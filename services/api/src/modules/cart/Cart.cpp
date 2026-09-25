#include "Cart.hpp"
#include "platform/Endpoint.hpp"
#include "platform/Errors.hpp"
#include "platform/Json.hpp"
#include <regex>

namespace bee::cart {
namespace {
bool uuid(const std::string& value) {
    static const std::regex pattern(
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    return std::regex_match(value, pattern);
}
void locale(const std::string& value) {
    if (value != "ru" && value != "ro")
        throw Error(400, "INVALID_LOCALE", "Locale must be ru or ro");
}
Json::Value result(const drogon::orm::Result& rows) {
    if (rows.empty()) return Json::Value(Json::objectValue);
    auto document = decode(rows[0]["document"].as<std::string>());
    if (!document.isMember("failure")) return document;
    const auto code = document["failure"].asString();
    if (code == "INVALID_CART_ITEM" || code == "INVALID_LOCALE")
        throw Error(422, code, "Cart item or locale is invalid");
    if (code == "ITEM_UNAVAILABLE")
        throw Error(409, code, "This product variant is no longer available");
    if (code == "CART_LIMIT_REACHED")
        throw Error(409, code, "A cart can contain at most 50 different items");
    throw Error(500, "CART_FAILED", "Cart operation could not be completed");
}
}

Json::Value Service::get(const std::string& customer, const std::string& language) const {
    locale(language);
    const auto rows = db_->execSqlSync(
        "SELECT customer_cart_document($1::uuid,$2)::text AS document", customer, language);
    return result(rows);
}

Json::Value Service::setItem(const std::string& customer, const Json::Value& body,
                             const std::string& language) const {
    locale(language);
    if (!body.isObject() || !body["variantId"].isString() ||
        !body["quantity"].isInt() || !uuid(body["variantId"].asString()) ||
        body["quantity"].asInt() < 1 || body["quantity"].asInt() > 100)
        throw Error(422, "INVALID_CART_ITEM", "A valid variant ID and quantity from 1 to 100 are required");
    const auto rows = db_->execSqlSync(
        "SELECT customer_cart_set_item($1::uuid,$2::uuid,$3,$4)::text AS document",
        customer, body["variantId"].asString(), body["quantity"].asInt(), language);
    return result(rows);
}

Json::Value Service::removeItem(const std::string& customer, const std::string& variant,
                                const std::string& language) const {
    locale(language);
    if (!uuid(variant)) throw Error(400, "INVALID_VARIANT", "A valid variant ID is required");
    const auto rows = db_->execSqlSync(
        "SELECT customer_cart_remove_item($1::uuid,$2::uuid,$3)::text AS document",
        customer, variant, language);
    return result(rows);
}

void registerRoutes(std::shared_ptr<Service> service,
                    std::shared_ptr<auth::Service> auth, Executor& executor) {
    drogon::app().registerHandler("/api/v1/cart",
        [service, auth, &executor](const drogon::HttpRequestPtr& req, Reply&& cb) {
            dispatch(executor, req, std::move(cb), [=] {
                const auto principal = auth->require(req);
                const auto language = req->getParameter("locale").empty()
                    ? "ru" : req->getParameter("locale");
                return drogon::HttpResponse::newHttpJsonResponse(
                    service->get(principal.id, language));
            });
        }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/cart/items",
        [service, auth, &executor](const drogon::HttpRequestPtr& req, Reply&& cb) {
            dispatch(executor, req, std::move(cb), [=] {
                auth->requireAuthOrigin(req);
                const auto principal = auth->require(req);
                const auto language = req->getParameter("locale").empty()
                    ? "ru" : req->getParameter("locale");
                return drogon::HttpResponse::newHttpJsonResponse(
                    service->setItem(principal.id, jsonBody(req), language));
            });
        }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/cart/items/{1}",
        [service, auth, &executor](const drogon::HttpRequestPtr& req, Reply&& cb,
                                   const std::string& variant) {
            dispatch(executor, req, std::move(cb), [=] {
                auth->requireAuthOrigin(req);
                const auto principal = auth->require(req);
                const auto language = req->getParameter("locale").empty()
                    ? "ru" : req->getParameter("locale");
                return drogon::HttpResponse::newHttpJsonResponse(
                    service->removeItem(principal.id, variant, language));
            });
        }, {drogon::Delete});
}
}
