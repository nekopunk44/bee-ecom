#pragma once
#include "HealthService.hpp"
#include <memory>

namespace bee::health {
void registerRoutes(std::shared_ptr<Service> service);
}
