// npm run db:reset — ล้างฐานข้อมูลบนเครื่องตัวเองทิ้งทั้งหมด แล้ว migrate + seed ใหม่
// ใช้เมื่อฐานข้อมูลบนเครื่องเละ หรือเพื่อนแก้ migration แล้วอยากเริ่มใหม่
// ปิดไว้บน production เพื่อกันลบข้อมูลจริง
const path = require('path');
const env = require('../src/config/env');
const { pool } = require('../src/db/pool');
const { runSqlDir } = require('./sqlRunner');

async function main() {
  if (env.isProduction) {
    throw new Error('ห้ามรัน db:reset บน production');
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
