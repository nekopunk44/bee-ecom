-- PostgreSQL is the authority for stock. Every change is an immutable movement;
-- the balance row is a locked projection used for atomic availability checks.
INSERT INTO roles(code) VALUES ('MANAGER'), ('WAREHOUSE_OPERATOR'), ('CUSTOMER')
    ON CONFLICT DO NOTHING;
INSERT INTO permissions(code) VALUES ('inventory.read'), ('inventory.adjust'), ('warehouses.manage')
    ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_code, permission_code) VALUES
    ('ADMIN', 'inventory.read'), ('ADMIN', 'inventory.adjust'),
    ('MANAGER', 'inventory.read'),
    ('MANAGER', 'warehouses.manage'),
    ('WAREHOUSE_OPERATOR', 'inventory.read'), ('WAREHOUSE_OPERATOR', 'inventory.adjust'),
    ('ADMIN', 'warehouses.manage')
    ON CONFLICT DO NOTHING;

CREATE TABLE warehouses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_balances (
    warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    variant_id uuid NOT NULL REFERENCES product_variants(id),
    on_hand integer NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= on_hand),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (warehouse_id, variant_id)
);
CREATE INDEX inventory_variant_availability_idx
    ON inventory_balances (variant_id, warehouse_id) INCLUDE (on_hand, reserved);

CREATE TABLE inventory_movements (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id uuid NOT NULL UNIQUE,
    warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    variant_id uuid NOT NULL REFERENCES product_variants(id),
    movement_type text NOT NULL CHECK (movement_type IN ('adjustment', 'reservation', 'release', 'sale')),
    quantity_delta integer NOT NULL DEFAULT 0,
    reserved_delta integer NOT NULL DEFAULT 0,
    reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 240),
    actor_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (quantity_delta <> 0 OR reserved_delta <> 0)
);
CREATE INDEX inventory_movements_history_idx
    ON inventory_movements (warehouse_id, variant_id, created_at DESC);

CREATE FUNCTION inventory_movements_are_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Inventory movements are append-only' USING ERRCODE = '55000';
END
$$;
CREATE TRIGGER inventory_movements_no_update
    BEFORE UPDATE OR DELETE ON inventory_movements
    FOR EACH ROW EXECUTE FUNCTION inventory_movements_are_append_only();

CREATE TABLE inventory_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL UNIQUE,
    request_items jsonb NOT NULL CHECK (jsonb_typeof(request_items) = 'array'),
    status text NOT NULL CHECK (status IN ('active', 'released', 'expired', 'converted')),
    created_by uuid NOT NULL REFERENCES users(id),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at)
);
CREATE INDEX inventory_reservations_expiry_idx
    ON inventory_reservations(expires_at, id) WHERE status = 'active';

CREATE TABLE inventory_reservation_items (
    reservation_id uuid NOT NULL REFERENCES inventory_reservations(id),
    warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    variant_id uuid NOT NULL REFERENCES product_variants(id),
    quantity integer NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (reservation_id, warehouse_id, variant_id)
);

CREATE FUNCTION inventory_reservation_document(reservation_key uuid, was_replayed boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'id', r.id, 'status', r.status, 'expiresAt', r.expires_at,
        'replayed', was_replayed,
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'warehouseId', ri.warehouse_id, 'variantId', ri.variant_id,
                'quantity', ri.quantity
            ) ORDER BY ri.variant_id, ri.warehouse_id)
            FROM inventory_reservation_items ri WHERE ri.reservation_id = r.id
        ), '[]'::jsonb)
    ) FROM inventory_reservations r WHERE r.id = reservation_key
$$;

CREATE FUNCTION inventory_reserve(
    correlation uuid, requested_items jsonb, actor uuid, lifetime_seconds integer DEFAULT 900
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

    IF EXISTS (
        SELECT 1 FROM jsonb_to_recordset(canonical_items) AS line("variantId" uuid, quantity integer)
        LEFT JOIN product_variants v ON v.id = line."variantId" AND v.active
        LEFT JOIN products p ON p.id = v.product_id AND p.status = 'active'
        WHERE v.id IS NULL OR p.id IS NULL
    ) THEN
        RETURN jsonb_build_object('failure', 'INVALID_REFERENCE');
    END IF;

    -- Lock every participating balance in one stable order before checking totals.
    PERFORM b.warehouse_id
    FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id AND w.active
    WHERE b.variant_id IN (SELECT line."variantId" FROM jsonb_to_recordset(canonical_items) AS line("variantId" uuid, quantity integer))
    ORDER BY b.variant_id, b.warehouse_id FOR UPDATE OF b;

    FOR item IN SELECT * FROM jsonb_to_recordset(canonical_items) AS line("variantId" uuid, quantity integer)
    LOOP
        IF COALESCE((SELECT sum(b.on_hand - b.reserved) FROM inventory_balances b
                     JOIN warehouses w ON w.id=b.warehouse_id AND w.active
                     WHERE b.variant_id=item."variantId"), 0) < item.quantity THEN
            RETURN jsonb_build_object('failure', 'INVENTORY_NOT_AVAILABLE', 'variantId', item."variantId");
        END IF;
    END LOOP;

    INSERT INTO inventory_reservations(request_id, request_items, status, created_by, expires_at)
        VALUES(correlation, canonical_items, 'active', actor, now() + make_interval(secs => lifetime_seconds))
        RETURNING id INTO reservation_key;

    FOR item IN SELECT * FROM jsonb_to_recordset(canonical_items) AS line("variantId" uuid, quantity integer)
    LOOP
        remaining := item.quantity;
        FOR stock IN
            SELECT b.warehouse_id, b.on_hand - b.reserved AS available
            FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id AND w.active
            WHERE b.variant_id=item."variantId" AND b.on_hand>b.reserved
            ORDER BY w.code, b.warehouse_id FOR UPDATE OF b
        LOOP
            take_quantity := LEAST(remaining, stock.available);
            UPDATE inventory_balances SET reserved=reserved + take_quantity, updated_at=now()
                WHERE warehouse_id=stock.warehouse_id AND variant_id=item."variantId";
            INSERT INTO inventory_reservation_items(reservation_id, warehouse_id, variant_id, quantity)
                VALUES(reservation_key, stock.warehouse_id, item."variantId", take_quantity);
            INSERT INTO inventory_movements(request_id, warehouse_id, variant_id, movement_type,
                                            reserved_delta, reason, actor_id)
                VALUES(gen_random_uuid(), stock.warehouse_id, item."variantId", 'reservation',
                       take_quantity, 'Checkout reservation', actor);
            remaining := remaining - take_quantity;
            EXIT WHEN remaining = 0;
        END LOOP;
    END LOOP;
    INSERT INTO audit_logs(actor_id, action, entity_id, request_id, changes)
        VALUES(actor, 'inventory.reserved', reservation_key, correlation,
               jsonb_build_object('items', canonical_items, 'expiresAt',
                                  (SELECT expires_at FROM inventory_reservations WHERE id=reservation_key)));
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

CREATE FUNCTION inventory_release(reservation_key uuid, actor uuid) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    reservation inventory_reservations%ROWTYPE;
    item record;
BEGIN
    SELECT * INTO reservation FROM inventory_reservations WHERE id=reservation_key FOR UPDATE;
    IF NOT FOUND OR reservation.created_by <> actor THEN
        RETURN jsonb_build_object('failure', 'NOT_FOUND');
    END IF;
    IF reservation.status <> 'active' THEN
        RETURN inventory_reservation_document(reservation_key, true);
    END IF;
    FOR item IN SELECT * FROM inventory_reservation_items
                WHERE reservation_id=reservation_key ORDER BY variant_id, warehouse_id
    LOOP
        UPDATE inventory_balances SET reserved=reserved-item.quantity, updated_at=now()
            WHERE warehouse_id=item.warehouse_id AND variant_id=item.variant_id;
        INSERT INTO inventory_movements(request_id, warehouse_id, variant_id, movement_type,
                                        reserved_delta, reason, actor_id)
            VALUES(gen_random_uuid(), item.warehouse_id, item.variant_id, 'release',
                   -item.quantity, 'Checkout reservation released', actor);
    END LOOP;
    UPDATE inventory_reservations SET status='released' WHERE id=reservation_key;
    INSERT INTO audit_logs(actor_id, action, entity_id, request_id)
        VALUES(actor, 'inventory.released', reservation_key, gen_random_uuid());
    RETURN inventory_reservation_document(reservation_key);
END
$$;

CREATE FUNCTION inventory_expire_reservations(batch_size integer DEFAULT 100) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
    reservation inventory_reservations%ROWTYPE;
    item record;
    expired_count integer := 0;
BEGIN
    IF batch_size NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid reservation batch size'; END IF;
    FOR reservation IN
        SELECT * FROM inventory_reservations
        WHERE status='active' AND expires_at<=now()
        ORDER BY expires_at, id FOR UPDATE SKIP LOCKED LIMIT batch_size
    LOOP
        FOR item IN SELECT * FROM inventory_reservation_items
                    WHERE reservation_id=reservation.id ORDER BY variant_id, warehouse_id
        LOOP
            UPDATE inventory_balances SET reserved=reserved-item.quantity, updated_at=now()
                WHERE warehouse_id=item.warehouse_id AND variant_id=item.variant_id;
            INSERT INTO inventory_movements(request_id, warehouse_id, variant_id, movement_type,
                                            reserved_delta, reason, actor_id)
                VALUES(gen_random_uuid(), item.warehouse_id, item.variant_id, 'release',
                       -item.quantity, 'Expired checkout reservation', reservation.created_by);
        END LOOP;
        UPDATE inventory_reservations SET status='expired' WHERE id=reservation.id;
        INSERT INTO audit_logs(actor_id, action, entity_id, request_id)
            VALUES(reservation.created_by, 'inventory.reservation_expired', reservation.id, gen_random_uuid());
        expired_count := expired_count + 1;
    END LOOP;
    RETURN expired_count;
END
$$;

CREATE FUNCTION inventory_adjust(
    warehouse_key uuid, variant_key uuid, delta integer, actor uuid,
    correlation uuid, explanation text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    previous inventory_movements%ROWTYPE;
    current_balance inventory_balances%ROWTYPE;
BEGIN
    IF delta = 0 OR explanation IS NULL OR length(explanation) NOT BETWEEN 1 AND 240 THEN
        RETURN jsonb_build_object('failure', 'INVALID_ADJUSTMENT');
    END IF;

    SELECT * INTO previous FROM inventory_movements WHERE request_id = correlation;
    IF FOUND THEN
        IF previous.warehouse_id = warehouse_key AND previous.variant_id = variant_key
           AND previous.quantity_delta = delta AND previous.actor_id = actor
           AND previous.reason = explanation AND previous.movement_type = 'adjustment' THEN
            RETURN jsonb_build_object('onHand',
                (SELECT on_hand FROM inventory_balances
                 WHERE warehouse_id = warehouse_key AND variant_id = variant_key),
                'reserved',
                (SELECT reserved FROM inventory_balances
                 WHERE warehouse_id = warehouse_key AND variant_id = variant_key),
                'replayed', true);
        END IF;
        RETURN jsonb_build_object('failure', 'IDEMPOTENCY_CONFLICT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM warehouses WHERE id = warehouse_key AND active)
       OR NOT EXISTS (SELECT 1 FROM product_variants v JOIN products p ON p.id=v.product_id
                      WHERE v.id=variant_key AND v.active AND p.status='active') THEN
        RETURN jsonb_build_object('failure', 'INVALID_REFERENCE');
    END IF;

    INSERT INTO inventory_balances (warehouse_id, variant_id)
        VALUES (warehouse_key, variant_key) ON CONFLICT DO NOTHING;
    SELECT * INTO current_balance FROM inventory_balances
        WHERE warehouse_id = warehouse_key AND variant_id = variant_key FOR UPDATE;
    IF current_balance.on_hand + delta < current_balance.reserved THEN
        RETURN jsonb_build_object('failure', 'BELOW_RESERVED');
    END IF;

    UPDATE inventory_balances SET on_hand=on_hand + delta, updated_at=now()
        WHERE warehouse_id=warehouse_key AND variant_id=variant_key
        RETURNING * INTO current_balance;
    INSERT INTO inventory_movements(request_id, warehouse_id, variant_id, movement_type,
                                    quantity_delta, reason, actor_id)
        VALUES(correlation, warehouse_key, variant_key, 'adjustment', delta, explanation, actor);
    INSERT INTO audit_logs(actor_id, action, entity_id, request_id, changes)
        VALUES(actor, 'inventory.adjusted', variant_key, correlation,
               jsonb_build_object('warehouseId', warehouse_key, 'delta', delta,
                                  'onHand', current_balance.on_hand,
                                  'reserved', current_balance.reserved, 'reason', explanation));
    RETURN jsonb_build_object('onHand', current_balance.on_hand,
                              'reserved', current_balance.reserved, 'replayed', false);
EXCEPTION
    WHEN unique_violation THEN
        SELECT * INTO previous FROM inventory_movements WHERE request_id = correlation;
        IF FOUND AND previous.warehouse_id = warehouse_key AND previous.variant_id = variant_key
           AND previous.quantity_delta = delta AND previous.actor_id = actor
           AND previous.reason = explanation AND previous.movement_type = 'adjustment' THEN
            SELECT * INTO current_balance FROM inventory_balances
                WHERE warehouse_id = warehouse_key AND variant_id = variant_key;
            RETURN jsonb_build_object('onHand', current_balance.on_hand,
                                      'reserved', current_balance.reserved, 'replayed', true);
        END IF;
        RETURN jsonb_build_object('failure', 'IDEMPOTENCY_CONFLICT');
    WHEN foreign_key_violation THEN RETURN jsonb_build_object('failure', 'INVALID_REFERENCE');
END
$$;

CREATE FUNCTION inventory_availability(variant_key uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'variantId', variant_key,
        'available', COALESCE(sum(CASE WHEN w.id IS NOT NULL THEN b.on_hand - b.reserved ELSE 0 END), 0)::integer,
        'warehouses', COALESCE(jsonb_agg(jsonb_build_object(
            'code', w.code, 'available', b.on_hand - b.reserved
        ) ORDER BY w.code) FILTER (WHERE w.id IS NOT NULL), '[]'::jsonb)
    )
    FROM (SELECT 1) seed
    LEFT JOIN inventory_balances b ON b.variant_id = variant_key
    LEFT JOIN warehouses w ON w.id = b.warehouse_id AND w.active
$$;

COMMENT ON TABLE inventory_movements IS
    'Append-only stock history. Mutations are serialized through inventory_adjust and future reservation operations.';
