// npm run db:seed — ใส่ข้อมูลตัวอย่างจากไฟล์ใน db/seeds (แต่ละไฟล์รันครั้งเดียว)
const path = require('path');
const { pool } = require('../src/db/pool');
const { runSqlDir } = require('./sqlRunner');

runSqlDir({
  dir: path.join(__dirname, '..', 'db', 'seeds'),
  table: 'schema_seeds',
  label: 'seed',
})
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
