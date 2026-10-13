// npm run db:reset — ล้างฐานข้อมูลบนเครื่องตัวเองทิ้งทั้งหมด แล้ว migrate + seed ใหม่
// ใช้เมื่อฐานข้อมูลบนเครื่องเละ หรือเพื่อนแก้ migration แล้วอยากเริ่มใหม่
//
// ตัวกัน 2 ชั้น เพื่อไม่ให้เผลอลบฐานข้อมูลจริงหรือฐานข้อมูลที่ใช้ร่วมกัน:
//   1. ห้ามรันเมื่อ NODE_ENV=production
//   2. รันได้เฉพาะฐานข้อมูลบนเครื่องตัวเอง (localhost / 127.0.0.1 / ::1)
//      หรือกล่อง "db" ของ docker compose บนเครื่องตัวเอง
//      ถ้า DATABASE_URL ชี้ไปที่ Railway หรือเครื่องอื่น จะปฏิเสธทันที
const path = require('path');
const env = require('../src/config/env');
const { pool } = require('../src/db/pool');
const { runSqlDir } = require('./sqlRunner');

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', 'db'];

function databaseHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '(อ่าน DATABASE_URL ไม่ได้)';
  }
}

async function main() {
  if (env.isProduction) {
    throw new Error('ห้ามรัน db:reset บน production');
  }
  const host = databaseHost(env.databaseUrl);
  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error(
      `ห้ามรัน db:reset กับฐานข้อมูลที่ ${host} — คำสั่งนี้ลบได้เฉพาะฐานข้อมูลบนเครื่องตัวเอง (localhost)`
    );
  }
  console.log('reset: ลบทุกตารางใน schema public');
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

  const dbDir = path.join(__dirname, '..', 'db');
  await runSqlDir({ dir: path.join(dbDir, 'migrations'), table: 'schema_migrations', label: 'migrate' });
  if (process.exitCode) return;
  await runSqlDir({ dir: path.join(dbDir, 'seeds'), table: 'schema_seeds', label: 'seed' });
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
