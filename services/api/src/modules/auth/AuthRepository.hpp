#pragma once
#include <drogon/orm/DbClient.h>

namespace bee::auth {
class Repository {
public:
    explicit Repository(drogon::orm::DbClientPtr db):db_(std::move(db)){}
    drogon::orm::Result principal(const std::string& hash) const;
    drogon::orm::Result credentials(const std::string& email) const;
    int consumeAttempt(const std::string& hash) const;
    void createSession(const std::string& hash,const std::string& user) const;
    void revoke(const std::string& hash) const;
private:
    drogon::orm::DbClientPtr db_;
};
}
