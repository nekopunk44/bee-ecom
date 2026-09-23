#include "Config.hpp"
#include <charconv>
#include <cstdlib>
#include <stdexcept>
#include <string_view>

namespace bee {
namespace {
std::string required(const Environment& read, const char* key) {
    auto value = read(key);
    if (value.empty() || value == "replace-with-random-value" || value.size() > 4096 ||
        value.find_first_of("\r\n") != std::string::npos) {
        throw std::invalid_argument(std::string("Invalid configuration: ") + key);
    }
    return value;
}
unsigned int number(const Environment& read, const char* key, unsigned int fallback,
                    unsigned int maximum) {
    const auto raw = read(key);
    if (raw.empty()) return fallback;
    unsigned int value = 0;
    const auto [end, error] = std::from_chars(raw.data(), raw.data() + raw.size(), value);
    if (error != std::errc{} || end != raw.data() + raw.size() || value == 0 || value > maximum)
        throw std::invalid_argument(std::string("Invalid configuration: ") + key);
    return value;
}
// libpq keyword values use single quotes; escape both quote and backslash.
std::string quote(std::string_view value) {
    std::string result = "'";
    for (const char c : value) {
        if (c == '\'' || c == '\\') result += '\\';
        result += c;
    }
    return result + "'";
}
} // namespace

Config Config::load(const Environment& read) {
    Config config;
    config.environment = required(read, "APP_ENV");
    if (config.environment != "development" && config.environment != "test" &&
        config.environment != "staging" && config.environment != "production")
        throw std::invalid_argument("Invalid configuration: APP_ENV");
    config.port = static_cast<unsigned short>(number(read, "API_PORT", 8080, 65535));
    config.threads = number(read, "API_THREADS", 2, 64);
    const auto pgPort = number(read, "PGPORT", 5432, 65535);
    auto ssl = read("PGSSLMODE");
    if (ssl.empty()) ssl = "disable";
    if (ssl != "disable" && ssl != "require" && ssl != "verify-full")
        throw std::invalid_argument("Invalid configuration: PGSSLMODE");
    if ((config.environment == "production" || config.environment == "staging") && ssl != "verify-full")
        throw std::invalid_argument("PGSSLMODE must be verify-full outside local development");
    config.postgresConnection = "host=" + quote(required(read, "PGHOST")) +
        " port=" + std::to_string(pgPort) + " dbname=" + quote(required(read, "PGDATABASE")) +
        " user=" + quote(required(read, "PGUSER")) + " password=" + quote(required(read, "PGPASSWORD")) +
        " sslmode=" + ssl + " connect_timeout=3 application_name=bee";
    if (ssl == "verify-full") config.postgresConnection += " sslrootcert=" + quote(required(read, "PGSSLROOTCERT"));
    config.redisHost = required(read, "REDIS_HOST");
    config.redisPort = static_cast<unsigned short>(number(read, "REDIS_PORT", 6379, 65535));
    config.redisPassword = required(read, "REDIS_PASSWORD");
    return config;
}

Config Config::fromEnvironment() {
    return load([](const char* key) {
        const auto* value = std::getenv(key);
        return value ? std::string(value) : std::string{};
    });
}
} // namespace bee
