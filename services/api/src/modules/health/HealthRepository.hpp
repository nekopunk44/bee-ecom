#pragma once
#include <drogon/orm/DbClient.h>
#include <drogon/nosql/RedisClient.h>
#include <functional>

namespace bee::health {
class Repository {
public:
    Repository(drogon::orm::DbClientPtr postgres, drogon::nosql::RedisClientPtr redis);
    void checkPostgres(std::function<void(bool)> complete) const;
    void checkRedis(std::function<void(bool)> complete) const;
private:
    drogon::orm::DbClientPtr postgres_;
    drogon::nosql::RedisClientPtr redis_;
};
}
