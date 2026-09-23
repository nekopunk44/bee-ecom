#include "Http.hpp"
#include "Logging.hpp"
#include <chrono>

namespace bee {
std::string requestId(const drogon::HttpRequestPtr& request) {
    auto id = request->attributes()->get<std::string>("requestId");
    if (id.empty()) {
        id = drogon::utils::getUuid();
        request->attributes()->insert("requestId", id);
    }
    return id;
}

drogon::HttpResponsePtr apiError(const drogon::HttpRequestPtr& request,
                                 drogon::HttpStatusCode status,
                                 const std::string& code, const std::string& message) {
    Json::Value body;
    body["error"]["code"] = code;
    body["error"]["message"] = message;
    body["error"]["requestId"] = requestId(request);
    auto response = drogon::HttpResponse::newHttpJsonResponse(body);
    response->setStatusCode(status);
    return response;
}

void configureHttp() {
    drogon::app().registerPreRoutingAdvice([](const drogon::HttpRequestPtr& request) {
        requestId(request);
        request->attributes()->insert("started", std::chrono::steady_clock::now());
    });
    drogon::app().registerPreSendingAdvice([](const drogon::HttpRequestPtr& request,
                                             const drogon::HttpResponsePtr& response) {
        const auto id = requestId(request);
        response->addHeader("X-Request-Id", id);
        response->addHeader("Cache-Control", "no-store");
        response->addHeader("X-Content-Type-Options", "nosniff");
        const auto start = request->attributes()->get<std::chrono::steady_clock::time_point>("started");
        Json::Value fields;
        fields["requestId"] = id;
        fields["method"] = request->methodString();
        // Only known route labels: arbitrary paths can contain credentials or PII.
        fields["endpoint"] = request->path() == "/api/v1/health/live" || request->path() == "/api/v1/health/ready"
            ? request->path() : "unmatched";
        fields["status"] = static_cast<int>(response->statusCode());
        if (start != std::chrono::steady_clock::time_point{})
            fields["durationMs"] = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count();
        log("bee-api", response->statusCode() >= 500 ? "error" : "info", "http_request", fields);
    });
    drogon::app().setCustomErrorHandler([](drogon::HttpStatusCode status, const drogon::HttpRequestPtr& request) {
        return apiError(request, status, status == drogon::k404NotFound ? "NOT_FOUND" : "HTTP_ERROR",
                        status == drogon::k404NotFound ? "Resource not found" : "Request could not be processed");
    });
    drogon::app().setExceptionHandler([](const std::exception&, const drogon::HttpRequestPtr& request,
                                        std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
        callback(apiError(request, drogon::k500InternalServerError, "INTERNAL_ERROR", "An unexpected error occurred"));
    });
}
} // namespace bee
