#include "OutboxRepository.hpp"
#include <utility>

namespace bee::outbox {
Repository::Repository(drogon::orm::DbClientPtr database) : database_(std::move(database)) {}
unsigned long Repository::parkUnhandledBatch() const {
    // A single SQL statement is one atomic transaction. No external I/O while
    // holding locks. Future registered handlers need their own delivery ledger.
    const auto result = database_->execSqlSync(R"SQL(
        WITH batch AS (
            SELECT id FROM outbox_events
            WHERE processed_at IS NULL AND dead_lettered_at IS NULL AND available_at <= now()
            ORDER BY available_at, created_at
            LIMIT 20 FOR UPDATE SKIP LOCKED
        )
        UPDATE outbox_events AS event
        SET attempts = event.attempts + 1,
            available_at = now() + interval '60 seconds',
            last_error_code = 'UNHANDLED_EVENT_TYPE',
            dead_lettered_at = CASE WHEN event.attempts + 1 >= 5 THEN now() ELSE NULL END
        FROM batch WHERE event.id = batch.id RETURNING event.id
    )SQL");
    return result.size();
}
}
