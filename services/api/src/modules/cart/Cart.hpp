#pragma once
#include <drogon/drogon.h>
#include "modules/auth/Auth.hpp"
#include "platform/Executor.hpp"

namespace bee::cart {
class Service {
public:
    explicit Service(drogon::orm::DbClientPtr db) : db_(std::move(db)) {}
    Json::Value get(const std::string& customer, const std::string& locale) const;
    Json::Value setItem(const std::string& customer, const Json::Value& body,
                        const std::string& locale) const;
    Json::Value removeItem(const std::string& customer, const std::string& variant,
                           const std::string& locale) const;
private:
    drogon::orm::DbClientPtr db_;
};
void registerRoutes(std::shared_ptr<Service> service,
                    std::shared_ptr<auth::Service> auth, Executor& executor);
}
