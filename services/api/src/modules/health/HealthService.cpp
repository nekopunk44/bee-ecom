#include "HealthService.hpp"
#include <utility>

namespace bee::health {
Service::Service(std::shared_ptr<Repository> repository) : repository_(std::move(repository)) {}
void Service::ready(std::function<void(bool)> complete) const {
    // Sequential asynchronous checks never block Drogon's request event loops.
    repository_->checkPostgres([repository = repository_, complete = std::move(complete)](bool postgres) {
        if (!postgres) { complete(false); return; }
        repository->checkRedis(complete);
    });
}
}
