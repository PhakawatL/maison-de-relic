// ตัวรันไฟล์ .sql ตามลำดับชื่อไฟล์ และจดไว้ในตารางว่ารันไฟล์ไหนไปแล้ว
// ใช้ร่วมกันโดย migrate.js (db/migrations) และ seed.js (db/seeds)
// รันซ้ำได้ปลอดภัย: ไฟล์ที่รันแล้วจะถูกข้าม
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db/pool');

async function runSqlDir({ dir, table, label }) {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

    const { rows } = await client.query(`SELECT filename FROM ${table}`);
    const done = new Set(rows.map((r) => r.filename));

    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      process.stdout.write(`${label}: ${file} ... `);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(`INSERT INTO ${table} (filename) VALUES ($1)`, [file]);
        await client.query('COMMIT');
        console.log('ok');
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('FAILED');
        console.error(`\n${file} พัง: ${err.message}`);
        if (err.position) console.error(`(ตำแหน่งตัวอักษรที่ ${err.position} ในไฟล์)`);
        process.exitCode = 1;
        return;
      }
    }
    console.log(count ? `${label}: รันเพิ่ม ${count} ไฟล์` : `${label}: เป็นปัจจุบันแล้ว`);
  } finally {
    client.release();
  }
}

module.exports = { runSqlDir };
