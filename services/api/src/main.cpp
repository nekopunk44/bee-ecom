#include "platform/Config.hpp"
#include "platform/Http.hpp"
#include "platform/Logging.hpp"
#include "modules/health/HealthController.hpp"
#include "modules/catalog/Catalog.hpp"
#include "modules/media/Media.hpp"
#include <sodium.h>
#include <curl/curl.h>
#include <vips/vips.h>
#include <netdb.h>
#include <stdexcept>

namespace {
trantor::InetAddress redisAddress(const std::string& host, unsigned short port) {
    addrinfo hints{};
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    addrinfo* addresses = nullptr;
    if (getaddrinfo(host.c_str(), std::to_string(port).c_str(), &hints, &addresses) != 0)
        throw std::runtime_error("Redis host resolution failed");
    const auto address = trantor::InetAddress(*reinterpret_cast<sockaddr_in*>(addresses->ai_addr));
    freeaddrinfo(addresses);
    return address;
}
}

int main() {
    try {
        const auto config = bee::Config::fromEnvironment();
        if(sodium_init()<0 || curl_global_init(CURL_GLOBAL_DEFAULT)!=0 || VIPS_INIT("bee-api"))
            throw std::runtime_error("Dependency initialization failed");
        vips_cache_set_max_mem(64*1024*1024);
        vips_concurrency_set(2);
        // Framework diagnostics may contain SQL/connection details. Application
        // logs below report sanitized operational events instead.
        drogon::app().setLogLevel(trantor::Logger::kFatal);
        auto postgres = drogon::orm::DbClient::newPgClient(config.postgresConnection, 4);
        postgres->setTimeout(2.0);
        auto redis = drogon::nosql::RedisClient::newRedisClient(redisAddress(config.redisHost, config.redisPort), 2, config.redisPassword);
        redis->setTimeout(2.0);
        bee::configureHttp();
        bee::Executor executor(4);
        auto auth = std::make_shared<bee::auth::Service>(postgres,
            config.environment=="production" || config.environment=="staging", bee::auth::requiredEnv("ADMIN_ORIGIN"));
        bee::auth::registerRoutes(auth,executor);
        bee::catalog::registerRoutes(std::make_shared<bee::catalog::Service>(std::make_shared<bee::catalog::Repository>(postgres)),auth,executor);
        bee::media::registerRoutes(std::make_shared<bee::media::Service>(postgres,std::make_shared<bee::media::S3Storage>()),auth,executor);
        bee::health::registerRoutes(std::make_shared<bee::health::Service>(
            std::make_shared<bee::health::Repository>(postgres, redis)));
        drogon::app().addListener("0.0.0.0", config.port)
            .setThreadNum(config.threads)
            .setClientMaxBodySize(8 * 1024 * 1024)
            .setClientMaxMemoryBodySize(8 * 1024 * 1024)
            .setIdleConnectionTimeout(30)
            .disableSession();
        bee::log("bee-api", "info", "starting");
        drogon::app().run();
        bee::log("bee-api", "info", "stopped");
    } catch (const std::exception&) {
        bee::log("bee-api", "error", "startup_failed");
        return 1;
    }
}
