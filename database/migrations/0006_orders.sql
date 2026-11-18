-- Orders domain: a signed-in customer converts their entire cart into a single
-- order in one atomic transaction. Payment is always on delivery. Three delivery
-- methods are supported: pickup (from a chosen warehouse, free, stock reserved
-- only there), courier (Chisinau delivery, price from shop_settings or NULL until
-- set by a manager), and post (anywhere in Moldova, price always NULL, manager
-- fills it later). Placing an order: validates inputs, reserves stock, snapshots
-- names and prices, empties the cart, writes an outbox event and an audit row.
-- Any failure before the reservation returns a {"failure":...} object without
-- side-effects; after the reservation succeeds, failures raise instead of return.

-- ─── 1. Warehouse-restricted reservation ────────────────────────────────────

CREATE FUNCTION inventory_reserve_at(
    correlation uuid, requested_items jsonb, actor uuid,
    lifetime_seconds integer DEFAULT 900, warehouse_key uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    canonical_items jsonb;
    reservation_key uuid;
    item record;
    stock record;
    remaining integer;
    take_quantity integer;
    prior inventory_reservations%ROWTYPE;
BEGIN
    IF correlation IS NULL OR actor IS NULL OR requested_items IS NULL
       OR lifetime_seconds IS NULL THEN
        RETURN jsonb_build_object('failure', 'INVALID_RESERVATION');
    END IF;
    IF jsonb_typeof(requested_items) <> 'array' THEN
        RETURN jsonb_build_object('failure', 'INVALID_RESERVATION');
    END IF;
    IF jsonb_array_length(requested_items) NOT BETWEEN 1 AND 50
       OR lifetime_seconds NOT BETWEEN 60 AND 1800 THEN
        RETURN jsonb_build_object('failure', 'INVALID_RESERVATION');
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
        'variantId', lower(entry->>'variantId'), 'quantity', (entry->>'quantity')::integer
    ) ORDER BY lower(entry->>'variantId')) INTO canonical_items
    FROM jsonb_array_elements(requested_items) entry;
    IF EXISTS (
        SELECT 1 FROM jsonb_to_recordset(canonical_items) AS line("variantId" uuid, quantity integer)
        WHERE line."variantId" IS NULL OR line.quantity IS NULL OR line.quantity NOT BETWEEN 1 AND 1000
    ) OR (SELECT count(*) FROM jsonb_to_recordset(canonical_items) AS line("variantId" uuid, quantity integer))
       <> (SELECT count(DISTINCT line."variantId") FROM jsonb_to_recordset(canonical_items) AS line("variantId" uuid, quantity integer)) THEN
        RETURN jsonb_build_object('failure', 'INVALID_RESERVATION');
    END IF;

    -- Serialize retries of the same idempotency key before stock is inspected.
    PERFORM pg_advisory_xact_lock(hashtext(correlation::text));
    SELECT * INTO prior FROM inventory_reservations WHERE request_id = correlation;
    IF FOUND THEN
        IF prior.created_by = actor AND prior.request_items = canonical_items THEN
            RETURN inventory_reservation_document(prior.id, true);
        END IF;
        RETURN jsonb_build_object('failure', 'IDEMPOTENCY_CONFLICT');
    END IF;

    -- Validate requested warehouse when specified.
    IF warehouse_key IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM warehouses WHERE id = warehouse_key AND active) THEN
            RETURN jsonb_build_object('failure', 'INVALID_WAREHOUSE');
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1 FROM jsonb_to_recordset(canonical_items) AS line("variantId" uuid, quantity integer)
        LEFT JOIN product_variants v ON v.id = line."variantId" AND v.active
        LEFT JOIN products p ON p.id = v.product_id AND p.status = 'active'
        WHERE v.id IS NULL OR p.id IS NULL
    ) THEN
        RETURN jsonb_build_object('failure', 'INVALID_REFERENCE');
    END IF;

    -- Lock every participating balance in one stable order before checking totals.
    IF warehouse_key IS NOT NULL THEN
        PERFORM b.warehouse_id
        FROM inventory_balances b JOIN warehouses w ON w.id = b.warehouse_id AND w.active
        WHERE b.variant_id IN (SELECT line."variantId" FROM jsonb_to_recordset(canonical_items) AS line("variantId" uuid, quantity integer))
          AND b.warehouse_id = warehouse_key
        ORDER BY b.variant_id, b.warehouse_id FOR UPDATE OF b;
    ELSE
        PERFORM b.warehouse_id
        FROM inventory_balances b JOIN warehouses w ON w.id = b.warehouse_id AND w.active
        WHERE b.variant_id IN (SELECT line."variantId" FROM jsonb_to_recordset(canonical_items) AS line("variantId" uuid, quantity integer))
        ORDER BY b.variant_id, b.warehouse_id FOR UPDATE OF b;
    END IF;

    FOR item IN SELECT * FROM jsonb_to_recordset(canonical_items) AS line("variantId" uuid, quantity integer)
    LOOP
        IF warehouse_key IS NOT NULL THEN
            IF COALESCE((SELECT sum(b.on_hand - b.reserved) FROM inventory_balances b
                         JOIN warehouses w ON w.id = b.warehouse_id AND w.active
                         WHERE b.variant_id = item."variantId"
                           AND b.warehouse_id = warehouse_key), 0) < item.quantity THEN
                RETURN jsonb_build_object('failure', 'INVENTORY_NOT_AVAILABLE', 'variantId', item."variantId");
            END IF;
        ELSE
            IF COALESCE((SELECT sum(b.on_hand - b.reserved) FROM inventory_balances b
                         JOIN warehouses w ON w.id = b.warehouse_id AND w.active
                         WHERE b.variant_id = item."variantId"), 0) < item.quantity THEN
                RETURN jsonb_build_object('failure', 'INVENTORY_NOT_AVAILABLE', 'variantId', item."variantId");
            END IF;
        END IF;
    END LOOP;

    INSERT INTO inventory_reservations(request_id, request_items, status, created_by, expires_at)
        VALUES(correlation, canonical_items, 'active', actor, now() + make_interval(secs => lifetime_seconds))
        RETURNING id INTO reservation_key;

    FOR item IN SELECT * FROM jsonb_to_recordset(canonical_items) AS line("variantId" uuid, quantity integer)
    LOOP
        remaining := item.quantity;
        IF warehouse_key IS NOT NULL THEN
            FOR stock IN
                SELECT b.warehouse_id, b.on_hand - b.reserved AS available
                FROM inventory_balances b JOIN warehouses w ON w.id = b.warehouse_id AND w.active
                WHERE b.variant_id = item."variantId" AND b.on_hand > b.reserved
                  AND b.warehouse_id = warehouse_key
                ORDER BY w.code, b.warehouse_id FOR UPDATE OF b
            LOOP
                take_quantity := LEAST(remaining, stock.available);
                UPDATE inventory_balances SET reserved = reserved + take_quantity, updated_at = now()
                    WHERE warehouse_id = stock.warehouse_id AND variant_id = item."variantId";
                INSERT INTO inventory_reservation_items(reservation_id, warehouse_id, variant_id, quantity)
                    VALUES(reservation_key, stock.warehouse_id, item."variantId", take_quantity);
                INSERT INTO inventory_movements(request_id, warehouse_id, variant_id, movement_type,
                                                reserved_delta, reason, actor_id)
                    VALUES(gen_random_uuid(), stock.warehouse_id, item."variantId", 'reservation',
                           take_quantity, 'Checkout reservation', actor);
                remaining := remaining - take_quantity;
                EXIT WHEN remaining = 0;
            END LOOP;
        ELSE
            FOR stock IN
                SELECT b.warehouse_id, b.on_hand - b.reserved AS available
                FROM inventory_balances b JOIN warehouses w ON w.id = b.warehouse_id AND w.active
                WHERE b.variant_id = item."variantId" AND b.on_hand > b.reserved
                ORDER BY w.code, b.warehouse_id FOR UPDATE OF b
            LOOP
                take_quantity := LEAST(remaining, stock.available);
                UPDATE inventory_balances SET reserved = reserved + take_quantity, updated_at = now()
                    WHERE warehouse_id = stock.warehouse_id AND variant_id = item."variantId";
                INSERT INTO inventory_reservation_items(reservation_id, warehouse_id, variant_id, quantity)
                    VALUES(reservation_key, stock.warehouse_id, item."variantId", take_quantity);
                INSERT INTO inventory_movements(request_id, warehouse_id, variant_id, movement_type,
                                                reserved_delta, reason, actor_id)
                    VALUES(gen_random_uuid(), stock.warehouse_id, item."variantId", 'reservation',
                           take_quantity, 'Checkout reservation', actor);
                remaining := remaining - take_quantity;
                EXIT WHEN remaining = 0;
            END LOOP;
        END IF;
    END LOOP;
    INSERT INTO audit_logs(actor_id, action, entity_id, request_id, changes)
        VALUES(actor, 'inventory.reserved', reservation_key, correlation,
               jsonb_build_object('items', canonical_items, 'expiresAt',
                                  (SELECT expires_at FROM inventory_reservations WHERE id = reservation_key)));
    RETURN inventory_reservation_document(reservation_key);
EXCEPTION
    WHEN unique_violation THEN
        SELECT * INTO prior FROM inventory_reservations WHERE request_id = correlation;
        IF FOUND AND prior.created_by = actor AND prior.request_items = canonical_items THEN
            RETURN inventory_reservation_document(prior.id, true);
        END IF;
        RETURN jsonb_build_object('failure', 'IDEMPOTENCY_CONFLICT');
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RETURN jsonb_build_object('failure', 'INVALID_RESERVATION');
END
$$;

-- Replace the original inventory_reserve with a thin wrapper.
CREATE OR REPLACE FUNCTION inventory_reserve(
    correlation uuid, requested_items jsonb, actor uuid, lifetime_seconds integer DEFAULT 900
) RETURNS jsonb LANGUAGE sql AS $$
    SELECT inventory_reserve_at(correlation, requested_items, actor, lifetime_seconds, NULL)
$$;

-- ─── 2. Tables ──────────────────────────────────────────────────────────────

CREATE TABLE shop_settings (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    courier_price_minor bigint CHECK (courier_price_minor BETWEEN 0 AND 100000000),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO shop_settings DEFAULT VALUES;

CREATE SEQUENCE order_numbers START WITH 1001;

CREATE TABLE orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number text NOT NULL UNIQUE,
    customer_id uuid NOT NULL REFERENCES users(id),
    request_id uuid NOT NULL UNIQUE,
    request jsonb NOT NULL CHECK (jsonb_typeof(request) = 'object'),
    reservation_id uuid NOT NULL UNIQUE REFERENCES inventory_reservations(id),
    status text NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'confirmed', 'ready', 'shipped', 'completed', 'cancelled')),
    language text NOT NULL CHECK (language IN ('ru', 'ro')),
    delivery_method text NOT NULL CHECK (delivery_method IN ('pickup', 'courier', 'post')),
    warehouse_id uuid REFERENCES warehouses(id),
    recipient_name text NOT NULL CHECK (length(recipient_name) BETWEEN 2 AND 120),
    phone text NOT NULL CHECK (phone ~ '^\+373[0-9]{8}$'),
    locality text CHECK (length(locality) BETWEEN 2 AND 120),
    address text CHECK (length(address) BETWEEN 5 AND 240),
    postal_code text CHECK (postal_code ~ '^MD-[0-9]{4}$'),
    comment text CHECK (length(comment) BETWEEN 1 AND 500),
    items_total_minor bigint NOT NULL CHECK (items_total_minor >= 0),
    delivery_price_minor bigint CHECK (delivery_price_minor >= 0),
    currency char(3) NOT NULL DEFAULT 'MDL' CHECK (currency = 'MDL'),
    payment_method text NOT NULL DEFAULT 'on_delivery' CHECK (payment_method = 'on_delivery'),
    tracking_number text CHECK (length(tracking_number) BETWEEN 1 AND 64),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((delivery_method = 'pickup') = (warehouse_id IS NOT NULL)),
    CHECK (delivery_method = 'pickup' OR address IS NOT NULL),
    CHECK ((delivery_method = 'post') = (locality IS NOT NULL)),
    CHECK (delivery_method = 'post' OR postal_code IS NULL)
);
CREATE INDEX orders_customer_idx ON orders (customer_id, created_at DESC);
CREATE INDEX orders_queue_idx ON orders (status, created_at);

CREATE TABLE order_items (
    order_id uuid NOT NULL REFERENCES orders(id),
    variant_id uuid NOT NULL REFERENCES product_variants(id),
    product_slug text NOT NULL,
    sku text NOT NULL,
    name text NOT NULL,
    variant_name text NOT NULL,
    unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
    PRIMARY KEY (order_id, variant_id)
);

CREATE TABLE order_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES orders(id),
    status text NOT NULL,
    actor_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events (order_id, id);

-- ─── 3. Helpers ─────────────────────────────────────────────────────────────

CREATE FUNCTION order_clean_text(raw text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN raw IS NULL THEN NULL
        WHEN trim(regexp_replace(raw, '\s+', ' ', 'g')) = '' THEN NULL
        ELSE trim(regexp_replace(raw, '\s+', ' ', 'g'))
    END
$$;

CREATE FUNCTION order_phone(raw text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT
        CASE
            WHEN digits ~ '^373[0-9]{8}$' THEN '+' || digits
            WHEN digits ~ '^0[0-9]{8}$'   THEN '+373' || substr(digits, 2)
            WHEN digits ~ '^[0-9]{8}$'    THEN '+373' || digits
            ELSE NULL
        END
    FROM (SELECT regexp_replace(COALESCE(raw, ''), '[^0-9]', '', 'g') AS digits) d
$$;

-- ─── 4. order_document ──────────────────────────────────────────────────────

CREATE FUNCTION order_document(order_key uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'id',                 o.id,
        'number',             o.number,
        'status',             o.status,
        'createdAt',          o.created_at,
        'updatedAt',          o.updated_at,
        'deliveryMethod',     o.delivery_method,
        'warehouse',          CASE WHEN w.id IS NOT NULL
                                   THEN jsonb_build_object('id', w.id, 'name', w.name)
                                   ELSE 'null'::jsonb END,
        'recipientName',      o.recipient_name,
        'phone',              o.phone,
        'locality',           o.locality,
        'address',            o.address,
        'postalCode',         o.postal_code,
        'comment',            o.comment,
        'itemsTotalMinor',    o.items_total_minor,
        'deliveryPriceMinor', o.delivery_price_minor,
        'totalMinor',         CASE WHEN o.delivery_price_minor IS NOT NULL
                                   THEN o.items_total_minor + o.delivery_price_minor
                                   ELSE NULL END,
        'currency',           o.currency,
        'paymentMethod',      o.payment_method,
        'trackingNumber',     o.tracking_number,
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'variantId',      oi.variant_id,
                'productSlug',    oi.product_slug,
                'sku',            oi.sku,
                'name',           oi.name,
                'variantName',    oi.variant_name,
                'unitPriceMinor', oi.unit_price_minor,
                'quantity',       oi.quantity
            ) ORDER BY oi.product_slug, oi.sku)
            FROM order_items oi WHERE oi.order_id = o.id
        ), '[]'::jsonb),
        'history', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'status', oe.status,
                'at',     oe.created_at
            ) ORDER BY oe.id)
            FROM order_events oe WHERE oe.order_id = o.id
        ), '[]'::jsonb)
    )
    FROM orders o
    LEFT JOIN warehouses w ON w.id = o.warehouse_id
    WHERE o.id = order_key
$$;

-- ─── 5. checkout_document ───────────────────────────────────────────────────

CREATE FUNCTION checkout_document(customer uuid, language text) RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'cart',              customer_cart_document(customer, language),
        'itemsTotalMinor',   COALESCE((
            SELECT sum(v.price_minor * ci.quantity)
            FROM customer_carts c
            JOIN customer_cart_items ci ON ci.cart_id = c.id
            JOIN product_variants v ON v.id = ci.variant_id
            WHERE c.user_id = customer
        ), 0),
        'courierPriceMinor', (SELECT courier_price_minor FROM shop_settings),
        'warehouses', COALESCE((
            SELECT jsonb_agg(wrow ORDER BY wrow->>'name')
            FROM (
                SELECT jsonb_build_object(
                    'id',    w.id,
                    'name',  w.name,
                    'ready', NOT EXISTS (
                        SELECT 1
                        FROM customer_carts c2
                        JOIN customer_cart_items ci2 ON ci2.cart_id = c2.id
                        WHERE c2.user_id = customer
                          AND COALESCE((
                              SELECT b.on_hand - b.reserved
                              FROM inventory_balances b
                              WHERE b.warehouse_id = w.id AND b.variant_id = ci2.variant_id
                          ), 0) < ci2.quantity
                    )
                ) AS wrow
                FROM warehouses w
                WHERE w.active
            ) sub
        ), '[]'::jsonb)
    )
$$;

-- ─── 6. order_place ─────────────────────────────────────────────────────────

CREATE FUNCTION order_place(customer uuid, correlation uuid, details jsonb, language text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    -- normalised fields
    v_method       text;
    v_warehouse_id uuid;
    v_recipient    text;
    v_phone        text;
    v_locality     text;
    v_address      text;
    v_postal_code  text;
    v_comment      text;
    -- working vars
    canonical      jsonb;
    prior_order    orders%ROWTYPE;
    v_cart_id        uuid;
    item           record;
    reservation    jsonb;
    v_reservation_id uuid;
    v_order_id       uuid;
    order_number   text;
    items_total    bigint := 0;
    delivery_price bigint;
    lines          jsonb;
    item_name      text;
BEGIN
    -- Step 1: basic null / type guard
    IF customer IS NULL OR correlation IS NULL
       OR details IS NULL OR jsonb_typeof(details) <> 'object' THEN
        RETURN jsonb_build_object('failure', 'INVALID_ORDER');
    END IF;
    IF language IS NULL OR language NOT IN ('ru', 'ro') THEN
        RETURN jsonb_build_object('failure', 'INVALID_LOCALE');
    END IF;

    -- Step 2: normalise
    v_method      := details->>'deliveryMethod';
    v_recipient   := order_clean_text(details->>'recipientName');
    v_phone       := order_phone(details->>'phone');
    v_locality    := order_clean_text(details->>'locality');
    v_address     := order_clean_text(details->>'address');
    v_comment     := order_clean_text(details->>'comment');
    -- postal code: strip non-digits; empty → NULL; exactly 4 digits → 'MD-' || digits
    v_postal_code := regexp_replace(COALESCE(details->>'postalCode', ''), '[^0-9]', '', 'g');
    IF v_postal_code = '' THEN
        v_postal_code := NULL;
    ELSIF length(v_postal_code) = 4 THEN
        v_postal_code := 'MD-' || v_postal_code;
    END IF;

    -- Step 3: validate
    IF v_method IS NULL OR v_method NOT IN ('pickup', 'courier', 'post') THEN
        RETURN jsonb_build_object('failure', 'INVALID_DELIVERY');
    END IF;
    IF v_recipient IS NULL OR length(v_recipient) NOT BETWEEN 2 AND 120 THEN
        RETURN jsonb_build_object('failure', 'INVALID_RECIPIENT');
    END IF;
    IF v_phone IS NULL THEN
        RETURN jsonb_build_object('failure', 'INVALID_PHONE');
    END IF;
    IF v_comment IS NOT NULL AND length(v_comment) > 500 THEN
        RETURN jsonb_build_object('failure', 'INVALID_COMMENT');
    END IF;

    IF v_method = 'pickup' THEN
        -- warehouseId must be a valid UUID and an active warehouse
        IF (details->>'warehouseId') IS NULL
           OR (details->>'warehouseId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            RETURN jsonb_build_object('failure', 'INVALID_WAREHOUSE');
        END IF;
        v_warehouse_id := (details->>'warehouseId')::uuid;
        IF NOT EXISTS (SELECT 1 FROM warehouses WHERE id = v_warehouse_id AND active) THEN
            RETURN jsonb_build_object('failure', 'INVALID_WAREHOUSE');
        END IF;
        -- for pickup, locality / address / postal_code are ignored
        v_locality    := NULL;
        v_address     := NULL;
        v_postal_code := NULL;
    ELSIF v_method = 'courier' THEN
        IF v_address IS NULL OR length(v_address) NOT BETWEEN 5 AND 240 THEN
            RETURN jsonb_build_object('failure', 'INVALID_ADDRESS');
        END IF;
        v_locality    := NULL;
        v_postal_code := NULL;
        v_warehouse_id := NULL;
    ELSIF v_method = 'post' THEN
        IF v_locality IS NULL OR length(v_locality) NOT BETWEEN 2 AND 120 THEN
            RETURN jsonb_build_object('failure', 'INVALID_LOCALITY');
        END IF;
        IF v_address IS NULL OR length(v_address) NOT BETWEEN 5 AND 240 THEN
            RETURN jsonb_build_object('failure', 'INVALID_ADDRESS');
        END IF;
        -- non-empty postal code that did not normalise to exactly 4 digits
        IF details->>'postalCode' IS NOT NULL
           AND regexp_replace(details->>'postalCode', '[^0-9]', '', 'g') <> ''
           AND (v_postal_code IS NULL OR v_postal_code !~ '^MD-[0-9]{4}$') THEN
            RETURN jsonb_build_object('failure', 'INVALID_POSTAL_CODE');
        END IF;
        v_warehouse_id := NULL;
    END IF;

    -- Step 4: canonical request snapshot
    canonical := jsonb_build_object(
        'deliveryMethod',  v_method,
        'warehouseId',     v_warehouse_id,
        'recipientName',   v_recipient,
        'phone',           v_phone,
        'locality',        v_locality,
        'address',         v_address,
        'postalCode',      v_postal_code,
        'comment',         v_comment,
        'language',        language
    );

    -- Step 5: idempotency lock
    PERFORM pg_advisory_xact_lock(hashtext(correlation::text));
    SELECT * INTO prior_order FROM orders WHERE request_id = correlation;
    IF FOUND THEN
        IF prior_order.customer_id = customer AND prior_order.request = canonical THEN
            RETURN order_document(prior_order.id) || '{"replayed":true}';
        END IF;
        RETURN jsonb_build_object('failure', 'IDEMPOTENCY_CONFLICT');
    END IF;

    -- Step 6: lock cart
    SELECT id INTO v_cart_id FROM customer_carts WHERE user_id = customer FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('failure', 'CART_EMPTY');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM customer_cart_items WHERE cart_id = v_cart_id) THEN
        RETURN jsonb_build_object('failure', 'CART_EMPTY');
    END IF;

    -- Step 7: check item availability
    FOR item IN
        SELECT ci.variant_id, v.active AS v_active, p.status AS p_status
        FROM customer_cart_items ci
        JOIN product_variants v ON v.id = ci.variant_id
        JOIN products p ON p.id = v.product_id
        WHERE ci.cart_id = v_cart_id
    LOOP
        IF NOT item.v_active OR item.p_status <> 'active' THEN
            RETURN jsonb_build_object('failure', 'ITEM_UNAVAILABLE', 'variantId', item.variant_id);
        END IF;
    END LOOP;

    -- Build reservation lines from cart
    SELECT jsonb_agg(jsonb_build_object('variantId', ci.variant_id, 'quantity', ci.quantity))
    INTO lines
    FROM customer_cart_items ci
    WHERE ci.cart_id = v_cart_id;

    -- Step 8: reserve stock
    reservation := inventory_reserve_at(
        correlation, lines, customer, 1800,
        CASE v_method WHEN 'pickup' THEN v_warehouse_id ELSE NULL END
    );

    IF reservation ? 'failure' THEN
        DECLARE failure_code text := reservation->>'failure';
        BEGIN
            IF failure_code = 'INVENTORY_NOT_AVAILABLE' THEN
                RETURN reservation;
            ELSIF failure_code = 'INVALID_REFERENCE' THEN
                RETURN jsonb_build_object('failure', 'ITEM_UNAVAILABLE');
            ELSIF failure_code = 'INVALID_WAREHOUSE' THEN
                RETURN reservation;
            ELSE
                RETURN jsonb_build_object('failure', 'IDEMPOTENCY_CONFLICT');
            END IF;
        END;
    END IF;

    v_reservation_id := (reservation->>'id')::uuid;

    -- Step 9: convert reservation so expiry job never frees it
    UPDATE inventory_reservations SET status = 'converted' WHERE id = v_reservation_id;

    -- Step 10: compute totals and insert order
    SELECT sum(v.price_minor * ci.quantity) INTO items_total
    FROM customer_cart_items ci
    JOIN product_variants v ON v.id = ci.variant_id
    WHERE ci.cart_id = v_cart_id;

    IF v_method = 'pickup' THEN
        delivery_price := 0;
    ELSIF v_method = 'courier' THEN
        SELECT courier_price_minor INTO delivery_price FROM shop_settings;
    ELSE
        delivery_price := NULL;
    END IF;

    order_number := 'B-' || nextval('order_numbers');
    v_order_id     := gen_random_uuid();

    INSERT INTO orders(id, number, customer_id, request_id, request, reservation_id,
                       language, delivery_method, warehouse_id, recipient_name, phone,
                       locality, address, postal_code, comment,
                       items_total_minor, delivery_price_minor)
    VALUES(v_order_id, order_number, customer, correlation, canonical, v_reservation_id,
           language, v_method, v_warehouse_id, v_recipient, v_phone,
           v_locality, v_address, v_postal_code, v_comment,
           items_total, delivery_price);

    -- Step 11: insert order_items with snapshotted names and prices
    FOR item IN
        SELECT ci.variant_id, ci.quantity,
               v.sku, v.name AS variant_name, v.price_minor,
               p.slug AS product_slug,
               sel.name AS name_selected,
               fal.name AS name_fallback
        FROM customer_cart_items ci
        JOIN product_variants v ON v.id = ci.variant_id
        JOIN products p ON p.id = v.product_id
        LEFT JOIN product_translations sel ON sel.product_id = p.id AND sel.locale = language
        LEFT JOIN product_translations fal ON fal.product_id = p.id
            AND fal.locale = CASE language WHEN 'ru' THEN 'ro' ELSE 'ru' END
        WHERE ci.cart_id = v_cart_id
    LOOP
        item_name := COALESCE(item.name_selected, item.name_fallback, item.product_slug);
        INSERT INTO order_items(order_id, variant_id, product_slug, sku, name, variant_name,
                                unit_price_minor, quantity)
        VALUES(v_order_id, item.variant_id, item.product_slug, item.sku, item_name,
               item.variant_name, item.price_minor, item.quantity);
    END LOOP;

    -- Step 12: event, clear cart
    INSERT INTO order_events(order_id, status, actor_id) VALUES(v_order_id, 'new', customer);
    DELETE FROM customer_cart_items WHERE cart_id = v_cart_id;
    UPDATE customer_carts SET updated_at = now() WHERE id = v_cart_id;

    -- Step 13: outbox + audit
    INSERT INTO outbox_events(event_type, aggregate_id, payload)
        VALUES('order.placed', v_order_id, jsonb_build_object('orderId', v_order_id, 'number', order_number));
    INSERT INTO audit_logs(actor_id, action, entity_id, request_id)
        VALUES(customer, 'order.placed', v_order_id, correlation);

    -- Step 14: return document
    RETURN order_document(v_order_id) || '{"replayed":false}';
END
$$;

-- ─── 7. Reading and cancelling ──────────────────────────────────────────────

CREATE FUNCTION customer_orders_document(customer uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id',                 o.id,
                'number',             o.number,
                'status',             o.status,
                'createdAt',          o.created_at,
                'deliveryMethod',     o.delivery_method,
                'itemsTotalMinor',    o.items_total_minor,
                'deliveryPriceMinor', o.delivery_price_minor,
                'totalMinor',         CASE WHEN o.delivery_price_minor IS NOT NULL
                                           THEN o.items_total_minor + o.delivery_price_minor
                                           ELSE NULL END,
                'currency',           o.currency,
                'quantity',           (SELECT sum(oi.quantity) FROM order_items oi WHERE oi.order_id = o.id)
            ) ORDER BY o.created_at DESC)
            FROM (SELECT * FROM orders WHERE customer_id = customer ORDER BY created_at DESC LIMIT 50) o
        ), '[]'::jsonb)
    )
$$;

CREATE FUNCTION customer_order_document(customer uuid, order_key uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM orders WHERE id = order_key AND customer_id = customer)
        THEN order_document(order_key)
        ELSE jsonb_build_object('failure', 'NOT_FOUND')
    END
$$;

CREATE FUNCTION order_release_stock(order_key uuid, actor uuid, reason text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    res_id uuid;
    item   record;
BEGIN
    SELECT reservation_id INTO res_id FROM orders WHERE id = order_key;
    IF NOT FOUND THEN RETURN; END IF;
    IF (SELECT status FROM inventory_reservations WHERE id = res_id) <> 'converted' THEN
        RETURN;
    END IF;
    FOR item IN
        SELECT ri.warehouse_id, ri.variant_id, ri.quantity
        FROM inventory_reservation_items ri
        WHERE ri.reservation_id = res_id
        ORDER BY ri.variant_id, ri.warehouse_id
    LOOP
        UPDATE inventory_balances
            SET reserved = reserved - item.quantity, updated_at = now()
            WHERE warehouse_id = item.warehouse_id AND variant_id = item.variant_id;
        INSERT INTO inventory_movements(request_id, warehouse_id, variant_id, movement_type,
                                        reserved_delta, reason, actor_id)
            VALUES(gen_random_uuid(), item.warehouse_id, item.variant_id, 'release',
                   -item.quantity, reason, actor);
    END LOOP;
    UPDATE inventory_reservations SET status = 'released' WHERE id = res_id;
END
$$;

CREATE FUNCTION order_cancel(customer uuid, order_key uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    ord orders%ROWTYPE;
    req_id uuid;
BEGIN
    SELECT * INTO ord FROM orders WHERE id = order_key AND customer_id = customer FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('failure', 'NOT_FOUND');
    END IF;
    IF ord.status = 'cancelled' THEN
        RETURN order_document(order_key);
    END IF;
    IF ord.status <> 'new' THEN
        RETURN jsonb_build_object('failure', 'ORDER_NOT_CANCELLABLE');
    END IF;

    PERFORM order_release_stock(order_key, customer, 'Order cancelled by customer');
    req_id := gen_random_uuid();
    UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = order_key;
    INSERT INTO order_events(order_id, status, actor_id) VALUES(order_key, 'cancelled', customer);
    INSERT INTO outbox_events(event_type, aggregate_id, payload)
        VALUES('order.cancelled', order_key,
               jsonb_build_object('orderId', order_key, 'number', ord.number));
    INSERT INTO audit_logs(actor_id, action, entity_id, request_id)
        VALUES(customer, 'order.cancelled', order_key, req_id);
    RETURN order_document(order_key);
END
$$;
