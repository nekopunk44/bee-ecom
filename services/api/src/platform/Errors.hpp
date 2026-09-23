#pragma once
#include <stdexcept>
#include <string>

namespace bee {
struct Error : std::runtime_error {
    int status;
    std::string code;
    Error(int status, std::string code, std::string message)
        : std::runtime_error(std::move(message)), status(status), code(std::move(code)) {}
};
}
