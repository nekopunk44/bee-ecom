#pragma once
#include <drogon/drogon.h>
#include "modules/auth/Auth.hpp"
#include "platform/Executor.hpp"

namespace bee::catalog {
struct Filter {
    std::string locale="ru", query, category, brand, sort="newest";
    int page=1, limit=12;
    long long minPrice=0, maxPrice=100000000;
};
bool uuid(const std::string& value);
void validateDraft(const Json::Value& draft);
Filter parseFilter(const drogon::HttpRequestPtr& request);
class Repository {
public:
    explicit Repository(drogon::orm::DbClientPtr db) : db_(std::move(db)) {}
    Json::Value list(const Filter& filter, bool admin) const;
    Json::Value find(const std::string& key, bool admin) const;
    Json::Value metadata(const std::string& locale) const;
    Json::Value save(const Json::Value& draft, const std::string& actor, const std::string& correlation, const std::string& id, int revision) const;
    Json::Value addReference(const std::string& kind, const Json::Value& body, const std::string& actor, const std::string& correlation) const;
private:
    drogon::orm::DbClientPtr db_;
};
class Service {
public:
    explicit Service(std::shared_ptr<Repository> repository) : repository_(std::move(repository)) {}
    Json::Value list(const Filter& filter, bool admin) const;
    Json::Value find(const std::string& key, bool admin) const;
    Json::Value metadata(const std::string& locale) const { return repository_->metadata(locale); }
    Json::Value save(const Json::Value& draft, const std::string& actor, const std::string& correlation, const std::string& id, int revision) const;
    Json::Value addReference(const std::string& kind, const Json::Value& body, const std::string& actor, const std::string& correlation) const;
private:
    std::shared_ptr<Repository> repository_;
};
void registerRoutes(std::shared_ptr<Service> service, std::shared_ptr<auth::Service> auth, Executor& executor);
}
