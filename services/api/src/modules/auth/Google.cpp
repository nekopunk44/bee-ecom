#include "Google.hpp"
#include "platform/Endpoint.hpp"
#include "platform/Json.hpp"
#include "platform/Logging.hpp"
#include <curl/curl.h>
#include <sodium.h>
#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <regex>

namespace bee::auth {
namespace {
std::string optionalEnv(const char* name, const std::string& fallback = "") {
    const auto* value = std::getenv(name);
    return value && *value ? value : fallback;
}
std::string randomHex(std::size_t bytes) {
    std::string raw(bytes, '\0');
    randombytes_buf(raw.data(), raw.size());
    std::string hex(bytes * 2 + 1, '\0');
    sodium_bin2hex(hex.data(), hex.size(), reinterpret_cast<const unsigned char*>(raw.data()), raw.size());
    hex.pop_back();
    return hex;
}
std::string escape(const std::string& value) {
    std::unique_ptr<CURL, decltype(&curl_easy_cleanup)> handle(curl_easy_init(), curl_easy_cleanup);
    char* escaped = curl_easy_escape(handle.get(), value.c_str(), static_cast<int>(value.size()));
    std::string result = escaped ? escaped : "";
    curl_free(escaped);
    return result;
}
std::optional<std::string> fromBase64Url(const std::string& text) {
    std::string raw(text.size() + 1, '\0');
    std::size_t length = 0;
    if (sodium_base642bin(reinterpret_cast<unsigned char*>(raw.data()), raw.size(), text.c_str(), text.size(),
                          nullptr, &length, nullptr, sodium_base64_VARIANT_URLSAFE_NO_PADDING) != 0)
        return std::nullopt;
    raw.resize(length);
    return raw;
}
// Form POST to Google's token endpoint; status 0 means no answer.
std::pair<long, std::string> postForm(const std::string& url, const std::string& body) {
    std::unique_ptr<CURL, decltype(&curl_easy_cleanup)> handle(curl_easy_init(), curl_easy_cleanup);
    if (!handle) return {0, ""};
    std::string result;
    curl_easy_setopt(handle.get(), CURLOPT_URL, url.c_str());
    curl_easy_setopt(handle.get(), CURLOPT_POSTFIELDS, body.c_str());
    curl_easy_setopt(handle.get(), CURLOPT_POSTFIELDSIZE, static_cast<long>(body.size()));
    curl_easy_setopt(handle.get(), CURLOPT_CONNECTTIMEOUT, 5L);
    curl_easy_setopt(handle.get(), CURLOPT_TIMEOUT, 10L);
    curl_easy_setopt(handle.get(), CURLOPT_NOSIGNAL, 1L);
    curl_easy_setopt(handle.get(), CURLOPT_PROTOCOLS_STR, "http,https");
    curl_easy_setopt(handle.get(), CURLOPT_WRITEFUNCTION, +[](char* bytes, size_t size, size_t count, void* output) -> size_t {
        auto& value = *static_cast<std::string*>(output);
        const auto length = size * count;
        if (value.size() + length > 64 * 1024) return 0;
        value.append(bytes, length);
        return length;
    });
    curl_easy_setopt(handle.get(), CURLOPT_WRITEDATA, &result);
    const auto code = curl_easy_perform(handle.get());
    long status = 0;
    curl_easy_getinfo(handle.get(), CURLINFO_RESPONSE_CODE, &status);
    return {code == CURLE_OK ? status : 0, result};
}
drogon::Cookie flowCookie(const std::string& value, bool secure, bool clear) {
    drogon::Cookie cookie("bee_oauth", value);
    cookie.setPath("/api/v1/auth/google");
    cookie.setHttpOnly(true);
    cookie.setSecure(secure);
    // Lax: Google sends the person back with a top-level GET, Strict would drop the cookie.
    cookie.setSameSite(drogon::Cookie::SameSite::kLax);
    cookie.setMaxAge(clear ? 0 : 600);
    return cookie;
}
}

std::string base64Url(const std::string& bytes) {
    constexpr auto variant = sodium_base64_VARIANT_URLSAFE_NO_PADDING;
    std::string text(sodium_base64_ENCODED_LEN(bytes.size(), variant), '\0');
    sodium_bin2base64(text.data(), text.size(), reinterpret_cast<const unsigned char*>(bytes.data()), bytes.size(),
                      variant);
    text.resize(std::strlen(text.c_str()));
    return text;
}
std::string pkceChallenge(const std::string& verifier) {
    unsigned char digest[crypto_hash_sha256_BYTES];
    crypto_hash_sha256(digest, reinterpret_cast<const unsigned char*>(verifier.data()), verifier.size());
    return base64Url(std::string(reinterpret_cast<const char*>(digest), sizeof digest));
}
std::string safeReturnPath(const std::string& path) {
    static const std::regex allowed(R"(^/(ru|ro)/[A-Za-z0-9._~/%-]*(\?[A-Za-z0-9._~%&=+-]*)?$)");
    return path.size() <= 300 && std::regex_match(path, allowed) ? path : "/ru/";
}
std::optional<GoogleAccount> readIdToken(const std::string& idToken, const std::string& clientId,
                                         std::int64_t now) {
    const auto first = idToken.find('.');
    if (first == std::string::npos) return std::nullopt;
    const auto second = idToken.find('.', first + 1);
    if (second == std::string::npos) return std::nullopt;
    const auto payload = fromBase64Url(idToken.substr(first + 1, second - first - 1));
    if (!payload) return std::nullopt;
    Json::Value claims;
    try { claims = decode(*payload); } catch (const std::exception&) { return std::nullopt; }
    if (!claims.isObject()) return std::nullopt;
    const auto text = [&](const char* key) { return claims[key].isString() ? claims[key].asString() : std::string(); };
    const auto issuer = text("iss");
    if (issuer != "https://accounts.google.com" && issuer != "accounts.google.com") return std::nullopt;
    const auto& audience = claims["aud"];
    const bool forUs = audience.isString() ? audience.asString() == clientId
        : audience.isArray() && std::any_of(audience.begin(), audience.end(),
              [&](const Json::Value& item) { return item.isString() && item.asString() == clientId; });
    if (!forUs) return std::nullopt;
    if (!claims["exp"].isNumeric() || claims["exp"].asInt64() <= now) return std::nullopt;
    const auto& verified = claims["email_verified"];
    if (!(verified.isBool() ? verified.asBool() : verified.isString() && verified.asString() == "true"))
        return std::nullopt;
    auto email = text("email");
    const auto subject = text("sub");
    if (subject.empty() || subject.size() > 255 || email.empty() || email.size() > 254) return std::nullopt;
    std::transform(email.begin(), email.end(), email.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return GoogleAccount{subject, email};
}

Google::Google(std::shared_ptr<Service> auth, bool secure, std::string storefrontOrigin)
    : auth_(std::move(auth)), secure_(secure), storefrontOrigin_(std::move(storefrontOrigin)),
      clientId_(optionalEnv("GOOGLE_CLIENT_ID")), clientSecret_(optionalEnv("GOOGLE_CLIENT_SECRET")),
      authUrl_(optionalEnv("GOOGLE_AUTH_URL", "https://accounts.google.com/o/oauth2/v2/auth")),
      tokenUrl_(optionalEnv("GOOGLE_TOKEN_URL", "https://oauth2.googleapis.com/token")) {}

drogon::HttpResponsePtr Google::back(const std::string& path, const std::string& outcome) const {
    const auto separator = path.find('?') == std::string::npos ? "?" : "&";
    auto response = drogon::HttpResponse::newRedirectionResponse(
        storefrontOrigin_ + path + separator + "signin=" + outcome, drogon::k302Found);
    response->addCookie(flowCookie("", secure_, true));
    return response;
}

drogon::HttpResponsePtr Google::start(const drogon::HttpRequestPtr& request) const {
    const auto path = safeReturnPath(request->getParameter("return"));
    if (!enabled()) return back(path, "google-off");
    const auto state = randomHex(16);
    const auto verifier = randomHex(32);
    const auto url = authUrl_ + "?response_type=code&scope=openid%20email&prompt=select_account" +
        "&client_id=" + escape(clientId_) + "&redirect_uri=" + escape(redirectUri()) + "&state=" + state +
        "&code_challenge=" + pkceChallenge(verifier) + "&code_challenge_method=S256";
    auto response = drogon::HttpResponse::newRedirectionResponse(url, drogon::k302Found);
    response->addCookie(flowCookie(state + "." + verifier + "." + base64Url(path), secure_, false));
    return response;
}

std::optional<GoogleAccount> Google::exchange(const std::string& code, const std::string& verifier) const {
    const auto [status, body] = postForm(tokenUrl_,
        "grant_type=authorization_code&code=" + escape(code) + "&client_id=" + escape(clientId_) +
        "&client_secret=" + escape(clientSecret_) + "&redirect_uri=" + escape(redirectUri()) +
        "&code_verifier=" + verifier);
    if (status != 200) {
        Json::Value fields;
        fields["status"] = static_cast<Json::Int64>(status);
        bee::log("bee-api", "error", "google_token_failed", fields);
        return std::nullopt;
    }
    Json::Value token;
    try { token = decode(body); } catch (const std::exception&) { return std::nullopt; }
    if (!token.isObject() || !token["id_token"].isString()) return std::nullopt;
    const auto now = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    return readIdToken(token["id_token"].asString(), clientId_, now);
}

drogon::HttpResponsePtr Google::callback(const drogon::HttpRequestPtr& request) const {
    // The flow cookie holds "state.verifier.return path"; every failure just goes back.
    const auto saved = request->getCookie("bee_oauth");
    const auto first = saved.find('.');
    const auto second = first == std::string::npos ? first : saved.find('.', first + 1);
    std::string path = "/ru/";
    if (second != std::string::npos)
        if (const auto decoded = fromBase64Url(saved.substr(second + 1))) path = safeReturnPath(*decoded);
    try {
        if (!enabled() || second == std::string::npos) return back(path, "google-failed");
        const auto state = saved.substr(0, first);
        const auto verifier = saved.substr(first + 1, second - first - 1);
        const auto returned = request->getParameter("state");
        const auto code = request->getParameter("code");
        if (code.empty() || returned.size() != state.size() ||
            sodium_memcmp(returned.data(), state.data(), state.size()) != 0)
            return back(path, "google-failed");
        const auto account = exchange(code, verifier);
        if (!account) return back(path, "google-failed");
        const auto token = auth_->signInWithGoogle(account->subject, account->email);
        if (!token) return back(path, "google-failed");
        auto response = back(path, "google");
        auth_->cookie(response, *token);
        return response;
    } catch (const std::exception&) {
        bee::log("bee-api", "error", "google_sign_in_failed");
        return back(path, "google-failed");
    }
}

void registerGoogleRoutes(std::shared_ptr<Google> google, Executor& executor) {
    drogon::app().registerHandler("/api/v1/auth/providers", [google](const drogon::HttpRequestPtr&, Reply&& callback) {
        Json::Value result;
        result["google"] = google->enabled();
        callback(drogon::HttpResponse::newHttpJsonResponse(result));
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/auth/google/start", [google, &executor](const drogon::HttpRequestPtr& req, Reply&& callback) {
        dispatch(executor, req, std::move(callback), [google, req] { return google->start(req); });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/auth/google/callback", [google, &executor](const drogon::HttpRequestPtr& req, Reply&& callback) {
        dispatch(executor, req, std::move(callback), [google, req] { return google->callback(req); });
    }, {drogon::Get});
}
}
