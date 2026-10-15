-- =====================================================================
-- 002_users.sql — บัญชีสำหรับทดสอบ (R2)
-- =====================================================================
-- ใช้บนเครื่องตัวเองและ CI เท่านั้น รหัสผ่านทุกบัญชีเปิดเผยอยู่ในไฟล์นี้
-- ห้ามใช้ seed นี้กับฐานข้อมูลที่มีข้อมูลจริง
--
--   username   รหัสผ่าน         เป็นอะไร
--   owner      Owner@1234       แอดมิน · เจ้าของร้าน (owner)
--   staff      Staff@1234       แอดมิน · ทีมงาน (staff)
--   customer   Customer@1234    ลูกค้า ยืนยันอีเมลแล้ว ซื้อของได้
--   newbie     Newbie@1234      ลูกค้า ยังไม่ยืนยันอีเมล (ดูสินค้าได้ แต่เขียนข้อมูลไม่ได้)
--   banned     Banned@1234      ลูกค้า ถูกปิดบัญชี (is_active = false) ล็อกอินไม่ได้
--
-- password_hash สร้างด้วย bcrypt (cost 10) เหมือนที่ API ใช้ตอนตรวจรหัสผ่าน
-- สิทธิ์แอดมินดูจากตาราง admin (BR-30) ส่วน user.role ตั้งให้ตรงกันไว้ด้วย
-- =====================================================================

INSERT INTO "user"
  (username, email, password_hash, first_name, last_name, display_name, role, is_email_verified, is_active)
VALUES
  ('owner',    'owner@maison-de-relic.test',    '$2b$10$Q6jrJs.DKoy4UDbOyiw0vuLtNSTpnLP9Q3339DPSG62ihzEA8IWw2', 'เจ้าของ', 'ร้าน',    'เจ้าของร้าน',  'admin',    TRUE,  TRUE),
  ('staff',    'staff@maison-de-relic.test',    '$2b$10$fN89Xmrmetjn1k4dLv0Y0us4Vo7J2Fr7vlSgCvQGvRZvM5X4yLMrK', 'ทีมงาน', 'ร้าน',    'ทีมงานร้าน',  'admin',    TRUE,  TRUE),
  ('customer', 'customer@maison-de-relic.test', '$2b$10$zwg.2LWM9eCeVZsHvZdLke62VbydcmUIiDXAt2v5rdJ6XcgOJlxx6', 'สมชาย', 'ใจดี',    'สมชาย',      'customer', TRUE,  TRUE),
  ('newbie',   'newbie@maison-de-relic.test',   '$2b$10$hlD/63ScLOCOhztsMjuCo..ht.2FNEqEMdqnBm75SAANJNolNhyoq', 'สมหญิง', 'มาใหม่',  'สมหญิง',     'customer', FALSE, TRUE),
  ('banned',   'banned@maison-de-relic.test',   '$2b$10$aN.4IYuYB0p2s7vclkhdkeVenD5I4Is0OPpRVuxwL.Vk0gsaf684C', 'ปิด',    'บัญชี',  'บัญชีที่ถูกปิด', 'customer', TRUE,  FALSE);

INSERT INTO admin (user_id, admin_role)
SELECT user_id, CASE username WHEN 'owner' THEN 'owner' ELSE 'staff' END
  FROM "user"
 WHERE username IN ('owner', 'staff');
