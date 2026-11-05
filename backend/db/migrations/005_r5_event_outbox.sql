-- R5-owned queue; no dependency on R4's not-yet-defined event schema.
CREATE TABLE r5_event_outbox (
  event_key TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('add_to_cart','purchase')),
  user_id BIGINT NOT NULL REFERENCES "user"(user_id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES "order"(order_id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  delivered_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX r5_event_pending ON r5_event_outbox(next_attempt_at,created_at)
  WHERE delivered_at IS NULL;
