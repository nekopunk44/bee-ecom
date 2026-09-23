#pragma once
#include "Errors.hpp"
#include "Executor.hpp"
#include "Http.hpp"

namespace bee {
using Reply = std::function<void(const drogon::HttpResponsePtr&)>;
inline void dispatch(Executor& executor, const drogon::HttpRequestPtr& request,
                     Reply callback, std::function<drogon::HttpResponsePtr()> work) {
    if (!executor.submit([request, callback, work = std::move(work)] {
        drogon::HttpResponsePtr response;
        try { response = work(); }
        catch (const Error& error) {
            response = apiError(request, static_cast<drogon::HttpStatusCode>(error.status), error.code, error.what());
        }
        catch (const drogon::orm::DrogonDbException&) {
            response = apiError(request, drogon::k503ServiceUnavailable, "DATABASE_UNAVAILABLE", "The operation could not be completed. Refresh before retrying.");
        }
        catch (const std::exception&) {
            response = apiError(request, drogon::k500InternalServerError, "INTERNAL_ERROR", "The operation could not be completed");
        }
        callback(response);
    })) callback(apiError(request, drogon::k503ServiceUnavailable, "BUSY", "Please try again shortly"));
}
inline Json::Value jsonBody(const drogon::HttpRequestPtr& request) {
    if (request->getHeader("content-type").find("application/json") != 0 || !request->getJsonObject())
        throw Error(400, "INVALID_BODY", "A JSON object is required");
    return *request->getJsonObject();
}
}
