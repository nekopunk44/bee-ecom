#include "Media.hpp"
#include "platform/Errors.hpp"
#include <curl/curl.h>
#include <regex>

namespace bee::media {
S3Storage::S3Storage()
    : endpoint_(auth::requiredEnv("S3_ENDPOINT")),bucket_(auth::requiredEnv("S3_BUCKET")),
      credentials_(auth::requiredEnv("S3_ACCESS_KEY")+":"+auth::requiredEnv("S3_SECRET_KEY")),
      signing_("aws:amz:"+auth::requiredEnv("S3_REGION")+":s3") {
    if (!std::regex_match(bucket_,std::regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")) || endpoint_.ends_with('/'))
        throw std::invalid_argument("Invalid S3 configuration");
    if (auth::requiredEnv("APP_ENV")!="development" && auth::requiredEnv("APP_ENV")!="test" && !endpoint_.starts_with("https://"))
        throw std::invalid_argument("S3 requires TLS outside development");
}
std::string S3Storage::request(const std::string& key,const std::string* data) const {
    using Handle=std::unique_ptr<CURL,decltype(&curl_easy_cleanup)>;
    Handle handle(curl_easy_init(),curl_easy_cleanup);
    if(!handle) throw Error(503,"STORAGE_UNAVAILABLE","Media storage is unavailable");
    std::string result;
    const auto url=endpoint_+"/"+bucket_+"/"+key;
    curl_easy_setopt(handle.get(),CURLOPT_URL,url.c_str());
    curl_easy_setopt(handle.get(),CURLOPT_AWS_SIGV4,signing_.c_str());
    curl_easy_setopt(handle.get(),CURLOPT_USERPWD,credentials_.c_str());
    curl_easy_setopt(handle.get(),CURLOPT_CONNECTTIMEOUT,3L);
    curl_easy_setopt(handle.get(),CURLOPT_TIMEOUT,15L);
    curl_easy_setopt(handle.get(),CURLOPT_NOSIGNAL,1L);
    curl_easy_setopt(handle.get(),CURLOPT_PROTOCOLS_STR,"http,https");
    curl_easy_setopt(handle.get(),CURLOPT_WRITEFUNCTION,+[](char* bytes,size_t size,size_t count,void* output)->size_t {
        auto& value=*static_cast<std::string*>(output); const auto length=size*count;
        if(value.size()+length>10*1024*1024) return 0;
        value.append(bytes,length); return length;
    });
    curl_easy_setopt(handle.get(),CURLOPT_WRITEDATA,&result);
    if(data) {
        curl_easy_setopt(handle.get(),CURLOPT_CUSTOMREQUEST,"PUT");
        curl_easy_setopt(handle.get(),CURLOPT_POSTFIELDS,data->data());
        curl_easy_setopt(handle.get(),CURLOPT_POSTFIELDSIZE_LARGE,static_cast<curl_off_t>(data->size()));
    }
    curl_slist* rawHeaders=nullptr;
    rawHeaders=curl_slist_append(rawHeaders,"Content-Type: image/webp");
    const auto payloadHash="x-amz-content-sha256: "+auth::hashToken(data?*data:std::string{});
    rawHeaders=curl_slist_append(rawHeaders,payloadHash.c_str());
    std::unique_ptr<curl_slist,decltype(&curl_slist_free_all)> headers(rawHeaders,curl_slist_free_all);
    curl_easy_setopt(handle.get(),CURLOPT_HTTPHEADER,headers.get());
    const auto code=curl_easy_perform(handle.get()); long status=0;
    curl_easy_getinfo(handle.get(),CURLINFO_RESPONSE_CODE,&status);
    if(status==404) throw Error(404,"NOT_FOUND","Image not found");
    if(code!=CURLE_OK || status<200 || status>=300) throw Error(503,"STORAGE_UNAVAILABLE","Media storage is unavailable");
    return result;
}
void S3Storage::put(const std::string& key,const std::string& data) const { request(key,&data); }
std::string S3Storage::get(const std::string& key) const { return request(key,nullptr); }
}
