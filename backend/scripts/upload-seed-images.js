// อัปโหลดรูปสินค้าตัวอย่าง (seed 004_products.sql) เข้า Supabase Storage — R4
//
// รันบนเครื่องตัวเอง (ไม่ต้องรันในกล่อง Docker) จาก root ของ repo:
//   node backend/scripts/upload-seed-images.js            ← อัปโหลดทุกรูปใน seed-images.json (รันซ้ำได้ จะเขียนทับรูปเดิม)
//   node backend/scripts/upload-seed-images.js --new      ← อัปโหลดเฉพาะรูปที่ยังเปิดจาก URL สาธารณะไม่ได้ (รูปใหม่)
//   node backend/scripts/upload-seed-images.js --check    ← เช็กอย่างเดียวว่าเปิดรูปจาก URL สาธารณะได้ครบไหม
//
// seed-images.json มีทั้งรูปปก (ไม่มีช่อง seq = รูปที่ 1 ของ 004_products.sql)
// และรูปเพิ่มเติม (seq >= 2 ของ 005_product_images.sql)
//
// ต้องมีใน .env ที่ root ของ repo (ห้าม commit ไฟล์นี้ — ดู docs/deploy.md ข้อ 3):
//   SUPABASE_URL=https://<project>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=<key ฝั่ง server>     (ไม่ต้องใช้ถ้ารันแค่ --check)
//
// ทำงานอย่างไร: อ่านรายชื่อรูปจาก seed-images.json → โหลดรูปจาก Pexels เป็น webp กว้างไม่เกิน 1000px
// → อัปโหลดเข้า bucket Product_image ที่ path seed/<ชื่อไฟล์> ผ่าน Storage REST API
// ใช้แค่ fetch ที่มีใน Node อยู่แล้ว จึงไม่ต้องเพิ่ม package ใน package.json
const fs = require('fs');
const path = require('path');

// ชื่อ bucket ตามที่สร้างไว้จริงใน Supabase (ตัวพิมพ์ใหญ่/เล็กต้องตรง) เปลี่ยนได้ด้วย SUPABASE_PRODUCT_BUCKET ใน .env
const BUCKET_DEFAULT = 'Product_image';
const FOLDER = 'seed';
const ROOT = path.join(__dirname, '..', '..');

/** อ่านค่าจาก .env ที่ root แบบง่าย ๆ (บรรทัด KEY=VALUE) ไม่ต้องพึ่ง package dotenv */
function readEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const onlyNew = process.argv.includes('--new');
  const env = { ...readEnv(path.join(ROOT, '.env')), ...process.env };
  const url = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const BUCKET = env.SUPABASE_PRODUCT_BUCKET || BUCKET_DEFAULT;

  if (!url) throw new Error('ไม่พบ SUPABASE_URL ใน .env ที่ root ของ repo');
  if (!checkOnly && !key) throw new Error('ไม่พบ SUPABASE_SERVICE_ROLE_KEY ใน .env (ถ้าแค่เช็ก ให้ใส่ --check)');

  const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-images.json'), 'utf8'));
  const publicUrl = (file) => `${url}/storage/v1/object/public/${BUCKET}/${FOLDER}/${file}`;
  let failed = 0;
  let skipped = 0;

  for (const item of items) {
    const label = `${item.code}${item.seq ? `#${item.seq}` : ''}`; // c06#2 = รูปที่ 2 ของสินค้า c06
    try {
      // --new: ถ้ารูปนี้เปิดจาก URL สาธารณะได้อยู่แล้ว (อัปโหลดไปแล้ว) ข้ามไปเลย ไม่ต้องโหลด/อัปโหลดซ้ำ
      if (onlyNew && !checkOnly && (await fetch(publicUrl(item.file), { method: 'HEAD' })).ok) {
        skipped++;
        continue;
      }
      if (!checkOnly) {
        // 1) โหลดรูปจาก Pexels (ให้ Pexels ย่อและแปลงเป็น webp ให้เลย)
        const src = `https://images.pexels.com/photos/${item.pexelsId}/pexels-photo-${item.pexelsId}.jpeg?auto=compress&cs=tinysrgb&w=1000&fm=webp`;
        const img = await fetch(src);
        if (!img.ok) throw new Error(`โหลดจาก Pexels ไม่ได้ (${img.status})`);
        const body = Buffer.from(await img.arrayBuffer());

        // 2) อัปโหลดเข้า Supabase Storage — x-upsert: true = มีไฟล์ชื่อนี้อยู่แล้วให้เขียนทับ
        // Storage บังคับให้มีทั้ง apikey และ Authorization ใช้ key เดียวกันได้ทั้ง key แบบใหม่ (sb_secret_...)
        // และแบบเก่า (service_role ที่ขึ้นต้นด้วย eyJ)
        const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${FOLDER}/${item.file}`, {
          method: 'POST',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'image/webp',
            'Cache-Control': 'max-age=31536000',
            'x-upsert': 'true',
          },
          body,
        });
        if (!res.ok) throw new Error(`อัปโหลดไม่ได้ (${res.status}) ${await res.text()}`);
      }

      // 3) เช็กว่าเปิดจาก URL สาธารณะได้ (bucket ต้องตั้งเป็น public)
      const check = await fetch(publicUrl(item.file), { method: 'HEAD' });
      if (!check.ok) throw new Error(`เปิดจาก URL สาธารณะไม่ได้ (${check.status}) — bucket เป็น public หรือยัง?`);
      console.log(`✔ ${label} ${item.file}`);
    } catch (err) {
      failed++;
      console.error(`✘ ${label} ${item.file}: ${err.message}`);
    }
  }

  console.log(`\nเสร็จ ${items.length - failed}/${items.length} รูป${skipped ? ` (ข้ามรูปที่มีอยู่แล้ว ${skipped} รูป)` : ''}`);
  console.log(`ตัวอย่าง URL: ${publicUrl(items[0].file)}`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
