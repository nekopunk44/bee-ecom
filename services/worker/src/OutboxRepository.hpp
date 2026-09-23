#pragma once
#include <drogon/orm/DbClient.h>

namespace bee::outbox {
class Repository {
public:
    explicit Repository(drogon::orm::DbClientPtr database);
    unsigned long parkUnhandledBatch() const;
private:
    drogon::orm::DbClientPtr database_;
};
}
