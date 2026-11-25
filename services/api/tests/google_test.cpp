#include "modules/auth/Google.hpp"
#include "platform/Json.hpp"
#include <sodium.h>
#include <iostream>
#include <stdexcept>

namespace {
void expect(bool condition, const char* what) {
    if (!condition) throw std::runtime_error(what);
}
// An ID token as Google returns it: header, claims and a signature, all base64url.
std::string token(const Json::Value& claims) {
    return bee::auth::base64Url(R"({"alg":"RS256","kid":"test"})") + "." +
        bee::auth::base64Url(bee::encode(claims)) + ".c2lnbmF0dXJl";
}
}

int main() {
    if (sodium_init() < 0) return 1;
    try {
        // Expected value from an independent implementation:
        // node -e "crypto.createHash('sha256').update(v).digest('base64url')".
        const auto challenge = bee::auth::pkceChallenge("dBjftJeZ4CVP-mJ92K9qhqVcAmRVOkALvOdrQi3VrC0");
        if (challenge != "43YYtHxCMo_Hrs0foPRHU_u8nep4RrgTGB1ds_6kH6I")
            throw std::runtime_error("PKCE challenge differs: " + challenge);
        expect(bee::auth::base64Url(std::string{'\xfb', '\xff'}) == "-_8",
               "base64url uses the URL-safe alphabet without padding");

        using bee::auth::safeReturnPath;
        expect(safeReturnPath("/ru/catalog/?category=hives&min=200") == "/ru/catalog/?category=hives&min=200",
               "A storefront path with a query was rejected");
        expect(safeReturnPath("/ro/") == "/ro/", "The Romanian home page was rejected");
        for (const auto* unsafe : {"//evil.example/", "https://evil.example/", "/en/", "/ru/\\evil", "", "ru/"})
            expect(safeReturnPath(unsafe) == "/ru/", "An unsafe return path was accepted");
        expect(safeReturnPath("/ru/" + std::string(400, 'a')) == "/ru/", "An overlong return path was accepted");

        Json::Value claims;
        claims["iss"] = "https://accounts.google.com";
        claims["aud"] = "client-id";
        claims["sub"] = "1234567890";
        claims["email"] = "Bee.Keeper@Example.com";
        claims["email_verified"] = true;
        claims["exp"] = 2000;
        const auto account = bee::auth::readIdToken(token(claims), "client-id", 1000);
        expect(account && account->subject == "1234567890" && account->email == "bee.keeper@example.com",
               "A valid ID token was not read");

        const auto rejected = [&](Json::Value changed, const char* what) {
            expect(!bee::auth::readIdToken(token(changed), "client-id", 1000), what);
        };
        auto changed = claims; changed["aud"] = "someone-else"; rejected(changed, "Foreign audience accepted");
        changed = claims; changed["exp"] = 900; rejected(changed, "Expired token accepted");
        changed = claims; changed["email_verified"] = false; rejected(changed, "Unverified email accepted");
        changed = claims; changed["iss"] = "https://evil.example"; rejected(changed, "Foreign issuer accepted");
        changed = claims; changed.removeMember("sub"); rejected(changed, "Token without subject accepted");
        changed = claims; changed["aud"] = Json::Value(Json::arrayValue); changed["aud"].append("client-id");
        expect(bee::auth::readIdToken(token(changed), "client-id", 1000).has_value(),
               "Audience given as a list was rejected");
        expect(!bee::auth::readIdToken("not-a-token", "client-id", 1000), "Garbage accepted as a token");
        expect(!bee::auth::readIdToken("a.%%%.b", "client-id", 1000), "Broken base64 accepted");
        std::cout << "Google sign-in checks passed\n";
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
