// ประกอบ Express app: middleware → routes → error handler
// แยกจาก server.js เพื่อให้ test เรียกใช้ app ได้โดยไม่ต้องเปิด port จริง
const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const { query } = require('./db/pool');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// API อยู่หลัง reverse proxy → ให้ req.ip เป็น IP ของผู้ใช้จริง (rate limit นับตาม IP)
app.set('trust proxy', env.trustProxy);

// ---------- CORS ----------
// หน้าเว็บ (localhost:5500 / Vercel) กับ API (localhost:3000) เป็นคนละ origin เบราว์เซอร์จึงต้องได้รับอนุญาตก่อนเรียก API
app.use(
  cors({
    origin(origin, callback) {
      // request ที่ไม่มี Origin (curl, Postman, server-to-server) ให้ผ่าน
      if (!origin) return callback(null, true);
      const allowed =
        env.allowedOrigins.includes(origin) ||
        (env.allowedOriginRegex && env.allowedOriginRegex.test(origin));
      return allowed
        ? callback(null, true)
        : callback(new Error(`CORS: ไม่อนุญาต origin ${origin}`));
    },
  })
);

app.use(express.json({ limit: '1mb' }));

// ---------- Health check ----------
// docker compose ใช้ตรวจว่ากล่อง api พร้อม และใช้ทดสอบว่า frontend ต่อ backend ได้
app.get('/api/health', async (req, res) => {
  let db = 'ok';
  try {
    await query('SELECT 1');
  } catch {
    db = 'down';
  }
  res.status(db === 'ok' ? 200 : 503).json({
    status: db === 'ok' ? 'ok' : 'degraded',
    db,
    time: new Date().toISOString(),
  });
});

// ---------- Routes ของแต่ละ module ----------
// เพิ่ม module ใหม่: สร้างไฟล์ใน src/modules/<ชื่อ>/ ตามแบบ src/modules/_template แล้วเพิ่มบรรทัดในนี้
app.use('/api/auth', require('./modules/auth/auth.routes'));               // R2
app.use('/api/admins', require('./modules/users/admins.routes'));          // R2
app.use('/api/addresses', require('./modules/users/addresses.routes'));    // R2
app.use('/api/profile', require('./modules/users/profile.routes'));        // R2
app.use('/api/products', require('./modules/products/products.routes')); // R3
const { categoriesRouter, seriesRouter } = require('./modules/products/catalog.routes');
app.use('/api/categories', categoriesRouter);                             // R3
app.use('/api/series', seriesRouter);                                     // R3
// app.use('/api/search', require('./modules/search/search.routes'));      // R4
// app.use('/api/cart', require('./modules/cart/cart.routes'));            // R5
// app.use('/api/orders', require('./modules/orders/orders.routes'));      // R5
// app.use('/api/wishlist', require('./modules/wishlist/wishlist.routes'));// R1

// ---------- Error handling (ต้องอยู่ท้ายสุดเสมอ) ----------
app.use('/api', notFound);
app.use(errorHandler);

module.exports = app;
