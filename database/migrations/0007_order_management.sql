-- Staff move orders through their lifecycle. A transition names the status the
-- operator saw, so two people cannot both act on the same order; each one writes an
-- order event, an outbox event and an audit record in the same transaction.

INSERT INTO permissions(code) VALUES ('orders.read'), ('orders.manage')
    ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_code, permission_code) VALUES
    ('ADMIN', 'orders.read'), ('ADMIN', 'orders.manage'),
    ('MANAGER', 'orders.read'), ('MANAGER', 'orders.manage'),
    ('WAREHOUSE_OPERATOR', 'orders.read')
    ON CONFLICT DO NOTHING;

-- Goods that left the warehouse: the reservation is used up, not released.
ALTER TABLE inventory_reservations DROP CONSTRAINT inventory_reservations_status_check;
ALTER TABLE inventory_reservations ADD CONSTRAINT inventory_reservations_status_check
    CHECK (status IN ('active', 'released', 'expired', 'converted', 'fulfilled'));

-- ─── 1. Stock leaves the warehouse ──────────────────────────────────────────

CREATE FUNCTION order_fulfil_stock(order_key uuid, actor uuid)
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
            SET on_hand = on_hand - item.quantity,
                reserved = reserved - item.quantity,
                updated_at = now()
            WHERE warehouse_id = item.warehouse_id AND variant_id = item.variant_id;
        INSERT INTO inventory_movements(request_id, warehouse_id, variant_id, movement_type,
                                        quantity_delta, reserved_delta, reason, actor_id)
            VALUES(gen_random_uuid(), item.warehouse_id, item.variant_id, 'sale',
                   -item.quantity, -item.quantity, 'Order handed over', actor);
    END LOOP;
    UPDATE inventory_reservations SET status = 'fulfilled' WHERE id = res_id;
END
$$;

-- ─── 2. Reading ─────────────────────────────────────────────────────────────

CREATE FUNCTION admin_orders_document(filter_status text, search text,
                                      page_size integer, page_offset integer)
RETURNS jsonb LANGUAGE sql STABLE AS $$
    WITH terms AS (
        SELECT
            NULLIF(trim(search), '') AS text,
            -- «069 123 456» и «+373 69 123 456» ищут один и тот же номер.
            NULLIF(ltrim(regexp_replace(COALESCE(search, ''), '[^0-9]', '', 'g'), '0'), '') AS digits
    ), matched AS (
        SELECT o.*
        FROM orders o, terms t
        WHERE (filter_status IS NULL OR o.status = filter_status)
          AND (t.text IS NULL
               OR o.number ILIKE '%' || replace(replace(replace(t.text, '\', '\\'), '%', '\%'), '_', '\_') || '%'
               OR o.recipient_name ILIKE '%' || replace(replace(replace(t.text, '\', '\\'), '%', '\%'), '_', '\_') || '%'
               OR (length(t.digits) >= 3 AND o.phone LIKE '%' || t.digits || '%'))
    )
    SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM matched),
        'counts', (
            SELECT jsonb_object_agg(s.status, (SELECT count(*) FROM orders o WHERE o.status = s.status))
            FROM unnest(ARRAY['new', 'confirmed', 'ready', 'shipped', 'completed', 'cancelled']) AS s(status)
        ),
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id',                 o.id,
                'number',             o.number,
                'status',             o.status,
                'createdAt',          o.created_at,
                'deliveryMethod',     o.delivery_method,
                'recipientName',      o.recipient_name,
                'phone',              o.phone,
                'itemsTotalMinor',    o.items_total_minor,
                'deliveryPriceMinor', o.delivery_price_minor,
                'totalMinor',         CASE WHEN o.delivery_price_minor IS NOT NULL
                                           THEN o.items_total_minor + o.delivery_price_minor
                                           ELSE NULL END,
                'currency',           o.currency,
                'quantity',           (SELECT sum(oi.quantity) FROM order_items oi WHERE oi.order_id = o.id)
            ) ORDER BY o.created_at DESC, o.id)
            FROM (
                SELECT * FROM matched
                ORDER BY created_at DESC, id
                LIMIT LEAST(GREATEST(COALESCE(page_size, 25), 1), 100)
                OFFSET GREATEST(COALESCE(page_offset, 0), 0)
            ) o
        ), '[]'::jsonb)
    )
$$;

CREATE FUNCTION admin_order_document(order_key uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT COALESCE(order_document(order_key), jsonb_build_object('failure', 'NOT_FOUND'))
$$;

-- ─── 3. Transitions ─────────────────────────────────────────────────────────

-- new → confirmed → ready → shipped (courier, post) → completed;
-- ready → completed for pickup; new, confirmed and ready can be cancelled.
CREATE FUNCTION order_transition_allowed(current_status text, target text, method text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN target = 'cancelled' THEN current_status IN ('new', 'confirmed', 'ready')
        WHEN current_status = 'new' THEN target = 'confirmed'
        WHEN current_status = 'confirmed' THEN target = 'ready'
        WHEN current_status = 'ready' AND method = 'pickup' THEN target = 'completed'
        WHEN current_status = 'ready' THEN target = 'shipped'
        WHEN current_status = 'shipped' THEN target = 'completed'
        ELSE false
    END
$$;

CREATE FUNCTION order_transition(actor uuid, order_key uuid, correlation uuid, change jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    ord        orders%ROWTYPE;
    expected   text;
    target     text;
    v_price    bigint;
    v_tracking text;
BEGIN
    IF actor IS NULL OR order_key IS NULL OR correlation IS NULL
       OR change IS NULL OR jsonb_typeof(change) <> 'object' THEN
        RETURN jsonb_build_object('failure', 'INVALID_TRANSITION');
    END IF;
    expected := change->>'from';
    target   := change->>'to';

    SELECT * INTO ord FROM orders WHERE id = order_key FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('failure', 'NOT_FOUND');
    END IF;
    -- Повтор того же действия (двойной клик, повтор после обрыва) ничего не меняет.
    IF ord.status = target AND expected IS DISTINCT FROM target THEN
        RETURN order_document(order_key);
    END IF;
    IF expected IS NULL OR ord.status <> expected THEN
        RETURN jsonb_build_object('failure', 'ORDER_STATUS_CHANGED');
    END IF;
    IF target IS NULL OR NOT order_transition_allowed(ord.status, target, ord.delivery_method) THEN
        RETURN jsonb_build_object('failure', 'INVALID_TRANSITION');
    END IF;

    -- The delivery price is agreed when a courier or post order is confirmed.
    IF change ? 'deliveryPriceMinor' AND change->'deliveryPriceMinor' <> 'null'::jsonb THEN
        IF target <> 'confirmed' OR ord.delivery_method = 'pickup'
           OR jsonb_typeof(change->'deliveryPriceMinor') <> 'number'
           OR (change->>'deliveryPriceMinor') !~ '^[0-9]{1,9}$'
           OR (change->>'deliveryPriceMinor')::bigint > 100000000 THEN
            RETURN jsonb_build_object('failure', 'INVALID_DELIVERY_PRICE');
        END IF;
        v_price := (change->>'deliveryPriceMinor')::bigint;
    END IF;
    IF change ? 'trackingNumber' AND change->'trackingNumber' <> 'null'::jsonb THEN
        v_tracking := order_clean_text(change->>'trackingNumber');
        IF target <> 'shipped' OR jsonb_typeof(change->'trackingNumber') <> 'string'
           OR v_tracking IS NULL OR length(v_tracking) > 64 THEN
            RETURN jsonb_build_object('failure', 'INVALID_TRACKING_NUMBER');
        END IF;
    END IF;

    IF target = 'cancelled' THEN
        PERFORM order_release_stock(order_key, actor, 'Order cancelled by staff');
    ELSIF target IN ('shipped', 'completed') THEN
        PERFORM order_fulfil_stock(order_key, actor);
    END IF;

    UPDATE orders
        SET status = target,
            delivery_price_minor = COALESCE(v_price, delivery_price_minor),
            tracking_number = COALESCE(v_tracking, tracking_number),
            updated_at = now()
        WHERE id = order_key;
    INSERT INTO order_events(order_id, status, actor_id) VALUES(order_key, target, actor);
    INSERT INTO outbox_events(event_type, aggregate_id, payload)
        VALUES('order.status_changed', order_key,
               jsonb_build_object('orderId', order_key, 'number', ord.number,
                                  'from', ord.status, 'to', target));
    INSERT INTO audit_logs(actor_id, action, entity_id, request_id, changes)
        VALUES(actor, 'order.' || target, order_key, correlation,
               jsonb_strip_nulls(jsonb_build_object(
                   'from', ord.status, 'to', target,
                   'deliveryPriceMinor', v_price, 'trackingNumber', v_tracking)));
    RETURN order_document(order_key);
END
$$;
