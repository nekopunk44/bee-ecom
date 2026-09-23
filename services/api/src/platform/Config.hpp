#pragma once
#include <functional>
#include <string>

namespace bee {
using Environment = std::function<std::string(const char*)>;
struct Config {
    std::string environment;
    unsigned short port;
    unsigned int threads;
    std::string postgresConnection;
    std::string redisHost;
    unsigned short redisPort;
    std::string redisPassword;
    static Config load(const Environment& read);
    static Config fromEnvironment();
};
} // namespace bee
