-- Per-product receipts survive partial delivery retries. R4 must also deduplicate request keys.
ALTER TABLE r5_event_outbox ADD COLUMN delivered_product_ids BIGINT[] NOT NULL DEFAULT '{}';
