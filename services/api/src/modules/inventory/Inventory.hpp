#pragma once
#include <drogon/drogon.h>
#include "modules/auth/Auth.hpp"
#include "platform/Executor.hpp"

namespace bee::inventory {
class Service {
public:
    explicit Service(drogon::orm::DbClientPtr db) : db_(std::move(db)) {}
    Json::Value availability(const std::string& variant) const;
    Json::Value warehouses() const;
    Json::Value createWarehouse(const Json::Value& body, const auth::Principal& actor,
                                const std::string& requestId) const;
    Json::Value adjust(const Json::Value& body, const auth::Principal& actor,
                       const std::string& requestId) const;
private:
    drogon::orm::DbClientPtr db_;
};
void registerRoutes(std::shared_ptr<Service> service,
                    std::shared_ptr<auth::Service> auth, Executor& executor);
}
