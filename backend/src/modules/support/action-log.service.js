// บันทึกการกระทำของแอดมิน (R1 · BR-31 · ตาราง admin_action_log)
//
// ทุกครั้งที่แอดมินเปลี่ยนข้อมูลสำคัญ ให้เรียก logAdminAction ใน transaction เดียวกับการเปลี่ยนข้อมูล
// ถ้าการเปลี่ยนข้อมูลล้มเหลว (ROLLBACK) log ก็จะหายไปด้วย → log ตรงกับสิ่งที่เกิดขึ้นจริงเสมอ
//
//   const { logAdminAction } = require('../support/action-log.service');
//   await withTransaction(async (client) => {
//     await client.query('UPDATE ...');
//     await logAdminAction(client, {
//       adminId: req.user.user_id,
//       actionType: 'reply_ticket',      // กริยา_สิ่งที่ทำ ภาษาอังกฤษตัวเล็ก
//       targetType: 'support_ticket',    // ชื่อตารางของสิ่งที่ถูกเปลี่ยน
//       targetId: 12,
//       note: 'ตอบกลับลูกค้า',            // ข้อความสั้น ๆ ให้คนอ่านรู้ว่าเกิดอะไรขึ้น (ไม่บังคับ)
//     });
//   });
//
// ตารางนี้เป็น append-only: เพิ่มได้อย่างเดียว ห้าม UPDATE / DELETE (ดูท้ายไฟล์ 001_init.sql)
// target_type ไม่มี FK (polymorphic) — ลบเคสไปแล้ว log ของเคสนั้นก็ยังอยู่
const { query } = require('../../db/pool');

/** เพิ่มแถวใน admin_action_log — db = client ของ transaction (หรือไม่ส่งก็ได้ถ้าไม่ได้อยู่ใน transaction) */
async function logAdminAction(db, { adminId, actionType, targetType, targetId = null, note = null }) {
  await (db || { query }).query(
    `INSERT INTO admin_action_log (admin_id, action_type, target_type, target_id, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminId, actionType, targetType, targetId, note]
  );
}

// =====================================================================
// อ่าน log (หน้า /admin/activity ของ owner และประวัติในหน้ารายละเอียดคำขอ / เคส)
// =====================================================================

const refCode = { refund_request: 'RF', support_ticket: 'TK', product: 'P' };

/** ชื่อของสิ่งที่ถูกเปลี่ยน ให้คนอ่าน log รู้ว่าคืออะไรโดยไม่ต้องเปิดดูทีละอัน (ลบไปแล้ว = null) */
const TARGET_NAME = `CASE l.target_type
    WHEN 'user'           THEN tu.username
    WHEN 'product'        THEN tp.title
    WHEN 'support_ticket' THEN tt.subject
    WHEN 'refund_request' THEN toi.title_snapshot
  END`;

const LOG_FROM = `
  FROM admin_action_log l
  JOIN "user" a                 ON a.user_id = l.admin_id
  LEFT JOIN "user" tu           ON l.target_type = 'user'           AND tu.user_id = l.target_id
  LEFT JOIN product tp          ON l.target_type = 'product'        AND tp.product_id = l.target_id
  LEFT JOIN support_ticket tt   ON l.target_type = 'support_ticket' AND tt.ticket_id = l.target_id
  LEFT JOIN refund_request trr  ON l.target_type = 'refund_request' AND trr.refund_id = l.target_id
  LEFT JOIN order_item toi      ON toi.order_item_id = trr.order_item_id`;

function toLog(row) {
  const targetId = row.target_id === null ? null : Number(row.target_id);
  const prefix = refCode[row.target_type];
  return {
    log_id: Number(row.log_id),
    action_type: row.action_type,
    target_type: row.target_type,
    target_id: targetId,
    // รหัสที่หน้าเว็บใช้ เช่น RF012, TK005, P012 (ประเภทอื่นไม่มีรหัส)
    target_code: prefix && targetId !== null ? `${prefix}${String(targetId).padStart(3, '0')}` : null,
    target_name: row.target_name ?? null,
    note: row.note,
    created_at: row.created_at,
    admin: { user_id: Number(row.admin_id), username: row.admin_username, display_name: row.admin_name },
  };
}

const LOG_COLUMNS = `l.*, a.username AS admin_username, a.display_name AS admin_name, ${TARGET_NAME} AS target_name`;

/**
 * log ทั้งหมดแบบแบ่งหน้า (ล่าสุดก่อน) — filters: { q, adminId, action, targetType, page, pageSize }
 *   q = ข้อความใน note / ชื่อผู้ดูแล / ชื่อสิ่งที่ถูกเปลี่ยน · หรือรหัส RF012 / TK005 / P012 (ตรงกับสิ่งนั้น)
 * meta: admins / actions / target_types ที่มีใน log (ไว้ทำตัวเลือกตัวกรอง)
 */
async function list({ q, adminId, action, targetType, page, pageSize }) {
  const where = [];
  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (q) {
    const code = /^(rf|tk|p)0*(\d{1,15})$/i.exec(q);
    if (code) {
      const type = { rf: 'refund_request', tk: 'support_ticket', p: 'product' }[code[1].toLowerCase()];
      where.push(`l.target_type = ${add(type)} AND l.target_id = ${add(Number(code[2]))}`);
    } else {
      const ph = add(`%${q}%`);
      where.push(`(l.note ILIKE ${ph} OR a.username ILIKE ${ph} OR a.display_name ILIKE ${ph} OR ${TARGET_NAME} ILIKE ${ph})`);
    }
  }
  if (adminId) where.push(`l.admin_id = ${add(adminId)}`);
  if (action) where.push(`l.action_type = ${add(action)}`);
  if (targetType) where.push(`l.target_type = ${add(targetType)}`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const count = await query(`SELECT COUNT(*)::int AS total ${LOG_FROM} ${whereSql}`, params);
  const limit = add(pageSize);
  const offset = add((page - 1) * pageSize);
  const { rows } = await query(
    `SELECT ${LOG_COLUMNS} ${LOG_FROM} ${whereSql}
      ORDER BY l.created_at DESC, l.log_id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  // ตัวเลือกของตัวกรอง (จากทั้งตาราง ไม่ขึ้นกับตัวกรองที่เลือกอยู่)
  const [admins, actions, targets] = await Promise.all([
    query(`SELECT DISTINCT a.user_id, a.display_name, a.username
             FROM admin_action_log l JOIN "user" a ON a.user_id = l.admin_id ORDER BY a.display_name`),
    query('SELECT DISTINCT action_type FROM admin_action_log ORDER BY action_type'),
    query('SELECT DISTINCT target_type FROM admin_action_log ORDER BY target_type'),
  ]);

  return {
    items: rows.map(toLog),
    total: count.rows[0].total,
    facets: {
      admins: admins.rows.map((r) => ({ user_id: Number(r.user_id), display_name: r.display_name, username: r.username })),
      actions: actions.rows.map((r) => r.action_type),
      target_types: targets.rows.map((r) => r.target_type),
    },
  };
}

/** ประวัติของสิ่งหนึ่ง เช่น คำขอคืนเงิน 12 (เก่าสุดก่อน) — ใช้แสดงในหน้ารายละเอียด */
async function historyOf(targetType, targetId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${LOG_COLUMNS} ${LOG_FROM}
      WHERE l.target_type = $1 AND l.target_id = $2
      ORDER BY l.created_at, l.log_id`,
    [targetType, targetId]
  );
  return rows.map(toLog);
}

module.exports = { logAdminAction, list, historyOf };
