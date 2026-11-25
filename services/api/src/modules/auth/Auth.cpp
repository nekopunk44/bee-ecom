#include "Auth.hpp"
#include "platform/Endpoint.hpp"
#include "platform/Json.hpp"
#include <sodium.h>
#include <algorithm>
#include <cstdlib>
#include <cctype>
#include <regex>

namespace bee::auth {
std::string requiredEnv(const char* name) {
    const auto* value = std::getenv(name);
    if (!value || !*value) throw std::invalid_argument(std::string("Missing configuration: ") + name);
    return value;
}
std::string hashToken(const std::string& token) {
    unsigned char digest[crypto_hash_sha256_BYTES];
    crypto_hash_sha256(digest, reinterpret_cast<const unsigned char*>(token.data()), token.size());
    char hex[crypto_hash_sha256_BYTES * 2 + 1];
    sodium_bin2hex(hex, sizeof hex, digest, sizeof digest);
    return hex;
}
namespace {
// 32 random bytes as 64 hex characters: the session token the browser keeps.
std::string newToken() {
    unsigned char random[32]; char token[65];
    randombytes_buf(random, sizeof random); sodium_bin2hex(token, sizeof token, random, sizeof random);
    return token;
}
}
std::string hashPassword(const std::string& password) {
    char hash[crypto_pwhash_STRBYTES];
    if (crypto_pwhash_str_alg(hash, password.data(), password.size(), 2, 64 * 1024 * 1024, crypto_pwhash_ALG_ARGON2ID13) != 0)
        throw std::runtime_error("Password hashing failed");
    return hash;
}
Service::Service(drogon::orm::DbClientPtr db, bool secure, std::string origin,
                 std::string storefrontOrigin)
    : repository_(std::move(db)), secure_(secure), origin_(std::move(origin)),
      storefrontOrigin_(std::move(storefrontOrigin)),
      dummyHash_(hashPassword("non-login-dummy-password")) {
    static const std::regex originPattern(R"(^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$)");
    const auto validOrigin = [](const std::string& value) {
        return std::regex_match(value, originPattern);
    };
    if (!validOrigin(origin_) || !validOrigin(storefrontOrigin_) ||
        (secure_ && (!origin_.starts_with("https://") ||
                     !storefrontOrigin_.starts_with("https://"))))
        throw std::invalid_argument("Invalid trusted application origins");
}
void Service::requireOrigin(const drogon::HttpRequestPtr& request) const {
    if (request->getHeader("origin") != origin_)
        throw Error(403, "ORIGIN_REJECTED", "Request origin is not allowed");
}
void Service::requireAuthOrigin(const drogon::HttpRequestPtr& request) const {
    const auto origin = request->getHeader("origin");
    if (origin != origin_ && origin != storefrontOrigin_)
        throw Error(403, "ORIGIN_REJECTED", "Request origin is not allowed");
}
Principal Service::require(const drogon::HttpRequestPtr& request, const std::string& permission) const {
    const auto token = request->getCookie("bee_session");
    if (token.size() != 64) throw Error(401, "AUTH_REQUIRED", "Please sign in");
    const auto rows = repository_.principal(hashToken(token));
    if (rows.empty()) throw Error(401, "AUTH_REQUIRED", "Please sign in");
    Principal principal{rows[0]["id"].as<std::string>(), rows[0]["email"].as<std::string>(), decode(rows[0]["permissions"].as<std::string>())};
    if (!permission.empty() && std::none_of(principal.permissions.begin(), principal.permissions.end(), [&](const auto& p) { return p.asString() == permission; }))
        throw Error(403, "FORBIDDEN", "You do not have permission for this operation");
    return principal;
}
Login Service::login(const std::string& rawEmail, const std::string& password, const std::string& address) {
    if (rawEmail.empty() || rawEmail.size() > 254 || password.empty() || password.size() > 256)
        throw Error(400, "INVALID_CREDENTIALS", "Check the email and password");
    auto email = rawEmail;
    std::transform(email.begin(), email.end(), email.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    for (const auto& key : {"email:" + email, "address:" + address}) {
        if (repository_.consumeAttempt(hashToken(key)) > (key.starts_with("email:") ? 10 : 50))
            throw Error(429, "RATE_LIMITED", "Too many attempts. Try again later");
    }
    const auto rows = repository_.credentials(email);
    const auto hash = rows.empty() ? dummyHash_ : rows[0]["password_hash"].as<std::string>();
    const bool verified = crypto_pwhash_str_verify(hash.c_str(), password.data(), password.size()) == 0;
    if (!verified || rows.empty() || !rows[0]["active"].as<bool>())
        throw Error(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    const auto token = newToken();
    const auto id = rows[0]["id"].as<std::string>();
    repository_.createSession(hashToken(token),id);
    return {token, {id, email, Json::Value(Json::arrayValue)}};
}
Login Service::registerCustomer(const std::string& rawEmail, const std::string& password,
                                const std::string& address) {
    if (rawEmail.empty() || rawEmail.size() > 254 || password.size() < 12 ||
        password.size() > 128 || password.find_first_not_of(" \t\r\n") == std::string::npos)
        throw Error(422, "INVALID_REGISTRATION", "Provide a valid email and a password of at least 12 characters");
    static const std::regex emailPattern(
        R"(^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$)");
    if (!std::regex_match(rawEmail, emailPattern))
        throw Error(422, "INVALID_REGISTRATION", "Provide a valid email and a password of at least 12 characters");
    std::string email = rawEmail;
    std::transform(email.begin(), email.end(), email.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    if (repository_.consumeAttempt(hashToken("register-email:" + email)) > 3 ||
        repository_.consumeAttempt(hashToken("register-address:" + address)) > 10)
        throw Error(429, "RATE_LIMITED", "Too many registration attempts. Try again later");

    const auto token = newToken();
    const auto rows = repository_.registerCustomer(email, hashPassword(password), hashToken(token));
    if (rows.empty()) throw Error(409, "EMAIL_UNAVAILABLE", "This email address is already registered");
    Json::Value permissions(Json::arrayValue);
    return {token, {rows[0]["id"].as<std::string>(), email, permissions}};
}
std::optional<std::string> Service::signInWithGoogle(const std::string& subject, const std::string& email) {
    const auto rows = repository_.googleUser(subject, email);
    if (rows.empty() || !rows[0]["active"].as<bool>()) return std::nullopt;
    const auto token = newToken();
    repository_.createSession(hashToken(token), rows[0]["id"].as<std::string>());
    return token;
}
void Service::logout(const drogon::HttpRequestPtr& request) const {
    repository_.revoke(hashToken(request->getCookie("bee_session")));
}
void Service::cookie(const drogon::HttpResponsePtr& response, const std::string& token, bool clear) const {
    drogon::Cookie cookie("bee_session", token);
    cookie.setPath("/api/v1"); cookie.setHttpOnly(true); cookie.setSecure(secure_);
    cookie.setSameSite(drogon::Cookie::SameSite::kStrict); cookie.setMaxAge(clear ? 0 : 1800);
    response->addCookie(cookie);
}
void registerRoutes(std::shared_ptr<Service> service, Executor& executor) {
    drogon::app().registerHandler("/api/v1/auth/login", [service, &executor](const drogon::HttpRequestPtr& req, Reply&& callback) {
        dispatch(executor, req, std::move(callback), [service, req] {
            service->requireAuthOrigin(req); auto body = jsonBody(req);
            if (!body["email"].isString() || !body["password"].isString()) throw Error(400, "INVALID_BODY", "Email and password are required");
            // API is private behind Nginx; it overwrites X-Real-IP. For direct local requests use peer address.
            const auto address = req->getHeader("x-real-ip").empty() ? req->peerAddr().toIp() : req->getHeader("x-real-ip");
            const auto login = service->login(body["email"].asString(), body["password"].asString(), address);
            Json::Value result; result["email"] = login.principal.email;
            auto response = drogon::HttpResponse::newHttpJsonResponse(result);
            service->cookie(response, login.token); return response;
        });
    }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/auth/register", [service, &executor](const drogon::HttpRequestPtr& req, Reply&& callback) {
        dispatch(executor, req, std::move(callback), [service, req] {
            service->requireAuthOrigin(req); auto body = jsonBody(req);
            if (!body["email"].isString() || !body["password"].isString())
                throw Error(400, "INVALID_BODY", "Email and password are required");
            const auto address = req->getHeader("x-real-ip").empty() ? req->peerAddr().toIp() : req->getHeader("x-real-ip");
            const auto registered = service->registerCustomer(body["email"].asString(), body["password"].asString(), address);
            Json::Value result; result["email"] = registered.principal.email;
            auto response = drogon::HttpResponse::newHttpJsonResponse(result);
            response->setStatusCode(drogon::k201Created);
            service->cookie(response, registered.token);
            return response;
        });
    }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/auth/session", [service, &executor](const drogon::HttpRequestPtr& req, Reply&& callback) {
        dispatch(executor, req, std::move(callback), [service, req] {
            const auto principal = service->require(req);
            Json::Value result; result["email"] = principal.email; result["permissions"] = principal.permissions;
            return drogon::HttpResponse::newHttpJsonResponse(result);
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/auth/logout", [service, &executor](const drogon::HttpRequestPtr& req, Reply&& callback) {
        dispatch(executor, req, std::move(callback), [service, req] {
            service->requireAuthOrigin(req); service->logout(req);
            auto response = drogon::HttpResponse::newHttpResponse(); response->setStatusCode(drogon::k204NoContent);
            service->cookie(response, "", true); return response;
        });
    }, {drogon::Post});
}
}
