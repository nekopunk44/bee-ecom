#include "OutboxRepository.hpp"
#include "platform/Config.hpp"
#include "platform/Logging.hpp"
#include <trantor/utils/Logger.h>
#include <chrono>
#include <csignal>
#include <fstream>
#include <thread>

namespace {
volatile std::sig_atomic_t stopping = 0;
void stop(int) { stopping = 1; }
}

int main() {
    std::signal(SIGTERM, stop);
    std::signal(SIGINT, stop);
    trantor::Logger::setLogLevel(trantor::Logger::kFatal);
    try {
        const auto config = bee::Config::fromEnvironment();
        auto database = drogon::orm::DbClient::newPgClient(config.postgresConnection, 2);
        database->setTimeout(3.0);
        bee::outbox::Repository repository(database);
        bee::log("bee-worker", "info", "started");
        while (!stopping) {
            try {
                const auto count = repository.parkUnhandledBatch();
                if (count > 0) {
                    Json::Value fields;
                    fields["count"] = static_cast<Json::UInt64>(count);
                    bee::log("bee-worker", "warn", "unhandled_events_deferred", fields);
                }
                // Timestamp is refreshed only after a successful database poll.
                std::ofstream("/tmp/bee-worker-heartbeat", std::ios::trunc) << "ok\n";
            } catch (const std::exception&) {
                bee::log("bee-worker", "error", "poll_failed");
            }
            for (int i = 0; i < 20 && !stopping; ++i)
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
        database->closeAll();
        bee::log("bee-worker", "info", "stopped");
    } catch (const std::exception&) {
        bee::log("bee-worker", "error", "startup_failed");
        return 1;
    }
}
