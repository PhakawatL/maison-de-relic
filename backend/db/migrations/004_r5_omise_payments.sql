-- A pending QR is a payment attempt, not a paid order.
CREATE TABLE checkout_payment_attempt (
  attempt_id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES "user"(user_id),
  request_hash CHAR(64) NOT NULL,
  input_snapshot JSONB NOT NULL,
  quote_snapshot JSONB NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents BETWEEN 2000 AND 15000000),
  status TEXT NOT NULL DEFAULT 'initializing' CHECK
    (status IN ('initializing','unknown','pending','successful','failed','expired','needs_review')),
  charge_id TEXT UNIQUE,
  qr_url TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  order_id BIGINT UNIQUE REFERENCES "order"(order_id),
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Prevent a second tab from creating another payable QR until the first resolves.
CREATE UNIQUE INDEX checkout_one_open_payment_per_user ON checkout_payment_attempt(user_id)
  WHERE status IN ('initializing','unknown','pending','needs_review');
