#include "InventoryReservationWorker.hpp"
#include <utility>

namespace bee::inventory {
ReservationWorker::ReservationWorker(drogon::orm::DbClientPtr database)
    : database_(std::move(database)) {}

unsigned long ReservationWorker::expireBatch() const {
    const auto result = database_->execSqlSync(
        "SELECT inventory_expire_reservations(100) AS expired_count");
    return static_cast<unsigned long>(result[0]["expired_count"].as<int>());
}
}
