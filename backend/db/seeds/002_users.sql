-- =====================================================================
-- 002_users.sql — บัญชีตั้งต้นและบัญชีทดสอบ (R2)
-- =====================================================================
-- ใช้บนเครื่องตัวเองและ CI เท่านั้น รหัสผ่านทุกบัญชีเปิดเผยอยู่ในไฟล์นี้
-- ห้ามใช้ seed นี้กับฐานข้อมูลที่มีข้อมูลจริง
--
--   username        รหัสผ่าน              เป็นอะไร
--   Neptz           Neptz@1234            แอดมิน · เจ้าของร้าน (owner)
--   SuphawitBonus   SuphawitBonus@1234    แอดมิน · เจ้าของร้าน (owner)
--   customer        Customer@1234         ลูกค้า ยืนยันอีเมลแล้ว ซื้อของได้
--   newbie          Newbie@1234           ลูกค้า ยังไม่ยืนยันอีเมล (ดูสินค้าได้ แต่เขียนข้อมูลไม่ได้)
--   banned          Banned@1234           ลูกค้า ถูกปิดบัญชี (is_active = false) ล็อกอินไม่ได้
--
-- username ตัวพิมพ์ใหญ่/เล็กต้องตรง (ล็อกอินด้วย Neptz ไม่ใช่ neptz)
-- password_hash สร้างด้วย bcrypt (cost 10) เหมือนที่ API ใช้ตอนตรวจรหัสผ่าน
-- สิทธิ์แอดมินดูจากตาราง admin (BR-30) ส่วน user.role ตั้งให้ตรงกันไว้ด้วย
-- =====================================================================

INSERT INTO "user"
  (username, email, password_hash, first_name, last_name, display_name, phone, role, is_email_verified, is_active)
VALUES
  ('Neptz',         'donyakrit.p@gmail.com',         '$2b$10$ATbASVBfredTyNH3M7cjYObENsZSch9U087wvPDgTcO8Zdc90.SBG', 'Donyakrit', 'Paththanawath', 'Neptz',          '0855144249', 'admin',    TRUE,  TRUE),
  ('SuphawitBonus', 'kittima6741@gmail.com',         '$2b$10$uw7rSMXHsmBkQ1Z4YDt48eBu21zhiQCBbTGhJQ42eTJPjsTRyfDxW', 'Suphawit',  'Thammarat',     'SuphawitBonus',  '0935295863', 'admin',    TRUE,  TRUE),
  ('customer',      'customer@maison-de-relic.test', '$2b$10$zwg.2LWM9eCeVZsHvZdLke62VbydcmUIiDXAt2v5rdJ6XcgOJlxx6', 'สมชาย',     'ใจดี',          'สมชาย',          NULL,         'customer', TRUE,  TRUE),
  ('newbie',        'newbie@maison-de-relic.test',   '$2b$10$hlD/63ScLOCOhztsMjuCo..ht.2FNEqEMdqnBm75SAANJNolNhyoq', 'สมหญิง',    'มาใหม่',        'สมหญิง',         NULL,         'customer', FALSE, TRUE),
  ('banned',        'banned@maison-de-relic.test',   '$2b$10$aN.4IYuYB0p2s7vclkhdkeVenD5I4Is0OPpRVuxwL.Vk0gsaf684C', 'ปิด',       'บัญชี',         'บัญชีที่ถูกปิด',  NULL,         'customer', TRUE,  FALSE);

INSERT INTO admin (user_id, admin_role)
SELECT user_id, 'owner'
  FROM "user"
 WHERE username IN ('Neptz', 'SuphawitBonus');
