-- R5 checkout snapshots and retry protection. 002 is reserved by R2 auth PR #39.
ALTER TABLE "order"
  ADD COLUMN subtotal NUMERIC(12,2) CHECK (subtotal >= 0),
  ADD COLUMN shipping_fee NUMERIC(12,2) CHECK (shipping_fee >= 0),
  ADD COLUMN shipping_method TEXT CHECK (shipping_method IN ('standard','express')),
  ADD COLUMN checkout_key UUID,
  ADD COLUMN checkout_request_hash TEXT CHECK (length(checkout_request_hash) = 64),
  ADD CONSTRAINT order_checkout_key_unique UNIQUE (user_id, checkout_key),
  ADD CONSTRAINT order_checkout_total_check CHECK (
    subtotal IS NULL OR shipping_fee IS NULL OR grand_total = subtotal + shipping_fee
  );
-- Existing orders keep NULL snapshots; do not invent historical delivery charges.
