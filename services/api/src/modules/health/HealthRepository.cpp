#include "HealthRepository.hpp"
#include <utility>

namespace bee::health {
Repository::Repository(drogon::orm::DbClientPtr postgres, drogon::nosql::RedisClientPtr redis)
    : postgres_(std::move(postgres)), redis_(std::move(redis)) {}

void Repository::checkPostgres(std::function<void(bool)> complete) const {
    postgres_->execSqlAsync("SELECT version FROM schema_migrations WHERE version = $1",
        [complete](const drogon::orm::Result& result) { complete(result.size() == 1); },
        [complete](const drogon::orm::DrogonDbException&) { complete(false); },
        std::string("0003_catalog_write.sql"));
}
void Repository::checkRedis(std::function<void(bool)> complete) const {
    redis_->execCommandAsync(
        [complete](const drogon::nosql::RedisResult& result) { complete(result.asString() == "PONG"); },
        [complete](const drogon::nosql::RedisException&) { complete(false); }, "PING");
}
}
