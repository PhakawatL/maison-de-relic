// controller ของประวัติการทำงานของผู้ดูแล (R1 · BR-31 · หน้า /admin/activity)
const { Checker, firstValue, parseListQuery } = require('../../utils/validate');
const service = require('./action-log.service');

const CODE = /^[a-z][a-z_]{0,49}$/; // action_type / target_type เป็นภาษาอังกฤษตัวเล็กคั่นด้วย _

// GET /api/admin/action-logs?q=&admin=&action=&target=&page=&pageSize=
async function list(req, res) {
  const { q, page, pageSize } = parseListQuery(req.query, { search: true, defaultPageSize: 20 });
  const check = new Checker('เงื่อนไขการค้นหาไม่ถูกต้อง');
  const pick = (key) => {
    const v = firstValue(req.query[key]);
    return typeof v === 'string' && v.trim() !== '' && v.trim() !== 'all' ? v.trim() : undefined;
  };
  const adminId = check.positiveInt(pick('admin'), 'admin');
  const action = pick('action');
  const targetType = pick('target');
  if (action !== undefined && !CODE.test(action)) check.fail('action', 'รูปแบบไม่ถูกต้อง');
  if (targetType !== undefined && !CODE.test(targetType)) check.fail('target', 'รูปแบบไม่ถูกต้อง');
  check.done();

  const { items, total, facets } = await service.list({ q, adminId, action, targetType, page, pageSize });
  res.json({ data: items, meta: { page, pageSize, total, ...facets } });
}

module.exports = { list };
