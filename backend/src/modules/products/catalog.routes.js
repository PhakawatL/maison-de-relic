// routes ของหมวดหมู่และซีรีส์ (R3) — อ่านอย่างเดียว ไม่ต้องล็อกอิน
// ใน app.js ใช้ไฟล์นี้ 2 ที่:
//   app.use('/api/categories', categoriesRouter)
//   app.use('/api/series',     seriesRouter)
const { Router } = require('express');
const service = require('./catalog.service');

const categoriesRouter = Router();
categoriesRouter.get('/', async (req, res) => {
  res.json({ data: await service.listCategories() }); // GET /api/categories
});

const seriesRouter = Router();
seriesRouter.get('/', async (req, res) => {
  res.json({ data: await service.listSeries() }); // GET /api/series
});

module.exports = { categoriesRouter, seriesRouter };
