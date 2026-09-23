#include "Auth.hpp"
#include "platform/Endpoint.hpp"
#include "platform/Json.hpp"
#include <sodium.h>
#include <algorithm>
#include <cstdlib>
#include <cctype>

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
std::string hashPassword(const std::string& password) {
    char hash[crypto_pwhash_STRBYTES];
    if (crypto_pwhash_str_alg(hash, password.data(), password.size(), 2, 64 * 1024 * 1024, crypto_pwhash_ALG_ARGON2ID13) != 0)
        throw std::runtime_error("Password hashing failed");
    return hash;
}
Service::Service(drogon::orm::DbClientPtr db, bool secure, std::string origin)
    : repository_(std::move(db)), secure_(secure), origin_(std::move(origin)), dummyHash_(hashPassword("non-login-dummy-password")) {
    if (origin_.empty() || (secure_ && !origin_.starts_with("https://")))
        throw std::invalid_argument("Invalid ADMIN_ORIGIN");
}
void Service::requireOrigin(const drogon::HttpRequestPtr& request) const {
    if (request->getHeader("origin") != origin_)
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
    unsigned char random[32]; char token[65];
    randombytes_buf(random, sizeof random); sodium_bin2hex(token, sizeof token, random, sizeof random);
    const auto id = rows[0]["id"].as<std::string>();
    repository_.createSession(hashToken(token),id);
    return {token, {id, email, Json::Value(Json::arrayValue)}};
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
            service->requireOrigin(req); auto body = jsonBody(req);
            if (!body["email"].isString() || !body["password"].isString()) throw Error(400, "INVALID_BODY", "Email and password are required");
            // API is private behind Nginx; it overwrites X-Real-IP. For direct local requests use peer address.
            const auto address = req->getHeader("x-real-ip").empty() ? req->peerAddr().toIp() : req->getHeader("x-real-ip");
            const auto login = service->login(body["email"].asString(), body["password"].asString(), address);
            Json::Value result; result["email"] = login.principal.email;
            auto response = drogon::HttpResponse::newHttpJsonResponse(result);
            service->cookie(response, login.token); return response;
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
            service->requireOrigin(req); service->logout(req);
            auto response = drogon::HttpResponse::newHttpResponse(); response->setStatusCode(drogon::k204NoContent);
            service->cookie(response, "", true); return response;
        });
    }, {drogon::Post});
}
}
