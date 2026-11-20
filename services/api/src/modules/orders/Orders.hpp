#pragma once
#include <drogon/drogon.h>
#include "modules/auth/Auth.hpp"
#include "platform/Executor.hpp"

namespace bee::orders {
class Service {
public:
    explicit Service(drogon::orm::DbClientPtr db) : db_(std::move(db)) {}
    Json::Value checkout(const std::string& customer, const std::string& locale) const;
    Json::Value place(const std::string& customer, const std::string& idempotencyKey,
                      const Json::Value& body, const std::string& locale) const;
    Json::Value list(const std::string& customer) const;
    Json::Value get(const std::string& customer, const std::string& orderId) const;
    Json::Value cancel(const std::string& customer, const std::string& orderId) const;
    Json::Value adminList(const std::string& status, const std::string& query,
                          long long limit, long long offset) const;
    Json::Value adminGet(const std::string& orderId) const;
    Json::Value transition(const std::string& actor, const std::string& orderId,
                           const Json::Value& change, const std::string& requestId) const;
private:
    drogon::orm::DbClientPtr db_;
};
void registerRoutes(std::shared_ptr<Service> service,
                    std::shared_ptr<auth::Service> auth, Executor& executor);
}
