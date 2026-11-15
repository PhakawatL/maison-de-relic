-- Redirect destination is supplied by Omise, never by the client.
ALTER TABLE checkout_payment_attempt ADD COLUMN authorize_url TEXT;
