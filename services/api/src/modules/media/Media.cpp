#include "Media.hpp"
#include "modules/catalog/Catalog.hpp"
#include "platform/Endpoint.hpp"
#include <vips/vips.h>

namespace bee::media {
Json::Value Service::upload(const std::string& bytes,const std::string& actor,const std::string& correlation) const {
    if(bytes.empty() || bytes.size()>8*1024*1024) throw Error(413,"IMAGE_TOO_LARGE","Images must be smaller than 8 MB");
    // Only raster formats with known decoders. No SVG, PDF or remote references.
    const bool jpeg=bytes.size()>3 && static_cast<unsigned char>(bytes[0])==0xff && static_cast<unsigned char>(bytes[1])==0xd8 && static_cast<unsigned char>(bytes[2])==0xff;
    const bool png=bytes.size()>8 && bytes.compare(0,8,"\x89PNG\r\n\x1a\n",8)==0;
    const bool webp=bytes.size()>12 && bytes.substr(0,4)=="RIFF" && bytes.substr(8,4)=="WEBP";
    if(!jpeg && !png && !webp) throw Error(415,"INVALID_IMAGE","Upload a JPEG, PNG or WebP image");
    const auto release=[](VipsImage* image){ if(image) g_object_unref(image); };
    using Image=std::unique_ptr<VipsImage,decltype(release)>;
    Image original(vips_image_new_from_buffer(bytes.data(),bytes.size(),"","access",VIPS_ACCESS_SEQUENTIAL,nullptr),release);
    if(!original) { vips_error_clear(); throw Error(422,"INVALID_IMAGE","Image could not be decoded"); }
    const int width=vips_image_get_width(original.get()),height=vips_image_get_height(original.get());
    if(width<1 || height<1 || static_cast<long long>(width)*height>40000000) throw Error(422,"INVALID_IMAGE","Image dimensions exceed the limit");
    const auto id=drogon::utils::getUuid();
    for(int size:{320,640,1280}) {
        VipsImage* resized=nullptr;
        if(vips_thumbnail_buffer(const_cast<char*>(bytes.data()),bytes.size(),&resized,size,"height",size,"size",VIPS_SIZE_DOWN,nullptr)) {
            vips_error_clear(); throw Error(422,"INVALID_IMAGE","Image could not be resized");
        }
        Image image(resized,release); void* buffer=nullptr; size_t length=0;
        if(vips_webpsave_buffer(image.get(),&buffer,&length,"Q",82,"strip",TRUE,nullptr)) {
            vips_error_clear(); throw Error(422,"INVALID_IMAGE","Image could not be encoded");
        }
        std::unique_ptr<void,decltype(&g_free)> owned(buffer,g_free);
        storage_->put("products/"+id+"/"+std::to_string(size)+".webp",std::string(static_cast<char*>(buffer),length));
    }
    db_->execSqlSync(R"SQL(
      WITH media AS (INSERT INTO media_objects(id,created_by,width,height) VALUES($1::uuid,$2::uuid,$3,$4))
      INSERT INTO audit_logs(actor_id,action,entity_id,request_id) VALUES($2::uuid,'media.created',$1::uuid,$5::uuid)
    )SQL",id,actor,width,height,correlation);
    Json::Value result; result["id"]=id; result["url"]="/api/v1/media/"+id+"/640.webp";
    result["srcSet"]="/api/v1/media/"+id+"/320.webp 320w, /api/v1/media/"+id+"/640.webp 640w, /api/v1/media/"+id+"/1280.webp 1280w";
    return result;
}
bool Service::published(const std::string& id) const {
    return !db_->execSqlSync("SELECT 1 FROM product_images i JOIN products p ON p.id=i.product_id WHERE i.media_id=$1::uuid AND p.status='active' LIMIT 1",id).empty();
}
std::string Service::image(const std::string& id,int width) const {
    return storage_->get("products/"+id+"/"+std::to_string(width)+".webp");
}
void registerRoutes(std::shared_ptr<Service> service,std::shared_ptr<auth::Service> auth,Executor& executor) {
    drogon::app().registerHandler("/api/v1/admin/media",[service,auth,&executor](const drogon::HttpRequestPtr& req,Reply&& cb) {
        dispatch(executor,req,std::move(cb),[=] {
            auth->requireOrigin(req); const auto principal=auth->require(req,"media.write");
            auto response=drogon::HttpResponse::newHttpJsonResponse(service->upload(std::string(req->body()),principal.id,requestId(req)));
            response->setStatusCode(drogon::k201Created); return response;
        });
    },{drogon::Post});
    drogon::app().registerHandler("/api/v1/media/{1}/{2}",[service,auth,&executor](const drogon::HttpRequestPtr& req,Reply&& cb,const std::string& id,const std::string& filename) {
        dispatch(executor,req,std::move(cb),[=] {
            if(!catalog::uuid(id) || (filename!="320.webp" && filename!="640.webp" && filename!="1280.webp")) throw Error(404,"NOT_FOUND","Image not found");
            if(!service->published(id)) auth->require(req,"media.write");
            auto response=drogon::HttpResponse::newHttpResponse(); response->setContentTypeString("image/webp");
            response->setBody(service->image(id,std::stoi(filename))); return response;
        });
    },{drogon::Get});
}
}
