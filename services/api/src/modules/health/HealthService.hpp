#pragma once
#include "HealthRepository.hpp"
#include <memory>

namespace bee::health {
class Service {
public:
    explicit Service(std::shared_ptr<Repository> repository);
    void ready(std::function<void(bool)> complete) const;
private:
    std::shared_ptr<Repository> repository_;
};
}
