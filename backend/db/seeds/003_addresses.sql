-- =====================================================================
-- 003_addresses.sql — ที่อยู่จัดส่งตัวอย่าง (R2)
-- =====================================================================
-- ให้บัญชี customer (จาก 002_users.sql) มีที่อยู่พร้อมใช้ทดสอบ checkout ของ R5 ได้ทันที
-- newbie ยังไม่ยืนยันอีเมล จึงไม่มีที่อยู่ (ผู้ใช้ที่ยังไม่ยืนยันเพิ่มที่อยู่ไม่ได้)
-- =====================================================================

INSERT INTO address (user_id, label, recipient_name, phone, line1, district, province, postcode, is_default)
SELECT user_id, v.label, v.recipient_name, v.phone, v.line1, v.district, v.province, v.postcode, v.is_default
  FROM "user"
 CROSS JOIN (VALUES
   ('บ้าน',      'สมชาย ใจดี', '081-234-5678', '999 ถนนพุทธมณฑลสาย 4',      'ศาลายา',  'นครปฐม',     '73170', TRUE),
   ('ที่ทำงาน',  'สมชาย ใจดี', '081-234-5678', '25/25 ถนนพระราม 6',          'ราชเทวี', 'กรุงเทพมหานคร', '10400', FALSE)
 ) AS v(label, recipient_name, phone, line1, district, province, postcode, is_default)
 WHERE username = 'customer';
