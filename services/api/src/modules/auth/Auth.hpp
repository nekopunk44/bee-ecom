#pragma once
#include <drogon/drogon.h>
#include "platform/Executor.hpp"
#include "AuthRepository.hpp"

namespace bee::auth {
struct Principal { std::string id; std::string email; Json::Value permissions; };
struct Login { std::string token; Principal principal; };
std::string hashToken(const std::string& token);
std::string hashPassword(const std::string& password);
std::string requiredEnv(const char* name);
class Service {
public:
    Service(drogon::orm::DbClientPtr db, bool secure, std::string origin);
    Login login(const std::string& email, const std::string& password, const std::string& address);
    Principal require(const drogon::HttpRequestPtr& request, const std::string& permission = "") const;
    void requireOrigin(const drogon::HttpRequestPtr& request) const;
    void logout(const drogon::HttpRequestPtr& request) const;
    void cookie(const drogon::HttpResponsePtr& response, const std::string& token, bool clear = false) const;
private:
    Repository repository_;
    bool secure_;
    std::string origin_;
    std::string dummyHash_;
};
void registerRoutes(std::shared_ptr<Service> service, Executor& executor);
}
