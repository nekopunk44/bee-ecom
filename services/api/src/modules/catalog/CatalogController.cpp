#include "Catalog.hpp"
#include "platform/Endpoint.hpp"

namespace bee::catalog {
void registerRoutes(std::shared_ptr<Service> service,std::shared_ptr<auth::Service> auth,Executor& executor) {
    for (bool admin:{false,true}) {
        const std::string base=admin?"/api/v1/admin/products":"/api/v1/products";
        drogon::app().registerHandler(base,[service,auth,&executor,admin](const drogon::HttpRequestPtr& req,Reply&& cb) {
            dispatch(executor,req,std::move(cb),[=] { if(admin) auth->require(req,"products.read"); return drogon::HttpResponse::newHttpJsonResponse(service->list(parseFilter(req),admin)); });
        },{drogon::Get});
        drogon::app().registerHandler(base+"/{1}",[service,auth,&executor,admin](const drogon::HttpRequestPtr& req,Reply&& cb,const std::string& key) {
            dispatch(executor,req,std::move(cb),[=] { if(admin) auth->require(req,"products.read"); return drogon::HttpResponse::newHttpJsonResponse(service->find(key,admin)); });
        },{drogon::Get});
    }
    drogon::app().registerHandler("/api/v1/catalog/metadata",[service,&executor](const drogon::HttpRequestPtr& req,Reply&& cb) {
        dispatch(executor,req,std::move(cb),[=] { return drogon::HttpResponse::newHttpJsonResponse(service->metadata(parseFilter(req).locale)); });
    },{drogon::Get});
    drogon::app().registerHandler("/api/v1/admin/products",[service,auth,&executor](const drogon::HttpRequestPtr& req,Reply&& cb) {
        dispatch(executor,req,std::move(cb),[=] {
            auth->requireOrigin(req); const auto principal=auth->require(req,"products.write");
            auto response=drogon::HttpResponse::newHttpJsonResponse(service->save(jsonBody(req),principal.id,requestId(req),"",0));
            response->setStatusCode(drogon::k201Created); return response;
        });
    },{drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/products/{1}",[service,auth,&executor](const drogon::HttpRequestPtr& req,Reply&& cb,const std::string& id) {
        dispatch(executor,req,std::move(cb),[=] {
            auth->requireOrigin(req); const auto principal=auth->require(req,"products.write"); auto body=jsonBody(req);
            if(!body["revision"].isInt()) throw Error(422,"VALIDATION_FAILED","Revision is required");
            return drogon::HttpResponse::newHttpJsonResponse(service->save(body,principal.id,requestId(req),id,body["revision"].asInt()));
        });
    },{drogon::Put});
    for (const std::string kind:{"categories","brands","attributes"}) {
        drogon::app().registerHandler("/api/v1/admin/"+kind,[service,auth,&executor,kind](const drogon::HttpRequestPtr& req,Reply&& cb) {
            dispatch(executor,req,std::move(cb),[=] {
                auth->requireOrigin(req); const auto principal=auth->require(req,"products.write");
                auto response=drogon::HttpResponse::newHttpJsonResponse(service->addReference(kind,jsonBody(req),principal.id,requestId(req)));
                response->setStatusCode(drogon::k201Created); return response;
            });
        },{drogon::Post});
    }
}
}
