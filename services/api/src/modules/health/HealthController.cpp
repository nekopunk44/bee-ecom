#include "HealthController.hpp"
#include "platform/Http.hpp"

namespace bee::health {
void registerRoutes(std::shared_ptr<Service> service) {
    drogon::app().registerHandler("/api/v1/health/live",
        [](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
            Json::Value body;
            body["status"] = "ok";
            body["service"] = "bee-api";
            body["version"] = "0.1.0";
            callback(drogon::HttpResponse::newHttpJsonResponse(body));
        }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/health/ready",
        [service](const drogon::HttpRequestPtr& request, std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
            service->ready([request, callback = std::move(callback)](bool ready) {
                if (!ready) {
                    callback(apiError(request, drogon::k503ServiceUnavailable, "DEPENDENCY_UNAVAILABLE", "Service is not ready"));
                    return;
                }
                Json::Value body;
                body["status"] = "ready";
                body["checks"]["postgres"] = "up";
                body["checks"]["redis"] = "up";
                callback(drogon::HttpResponse::newHttpJsonResponse(body));
            });
        }, {drogon::Get});
}
}
