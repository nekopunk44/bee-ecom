#include "platform/Config.hpp"
#include <iostream>
#include <map>
#include <stdexcept>

int main() {
    std::map<std::string, std::string> values{
        {"APP_ENV", "test"}, {"PGHOST", "postgres"}, {"PGDATABASE", "bee"},
        {"PGUSER", "bee"}, {"PGPASSWORD", "a'b\\c"},
        {"REDIS_HOST", "redis"}, {"REDIS_PASSWORD", "secret"}
    };
    auto read = [&](const char* key) { return values[key]; };
    auto expectRejected = [&] {
        try { bee::Config::load(read); } catch (const std::invalid_argument&) { return; }
        throw std::runtime_error("Invalid configuration accepted");
    };
    try {
        const auto config = bee::Config::load(read);
        if (config.port != 8080 || config.postgresConnection.find("password='a\\'b\\\\c'") == std::string::npos)
            throw std::runtime_error("Defaults or libpq escaping failed");
        for (const auto* invalid : {"0", "-1", "65536", "12abc", " 80", "99999999999999999999"}) {
            values["API_PORT"] = invalid;
            expectRejected();
        }
        values.erase("API_PORT");
        values["APP_ENV"] = "production";
        expectRejected();
        values["PGSSLMODE"] = "verify-full";
        expectRejected();
        values["PGSSLROOTCERT"] = "/certs/ca.pem";
        bee::Config::load(read);
        values["PGPASSWORD"] = "";
        expectRejected();
        values["PGPASSWORD"] = "replace-with-random-value";
        expectRejected();
        std::cout << "Configuration boundary checks passed\n";
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
