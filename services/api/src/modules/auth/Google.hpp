#pragma once
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include "Auth.hpp"

namespace bee::auth {
struct GoogleAccount { std::string subject; std::string email; };

std::string base64Url(const std::string& bytes);
/** PKCE S256: base64url of the SHA-256 of the verifier (RFC 7636). */
std::string pkceChallenge(const std::string& verifier);
/** Where to return after sign-in: a storefront page path, never another site. */
std::string safeReturnPath(const std::string& path);
/**
 * Claims of an ID token received straight from Google's token endpoint over TLS, so
 * its signature need not be checked again (OpenID Connect Core 3.1.3.7). The issuer,
 * audience, expiry and a verified email are still required.
 */
std::optional<GoogleAccount> readIdToken(const std::string& idToken, const std::string& clientId,
                                         std::int64_t now);

/**
 * Sign-in with Google: authorization code flow with PKCE. The state, the verifier and
 * the return path wait in a short HttpOnly cookie between the two requests. Without
 * GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET the provider is simply off.
 */
class Google {
public:
    Google(std::shared_ptr<Service> auth, bool secure, std::string storefrontOrigin);
    bool enabled() const { return !clientId_.empty() && !clientSecret_.empty(); }
    drogon::HttpResponsePtr start(const drogon::HttpRequestPtr& request) const;
    drogon::HttpResponsePtr callback(const drogon::HttpRequestPtr& request) const;
private:
    std::shared_ptr<Service> auth_;
    bool secure_;
    std::string storefrontOrigin_;
    std::string clientId_;
    std::string clientSecret_;
    std::string authUrl_;
    std::string tokenUrl_;
    std::string redirectUri() const { return storefrontOrigin_ + "/api/v1/auth/google/callback"; }
    drogon::HttpResponsePtr back(const std::string& path, const std::string& outcome) const;
    std::optional<GoogleAccount> exchange(const std::string& code, const std::string& verifier) const;
};
void registerGoogleRoutes(std::shared_ptr<Google> google, Executor& executor);
}
