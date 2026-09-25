CREATE TABLE customer_carts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customer_cart_items (
    cart_id uuid NOT NULL REFERENCES customer_carts(id) ON DELETE CASCADE,
    variant_id uuid NOT NULL REFERENCES product_variants(id),
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (cart_id, variant_id)
);
CREATE INDEX customer_cart_items_variant_idx ON customer_cart_items(variant_id);

CREATE FUNCTION customer_cart_document(customer uuid, language text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'variantId', v.id,
            'productSlug', p.slug,
            'sku', v.sku,
            'name', COALESCE(selected.name, fallback.name, p.slug),
            'variantName', v.name,
            'quantity', ci.quantity,
            'unitPriceMinor', v.price_minor,
            'currency', v.currency,
            'available', CASE WHEN v.active AND p.status = 'active'
                              THEN COALESCE(stock.available, 0) ELSE 0 END
        ) ORDER BY p.slug, v.sku)
        FROM customer_carts c
        JOIN customer_cart_items ci ON ci.cart_id = c.id
        JOIN product_variants v ON v.id = ci.variant_id
        JOIN products p ON p.id = v.product_id
        LEFT JOIN product_translations selected ON selected.product_id = p.id AND selected.locale = language
        LEFT JOIN product_translations fallback ON fallback.product_id = p.id AND fallback.locale = CASE language WHEN 'ru' THEN 'ro' ELSE 'ru' END
        LEFT JOIN LATERAL (
            SELECT sum(b.on_hand - b.reserved)::integer AS available
            FROM inventory_balances b JOIN warehouses w ON w.id = b.warehouse_id AND w.active
            WHERE b.variant_id = v.id
        ) stock ON true
        WHERE c.user_id = customer AND language IN ('ru', 'ro')
    ), '[]'::jsonb)
    )
$$;

CREATE FUNCTION customer_cart_set_item(customer uuid, variant uuid, amount integer, language text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    cart uuid;
    distinct_items integer;
BEGIN
    IF customer IS NULL OR variant IS NULL OR amount IS NULL OR amount NOT BETWEEN 1 AND 100 THEN
        RETURN jsonb_build_object('failure', 'INVALID_CART_ITEM');
    END IF;
    IF language NOT IN ('ru', 'ro') THEN
        RETURN jsonb_build_object('failure', 'INVALID_LOCALE');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE v.id = variant AND v.active AND p.status = 'active'
    ) THEN
        RETURN jsonb_build_object('failure', 'ITEM_UNAVAILABLE');
    END IF;

    INSERT INTO customer_carts(user_id) VALUES(customer)
        ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
        RETURNING id INTO cart;
    SELECT count(*) INTO distinct_items FROM customer_cart_items WHERE cart_id = cart;
    IF distinct_items >= 50 AND NOT EXISTS (
        SELECT 1 FROM customer_cart_items WHERE cart_id = cart AND variant_id = variant
    ) THEN
        RETURN jsonb_build_object('failure', 'CART_LIMIT_REACHED');
    END IF;
    INSERT INTO customer_cart_items(cart_id, variant_id, quantity)
        VALUES(cart, variant, amount)
        ON CONFLICT (cart_id, variant_id) DO UPDATE
        SET quantity = EXCLUDED.quantity, updated_at = now();
    RETURN customer_cart_document(customer, language);
END
$$;

CREATE FUNCTION customer_cart_remove_item(customer uuid, variant uuid, language text)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
    IF customer IS NULL OR variant IS NULL OR language NOT IN ('ru', 'ro') THEN
        RETURN jsonb_build_object('failure', 'INVALID_CART_ITEM');
    END IF;
    DELETE FROM customer_cart_items ci USING customer_carts c
        WHERE ci.cart_id = c.id AND c.user_id = customer AND ci.variant_id = variant;
    UPDATE customer_carts SET updated_at = now() WHERE user_id = customer;
    RETURN customer_cart_document(customer, language);
END
$$;
