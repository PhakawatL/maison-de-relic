// npm run db:migrate — สร้าง/แก้โครงสร้างตารางตามไฟล์ใน db/migrations
// docker compose รันคำสั่งนี้ให้เองทุกครั้งที่เปิดกล่อง api
const path = require('path');
const { pool } = require('../src/db/pool');
const { runSqlDir } = require('./sqlRunner');

runSqlDir({
  dir: path.join(__dirname, '..', 'db', 'migrations'),
  table: 'schema_migrations',
  label: 'migrate',
})
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
