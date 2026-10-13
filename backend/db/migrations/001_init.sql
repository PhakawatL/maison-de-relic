-- =====================================================================
-- 001_init.sql — โครงสร้างฐานข้อมูลตั้งต้น (22 ตาราง)
-- ที่มา: เอกสาร "โครงงานร้านของสะสม" แท็บ 2 · ERD (DDL ที่แปลงจาก BR-01..BR-31)
-- =====================================================================
-- กติกาของไฟล์ migration:
--   * พอไฟล์นี้ merge เข้า main แล้ว ห้ามแก้อีก
--     ถ้าต้องเปลี่ยนโครงสร้าง ให้สร้างไฟล์ใหม่ เช่น 002_add_review_rating.sql
--   * แต่ละไฟล์รันใน transaction เดียว ถ้าพังจะย้อนกลับทั้งไฟล์
--
-- ข้อควรระวังตอนเขียน SQL ใน API:
--   * "user" กับ "order" เป็นคำสงวนของ SQL ต้องใส่เครื่องหมายคำพูดคู่ทุกครั้ง
--     เช่น SELECT * FROM "user" WHERE user_id = $1
--   * ดูหัวข้อ "สิ่งที่ DDL บังคับให้ไม่ได้" ท้ายไฟล์ ต้องเขียนบังคับในโค้ดเอง
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ========== Identity ==========
CREATE TABLE "user" (
  user_id           BIGSERIAL PRIMARY KEY,
  username          TEXT        NOT NULL UNIQUE,   -- ล็อกอินด้วย username + password
  email             TEXT        NOT NULL UNIQUE,   -- ส่ง OTP และลิงก์รีเซ็ตรหัสผ่าน
  password_hash     TEXT        NOT NULL,
  first_name        TEXT        NOT NULL,
  last_name         TEXT        NOT NULL,
  display_name      TEXT        NOT NULL,
  phone             TEXT,
  avatar_url        TEXT,
  role              TEXT        NOT NULL DEFAULT 'customer'
                      CHECK (role IN ('customer','admin')),
  is_email_verified BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,    -- ปิดบัญชีแทนการลบจริง
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- BR-30 specialization: PK คือ FK ตัวเดียวกัน
CREATE TABLE admin (
  user_id    BIGINT      PRIMARY KEY REFERENCES "user"(user_id) ON DELETE CASCADE,
  admin_role TEXT        NOT NULL DEFAULT 'staff'
               CHECK (admin_role IN ('owner','staff')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE otp_verification (            -- BR-01
  otp_id      BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES "user"(user_id) ON DELETE CASCADE,
  code_hash   TEXT        NOT NULL,
  purpose     TEXT        NOT NULL DEFAULT 'verify_email',
  expires_at  TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,                  -- null = ยังไม่ยืนยัน
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE password_reset_request (      -- BR-02
  request_id BIGSERIAL PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES "user"(user_id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE address (                     -- BR-03
  address_id     BIGSERIAL PRIMARY KEY,
  user_id        BIGINT  NOT NULL REFERENCES "user"(user_id) ON DELETE CASCADE,
  label          TEXT,
  recipient_name TEXT    NOT NULL,
  phone          TEXT    NOT NULL,
  line1          TEXT    NOT NULL,
  district       TEXT    NOT NULL,
  province       TEXT    NOT NULL,
  postcode       TEXT    NOT NULL,
  is_default     BOOLEAN NOT NULL DEFAULT FALSE
);
-- ที่อยู่หลักได้แค่หนึ่งเดียวต่อคน — partial unique index ของ Postgres
CREATE UNIQUE INDEX ON address (user_id) WHERE is_default;

-- ========== Catalog ==========
CREATE TABLE category (                    -- BR-06
  category_id BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE
);

CREATE TABLE series (                      -- BR-07
  series_id BIGSERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  slug      TEXT NOT NULL UNIQUE
);

CREATE TABLE product (
  product_id      BIGSERIAL PRIMARY KEY,
  category_id     BIGINT  NOT NULL REFERENCES category(category_id),   -- BR-06
  series_id       BIGINT           REFERENCES series(series_id),       -- BR-07 nullable
  created_by      BIGINT  NOT NULL REFERENCES admin(user_id),          -- BR-04 แอดมินลงเท่านั้น
  title           TEXT    NOT NULL,
  description     TEXT,
  price           NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  condition       TEXT    NOT NULL CHECK (condition IN
                    ('new','like_new','excellent','good','fair','poor')),
  condition_score NUMERIC(3,1) GENERATED ALWAYS AS (
    CASE condition WHEN 'new'       THEN 9.0
                    WHEN 'like_new'  THEN 8.0
                    WHEN 'excellent' THEN 7.0
                    WHEN 'good'      THEN 5.5
                    WHEN 'fair'      THEN 4.0
                    ELSE 2.0 END) STORED,   -- ไม่มีคอลัมน์เกรด เกรดเขียนใน description
  status          TEXT    NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('available','hidden','draft')),  -- ห้ามมี sold
  stock_quantity  INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  view_count      INTEGER NOT NULL DEFAULT 0,
  cover_image_url TEXT,
  attributes      JSONB   NOT NULL DEFAULT '{}',
  embedding       vector(384),
  search_tsv      tsvector GENERATED ALWAYS AS (
                    to_tsvector('simple', COALESCE(title,'') || ' ' || COALESCE(description,''))
                  ) STORED,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON product (category_id);
CREATE INDEX ON product (series_id);
CREATE INDEX ON product USING gin(search_tsv);
CREATE INDEX ON product USING gin(attributes);

-- BR-05 weak entity: PK ประกอบ
CREATE TABLE product_image (
  product_id BIGINT   NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
  seq        SMALLINT NOT NULL,
  url        TEXT     NOT NULL,
  alt_text   TEXT,
  is_cover   BOOLEAN  NOT NULL DEFAULT FALSE,
  PRIMARY KEY (product_id, seq)
);

-- ========== Discovery ==========
CREATE TABLE user_event (                  -- BR-10 / BR-11
  event_id   BIGSERIAL PRIMARY KEY,
  user_id    BIGINT      REFERENCES "user"(user_id) ON DELETE SET NULL,  -- nullable
  product_id BIGINT      NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
  session_id TEXT        NOT NULL,
  event_type TEXT        NOT NULL CHECK (event_type IN
               ('view','click','wishlist','add_to_cart','purchase')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON user_event (user_id, created_at DESC);
CREATE INDEX ON user_event (product_id);

-- BR-12 + BR-13 = M:N ระหว่าง User กับ Product
CREATE TABLE wishlist (
  user_id    BIGINT NOT NULL REFERENCES "user"(user_id)  ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE cart (                        -- BR-14 หนึ่งใบต่อหนึ่งคน
  cart_id    BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL UNIQUE REFERENCES "user"(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cart_item (                   -- BR-15 + BR-16
  cart_id    BIGINT  NOT NULL REFERENCES cart(cart_id) ON DELETE CASCADE,
  product_id BIGINT  NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cart_id, product_id)
);

-- ========== Transaction ==========
CREATE TABLE "order" (                     -- BR-17 / BR-18
  order_id       BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES "user"(user_id),
  address_id     BIGINT          REFERENCES address(address_id) ON DELETE SET NULL,
  grand_total    NUMERIC(12,2) NOT NULL CHECK (grand_total >= 0),
  current_status TEXT NOT NULL DEFAULT 'paid' CHECK (current_status IN
                   ('paid','packing','shipped','delivered','completed','cancelled','refunded')),
  carrier        TEXT,
  tracking_no    TEXT,
  ship_name      TEXT NOT NULL,        -- สำเนาที่อยู่ ณ เวลาสั่ง
  ship_phone     TEXT NOT NULL,
  ship_line1     TEXT NOT NULL,
  ship_district  TEXT NOT NULL,
  ship_province  TEXT NOT NULL,
  ship_postcode  TEXT NOT NULL,
  placed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_item (                  -- BR-19 + BR-20
  order_item_id          BIGSERIAL PRIMARY KEY,
  order_id               BIGINT  NOT NULL REFERENCES "order"(order_id) ON DELETE CASCADE,
  product_id             BIGINT  NOT NULL REFERENCES product(product_id),
  quantity               INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_at_purchase NUMERIC(12,2) NOT NULL,
  title_snapshot         TEXT    NOT NULL
);
CREATE INDEX ON order_item (order_id);
CREATE INDEX ON order_item (product_id);

CREATE TABLE payment (                     -- BR-21 หนึ่งต่อหนึ่ง
  payment_id BIGSERIAL PRIMARY KEY,
  order_id   BIGINT NOT NULL UNIQUE REFERENCES "order"(order_id) ON DELETE CASCADE,
  amount     NUMERIC(12,2) NOT NULL,
  method     TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('succeeded','failed','refunded')),
  paid_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_status_log (            -- BR-24
  log_id      BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES "order"(order_id) ON DELETE CASCADE,
  from_status TEXT,                        -- null ได้เฉพาะแถวแรก
  to_status   TEXT NOT NULL,
  changed_by  BIGINT REFERENCES admin(user_id),   -- null = ระบบ
  note        TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE refund_request (              -- BR-22 / BR-23
  refund_id        BIGSERIAL PRIMARY KEY,
  order_item_id    BIGINT  NOT NULL REFERENCES order_item(order_item_id),
  reviewed_by      BIGINT           REFERENCES admin(user_id),   -- nullable
  reason           TEXT    NOT NULL,
  evidence_url     TEXT,
  refund_qty       INTEGER NOT NULL CHECK (refund_qty > 0),
  amount           NUMERIC(12,2) NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'requested' CHECK (status IN
                     ('requested','approved','rejected','refunded')),
  restock_decision TEXT    CHECK (restock_decision IN ('return','write_off')),
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ
);

-- ต้องมาหลัง order_item เพราะอ้างถึง (BR-08 + BR-09)
CREATE TABLE stock_movement (
  movement_id   BIGSERIAL PRIMARY KEY,
  product_id    BIGINT  NOT NULL REFERENCES product(product_id),
  order_item_id BIGINT           REFERENCES order_item(order_item_id),  -- nullable
  movement_type TEXT    NOT NULL CHECK (movement_type IN
                  ('restock','sale','return','write_off','adjust')),
  qty_change    INTEGER NOT NULL CHECK (qty_change <> 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  note          TEXT,
  created_by    BIGINT           REFERENCES "user"(user_id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON stock_movement (product_id, created_at);

-- ========== Trust & Support ==========
CREATE TABLE review (                      -- BR-25 / BR-26
  review_id     BIGSERIAL PRIMARY KEY,
  order_item_id BIGINT   NOT NULL UNIQUE REFERENCES order_item(order_item_id),
  product_id    BIGINT   NOT NULL REFERENCES product(product_id),  -- ทางลัดโดยตั้งใจ
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON review (product_id);

CREATE TABLE support_ticket (              -- BR-27 / BR-28 / BR-29
  ticket_id   BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES "user"(user_id),
  order_id    BIGINT          REFERENCES "order"(order_id),   -- nullable
  assigned_to BIGINT          REFERENCES admin(user_id),      -- nullable
  subject     TEXT NOT NULL,
  category    TEXT NOT NULL,
  body        TEXT NOT NULL,                 -- ข้อความจากลูกค้า
  admin_reply TEXT,                          -- ยังไม่ตอบ = null
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','closed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at   TIMESTAMPTZ
);

CREATE TABLE admin_action_log (            -- BR-31 append-only
  log_id      BIGSERIAL PRIMARY KEY,
  admin_id    BIGINT NOT NULL REFERENCES admin(user_id),
  action_type TEXT   NOT NULL,
  target_type TEXT   NOT NULL,       -- polymorphic ไม่มี FK
  target_id   BIGINT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- สิ่งที่ DDL บังคับให้ไม่ได้ ต้องบังคับในโค้ด (backend)
-- =====================================================================
-- 1. ค่าคงที่ของสต็อก: SUM(stock_movement.qty_change) = product.stock_quantity
--    ต้องมีสคริปต์ reconcile ตรวจเป็นระยะ
-- 2. Order ต้องมี OrderItem อย่างน้อยหนึ่งแถว (BR-19 min=1)
--    FK บังคับได้ทิศเดียว ต้องสร้างทั้งสองใน transaction เดียว
-- 3. Order ต้องมี Payment เสมอ (BR-21 min=1) — เหตุผลเดียวกัน สร้างพร้อมกันใน transaction เดียว
-- 4. รีวิวได้เฉพาะออเดอร์ที่ส่งถึงแล้ว: "order".current_status ต้องเป็น delivered ขึ้นไป
--    เช็กในโค้ดก่อน INSERT review
-- 5. stock_movement และ admin_action_log เป็น append-only ห้าม UPDATE/DELETE
--
-- ตัวอย่าง transaction ตอนจ่ายเงินสำเร็จ (R5) — ห้าอย่างต้องเกิดพร้อมกัน:
--   BEGIN;
--     -- 1. ตัดสต็อกแบบ atomic: ถ้าของไม่พอจะได้ 0 แถว แล้ว ROLLBACK ทั้งชุด
--     UPDATE product SET stock_quantity = stock_quantity - $qty
--      WHERE product_id = $pid AND stock_quantity >= $qty;
--     -- 2. INSERT "order"  3. INSERT order_item  4. INSERT payment
--     -- 5. INSERT stock_movement (sale, qty_change = -qty) + order_status_log แถวแรก
--   COMMIT;
