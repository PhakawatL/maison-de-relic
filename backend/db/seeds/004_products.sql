-- =====================================================================
-- 004_products.sql — สินค้าตัวอย่าง 60 ชิ้น (R4 ร่วมกับ R3)
-- =====================================================================
-- ไฟล์ seed รันครั้งเดียวต่อฐานข้อมูล พอ merge แล้วห้ามแก้ ถ้าจะเพิ่ม/แก้สินค้าให้สร้างไฟล์ใหม่ 005_...sql
--
-- * หมวดละ 10 ชิ้น ครบ 6 หมวด · ชื่อและคำอธิบายเขียนตามของที่เห็นในรูปจริง · ราคาเป็นราคาสมมติ
-- * รูปอยู่ใน Supabase Storage bucket Product_image โฟลเดอร์ seed/ (bucket เป็น public ทุกเครื่องเปิดรูปได้โดยไม่ต้องมี key)
--   อัปโหลดด้วย node backend/scripts/upload-seed-images.js · ที่มาและเครดิตช่างภาพอยู่ใน 004_products.credits.md
-- * ผู้ลงสินค้าคือแอดมิน Neptz จาก 002_users.sql (product.created_by ต้องชี้ไปที่ตาราง admin)
-- * embedding ยังว่าง (NULL) — สคริปต์ backfill ของ R4 จะเติมทีหลัง
-- * มีกรณีทดสอบปนอยู่: status draft 2 ชิ้น / hidden 2 ชิ้น (หน้าร้านต้องไม่เห็น)
--   และของหมด stock_quantity = 0 อีก 6 ชิ้น (ใช้ทดสอบตัวกรอง inStock=true)
-- * age_hours = ลงขายมาแล้วกี่ชั่วโมง ใช้ตั้ง created_at ให้ไม่ซ้ำกัน แถว "มาใหม่ล่าสุด" จะเรียงได้แน่นอน
-- =====================================================================

INSERT INTO product
  (category_id, series_id, created_by, title, description, price, condition, status,
   stock_quantity, cover_image_url, created_at)
SELECT c.category_id,
       s.series_id,                                   -- ไม่มีซีรีส์ → LEFT JOIN ได้ NULL
       (SELECT a.user_id FROM admin a
          JOIN "user" u ON u.user_id = a.user_id
         WHERE u.username = 'Neptz'),                 -- แอดมินผู้ลงสินค้า
       d.title, d.description, d.price, d.condition, d.status, d.stock,
       'https://qosmwcfrrwcbdzxgrzlu.supabase.co/storage/v1/object/public/Product_image/seed/'
         || d.image,                                  -- URL สาธารณะของรูปหน้าปก (หน้าเว็บเปิดได้ตรง ๆ)
       NOW() - make_interval(hours => d.age_hours)
FROM (VALUES
  -- (หมวด, ซีรีส์, ชื่อ, สภาพ, ราคา, สต็อก, สถานะ, ไฟล์รูป, อายุ(ชม.), คำอธิบาย)
  -- ---------- การ์ดสะสม (trading-cards) ----------
  ('trading-cards', 'pokemon-tcg', 'Charizard Holo — Base Set 2 (4/130)', 'excellent', 7900, 1, 'available', 'c01-charizard-holo.webp', 2,
   'การ์ดลิซาร์ดอนโฮโลจากชุด Base Set 2 ภาษาอังกฤษ เก็บในเคสแม่เหล็กตลอด ผิวโฮโลยังวาว มุมมีรอยขาวเล็กน้อย'),
  ('trading-cards', 'pokemon-tcg', 'Charizard Collection Set (ในเคสแม่เหล็ก)', 'excellent', 12500, 1, 'available', 'c02-charizard-collection-set.webp', 44,
   'ชุดสะสมการ์ดลิซาร์ดอนหลายรุ่นตามรูป ทั้งโฮโลยุคคลาสสิกและรุ่นใหม่ ทุกใบอยู่ในเคสแม่เหล็กกันรอย ขายยกชุด'),
  ('trading-cards', 'pokemon-tcg', 'Blastoise Holo — Base Set 2', 'excellent', 3200, 1, 'available', 'c03-blastoise-holo.webp', 86,
   'การ์ดคาเม็กซ์โฮโลชุด Base Set 2 ภาษาอังกฤษ สีสดไม่ซีด เก็บในเคสแม่เหล็กพร้อมขาตั้ง'),
  ('trading-cards', 'pokemon-tcg', 'Dark Blastoise Holo — Team Rocket (JP)', 'like_new', 2400, 1, 'available', 'c04-dark-blastoise-holo.webp', 128,
   'การ์ด わるいカメックス (ดาร์กคาเม็กซ์) โฮโลภาษาญี่ปุ่นจากชุด Team Rocket ลายโฮโลแบบจุดดาวสวย ไม่มีรอยพับ'),
  ('trading-cards', 'pokemon-tcg', 'Mewtwo Holo — Base Set 2', 'excellent', 1800, 1, 'available', 'c05-mewtwo-holo.webp', 170,
   'การ์ดมิวทูโฮโลจากชุด Base Set 2 ภาษาอังกฤษ ใส่เคสแม่เหล็กพร้อมขาตั้ง เหมาะตั้งโชว์ในตู้'),
  ('trading-cards', 'pokemon-tcg', 'Pokémon Card Bulk Lot — การ์ดคละ 100 ใบ', 'good', 590, 4, 'available', 'c06-pokemon-card-bulk-lot.webp', 212,
   'การ์ดโปเกมอนคละแบบ 100 ใบ ส่วนใหญ่เป็นการ์ดธรรมดาและอันคอมมอน เหมาะกับคนเริ่มสะสมหรือเอาไว้เล่นกับเพื่อน'),
  ('trading-cards', NULL, 'Yu-Gi-Oh! Classic Cards — กรอบโชว์การ์ดยุคแรก', 'good', 4500, 1, 'available', 'c07-yu-gi-oh-classic-cards.webp', 254,
   'ชุดการ์ดยูกิโอยุคแรกจัดใส่กรอบติดผนัง มี Curse of Dragon และการ์ดลายยูกิ ตัวการ์ดมีรอยใช้งานตามอายุ'),
  ('trading-cards', NULL, 'Yu-Gi-Oh! Rush Duel — Harpie Lady Sisters Holo (JP)', 'like_new', 690, 2, 'available', 'c08-yu-gi-oh-rush-duel.webp', 296,
   'การ์ดยูกิโอ Rush Duel ภาษาญี่ปุ่น ハーピィ三姉妹 ระดับโฮโลแสงรุ้ง แกะจากซองแล้วใส่ซองทันที'),
  ('trading-cards', NULL, 'Yu-Gi-Oh! Rush Duel Deck พร้อมกล่อง (JP)', 'like_new', 1290, 0, 'available', 'c09-yu-gi-oh-rush-duel-deck-jp.webp', 338,
   'เด็คยูกิโอ Rush Duel ภาษาญี่ปุ่นธีมฮาร์ปี้ พร้อมกล่องเด็คเดิม การ์ดครบตามชุด'),
  ('trading-cards', NULL, 'Vintage NHL Hockey Cards Lot', 'fair', 1500, 1, 'available', 'c10-vintage-nhl-hockey-cards-lot.webp', 380,
   'การ์ดฮอกกี้ NHL ยุคเก่าคละทีม เช่น Penguins และ Bruins บางใบอยู่ในเคสแข็ง บางใบมีรอยมุมตามอายุ'),
  -- ---------- ฟิกเกอร์ (figures) ----------
  ('figures', 'one-piece', 'Monkey D. Luffy — ฟิกเกอร์ท่าหมัดไฟพร้อมเอฟเฟกต์', 'new', 2900, 2, 'available', 'f01-monkey-d-luffy.webp', 9,
   'ฟิกเกอร์ลูฟี่ท่ากระโดดออกหมัดไฟ มีเอฟเฟกต์เปลวไฟและสายน้ำใส ฐานสีดำ งานสีสด'),
  ('figures', 'one-piece', 'Yamato — ฟิกเกอร์ทรงจิบิ', 'like_new', 990, 1, 'available', 'f02-yamato.webp', 51,
   'ฟิกเกอร์ยามาโตะจากวันพีซ ทรงหัวโตน่ารัก ผมขาวไล่สีเขียวฟ้า เขาสีแดง เปิดกล่องตั้งโชว์'),
  ('figures', 'dragon-ball', 'Son Goku Super Saiyan — ฟิกเกอร์ขนาดใหญ่', 'good', 1850, 1, 'available', 'f03-son-goku-super-saiyan.webp', 93,
   'ฟิกเกอร์โกคูร่างซูเปอร์ไซย่าผมทอง ท่ากำหมัด ตั้งโชว์มาก่อน มีฝุ่นเล็กน้อยตามซอก'),
  ('figures', NULL, 'Minato Namikaze — Resin Statue (Naruto)', 'excellent', 8900, 1, 'available', 'f04-minato-namikaze.webp', 135,
   'สแตชูเรซิ่นนามิคาเซ่ มินาโตะ ท่าพุ่งถือคุไน ฐานเป็นโซ่และเปลวไฟ ชิ้นใหญ่ งานลงสีละเอียด'),
  ('figures', NULL, 'Itachi Uchiha — ชุดแสงอุษา (Naruto)', 'like_new', 2600, 1, 'available', 'f05-itachi-uchiha.webp', 177,
   'ฟิกเกอร์อุจิวะ อิทาจิ ในเสื้อคลุมลายเมฆแดงของแสงอุษา ตั้งในตู้กระจกตลอด ไม่โดนแดด'),
  ('figures', NULL, 'Kokkoro — ฟิกเกอร์จิบิถือดาบ (Princess Connect! Re:Dive)', 'new', 1450, 2, 'available', 'f06-kokkoro.webp', 219,
   'ฟิกเกอร์โคโคโระผมขาวประดับดอกไม้ ท่าขยิบตาถือดาบ ฐานใส ของใหม่'),
  ('figures', NULL, 'Hatsune Miku — ฟิกเกอร์ธีมดอกไม้', 'excellent', 3900, 1, 'hidden', 'f07-hatsune-miku.webp', 261,
   'ฟิกเกอร์มิกุผมทวินเทลสีฟ้าอมเขียว ชุดขาวถือช่อดอกไม้สีชมพู (ซ่อนไว้รอตรวจชิ้นส่วนดอกไม้)'),
  ('figures', NULL, 'Saitama — ฟิกเกอร์ท่าต่อย (One Punch Man)', 'excellent', 1200, 1, 'available', 'f08-saitama.webp', 303,
   'ฟิกเกอร์ไซตามะชุดฮีโร่สีเหลืองผ้าคลุมขาว ท่าพุ่งออกหมัด สีไม่ถลอก'),
  ('figures', NULL, 'WarGreymon — ฟิกเกอร์ขยับได้ (Digimon)', 'good', 1100, 1, 'available', 'f09-wargreymon.webp', 345,
   'ฟิกเกอร์วอร์เกรย์มอนจากดิจิมอน ขยับแขนขาได้ เกราะและกรงเล็บครบ มีรอยถลอกเล็กน้อยที่ขอบเกราะ'),
  ('figures', NULL, 'Duke Nukem — NECA Action Figure (ซีลแพ็ก)', 'new', 1350, 0, 'available', 'f10-duke-nukem.webp', 387,
   'แอ็กชันฟิกเกอร์ดยุก นูเคม ค่าย NECA ยังอยู่ในแพ็กเกจซีลเดิม เหมาะกับสายเกมยุค 90'),
  -- ---------- โมเดลพลาสติก (model-kits) ----------
  ('model-kits', 'gundam', 'ν Gundam (RX-93) — ประกอบแล้ว', 'excellent', 2200, 1, 'available', 'm01-nu-gundam-rx-93.webp', 16,
   'กันพลา ν Gundam ประกอบแล้ว สีเดิมจากโรงงาน ตัดเก็บรอยเรียบร้อย ข้อต่อขยับได้'),
  ('model-kits', 'gundam', 'Gundam Exia — ประกอบแล้ว', 'excellent', 1500, 1, 'available', 'm02-gundam-exia.webp', 58,
   'กันพลา Gundam Exia จากเรื่อง Gundam 00 ประกอบแล้ว ชิ้นส่วนสีน้ำเงิน ขาว แดงครบ'),
  ('model-kits', 'gundam', 'Gunpla Collection — ยกชุดพร้อมตู้ไฟ LED', 'good', 9900, 1, 'draft', 'm03-gunpla-collection.webp', 100,
   'ยกชุดกันพลาประกอบแล้วหลายรุ่นในตู้โชว์ไฟ LED (ร่าง — รอนับรุ่นและเช็กชิ้นส่วน)'),
  ('model-kits', NULL, 'Ferrari 348 Rally #177 — Diecast', 'good', 1350, 1, 'available', 'm04-ferrari-348-rally-177.webp', 142,
   'รถเหล็กเฟอร์รารี่ 348 ลายแรลลี่เบอร์ 177 สีแดง สติกเกอร์สปอนเซอร์ครบ ล้อหมุนได้'),
  ('model-kits', NULL, 'Volkswagen Type 2 — รถตู้ VW ชุด 4 คัน', 'excellent', 2400, 1, 'available', 'm05-volkswagen-type-2.webp', 184,
   'รถเหล็กโฟล์คตู้ Type 2 สี่คันสี่สี เก็บบนชั้นโชว์ ไม่มีรอยบุบ'),
  ('model-kits', NULL, 'Classic 1950s Convertible — Diecast สีเทอร์ควอยซ์', 'good', 890, 1, 'available', 'm06-classic-1950s-convertible.webp', 226,
   'รถเหล็กเปิดประทุนทรงอเมริกันยุค 50 สีฟ้าเทอร์ควอยซ์ ชิ้นโครเมียมยังเงา'),
  ('model-kits', NULL, 'Tamiya Mini 4WD — ชุดกล่อง + รถประกอบแล้ว', 'like_new', 1600, 2, 'available', 'm07-tamiya-mini-4wd.webp', 268,
   'รถทามิย่ามินิโฟร์วีลหลายกล่องยังไม่แกะ พร้อมรถสีแดงที่ประกอบแล้ว 1 คัน และกล่องเก็บอะไหล่'),
  ('model-kits', NULL, 'Royal Aircraft Factory S.E.5a — Scale Model', 'excellent', 1900, 1, 'available', 'm08-royal-aircraft-factory-s-e-5a.webp', 310,
   'โมเดลเครื่องบินปีกสองชั้น S.E.5a ของอังกฤษยุคสงครามโลกครั้งที่ 1 ทำสีลายพรางเขียวพร้อมเครื่องหมายวงกลม'),
  ('model-kits', NULL, 'Type 97 Chi-Ha — รถถังโมเดลทำสีเก่า', 'excellent', 2300, 0, 'available', 'm09-type-97-chi-ha.webp', 352,
   'โมเดลรถถังญี่ปุ่นสมัยสงครามโลกครั้งที่ 2 ทำสีเวทเธอริ่งให้ดูผ่านสนามรบ รายละเอียดหมุดย้ำชัด'),
  ('model-kits', NULL, 'Lockheed F-104 Starfighter — Kit ทำค้าง', 'fair', 650, 1, 'available', 'm10-lockheed-f-104-starfighter.webp', 394,
   'โมเดลเครื่องบิน F-104 ประกอบตัวลำแล้วแต่ยังไม่ทำสี เหมาะกับคนอยากทำต่อเอง'),
  -- ---------- อาร์ตทอย (art-toys) ----------
  ('art-toys', NULL, 'Mr. Bone Astronaut Series — Set of 3', 'new', 1590, 1, 'available', 'a01-mr-bone-astronaut-series.webp', 23,
   'ชุดอาร์ตทอย Mr. Bone ชุดนักบินอวกาศสีน้ำเงินขาว 3 ตัว หน้าไม่ซ้ำกัน ใส่หูฟังทุกตัว'),
  ('art-toys', NULL, 'Mr. Bone — Skull Headphone', 'like_new', 690, 1, 'available', 'a02-mr-bone.webp', 65,
   'ฟิกเกอร์ Mr. Bone หน้าหัวกะโหลกสีฟ้า ใส่หูฟัง เปิดกล่องตั้งโชว์'),
  ('art-toys', NULL, 'Mini Plush Bunny — สีส้มพีช', 'excellent', 450, 3, 'available', 'a03-mini-plush-bunny.webp', 107,
   'ตุ๊กตาหน้าไวนิลตัวจิ๋วชุดกระต่ายขนฟูสีส้มพีช ขนาดพอดีฝ่ามือ (ไม่ระบุแบรนด์)'),
  ('art-toys', NULL, 'Astronaut Antler — Designer Vinyl สีดำ', 'like_new', 2200, 1, 'available', 'a04-astronaut-antler.webp', 149,
   'อาร์ตทอยนักบินอวกาศหน้ากากดำ มีเขาสีขาว รองเท้าขาว ตั้งบนโต๊ะทำงาน'),
  ('art-toys', NULL, 'Streetwear Designer Figures — Set of 3', 'excellent', 3500, 1, 'available', 'a05-streetwear-designer-figures.webp', 191,
   'ชุดฟิกเกอร์ดีไซเนอร์สายสตรีท 3 ตัว แต่ละตัวถือของต่างกัน เช่น กล่องสินค้าและดอกไม้'),
  ('art-toys', NULL, 'Baby Groot — Custom Streetwear', 'good', 890, 1, 'available', 'a06-baby-groot.webp', 233,
   'ฟิกเกอร์เบบี้กรูทแต่งเสื้อยืดโลโก้กล่องแดงแบบคัสตอม นั่งบนกล่องรองเท้า'),
  ('art-toys', NULL, 'Funko Pop! Homelander #978 (The Boys)', 'new', 790, 2, 'available', 'a07-funko-pop-homelander-978-the-boys.webp', 275,
   'Funko Pop โฮมแลนเดอร์จากซีรีส์ The Boys หมายเลข 978 กล่องเดิมสภาพดี'),
  ('art-toys', NULL, 'Funko Pop! Harry Potter with Birthday Cake', 'excellent', 690, 1, 'draft', 'a08-funko-pop-harry-potter-with-birthday-cake.webp', 317,
   'Funko Pop แฮร์รี่ พอตเตอร์ถือกล่องเค้กวันเกิด (ร่าง — รอหากล่องเดิม)'),
  ('art-toys', NULL, 'Funko Pop! Harley Quinn', 'excellent', 750, 1, 'available', 'a09-funko-pop-harley-quinn.webp', 359,
   'Funko Pop ฮาร์ลีย์ ควินน์ ผมสองสีชมพูฟ้า ถือค้อน มีขาตั้งใส'),
  ('art-toys', NULL, 'Funko Pop! Collection Lot — ยกชุดหลายสิบกล่อง', 'good', 9500, 0, 'available', 'a10-funko-pop-collection-lot.webp', 401,
   'ยกชุด Funko Pop หลายเรื่องหลายสิบกล่องตามรูป กล่องมีรอยถลอกบ้างตามการเก็บ'),
  -- ---------- การ์ตูนและหนังสือ (comics-books) ----------
  ('comics-books', NULL, 'Cardcaptor Sakura: Clear Card + Sailor Moon (English)', 'like_new', 690, 1, 'available', 'b01-cardcaptor-sakura-clear-card-sailor-moon-english.webp', 30,
   'มังงะภาษาอังกฤษ 2 เล่ม การ์ดแคปเตอร์ซากุระภาคเคลียร์การ์ด และเซเลอร์มูน แนวสาวน้อยเวทมนตร์'),
  ('comics-books', NULL, 'The Silver Surfer #10 (Marvel)', 'good', 3900, 1, 'available', 'b02-the-silver-surfer-10-marvel.webp', 72,
   'คอมิก Marvel The Silver Surfer ฉบับที่ 10 ปก 15 เซนต์ เก็บในซองพร้อมแผ่นรองแข็ง ปกสียังสด'),
  ('comics-books', NULL, 'Silver Surfer Vintage Comics — ชุด 9 เล่ม', 'good', 15000, 1, 'available', 'b03-silver-surfer-vintage-comics.webp', 114,
   'ชุดคอมิก Silver Surfer ยุคเก่า 9 เล่มในซองแข็งแขวนผนัง มี The Defenders รวมอยู่หนึ่งเล่ม'),
  ('comics-books', NULL, 'Fantastic Four — ฉบับภาษาฝรั่งเศส', 'fair', 1200, 1, 'available', 'b04-fantastic-four.webp', 156,
   'คอมิก Fantastic Four ฉบับพิเศษภาษาฝรั่งเศส ปกมี Silver Surfer เก็บในซอง ขอบปกมีรอยยับ'),
  ('comics-books', NULL, 'Thor — Vintage Comic', 'fair', 1800, 1, 'available', 'b05-thor.webp', 198,
   'คอมิกธอร์ยุคเก่า ปกลายธอร์ถือค้อน กระดาษเหลืองตามอายุ'),
  ('comics-books', NULL, 'X-Men (ปก Storm) + กล่องเก็บคอมิก', 'good', 990, 1, 'available', 'b06-x-men-storm.webp', 240,
   'คอมิก X-Men ปกสตอร์ม มาพร้อมกล่องกระดาษสำหรับเก็บคอมิก'),
  ('comics-books', NULL, 'Marvel Comics Lot — Deadpool / Uncanny X-Men', 'good', 2500, 2, 'available', 'b07-marvel-comics-lot.webp', 282,
   'คอมิก Marvel คละเรื่อง เช่น Deadpool และ The Uncanny X-Men ปกสีสด เหมาะกับคนเริ่มสะสม'),
  ('comics-books', NULL, 'Marvel Vintage Lot — Captain America / Iron Man / Doctor Doom', 'fair', 3200, 1, 'hidden', 'b08-marvel-vintage-lot.webp', 324,
   'คอมิกยุคเก่าคละ ปก Captain America, Iron Man และ Doctor Doom (ซ่อนไว้รอแยกขายรายเล่ม)'),
  ('comics-books', NULL, 'DC World''s Finest — กล่องคอมิกยุคเก่า', 'good', 2900, 1, 'available', 'b09-dc-world-s-finest.webp', 366,
   'กล่องคอมิก DC ยุคเก่า มี World''s Finest และเล่มอื่นเรียงในซอง ขายยกกล่อง'),
  ('comics-books', NULL, 'Comic & Graphic Novel Stack — คละ', 'good', 1500, 0, 'available', 'b10-comic-graphic-novel-stack.webp', 408,
   'กองคอมิกและกราฟิกโนเวลคละเรื่อง ปกสีสด บางเล่มมีรอยพับมุม'),
  -- ---------- เหรียญและแสตมป์ (coins-stamps) ----------
  ('coins-stamps', NULL, 'Canada Silver Dollar 1981 (Railway)', 'excellent', 1450, 1, 'available', 'k01-canada-silver-dollar-1981-railway.webp', 37,
   'เหรียญดอลลาร์เงินแคนาดาปี 1981 ลายรถไฟ อยู่ในแคปซูลใส มาพร้อมกล่องกำมะหยี่แดง'),
  ('coins-stamps', NULL, 'Roman Silver Coins Lot — เหรียญโรมันโบราณ', 'fair', 8500, 1, 'available', 'k02-roman-silver-coins-lot.webp', 79,
   'เหรียญเงินโรมันโบราณคละองค์จักรพรรดิ ลายนูนยังเห็นชัด ผิวมีคราบตามอายุ'),
  ('coins-stamps', NULL, 'UK 50p — Benjamin Britten', 'good', 350, 4, 'available', 'k03-uk-50p.webp', 121,
   'เหรียญ 50 เพนนีที่ระลึกเบนจามิน บริตเทน นักแต่งเพลงชาวอังกฤษ ผ่านการใช้งาน'),
  ('coins-stamps', NULL, 'India One Rupee 1907 — Silver', 'good', 1900, 1, 'available', 'k04-india-one-rupee-1907.webp', 163,
   'เหรียญหนึ่งรูปีเงินของบริติชอินเดียปี 1907 ตัวหนังสือชัด ขอบมีรอยสึก'),
  ('coins-stamps', NULL, 'Vienna Philharmonic — คู่เหรียญทองและเงิน', 'new', 15900, 1, 'available', 'k05-vienna-philharmonic.webp', 205,
   'เหรียญ Wiener Philharmoniker ของออสเตรีย 2 เหรียญ เนื้อทองและเนื้อเงิน ลายเครื่องดนตรีคมชัด'),
  ('coins-stamps', NULL, 'Lunar Year of the Snake — เหรียญเงิน 3 ขนาด', 'like_new', 4800, 1, 'available', 'k06-lunar-year-of-the-snake.webp', 247,
   'เหรียญเงินลายปีงู 3 ขนาดในแคปซูลใส ลายงูและตัวอักษรจีน 蛇 คมชัด'),
  ('coins-stamps', NULL, 'RMS Titanic — เหรียญที่ระลึกลงสี', 'new', 1290, 2, 'available', 'k07-rms-titanic.webp', 289,
   'เหรียญที่ระลึกเรือไททานิกสีทองลงสีน้ำเงิน อยู่ในแคปซูลใส'),
  ('coins-stamps', NULL, 'Cuba Sailing Ship Stamps — 3 ดวง', 'excellent', 250, 3, 'available', 'k08-cuba-sailing-ship-stamps.webp', 331,
   'แสตมป์คิวบาลายเรือใบ 3 ดวง สีสด ขอบฟันครบ'),
  ('coins-stamps', NULL, 'USA Christmas Stamps — Vintage Set', 'good', 320, 2, 'available', 'k09-usa-christmas-stamps.webp', 373,
   'แสตมป์คริสต์มาสอเมริกันยุคเก่า ลายซานตาคลอสและฉากฤดูหนาว'),
  ('coins-stamps', NULL, 'Poland Stamps Album — อัลบั้มแสตมป์โปแลนด์', 'fair', 1200, 0, 'available', 'k10-poland-stamps-album.webp', 415,
   'อัลบั้มแสตมป์โปแลนด์และยุโรปตะวันออกยุคเก่าหลายสิบดวง บางดวงมีตราประทับ')
) AS d(category_slug, series_slug, title, condition, price, stock, status, image, age_hours, description)
JOIN category c    ON c.slug = d.category_slug
LEFT JOIN series s ON s.slug = d.series_slug;

-- รูปหน้าปกของแต่ละชิ้นเป็นรูปที่ 1 (seq = 1) ในตาราง product_image ใช้ไฟล์เดียวกับ cover_image_url
-- หน้า Detail อ่านรูปจาก product_image ส่วนการ์ดสินค้าอ่านจาก cover_image_url
INSERT INTO product_image (product_id, seq, url, alt_text, is_cover)
SELECT product_id, 1, cover_image_url, title, TRUE
FROM product
WHERE cover_image_url LIKE '%/Product_image/seed/%'
  AND NOT EXISTS (SELECT 1 FROM product_image pi WHERE pi.product_id = product.product_id);  -- ข้ามชิ้นที่มีรูปอยู่แล้ว
