CREATE FUNCTION catalog_save(body jsonb, actor uuid, correlation uuid, target uuid DEFAULT NULL, expected integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  product_key uuid := COALESCE(target, gen_random_uuid());
  previous jsonb;
  item jsonb;
  variant_key uuid;
  retained uuid[] := ARRAY[]::uuid[];
BEGIN
  IF target IS NOT NULL THEN
    PERFORM 1 FROM products WHERE id=target FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('failure','NOT_FOUND'); END IF;
    SELECT catalog_document(target) INTO previous;
    IF (previous->>'revision')::integer IS DISTINCT FROM expected THEN
      RETURN jsonb_build_object('failure','REVISION_CONFLICT');
    END IF;
    UPDATE products SET slug=body->>'slug', brand_id=(body->>'brandId')::uuid,
      status=body->>'status', revision=revision+1, updated_at=now() WHERE id=target;
  ELSE
    INSERT INTO products(id,slug,brand_id,status)
      VALUES(product_key,body->>'slug',(body->>'brandId')::uuid,body->>'status');
  END IF;
  DELETE FROM product_categories WHERE product_id=product_key;
  INSERT INTO product_categories SELECT product_key, value::uuid FROM jsonb_array_elements_text(body->'categoryIds');
  DELETE FROM product_translations WHERE product_id=product_key;
  INSERT INTO product_translations(product_id,locale,name,description,seo_title,seo_description)
    SELECT product_key,key,value->>'name',value->>'description',value->>'seoTitle',value->>'seoDescription'
    FROM jsonb_each(body->'translations');
  FOR item IN SELECT value FROM jsonb_array_elements(body->'variants') LOOP
    variant_key := COALESCE((item->>'id')::uuid,gen_random_uuid());
    IF item ? 'id' AND NOT EXISTS(SELECT 1 FROM product_variants WHERE id=variant_key AND product_id=product_key) THEN
      RAISE EXCEPTION 'Invalid variant identity' USING ERRCODE='22023';
    END IF;
    INSERT INTO product_variants(id,product_id,sku,name,price_minor,active)
      VALUES(variant_key,product_key,item->>'sku',item->>'name',(item->>'priceMinor')::bigint,(item->>'active')::boolean)
      ON CONFLICT(id) DO UPDATE SET sku=excluded.sku,name=excluded.name,price_minor=excluded.price_minor,active=excluded.active;
    retained := array_append(retained,variant_key);
    DELETE FROM product_attribute_values WHERE variant_id=variant_key;
    INSERT INTO product_attribute_values SELECT variant_key,key,value FROM jsonb_each_text(item->'attributes');
  END LOOP;
  UPDATE product_variants SET active=false WHERE product_id=product_key AND NOT(id=ANY(retained));
  DELETE FROM product_images WHERE product_id=product_key;
  INSERT INTO product_images(product_id,media_id,position)
    SELECT product_key,value::uuid,(ordinality-1)::integer FROM jsonb_array_elements_text(body->'mediaIds') WITH ORDINALITY;
  INSERT INTO audit_logs(actor_id,action,entity_id,request_id,changes)
    VALUES(actor,CASE WHEN target IS NULL THEN 'product.created' ELSE 'product.updated' END,product_key,correlation,
      jsonb_build_object('oldRevision',previous->'revision','newRevision',(SELECT revision FROM products WHERE id=product_key),'status',body->'status'));
  RETURN catalog_document(product_key);
EXCEPTION
  WHEN unique_violation THEN RETURN jsonb_build_object('failure','DUPLICATE_SLUG_OR_SKU');
  WHEN foreign_key_violation OR check_violation OR invalid_text_representation OR invalid_parameter_value
    THEN RETURN jsonb_build_object('failure','INVALID_REFERENCE');
END
$$;
