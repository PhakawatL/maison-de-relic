// จุดเริ่มรัน server (npm start / npm run dev)
const app = require('./app');
const env = require('./config/env');
const { pool } = require('./db/pool');
const localEvents = require('./modules/orders/r5-local-events');
const stopEvents = localEvents.startWorker({dispatcher:localEvents.createRuntimeDispatcher()});

const server = app.listen(env.port, () => {
  console.log(`API พร้อมใช้งานที่ http://localhost:${env.port}/api/health (${env.nodeEnv})`);
  // R4 warm-up remains non-blocking; search can fall back while the model loads.
  require('./modules/search/embedding').warmUpModel();
});

// ปิดการเชื่อมต่อให้เรียบร้อยตอน docker compose สั่งหยุดกล่อง
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  // Stop scheduling immediately, while existing HTTP requests finish draining.
  const eventsStopped = stopEvents();
  server.close(() => eventsStopped.then(() => pool.end()).then(() => process.exit(0)).catch(() => {
    console.error('SERVER_SHUTDOWN_FAILED');
    process.exit(1);
  }));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
