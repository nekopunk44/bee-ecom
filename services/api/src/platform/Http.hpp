#pragma once
#include <drogon/drogon.h>

namespace bee {
void configureHttp();
std::string requestId(const drogon::HttpRequestPtr& request);
drogon::HttpResponsePtr apiError(const drogon::HttpRequestPtr& request,
                                 drogon::HttpStatusCode status,
                                 const std::string& code, const std::string& message);
}
