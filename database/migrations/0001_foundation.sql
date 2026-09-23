-- Business tables arrive with their domain milestones. This table is the
-- shared transaction boundary for durable, at-least-once background delivery.
CREATE TABLE outbox_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type varchar(160) NOT NULL,
    aggregate_id uuid NOT NULL,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    available_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error_code varchar(100),
    dead_lettered_at timestamptz,
    CHECK (processed_at IS NULL OR dead_lettered_at IS NULL)
);

CREATE INDEX outbox_events_pending_idx ON outbox_events (available_at, created_at)
    WHERE processed_at IS NULL AND dead_lettered_at IS NULL;

COMMENT ON TABLE outbox_events IS
    'Written in the business transaction; consumed with SKIP LOCKED and idempotent handlers.';
