// จุดเริ่มรัน server (npm start / npm run dev)
const app = require('./app');
const env = require('./config/env');
const { pool } = require('./db/pool');

const server = app.listen(env.port, () => {
  console.log(`API พร้อมใช้งานที่ http://localhost:${env.port}/api/health (${env.nodeEnv})`);
});

// ปิดการเชื่อมต่อให้เรียบร้อยตอน Railway สั่งหยุด/deploy ใหม่
function shutdown() {
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
