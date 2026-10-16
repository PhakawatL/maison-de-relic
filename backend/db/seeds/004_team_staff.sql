-- =====================================================================
-- 004_team_staff.sql — บัญชีแอดมินระดับทีมงาน (staff) ของสมาชิกทีม (R2)
-- =====================================================================
-- แยกเป็นไฟล์ใหม่ (ไม่แก้ 002_users.sql) เพื่อให้เครื่องที่ seed ไปแล้วได้บัญชีเพิ่มเองตอน docker compose up
-- โดยไม่ต้อง down -v (ตัวรัน seed ข้ามไฟล์ที่เคยรันแล้ว ดูจากชื่อไฟล์)
-- ใช้บนเครื่องตัวเองและ CI เท่านั้น รหัสผ่านเปิดเผยอยู่ในไฟล์นี้
--
--   username    รหัสผ่าน          เป็นอะไร
--   tain        tain@1234         แอดมิน · ทีมงาน (staff)
--   oicnssw     oicnssw@1234      แอดมิน · ทีมงาน (staff)
--   PhakawatL   PhakawatL@1234    แอดมิน · ทีมงาน (staff)
--
-- staff ดูรายชื่อผู้ดูแลได้อย่างเดียว · เพิ่ม/แก้/ปิดบัญชีผู้ดูแลได้เฉพาะ owner
-- อีเมลเป็นโดเมน .test และไม่ใส่เบอร์โทร — repo นี้เป็น public ห้ามใส่ข้อมูลติดต่อจริง
-- password_hash สร้างด้วย bcrypt (cost 10) เหมือนที่ API ใช้ตอนตรวจรหัสผ่าน
-- =====================================================================

INSERT INTO "user"
  (username, email, password_hash, first_name, last_name, display_name, role, is_email_verified, is_active)
VALUES
  ('tain',      'tain@maison-de-relic.test',      '$2b$10$AqIZiJf.Qm7W.nO76aNaUuj/WvQIsvtSv1rKjzcrd0EpjlLZjqyga', 'Narabodee', 'Srideelerd', 'tain',      'admin', TRUE, TRUE),
  ('oicnssw',   'oicnssw@maison-de-relic.test',   '$2b$10$0Yd5uInSUM3MmZQJrYhhhuuAwbRax07FoBhMMWZ1fimiKSHRhlAZG', 'Yanawut',   'Thongyoung', 'oicnssw',   'admin', TRUE, TRUE),
  ('PhakawatL', 'phakawatl@maison-de-relic.test', '$2b$10$79TryXic.pdKbLH3vTu6ouvTC/nk55JxPV1n9xvARwf6k.EPzMnri', 'Phakawat',  'Limothai',   'PhakawatL', 'admin', TRUE, TRUE);

INSERT INTO admin (user_id, admin_role)
SELECT user_id, 'staff'
  FROM "user"
 WHERE username IN ('tain', 'oicnssw', 'PhakawatL');
