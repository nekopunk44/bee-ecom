#include "modules/catalog/Catalog.hpp"
#include "platform/Json.hpp"
#include "platform/Errors.hpp"
#include <iostream>

int main() {
    const auto draft=bee::decode(R"JSON({"slug":"test-hive","status":"active","brandId":null,"categoryIds":["11111111-1111-4111-8111-111111111111"],"mediaIds":[],"translations":{"ru":{"name":"Улей","description":"","seoTitle":"","seoDescription":""},"ro":{"name":"Stup","description":"","seoTitle":"","seoDescription":""}},"variants":[{"sku":"T-1","name":"Standard","priceMinor":10050,"active":true,"attributes":{}}]})JSON");
    auto reject=[](const Json::Value& value) {
        try { bee::catalog::validateDraft(value); } catch(const bee::Error& error) { if(error.status==422)return; }
        throw std::runtime_error("Invalid draft accepted");
    };
    try {
        bee::catalog::validateDraft(draft);
        auto invalid=draft; invalid["variants"][0]["priceMinor"]=-1; reject(invalid);
        invalid=draft; invalid["variants"][0]["priceMinor"]=10.1; reject(invalid);
        invalid=draft; invalid["variants"][0]["active"]=false; reject(invalid);
        invalid=draft; invalid["variants"].append(invalid["variants"][0]); reject(invalid);
        invalid=draft; invalid["categoryIds"].append(invalid["categoryIds"][0]); reject(invalid);
        invalid=draft; invalid["translations"].removeMember("ro"); reject(invalid);
        invalid=draft; invalid["slug"]="../unsafe"; reject(invalid);
        invalid=draft; invalid["translations"]["ru"]["name"]="   "; reject(invalid);
        std::cout << "Catalog validation boundary checks passed\n";
    } catch(const std::exception& error) {std::cerr << error.what() << '\n';return 1;}
}
