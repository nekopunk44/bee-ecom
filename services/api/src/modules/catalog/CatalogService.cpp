#include "Catalog.hpp"
#include "platform/Errors.hpp"
#include <regex>
#include <set>
#include <charconv>
#include <algorithm>

namespace bee::catalog {
bool uuid(const std::string& value) {
    static const std::regex pattern("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    return std::regex_match(value, pattern);
}
namespace {
void text(const Json::Value& value, const char* field, size_t min, size_t max) {
    if(!value[field].isString()) throw Error(422,"VALIDATION_FAILED",std::string("Invalid field: ")+field);
    const auto raw=value[field].asString();
    const auto count=static_cast<size_t>(std::count_if(raw.begin(),raw.end(),[](unsigned char c){return (c&0xc0)!=0x80;}));
    if (count<min || count>max || (min>0 && raw.find_first_not_of(" \t\r\n")==std::string::npos))
        throw Error(422,"VALIDATION_FAILED",std::string("Invalid field: ")+field);
}
void ids(const Json::Value& values, size_t min, size_t max) {
    if (!values.isArray() || values.size()<min || values.size()>max) throw Error(422,"VALIDATION_FAILED","Invalid reference list");
    std::set<std::string> unique;
    for (const auto& value : values) if (!value.isString() || !uuid(value.asString()) || !unique.insert(value.asString()).second)
        throw Error(422,"VALIDATION_FAILED","Invalid or duplicate reference");
}
long long integer(const std::string& input, long long fallback, long long max) {
    if (input.empty()) return fallback;
    long long value;
    const auto [end,error]=std::from_chars(input.data(),input.data()+input.size(),value);
    if (error!=std::errc{} || end!=input.data()+input.size() || value<0 || value>max) throw Error(400,"INVALID_FILTER","Invalid numeric filter");
    return value;
}
void publicDocument(Json::Value& product) {
    Json::Value variants(Json::arrayValue);
    for (const auto& variant: product["variants"]) if (variant["active"].asBool()) variants.append(variant);
    product["variants"] = std::move(variants);
}
}
void validateDraft(const Json::Value& draft) {
    if (!draft.isObject()) throw Error(422,"VALIDATION_FAILED","A product object is required");
    text(draft,"slug",1,160); text(draft,"status",1,20);
    static const std::regex slug("^[a-z0-9]+(-[a-z0-9]+)*$");
    if (!std::regex_match(draft["slug"].asString(),slug)) throw Error(422,"VALIDATION_FAILED","Invalid slug");
    const auto status=draft["status"].asString();
    if (status!="draft" && status!="active" && status!="archived") throw Error(422,"VALIDATION_FAILED","Invalid product status");
    if (!draft["brandId"].isNull() && (!draft["brandId"].isString() || !uuid(draft["brandId"].asString()))) throw Error(422,"VALIDATION_FAILED","Invalid brand");
    ids(draft["categoryIds"],1,10); ids(draft["mediaIds"],0,10);
    const auto& translations=draft["translations"];
    if (!translations.isObject() || translations.size()!=2) throw Error(422,"VALIDATION_FAILED","Russian and Romanian translations are required");
    for (const auto* locale:{"ru","ro"}) {
        text(translations[locale],"name",1,200); text(translations[locale],"description",0,20000);
        text(translations[locale],"seoTitle",0,200); text(translations[locale],"seoDescription",0,500);
    }
    const auto& variants=draft["variants"];
    if (!variants.isArray() || variants.empty() || variants.size()>50) throw Error(422,"VALIDATION_FAILED","Between 1 and 50 variants are required");
    std::set<std::string> skus, variantIds;
    bool active=false;
    for (const auto& variant: variants) {
        text(variant,"sku",1,64); text(variant,"name",1,160);
        if (!skus.insert(variant["sku"].asString()).second) throw Error(422,"VALIDATION_FAILED","Duplicate SKU");
        if (variant.isMember("id") && (!variant["id"].isString() || !uuid(variant["id"].asString()) || !variantIds.insert(variant["id"].asString()).second)) throw Error(422,"VALIDATION_FAILED","Invalid variant ID");
        if (!variant["priceMinor"].isInt64() || variant["priceMinor"].asInt64()<0 || variant["priceMinor"].asInt64()>100000000 || !variant["active"].isBool()) throw Error(422,"VALIDATION_FAILED","Invalid price or availability flag");
        active = active || variant["active"].asBool();
        if (!variant["attributes"].isObject() || variant["attributes"].size()>30) throw Error(422,"VALIDATION_FAILED","Invalid attributes");
        for (const auto& key: variant["attributes"].getMemberNames()) text(variant["attributes"],key.c_str(),1,300);
    }
    if (status=="active" && !active) throw Error(422,"VALIDATION_FAILED","An active product needs an active variant");
}
Filter parseFilter(const drogon::HttpRequestPtr& req) {
    Filter f;
    if (!req->getParameter("locale").empty()) f.locale=req->getParameter("locale");
    if(f.locale!="ru" && f.locale!="ro") throw Error(400,"INVALID_FILTER","Unsupported locale");
    f.query=req->getParameter("q"); f.category=req->getParameter("category"); f.brand=req->getParameter("brand");
    if(f.query.size()>200 || (!f.category.empty() && !uuid(f.category)) || (!f.brand.empty() && !uuid(f.brand))) throw Error(400,"INVALID_FILTER","Invalid search filter");
    if(!req->getParameter("sort").empty()) f.sort=req->getParameter("sort");
    if(f.sort!="newest" && f.sort!="price_asc" && f.sort!="price_desc" && f.sort!="name") throw Error(400,"INVALID_FILTER","Invalid sorting");
    f.page=static_cast<int>(integer(req->getParameter("page"),1,10000)); f.limit=static_cast<int>(integer(req->getParameter("limit"),12,48));
    f.minPrice=integer(req->getParameter("minPrice"),0,100000000); f.maxPrice=integer(req->getParameter("maxPrice"),100000000,100000000);
    if(!f.page || !f.limit || f.minPrice>f.maxPrice) throw Error(400,"INVALID_FILTER","Invalid page or price range");
    return f;
}
Json::Value Service::list(const Filter& filter,bool admin) const {
    auto result=repository_->list(filter,admin);
    if(!admin) for(auto& item: result["items"]) publicDocument(item);
    return result;
}
Json::Value Service::find(const std::string& key,bool admin) const {
    if(key.empty() || key.size()>160 || (admin && !uuid(key))) throw Error(404,"NOT_FOUND","Product not found");
    auto result=repository_->find(key,admin);
    if(result.isNull()) throw Error(404,"NOT_FOUND","Product not found");
    if(!admin) publicDocument(result);
    return result;
}
Json::Value Service::save(const Json::Value& draft,const std::string& actor,const std::string& correlation,const std::string& id,int revision) const {
    validateDraft(draft);
    if(!id.empty() && (!uuid(id) || revision<1)) throw Error(422,"VALIDATION_FAILED","A valid revision and ID are required");
    auto result=repository_->save(draft,actor,correlation,id,revision);
    if(result.isMember("failure")) {
        const auto code=result["failure"].asString();
        throw Error(code=="NOT_FOUND"?404:code=="INVALID_REFERENCE"?422:409,code,
            code=="REVISION_CONFLICT"?"The product changed. Reload before editing again":"Product could not be saved. Check SKU, slug and references");
    }
    return result;
}
Json::Value Service::addReference(const std::string& kind,const Json::Value& body,const std::string& actor,const std::string& correlation) const {
    static const std::regex slug("^[a-z0-9]+(-[a-z0-9]+)*$"), code("^[a-z][a-z0-9_]{0,39}$");
    text(body,kind=="attributes"?"code":"slug",1,120);
    if(kind=="attributes") {
        if(!std::regex_match(body["code"].asString(),code)) throw Error(422,"VALIDATION_FAILED","Invalid attribute code");
        text(body,"unit",0,20);
    } else if(!std::regex_match(body["slug"].asString(),slug)) throw Error(422,"VALIDATION_FAILED","Invalid slug");
    if(kind=="brands") text(body,"name",1,120);
    else { text(body,"nameRu",1,120); text(body,"nameRo",1,120); }
    return repository_->addReference(kind,body,actor,correlation);
}
}
