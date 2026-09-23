CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE CHECK (email = lower(email)),
    password_hash text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE roles (code text PRIMARY KEY);
CREATE TABLE permissions (code text PRIMARY KEY);
CREATE TABLE role_permissions (
    role_code text REFERENCES roles(code), permission_code text REFERENCES permissions(code),
    PRIMARY KEY (role_code, permission_code)
);
CREATE TABLE user_roles (
    user_id uuid REFERENCES users(id), role_code text REFERENCES roles(code), PRIMARY KEY(user_id, role_code)
);
INSERT INTO roles VALUES ('ADMIN'), ('CONTENT_MANAGER');
INSERT INTO permissions VALUES ('products.read'), ('products.write'), ('media.write');
INSERT INTO role_permissions SELECT roles.code, permissions.code FROM roles CROSS JOIN permissions;
CREATE TABLE sessions (
    token_hash char(64) PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE auth_throttles (
    key_hash char(64) PRIMARY KEY, attempts integer NOT NULL,
    resets_at timestamptz NOT NULL
);
CREATE TABLE brands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120)
);
CREATE TABLE categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    parent_id uuid REFERENCES categories(id), CHECK(parent_id IS DISTINCT FROM id)
);
CREATE TABLE category_translations (
    category_id uuid REFERENCES categories(id), locale text CHECK(locale IN ('ru','ro')),
    name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120), PRIMARY KEY(category_id, locale)
);
CREATE TABLE products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    brand_id uuid REFERENCES brands(id),
    status text NOT NULL CHECK(status IN ('draft','active','archived')) DEFAULT 'draft',
    revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_categories (
    product_id uuid REFERENCES products(id), category_id uuid REFERENCES categories(id),
    PRIMARY KEY(product_id, category_id)
);
CREATE TABLE product_translations (
    product_id uuid REFERENCES products(id), locale text CHECK(locale IN ('ru','ro')),
    name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
    description text NOT NULL DEFAULT '' CHECK(length(description) <= 20000),
    seo_title text NOT NULL DEFAULT '' CHECK(length(seo_title) <= 200),
    seo_description text NOT NULL DEFAULT '' CHECK(length(seo_description) <= 500),
    PRIMARY KEY(product_id, locale)
);
CREATE INDEX product_search_idx ON product_translations USING gin (
    to_tsvector('simple', name || ' ' || description)
);
CREATE TABLE product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id),
    sku text NOT NULL UNIQUE CHECK(length(sku) BETWEEN 1 AND 64),
    name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
    price_minor bigint NOT NULL CHECK(price_minor BETWEEN 0 AND 100000000),
    currency char(3) NOT NULL DEFAULT 'MDL' CHECK(currency = 'MDL'),
    active boolean NOT NULL DEFAULT true
);
CREATE INDEX product_variants_product_idx ON product_variants(product_id);
CREATE TABLE product_attributes (
    code text PRIMARY KEY CHECK(code ~ '^[a-z][a-z0-9_]{0,39}$'),
    name_ru text NOT NULL, name_ro text NOT NULL, unit text NOT NULL DEFAULT ''
);
CREATE TABLE product_attribute_values (
    variant_id uuid REFERENCES product_variants(id), attribute_code text REFERENCES product_attributes(code),
    value text NOT NULL CHECK(length(value) <= 300), PRIMARY KEY(variant_id, attribute_code)
);
CREATE TABLE media_objects (
    id uuid PRIMARY KEY, created_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    width integer NOT NULL CHECK(width > 0), height integer NOT NULL CHECK(height > 0)
);
CREATE TABLE product_images (
    product_id uuid REFERENCES products(id), media_id uuid REFERENCES media_objects(id),
    position integer NOT NULL CHECK(position BETWEEN 0 AND 9),
    PRIMARY KEY(product_id, media_id), UNIQUE(product_id, position)
);
CREATE TABLE audit_logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id uuid NOT NULL REFERENCES users(id), action text NOT NULL,
    entity_id uuid NOT NULL, request_id uuid NOT NULL,
    changes jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);

-- Central read model: one projection for public and administrative callers.
CREATE FUNCTION catalog_document(product_key uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
   'id', p.id, 'slug', p.slug, 'status', p.status, 'revision', p.revision,
   'brandId', p.brand_id,
   'categoryIds', COALESCE((SELECT jsonb_agg(category_id ORDER BY category_id) FROM product_categories WHERE product_id=p.id), '[]'),
   'translations', COALESCE((SELECT jsonb_object_agg(locale, jsonb_build_object('name',name,'description',description,'seoTitle',seo_title,'seoDescription',seo_description)) FROM product_translations WHERE product_id=p.id), '{}'),
   'variants', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'name',v.name,'priceMinor',v.price_minor,'currency',v.currency,'active',v.active,
     'attributes',COALESCE((SELECT jsonb_object_agg(attribute_code,value) FROM product_attribute_values WHERE variant_id=v.id),'{}')) ORDER BY v.sku)
     FROM product_variants v WHERE v.product_id=p.id), '[]'),
   'images', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',media_id,'url','/api/v1/media/'||media_id||'/640.webp','srcSet','/api/v1/media/'||media_id||'/320.webp 320w, /api/v1/media/'||media_id||'/640.webp 640w, /api/v1/media/'||media_id||'/1280.webp 1280w') ORDER BY position) FROM product_images WHERE product_id=p.id), '[]')
 ) FROM products p WHERE p.id=product_key
$$;
