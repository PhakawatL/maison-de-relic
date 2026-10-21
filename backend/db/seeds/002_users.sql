-- =====================================================================
-- 002_users.sql — บัญชีตั้งต้นและบัญชีทดสอบ (R2)
-- =====================================================================
-- ใช้บนเครื่องตัวเองและ CI เท่านั้น รหัสผ่านทุกบัญชีเปิดเผยอยู่ในไฟล์นี้
-- ห้ามใช้ seed นี้กับฐานข้อมูลที่มีข้อมูลจริง
--
--   username        รหัสผ่าน              เป็นอะไร
--   Neptz           Neptz@1234            แอดมิน · เจ้าของร้าน (owner)
--   SuphawitBonus   SuphawitBonus@1234    แอดมิน · เจ้าของร้าน (owner)
--   staff           Staff@1234            แอดมิน · ทีมงาน (staff) ดูรายชื่อผู้ดูแลได้อย่างเดียว · ปิด/เปิดบัญชีลูกค้าได้
--   tain            tain@1234             แอดมิน · ทีมงาน (staff)
--   oicnssw         oicnssw@1234          แอดมิน · ทีมงาน (staff)
--   PhakawatL       PhakawatL@1234        แอดมิน · ทีมงาน (staff)
--   customer        Customer@1234         ลูกค้า ยืนยันอีเมลแล้ว ซื้อของได้
--   newbie          Newbie@1234           ลูกค้า ยังไม่ยืนยันอีเมล (ดูสินค้าได้ แต่เขียนข้อมูลไม่ได้)
--   banned          Banned@1234           ลูกค้า ถูกปิดบัญชี (is_active = false) ล็อกอินไม่ได้
--
-- username ตัวพิมพ์ใหญ่/เล็กต้องตรง (ล็อกอินด้วย Neptz ไม่ใช่ neptz)
-- อีเมลทุกบัญชีเป็นโดเมน .test (ส่งไม่ถึงใคร) และไม่ใส่เบอร์โทร — repo นี้เป็น public ห้ามใส่ข้อมูลติดต่อจริง
-- password_hash สร้างด้วย bcrypt (cost 10) เหมือนที่ API ใช้ตอนตรวจรหัสผ่าน
-- สิทธิ์แอดมินดูจากตาราง admin (BR-30) ส่วน user.role ตั้งให้ตรงกันไว้ด้วย
-- =====================================================================

INSERT INTO "user"
  (username, email, password_hash, first_name, last_name, display_name, role, is_email_verified, is_active)
VALUES
  ('Neptz',         'neptz@maison-de-relic.test',    '$2b$10$ATbASVBfredTyNH3M7cjYObENsZSch9U087wvPDgTcO8Zdc90.SBG', 'Donyakrit', 'Paththanawath', 'Neptz',          'admin',    TRUE,  TRUE),
  ('SuphawitBonus', 'suphawit@maison-de-relic.test', '$2b$10$uw7rSMXHsmBkQ1Z4YDt48eBu21zhiQCBbTGhJQ42eTJPjsTRyfDxW', 'Suphawit',  'Thammarat',     'SuphawitBonus',  'admin',    TRUE,  TRUE),
  ('staff',         'staff@maison-de-relic.test',    '$2b$10$AE1y7MqpCvmJ.o/4xPy8Ze2YF.obvcMlhoZdNNq26BlJiIDxVU0r.', 'ทีมงาน',    'ร้าน',          'ทีมงานร้าน',      'admin',    TRUE,  TRUE),
  ('tain',          'tain@maison-de-relic.test',     '$2b$10$AqIZiJf.Qm7W.nO76aNaUuj/WvQIsvtSv1rKjzcrd0EpjlLZjqyga', 'Narabodee', 'Srideelerd',    'tain',           'admin',    TRUE,  TRUE),
  ('oicnssw',       'oicnssw@maison-de-relic.test',  '$2b$10$0Yd5uInSUM3MmZQJrYhhhuuAwbRax07FoBhMMWZ1fimiKSHRhlAZG', 'Yanawut',   'Thongyoung',    'oicnssw',        'admin',    TRUE,  TRUE),
  ('PhakawatL',     'phakawatl@maison-de-relic.test', '$2b$10$79TryXic.pdKbLH3vTu6ouvTC/nk55JxPV1n9xvARwf6k.EPzMnri', 'Phakawat', 'Limothai',      'PhakawatL',      'admin',    TRUE,  TRUE),
  ('customer',      'customer@maison-de-relic.test', '$2b$10$zwg.2LWM9eCeVZsHvZdLke62VbydcmUIiDXAt2v5rdJ6XcgOJlxx6', 'สมชาย',     'ใจดี',          'สมชาย',          'customer', TRUE,  TRUE),
  ('newbie',        'newbie@maison-de-relic.test',   '$2b$10$hlD/63ScLOCOhztsMjuCo..ht.2FNEqEMdqnBm75SAANJNolNhyoq', 'สมหญิง',    'มาใหม่',        'สมหญิง',         'customer', FALSE, TRUE),
  ('banned',        'banned@maison-de-relic.test',   '$2b$10$aN.4IYuYB0p2s7vclkhdkeVenD5I4Is0OPpRVuxwL.Vk0gsaf684C', 'ปิด',       'บัญชี',         'บัญชีที่ถูกปิด',  'customer', TRUE,  FALSE);

INSERT INTO admin (user_id, admin_role)
SELECT u.user_id, v.admin_role
  FROM (VALUES
         ('Neptz',         'owner'),
         ('SuphawitBonus', 'owner'),
         ('staff',         'staff'),
         ('tain',          'staff'),
         ('oicnssw',       'staff'),
         ('PhakawatL',     'staff')
       ) AS v(username, admin_role)
  JOIN "user" u USING (username);
