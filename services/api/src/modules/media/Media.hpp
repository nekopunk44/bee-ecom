#pragma once
#include <drogon/drogon.h>
#include "modules/auth/Auth.hpp"
#include "platform/Executor.hpp"

namespace bee::media {
class Storage {
public:
    virtual ~Storage() = default;
    virtual void put(const std::string& key,const std::string& data) const = 0;
    virtual std::string get(const std::string& key) const = 0;
};
class S3Storage final : public Storage {
public:
    S3Storage();
    void put(const std::string& key,const std::string& data) const override;
    std::string get(const std::string& key) const override;
private:
    std::string endpoint_,bucket_,credentials_,signing_;
    std::string request(const std::string& key,const std::string* data) const;
};
class Service {
public:
    Service(drogon::orm::DbClientPtr db,std::shared_ptr<Storage> storage): db_(std::move(db)),storage_(std::move(storage)) {}
    Json::Value upload(const std::string& bytes,const std::string& actor,const std::string& requestId) const;
    bool published(const std::string& id) const;
    std::string image(const std::string& id,int width) const;
private:
    drogon::orm::DbClientPtr db_;
    std::shared_ptr<Storage> storage_;
};
void registerRoutes(std::shared_ptr<Service> service,std::shared_ptr<auth::Service> auth,Executor& executor);
}
