#include "Orders.hpp"
#include "platform/Endpoint.hpp"
#include "platform/Errors.hpp"
#include "platform/Json.hpp"
#include <regex>

namespace bee::orders {
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
    if (rows.empty() || rows[0]["document"].isNull())
        throw Error(404, "NOT_FOUND", "Order not found");
    auto document = decode(rows[0]["document"].as<std::string>());
    if (document.isNull())
        throw Error(404, "NOT_FOUND", "Order not found");
    if (!document.isObject() || !document.isMember("failure")) return document;
    const auto code = document["failure"].asString();
    if (code == "INVALID_ORDER")
        throw Error(400, code, "Order request is malformed");
    if (code == "INVALID_LOCALE")
        throw Error(400, code, "Locale must be ru or ro");
    if (code == "INVALID_DELIVERY")
        throw Error(422, code, "Choose a delivery method");
    if (code == "INVALID_RECIPIENT")
        throw Error(422, code, "Enter the recipient's name");
    if (code == "INVALID_PHONE")
        throw Error(422, code, "Enter a Moldovan phone number");
    if (code == "INVALID_ADDRESS")
        throw Error(422, code, "Enter the delivery address");
    if (code == "INVALID_LOCALITY")
        throw Error(422, code, "Enter the locality");
    if (code == "INVALID_POSTAL_CODE")
        throw Error(422, code, "The postal code must have four digits");
    if (code == "INVALID_COMMENT")
        throw Error(422, code, "The comment is too long");
    if (code == "INVALID_WAREHOUSE")
        throw Error(422, code, "Choose an available pickup warehouse");
    if (code == "CART_EMPTY")
        throw Error(409, code, "The cart is empty");
    if (code == "ITEM_UNAVAILABLE")
        throw Error(409, code, "A product in the cart is no longer available");
    if (code == "INVENTORY_NOT_AVAILABLE")
        throw Error(409, code, "Not enough stock for a product in the cart");
    if (code == "IDEMPOTENCY_CONFLICT")
        throw Error(409, code, "Idempotency key was already used for another order");
    if (code == "NOT_FOUND")
        throw Error(404, code, "Order not found");
    if (code == "ORDER_NOT_CANCELLABLE")
        throw Error(409, code, "Only a new order can be cancelled");
    throw Error(500, "ORDER_FAILED", "Order operation could not be completed");
}
}

Json::Value Service::checkout(const std::string& customer, const std::string& language) const {
    locale(language);
    const auto rows = db_->execSqlSync(
        "SELECT checkout_document($1::uuid,$2)::text AS document", customer, language);
    return result(rows);
}

Json::Value Service::place(const std::string& customer, const std::string& idempotencyKey,
                           const Json::Value& body, const std::string& language) const {
    locale(language);
    if (!uuid(idempotencyKey))
        throw Error(400, "IDEMPOTENCY_KEY_REQUIRED", "A UUID Idempotency-Key header is required");
    if (!body.isObject())
        throw Error(400, "INVALID_BODY", "A JSON object is required");
    const auto rows = db_->execSqlSync(
        "SELECT order_place($1::uuid,$2::uuid,$3::jsonb,$4)::text AS document",
        customer, idempotencyKey, encode(body), language);
    return result(rows);
}

Json::Value Service::list(const std::string& customer) const {
    const auto rows = db_->execSqlSync(
        "SELECT customer_orders_document($1::uuid)::text AS document", customer);
    return result(rows);
}

Json::Value Service::get(const std::string& customer, const std::string& orderId) const {
    if (!uuid(orderId))
        throw Error(404, "NOT_FOUND", "Order not found");
    const auto rows = db_->execSqlSync(
        "SELECT customer_order_document($1::uuid,$2::uuid)::text AS document", customer, orderId);
    return result(rows);
}

Json::Value Service::cancel(const std::string& customer, const std::string& orderId) const {
    if (!uuid(orderId))
        throw Error(404, "NOT_FOUND", "Order not found");
    const auto rows = db_->execSqlSync(
        "SELECT order_cancel($1::uuid,$2::uuid)::text AS document", customer, orderId);
    return result(rows);
}

void registerRoutes(std::shared_ptr<Service> service,
                    std::shared_ptr<auth::Service> auth, Executor& executor) {
    drogon::app().registerHandler("/api/v1/checkout",
        [service, auth, &executor](const drogon::HttpRequestPtr& req, Reply&& cb) {
            dispatch(executor, req, std::move(cb), [=] {
                const auto principal = auth->require(req);
                const auto language = req->getParameter("locale").empty()
                    ? "ru" : req->getParameter("locale");
                return drogon::HttpResponse::newHttpJsonResponse(
                    service->checkout(principal.id, language));
            });
        }, {drogon::Get});

    drogon::app().registerHandler("/api/v1/orders",
        [service, auth, &executor](const drogon::HttpRequestPtr& req, Reply&& cb) {
            dispatch(executor, req, std::move(cb), [=] {
                auth->requireAuthOrigin(req);
                const auto principal = auth->require(req);
                const auto key = req->getHeader("Idempotency-Key");
                if (!uuid(key))
                    throw Error(400, "IDEMPOTENCY_KEY_REQUIRED", "A UUID Idempotency-Key header is required");
                const auto body = jsonBody(req);
                if (!body.isObject())
                    throw Error(400, "INVALID_BODY", "A JSON object is required");
                const auto language = req->getParameter("locale").empty()
                    ? "ru" : req->getParameter("locale");
                const auto doc = service->place(principal.id, key, body, language);
                auto response = drogon::HttpResponse::newHttpJsonResponse(doc);
                const bool replayed = doc.isMember("replayed") && doc["replayed"].asBool();
                response->setStatusCode(replayed ? drogon::k200OK : drogon::k201Created);
                return response;
            });
        }, {drogon::Post});

    drogon::app().registerHandler("/api/v1/orders",
        [service, auth, &executor](const drogon::HttpRequestPtr& req, Reply&& cb) {
            dispatch(executor, req, std::move(cb), [=] {
                const auto principal = auth->require(req);
                return drogon::HttpResponse::newHttpJsonResponse(
                    service->list(principal.id));
            });
        }, {drogon::Get});

    drogon::app().registerHandler("/api/v1/orders/{1}",
        [service, auth, &executor](const drogon::HttpRequestPtr& req, Reply&& cb,
                                   const std::string& orderId) {
            dispatch(executor, req, std::move(cb), [=] {
                const auto principal = auth->require(req);
                if (!uuid(orderId))
                    throw Error(404, "NOT_FOUND", "Order not found");
                return drogon::HttpResponse::newHttpJsonResponse(
                    service->get(principal.id, orderId));
            });
        }, {drogon::Get});

    drogon::app().registerHandler("/api/v1/orders/{1}/cancel",
        [service, auth, &executor](const drogon::HttpRequestPtr& req, Reply&& cb,
                                   const std::string& orderId) {
            dispatch(executor, req, std::move(cb), [=] {
                auth->requireAuthOrigin(req);
                const auto principal = auth->require(req);
                if (!uuid(orderId))
                    throw Error(404, "NOT_FOUND", "Order not found");
                return drogon::HttpResponse::newHttpJsonResponse(
                    service->cancel(principal.id, orderId));
            });
        }, {drogon::Post});
}
}
