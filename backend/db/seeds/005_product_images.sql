-- รูปเพิ่มเติม (รูปที่ 2 ขึ้นไป) ของสินค้าตัวอย่างใน 004_products.sql — R4
-- ใช้โชว์แกลเลอรีในหน้า Detail (หน้า Detail อ่านรูปทั้งหมดจากตาราง product_image เรียงตาม seq)
--
-- * รูปทุกรูปเป็น "ของชิ้นเดียวกัน" ถ่ายชุดเดียวกันโดยช่างภาพคนเดิมบน Pexels (เปิดดูทุกรูปแล้ว)
-- * ไฟล์อยู่ใน Supabase Storage bucket Product_image โฟลเดอร์ seed/ เหมือน 004
--   อัปโหลดด้วย node backend/scripts/upload-seed-images.js (รายชื่ออยู่ใน seed-images.json ช่อง seq >= 2)
-- * หาสินค้าจากชื่อไฟล์รูปปก (cover_image_url) แทน product_id เพราะ id แต่ละเครื่องอาจไม่ตรงกัน
-- * seq = 1 คือรูปปก (ใส่ไว้แล้วใน 004) ไฟล์นี้เริ่มที่ seq = 2 · ที่มาของรูปอยู่ใน 004_products.credits.md
INSERT INTO product_image (product_id, seq, url, alt_text, is_cover)
SELECT p.product_id,
       d.seq,
       'https://qosmwcfrrwcbdzxgrzlu.supabase.co/storage/v1/object/public/Product_image/seed/' || d.file,
       p.title,                       -- alt ของรูป = ชื่อสินค้า (โปรแกรมอ่านหน้าจออ่านได้)
       FALSE                          -- ไม่ใช่รูปปก
FROM (VALUES
  -- (รหัส, ไฟล์รูปปกของสินค้า, ลำดับรูป, ไฟล์รูปใหม่)
  ('c06', 'c06-pokemon-card-bulk-lot.webp', 2, 'c06-pokemon-card-bulk-lot-2.webp'),
  ('c06', 'c06-pokemon-card-bulk-lot.webp', 3, 'c06-pokemon-card-bulk-lot-3.webp'),
  ('c06', 'c06-pokemon-card-bulk-lot.webp', 4, 'c06-pokemon-card-bulk-lot-4.webp'),
  ('c09', 'c09-yu-gi-oh-rush-duel-deck-jp.webp', 2, 'c09-yu-gi-oh-rush-duel-deck-jp-2.webp'),
  ('c10', 'c10-vintage-nhl-hockey-cards-lot.webp', 2, 'c10-vintage-nhl-hockey-cards-lot-2.webp'),
  ('f02', 'f02-yamato.webp', 2, 'f02-yamato-2.webp'),
  ('f02', 'f02-yamato.webp', 3, 'f02-yamato-3.webp'),
  ('f02', 'f02-yamato.webp', 4, 'f02-yamato-4.webp'),
  ('f05', 'f05-itachi-uchiha.webp', 2, 'f05-itachi-uchiha-2.webp'),
  ('f06', 'f06-kokkoro.webp', 2, 'f06-kokkoro-2.webp'),
  ('f09', 'f09-wargreymon.webp', 2, 'f09-wargreymon-2.webp'),
  ('f10', 'f10-duke-nukem.webp', 2, 'f10-duke-nukem-2.webp'),
  ('a06', 'a06-baby-groot.webp', 2, 'a06-baby-groot-2.webp'),
  ('a06', 'a06-baby-groot.webp', 3, 'a06-baby-groot-3.webp'),
  ('a07', 'a07-funko-pop-homelander-978-the-boys.webp', 2, 'a07-funko-pop-homelander-978-the-boys-2.webp'),
  ('a08', 'a08-funko-pop-harry-potter-with-birthday-cake.webp', 2, 'a08-funko-pop-harry-potter-with-birthday-cake-2.webp'),
  ('a09', 'a09-funko-pop-harley-quinn.webp', 2, 'a09-funko-pop-harley-quinn-2.webp'),
  ('a09', 'a09-funko-pop-harley-quinn.webp', 3, 'a09-funko-pop-harley-quinn-3.webp'),
  ('b06', 'b06-x-men-storm.webp', 2, 'b06-x-men-storm-2.webp'),
  ('b08', 'b08-marvel-vintage-lot.webp', 2, 'b08-marvel-vintage-lot-2.webp'),
  ('k08', 'k08-cuba-sailing-ship-stamps.webp', 2, 'k08-cuba-sailing-ship-stamps-2.webp'),
  ('k09', 'k09-usa-christmas-stamps.webp', 2, 'k09-usa-christmas-stamps-2.webp'),
  ('k09', 'k09-usa-christmas-stamps.webp', 3, 'k09-usa-christmas-stamps-3.webp'),
  ('k10', 'k10-poland-stamps-album.webp', 2, 'k10-poland-stamps-album-2.webp'),
  ('m04', 'm04-ferrari-348-rally-177.webp', 2, 'm04-ferrari-348-rally-177-2.webp'),
  ('m04', 'm04-ferrari-348-rally-177.webp', 3, 'm04-ferrari-348-rally-177-3.webp'),
  ('m04', 'm04-ferrari-348-rally-177.webp', 4, 'm04-ferrari-348-rally-177-4.webp'),
  ('m08', 'm08-royal-aircraft-factory-s-e-5a.webp', 2, 'm08-royal-aircraft-factory-s-e-5a-2.webp'),
  ('m08', 'm08-royal-aircraft-factory-s-e-5a.webp', 3, 'm08-royal-aircraft-factory-s-e-5a-3.webp'),
  ('m09', 'm09-type-97-chi-ha.webp', 2, 'm09-type-97-chi-ha-2.webp'),
  ('m09', 'm09-type-97-chi-ha.webp', 3, 'm09-type-97-chi-ha-3.webp'),
  ('m09', 'm09-type-97-chi-ha.webp', 4, 'm09-type-97-chi-ha-4.webp')
) AS d(code, cover_file, seq, file)
JOIN product p ON p.cover_image_url LIKE '%/Product_image/seed/' || d.cover_file
ON CONFLICT (product_id, seq) DO NOTHING;  -- มีรูปลำดับนี้อยู่แล้ว (เช่นแอดมินใส่เอง) → ข้าม ไม่เขียนทับ
