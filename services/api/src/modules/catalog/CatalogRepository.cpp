#include "Catalog.hpp"
#include "platform/Json.hpp"
#include "platform/Errors.hpp"

namespace bee::catalog {
Json::Value Repository::list(const Filter& f,bool admin) const {
    const auto rows=db_->execSqlSync(R"SQL(
      WITH filtered AS (
        SELECT p.id,p.created_at,t.name,min(v.price_minor) AS price
        FROM products p JOIN product_translations t ON t.product_id=p.id AND t.locale=$1
        JOIN product_variants v ON v.product_id=p.id AND ($2::boolean OR v.active)
        WHERE ($2::boolean OR p.status='active')
          AND ($3='' OR to_tsvector('simple',t.name||' '||t.description) @@ plainto_tsquery('simple',$3) OR t.name ILIKE '%'||replace(replace(replace($3,'\','\\'),'%','\%'),'_','\_')||'%')
          AND ($4='' OR EXISTS(SELECT 1 FROM product_categories pc WHERE pc.product_id=p.id AND pc.category_id=NULLIF($4,'')::uuid))
          AND ($5='' OR p.brand_id=NULLIF($5,'')::uuid)
          AND v.price_minor BETWEEN $6::bigint AND $7::bigint
        GROUP BY p.id,t.name
      ), page AS (
        SELECT * FROM filtered ORDER BY
          CASE WHEN $8='price_asc' THEN price END ASC,
          CASE WHEN $8='price_desc' THEN price END DESC,
          CASE WHEN $8='name' THEN name END ASC,
          created_at DESC,id LIMIT $9 OFFSET $10
      )
      SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(catalog_document(id)) FROM page),'[]'),
        'total',(SELECT count(*) FROM filtered),'page',$11::integer,'limit',$9::integer)::text AS document
    )SQL", f.locale,admin,f.query,f.category,f.brand,f.minPrice,f.maxPrice,f.sort,f.limit,(f.page-1)*f.limit,f.page);
    return decode(rows[0]["document"].as<std::string>());
}
Json::Value Repository::find(const std::string& key,bool admin) const {
    const auto rows=admin ? db_->execSqlSync("SELECT catalog_document(id)::text AS document FROM products WHERE id=$1::uuid",key)
        : db_->execSqlSync("SELECT catalog_document(id)::text AS document FROM products WHERE slug=$1 AND status='active' AND EXISTS(SELECT 1 FROM product_variants WHERE product_id=products.id AND active)",key);
    return rows.empty()?Json::Value():decode(rows[0]["document"].as<std::string>());
}
Json::Value Repository::metadata(const std::string& locale) const {
    const auto rows=db_->execSqlSync(R"SQL(
      SELECT jsonb_build_object(
        'categories',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,'name',t.name) ORDER BY t.name) FROM categories c JOIN category_translations t ON t.category_id=c.id AND t.locale=$1),'[]'),
        'brands',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'slug',slug,'name',name) ORDER BY name) FROM brands),'[]'),
        'attributes',COALESCE((SELECT jsonb_agg(jsonb_build_object('code',code,'name',CASE WHEN $1='ro' THEN name_ro ELSE name_ru END,'unit',unit) ORDER BY code) FROM product_attributes),'[]')
      )::text AS document
    )SQL",locale);
    return decode(rows[0]["document"].as<std::string>());
}
Json::Value Repository::save(const Json::Value& draft,const std::string& actor,const std::string& correlation,const std::string& id,int revision) const {
    const auto rows=db_->execSqlSync("SELECT catalog_save($1::jsonb,$2::uuid,$3::uuid,NULLIF($4,'')::uuid,$5::integer)::text AS document",encode(draft),actor,correlation,id,revision);
    return decode(rows[0]["document"].as<std::string>());
}
Json::Value Repository::addReference(const std::string& kind,const Json::Value& body,const std::string& actor,const std::string& correlation) const {
    // A single transaction includes both reference and audit record; JSON keys are validated in the service.
    const std::string sql=kind=="brands"?R"SQL(
      WITH inserted AS (INSERT INTO brands(slug,name) VALUES($1::jsonb->>'slug',$1::jsonb->>'name') RETURNING id),
      audit AS (INSERT INTO audit_logs(actor_id,action,entity_id,request_id) SELECT $2::uuid,'brand.created',id,$3::uuid FROM inserted)
      SELECT id::text FROM inserted
    )SQL":kind=="categories"?R"SQL(
      WITH inserted AS (INSERT INTO categories(slug) VALUES($1::jsonb->>'slug') RETURNING id),
      translations AS (INSERT INTO category_translations SELECT id,'ru',$1::jsonb->>'nameRu' FROM inserted UNION ALL SELECT id,'ro',$1::jsonb->>'nameRo' FROM inserted),
      audit AS (INSERT INTO audit_logs(actor_id,action,entity_id,request_id) SELECT $2::uuid,'category.created',id,$3::uuid FROM inserted)
      SELECT id::text FROM inserted
    )SQL":R"SQL(
      WITH inserted AS (INSERT INTO product_attributes(code,name_ru,name_ro,unit) VALUES($1::jsonb->>'code',$1::jsonb->>'nameRu',$1::jsonb->>'nameRo',$1::jsonb->>'unit') RETURNING code),
      audit AS (INSERT INTO audit_logs(actor_id,action,entity_id,request_id,changes) SELECT $2::uuid,'attribute.created',gen_random_uuid(),$3::uuid,jsonb_build_object('code',code) FROM inserted)
      SELECT code AS id FROM inserted
    )SQL";
    try { const auto rows=db_->execSqlSync(sql,encode(body),actor,correlation); Json::Value result; result["id"]=rows[0]["id"].as<std::string>(); return result; }
    catch(const drogon::orm::DrogonDbException&) { throw Error(409,"REFERENCE_CONFLICT","The reference could not be created. Refresh and check for duplicates"); }
}
}
