#pragma once
#include <drogon/orm/DbClient.h>

namespace bee::inventory {
class ReservationWorker {
public:
    explicit ReservationWorker(drogon::orm::DbClientPtr database);
    unsigned long expireBatch() const;
private:
    drogon::orm::DbClientPtr database_;
};
}
