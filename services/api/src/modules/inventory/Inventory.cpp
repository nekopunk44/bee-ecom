#include "Inventory.hpp"
#include "platform/Endpoint.hpp"
#include "platform/Json.hpp"
#include "platform/Errors.hpp"
#include <regex>

namespace bee::inventory {
namespace {
bool uuid(const std::string& value) {
    static const std::regex pattern("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    return std::regex_match(value, pattern);
}
}

Json::Value Service::availability(const std::string& variant) const {
    if (!uuid(variant)) throw Error(400, "INVALID_VARIANT", "A valid variant ID is required");
    const auto rows = db_->execSqlSync(
        "SELECT inventory_availability(v.id)::text AS document FROM product_variants v "
        "JOIN products p ON p.id=v.product_id WHERE v.id=$1::uuid AND v.active AND p.status='active'", variant);
    if (rows.empty()) throw Error(404, "NOT_FOUND", "Inventory item not found");
    return decode(rows[0]["document"].as<std::string>());
}

Json::Value Service::warehouses() const {
    const auto rows = db_->execSqlSync(R"SQL(
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', id, 'code', code, 'name', name, 'active', active
        ) ORDER BY code), '[]'::jsonb)::text AS document
        FROM warehouses
    )SQL");
    return decode(rows[0]["document"].as<std::string>());
}

Json::Value Service::createWarehouse(const Json::Value& body, const auth::Principal& actor,
                                     const std::string& requestId) const {
    static const std::regex codePattern("^[a-z0-9]+(-[a-z0-9]+)*$");
    if (!body.isObject() || !body["code"].isString() || !body["name"].isString() ||
        body["code"].asString().size() > 64 || body["name"].asString().empty() ||
        body["name"].asString().size() > 120 ||
        !std::regex_match(body["code"].asString(), codePattern))
        throw Error(422, "VALIDATION_FAILED", "A lowercase warehouse code and name are required");
    const auto rows = db_->execSqlSync(R"SQL(
            WITH inserted AS (
                INSERT INTO warehouses(code, name) VALUES($1, $2)
                ON CONFLICT (code) DO NOTHING
                RETURNING id, code, name, active
            ), audit AS (
                INSERT INTO audit_logs(actor_id, action, entity_id, request_id, changes)
                SELECT $3::uuid, 'warehouse.created', id, $4::uuid,
                       jsonb_build_object('code', code, 'name', name) FROM inserted
            )
            SELECT jsonb_build_object('id', id, 'code', code, 'name', name, 'active', active)::text AS document
            FROM inserted
        )SQL", body["code"].asString(), body["name"].asString(), actor.id, requestId);
    if (rows.empty())
        throw Error(409, "WAREHOUSE_CONFLICT", "Warehouse code is already in use or the request is invalid");
    return decode(rows[0]["document"].as<std::string>());
}

Json::Value Service::adjust(const Json::Value& body, const auth::Principal& actor,
                            const std::string& requestId) const {
    if (!body.isObject() || !body["warehouseId"].isString() ||
        !body["variantId"].isString() || !body["delta"].isInt() ||
        !body["reason"].isString() || !uuid(body["warehouseId"].asString()) ||
        !uuid(body["variantId"].asString()) || body["delta"].asInt() == 0 ||
        body["delta"].asInt() < -1000000 || body["delta"].asInt() > 1000000 ||
        body["reason"].asString().empty() || body["reason"].asString().size() > 240)
        throw Error(422, "VALIDATION_FAILED", "A valid warehouse, variant, nonzero delta and reason are required");
    const auto rows = db_->execSqlSync(
        "SELECT inventory_adjust($1::uuid,$2::uuid,$3::integer,$4::uuid,$5::uuid,$6)::text AS document",
        body["warehouseId"].asString(), body["variantId"].asString(),
        body["delta"].asInt(), actor.id, requestId, body["reason"].asString());
    const auto result = decode(rows[0]["document"].as<std::string>());
    if (result.isMember("failure")) {
        const auto code = result["failure"].asString();
        const int status = code == "INVALID_REFERENCE" ? 404 : code == "INVALID_ADJUSTMENT" ? 422 : 409;
        const auto message = code == "BELOW_RESERVED" ? "Adjustment would reduce stock below reserved quantity" :
            code == "IDEMPOTENCY_CONFLICT" ? "Idempotency key was already used for a different adjustment" :
            "Inventory adjustment could not be applied";
        throw Error(status, code, message);
    }
    return result;
}

void registerRoutes(std::shared_ptr<Service> service,
                    std::shared_ptr<auth::Service> auth, Executor& executor) {
    drogon::app().registerHandler("/api/v1/admin/warehouses",
        [service, auth, &executor](const drogon::HttpRequestPtr& req, Reply&& cb) {
            dispatch(executor, req, std::move(cb), [=] {
                auth->require(req, "inventory.read");
                return drogon::HttpResponse::newHttpJsonResponse(service->warehouses());
            });
        }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/admin/warehouses",
        [service, auth, &executor](const drogon::HttpRequestPtr& req, Reply&& cb) {
            dispatch(executor, req, std::move(cb), [=] {
                auth->requireOrigin(req);
                const auto actor = auth->require(req, "warehouses.manage");
                auto response = drogon::HttpResponse::newHttpJsonResponse(
                    service->createWarehouse(jsonBody(req), actor, requestId(req)));
                response->setStatusCode(drogon::k201Created);
                return response;
            });
        }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/inventory/products/{1}",
        [service, &executor](const drogon::HttpRequestPtr& req, Reply&& cb, const std::string& variant) {
            dispatch(executor, req, std::move(cb), [=] {
                return drogon::HttpResponse::newHttpJsonResponse(service->availability(variant));
            });
        }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/admin/inventory/adjustments",
        [service, auth, &executor](const drogon::HttpRequestPtr& req, Reply&& cb) {
            dispatch(executor, req, std::move(cb), [=] {
                auth->requireOrigin(req);
                const auto actor = auth->require(req, "inventory.adjust");
                const auto key = req->getHeader("Idempotency-Key");
                if (!uuid(key)) throw Error(400, "IDEMPOTENCY_KEY_REQUIRED", "A UUID Idempotency-Key header is required");
                return drogon::HttpResponse::newHttpJsonResponse(
                    service->adjust(jsonBody(req), actor, key));
            });
        }, {drogon::Post});
}
}
