// service ของระบบแจ้งปัญหา (R1 · S12 · BR-27, BR-28, BR-29 · ตาราง support_ticket)
//
// เคส 1 เคส = ลูกค้า 1 คนแจ้งเรื่อง 1 เรื่อง
//   * ลูกค้าเปิดเคสได้เองจากหน้า "ศูนย์ช่วยเหลือ" (/support) หรือจากปุ่ม "รายงานสินค้านี้" ในหน้า Detail
//   * อ้างถึงคำสั่งซื้อของตัวเองได้ 0..1 รายการ (order_id) · ผู้ดูแลรับผิดชอบได้ 0..1 คน (assigned_to)
//   * ผู้ดูแลตอบกลับได้หนึ่งข้อความ (admin_reply) และเปลี่ยนสถานะ open → pending → closed
//   * ทุกการเปลี่ยนแปลงของผู้ดูแลบันทึกลง admin_action_log ใน transaction เดียวกัน (BR-31)
//
// รายงานสินค้า: ตาราง support_ticket ไม่มีคอลัมน์ product_id (ERD ระยะที่ 1 ไม่ได้ผูกเคสกับสินค้า)
// จึงให้ระบบตั้งหัวข้อเป็น "[P012] ชื่อสินค้า" เอง ผู้ดูแลค้นสินค้าด้วยรหัส P012 ในหน้าจัดการสินค้าได้
// และหน้าแอดมินแปลงรหัสนี้เป็นลิงก์ไปหน้าสินค้าให้
const { query, withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const { logAdminAction, historyOf } = require('./action-log.service');

// หมวดของเคส (เก็บเป็นรหัสภาษาอังกฤษ ข้อความที่แสดงอยู่ใน frontend/js/locales หมวด support.cat.*)
const ORDER_CATEGORIES = ['not_as_described', 'damaged', 'not_delivered', 'product_question', 'payment', 'account'];
const PRODUCT_REPORT_CATEGORIES = ['counterfeit', 'wrong_images', 'misleading_price', 'inappropriate'];
const CATEGORIES = [...ORDER_CATEGORIES, ...PRODUCT_REPORT_CATEGORIES, 'other'];
const STATUSES = ['open', 'pending', 'closed'];

const SUBJECT_MAX = 150;

const ticketCode = (id) => `TK${String(id).padStart(3, '0')}`;
const productCode = (id) => `P${String(id).padStart(3, '0')}`;

const COLUMNS = `
  t.ticket_id, t.user_id, t.order_id, t.assigned_to, t.subject, t.category, t.body,
  t.admin_reply, t.status, t.created_at, t.closed_at`;

const ADMIN_FROM = `
  FROM support_ticket t
  JOIN "user" u       ON u.user_id  = t.user_id
  LEFT JOIN "user" au ON au.user_id = t.assigned_to`;

const ADMIN_COLUMNS = `${COLUMNS},
  u.username AS reporter_username, u.display_name AS reporter_name, u.email AS reporter_email,
  au.display_name AS assignee_name`;

/** เคสในมุมของลูกค้า — ไม่บอกว่าผู้ดูแลคนไหนรับเรื่อง */
function toTicket(row) {
  return {
    ticket_id: Number(row.ticket_id),
    code: ticketCode(row.ticket_id),
    subject: row.subject,
    category: row.category,
    body: row.body,
    status: row.status,
    admin_reply: row.admin_reply,
    order_id: row.order_id === null ? null : Number(row.order_id),
    created_at: row.created_at,
    closed_at: row.closed_at,
  };
}

/** เคสในมุมของผู้ดูแล — เพิ่มผู้แจ้งและผู้รับผิดชอบ */
function toAdminTicket(row) {
  return {
    ...toTicket(row),
    reporter: {
      user_id: Number(row.user_id),
      username: row.reporter_username,
      display_name: row.reporter_name,
      email: row.reporter_email,
    },
    assignee: row.assigned_to === null ? null : { user_id: Number(row.assigned_to), display_name: row.assignee_name },
  };
}

/** ตัวช่วยต่อเงื่อนไข WHERE แบบใส่พารามิเตอร์ ($1, $2, ...) */
function whereBuilder() {
  const where = [];
  const params = [];
  return {
    where,
    params,
    add(value) {
      params.push(value);
      return `$${params.length}`;
    },
    sql() {
      return where.length ? `WHERE ${where.join(' AND ')}` : '';
    },
  };
}

// =====================================================================
// ฝั่งลูกค้า
// =====================================================================

/**
 * เปิดเคสใหม่ — data: { subject, category, body, order_id?, product_id? }
 * order_id ต้องเป็นคำสั่งซื้อของตัวเอง ไม่งั้น 404 ORDER_NOT_FOUND
 * product_id (รายงานสินค้า) ต้องเป็นสินค้าที่วางขายอยู่ ไม่งั้น 404 PRODUCT_NOT_FOUND
 */
async function create(userId, data) {
  let subject = data.subject;

  if (data.order_id !== undefined) {
    const { rows } = await query('SELECT 1 FROM "order" WHERE order_id = $1 AND user_id = $2', [data.order_id, userId]);
    if (!rows[0]) throw AppError.notFound('ORDER_NOT_FOUND', 'ไม่พบคำสั่งซื้อนี้ในบัญชีของคุณ');
  }

  if (data.product_id !== undefined) {
    const { rows } = await query(`SELECT title FROM product WHERE product_id = $1 AND status = 'available'`, [
      data.product_id,
    ]);
    if (!rows[0]) throw AppError.notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้ หรือสินค้ายังไม่ได้วางขาย');
    // ระบบตั้งหัวข้อเอง ผู้ดูแลจะได้รู้ว่าเป็นสินค้าชิ้นไหน (ข้อความจากลูกค้าอยู่ใน body)
    subject = `[${productCode(data.product_id)}] ${rows[0].title}`.slice(0, SUBJECT_MAX);
  }

  const { rows } = await query(
    `INSERT INTO support_ticket (user_id, order_id, subject, category, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, data.order_id ?? null, subject, data.category, data.body ?? '']
  );
  return toTicket(rows[0]);
}

/** เคสของตัวเองแบบแบ่งหน้า (ล่าสุดขึ้นก่อน) — filters: { status, page, pageSize } */
async function listForUser(userId, { status, page, pageSize }) {
  const w = whereBuilder();
  w.where.push(`t.user_id = ${w.add(userId)}`);
  if (status !== 'all') w.where.push(`t.status = ${w.add(status)}`);

  const count = await query(`SELECT COUNT(*)::int AS total FROM support_ticket t ${w.sql()}`, w.params);
  const limit = w.add(pageSize);
  const offset = w.add((page - 1) * pageSize);
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM support_ticket t ${w.sql()}
      ORDER BY t.created_at DESC, t.ticket_id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    w.params
  );
  return { items: rows.map(toTicket), total: count.rows[0].total };
}

/** เคสของตัวเอง 1 เคส — ของคนอื่นได้ null (ตอบ 404 เหมือนไม่มีอยู่) */
async function getForUser(userId, ticketId) {
  const { rows } = await query(`SELECT ${COLUMNS} FROM support_ticket t WHERE t.ticket_id = $1 AND t.user_id = $2`, [
    ticketId,
    userId,
  ]);
  return rows[0] ? toTicket(rows[0]) : null;
}

// =====================================================================
// ฝั่งผู้ดูแล
// =====================================================================

/**
 * รายการเคสทั้งหมดแบบแบ่งหน้า (ล่าสุดขึ้นก่อน)
 * filters: { q, category, status, assigned: 'all' | 'me' | 'unassigned', page, pageSize }
 *   q = รหัสเคส (TK012) · เลข (รหัสเคสหรือเลขคำสั่งซื้อ) · คำในหัวข้อ / ชื่อผู้ใช้ / อีเมลของผู้แจ้ง
 * คืน counts = จำนวนเคสแต่ละสถานะ (ตามเงื่อนไขอื่นที่เลือก ยกเว้นสถานะ) ไว้ทำแท็บพร้อมตัวเลข
 */
async function list(actorId, { q, category, status, assigned, page, pageSize }) {
  const w = whereBuilder();

  if (q) {
    const code = /^tk0*(\d{1,15})$/i.exec(q);
    const num = /^#?(\d{1,15})$/.exec(q);
    if (code) {
      w.where.push(`t.ticket_id = ${w.add(Number(code[1]))}`);
    } else if (num) {
      const ph = w.add(Number(num[1]));
      w.where.push(`(t.ticket_id = ${ph} OR t.order_id = ${ph})`);
    } else {
      const ph = w.add(`%${q}%`);
      w.where.push(`(t.subject ILIKE ${ph} OR u.username ILIKE ${ph} OR u.display_name ILIKE ${ph} OR u.email ILIKE ${ph})`);
    }
  }
  if (category !== 'all') w.where.push(`t.category = ${w.add(category)}`);
  if (assigned === 'me') w.where.push(`t.assigned_to = ${w.add(actorId)}`);
  if (assigned === 'unassigned') w.where.push('t.assigned_to IS NULL');

  // นับแต่ละสถานะก่อนกรองสถานะ (ตัวเลขบนแท็บจะได้ไม่เป็น 0 ตอนเลือกแท็บอื่น)
  const counted = await query(
    `SELECT t.status, COUNT(*)::int AS n ${ADMIN_FROM} ${w.sql()} GROUP BY t.status`,
    w.params
  );
  const counts = { open: 0, pending: 0, closed: 0 };
  for (const row of counted.rows) counts[row.status] = row.n;

  if (status !== 'all') w.where.push(`t.status = ${w.add(status)}`);
  const total =
    status === 'all' ? counts.open + counts.pending + counts.closed : counts[status];

  const limit = w.add(pageSize);
  const offset = w.add((page - 1) * pageSize);
  const { rows } = await query(
    `SELECT ${ADMIN_COLUMNS} ${ADMIN_FROM} ${w.sql()}
      ORDER BY t.created_at DESC, t.ticket_id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    w.params
  );
  return { items: rows.map(toAdminTicket), total, counts };
}

/**
 * เคส 1 เคสพร้อมรายละเอียดสำหรับผู้ดูแล — ไม่พบได้ null
 * เพิ่ม order (ถ้าอ้างถึงคำสั่งซื้อ) เพื่อให้ตอบลูกค้าได้โดยไม่ต้องเปิดหลายหน้า
 * และ history = ประวัติการจัดการเคสจาก admin_action_log (เก่าสุดก่อน)
 */
async function getById(ticketId, db = { query }) {
  const { rows } = await db.query(`SELECT ${ADMIN_COLUMNS} ${ADMIN_FROM} WHERE t.ticket_id = $1`, [ticketId]);
  if (!rows[0]) return null;
  const ticket = toAdminTicket(rows[0]);

  ticket.order = null;
  if (ticket.order_id !== null) {
    const order = await db.query(
      `SELECT order_id, current_status, grand_total, placed_at, carrier, tracking_no
         FROM "order" WHERE order_id = $1`,
      [ticket.order_id]
    );
    if (order.rows[0]) {
      const o = order.rows[0];
      ticket.order = {
        order_id: Number(o.order_id),
        current_status: o.current_status,
        grand_total: Number(o.grand_total),
        placed_at: o.placed_at,
        carrier: o.carrier,
        tracking_no: o.tracking_no,
      };
    }
  }
  ticket.history = await historyOf('support_ticket', ticketId, db);
  return ticket;
}

/** ผู้ดูแลที่ยังใช้งานอยู่ (ไว้เลือกผู้รับผิดชอบเคส) */
async function listAssignees() {
  const { rows } = await query(
    `SELECT u.user_id, u.display_name, a.admin_role
       FROM admin a
       JOIN "user" u ON u.user_id = a.user_id
      WHERE u.is_active
      ORDER BY (a.admin_role = 'owner') DESC, u.display_name`
  );
  return rows.map((r) => ({ user_id: Number(r.user_id), display_name: r.display_name, admin_role: r.admin_role }));
}

const STATUS_LABELS = { open: 'รอดำเนินการ', pending: 'กำลังดำเนินการ', closed: 'ปิดเคสแล้ว' };

/**
 * ผู้ดูแลอัปเดตเคส — changes มีเฉพาะช่องที่จะแก้: { admin_reply, status, assigned_to }
 *   * ตอบกลับเคสที่ยัง "รอดำเนินการ" โดยไม่ได้เลือกสถานะ → เปลี่ยนเป็น "กำลังดำเนินการ" ให้เอง
 *   * เคสที่ยังไม่มีผู้รับผิดชอบ แล้วผู้ดูแลตอบหรือเปลี่ยนสถานะ → ผู้ดูแลคนนั้นเป็นผู้รับผิดชอบให้เอง
 *   * ปิดเคส → ลงเวลา closed_at · เปิดเคสกลับ → ล้าง closed_at
 * บันทึก admin_action_log แยกตามเรื่องที่เปลี่ยน: reply_ticket, update_ticket_status, assign_ticket
 * คืนเคสหลังแก้ (รูปเดียวกับ getById) หรือ null ถ้าไม่พบเคส
 */
async function update(actorId, ticketId, changes) {
  return withTransaction(async (client) => {
    // ล็อกแถวไว้ กันผู้ดูแลสองคนแก้เคสเดียวกันพร้อมกันแล้ว log ไม่ตรงกับที่เกิดจริง
    const { rows } = await client.query('SELECT * FROM support_ticket WHERE ticket_id = $1 FOR UPDATE', [ticketId]);
    const before = rows[0];
    if (!before) return null;

    const replyChanged = changes.admin_reply !== undefined && changes.admin_reply !== before.admin_reply;
    let nextStatus = changes.status ?? before.status;
    if (replyChanged && changes.admin_reply !== null && changes.status === undefined && before.status === 'open') {
      nextStatus = 'pending';
    }
    const statusChanged = nextStatus !== before.status;

    let nextAssignee = before.assigned_to === null ? null : Number(before.assigned_to);
    let assigneeName = null;
    if (changes.assigned_to !== undefined) {
      nextAssignee = changes.assigned_to;
    } else if (nextAssignee === null && (replyChanged || statusChanged)) {
      nextAssignee = actorId; // คนที่ลงมือทำเคสที่ยังไม่มีเจ้าของ = รับเคสไปเลย
    }
    if (nextAssignee !== null) {
      const admin = await client.query(
        `SELECT u.display_name FROM admin a JOIN "user" u ON u.user_id = a.user_id
          WHERE a.user_id = $1 AND u.is_active`,
        [nextAssignee]
      );
      if (!admin.rows[0]) {
        throw AppError.badRequest('VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', [
          { field: 'assigned_to', issue: 'ไม่พบผู้ดูแลคนนี้ หรือบัญชีถูกปิดแล้ว' },
        ]);
      }
      assigneeName = admin.rows[0].display_name;
    }
    const assigneeChanged = nextAssignee !== (before.assigned_to === null ? null : Number(before.assigned_to));

    if (!replyChanged && !statusChanged && !assigneeChanged) {
      return getById(ticketId, client); // ไม่มีอะไรเปลี่ยน → ไม่ต้องเขียนหรือบันทึก log
    }

    await client.query(
      `UPDATE support_ticket
          SET admin_reply = $1,
              status      = $2,
              assigned_to = $3,
              closed_at   = CASE WHEN $2 = 'closed' THEN COALESCE(closed_at, NOW()) ELSE NULL END
        WHERE ticket_id = $4`,
      [replyChanged ? changes.admin_reply : before.admin_reply, nextStatus, nextAssignee, ticketId]
    );

    const log = (actionType, note) =>
      logAdminAction(client, { adminId: actorId, actionType, targetType: 'support_ticket', targetId: ticketId, note });
    const code = ticketCode(ticketId);
    if (replyChanged) {
      await log('reply_ticket', changes.admin_reply === null ? `${code}: ลบคำตอบ` : `${code}: ตอบกลับลูกค้า`);
    }
    if (statusChanged) {
      await log('update_ticket_status', `${code}: ${STATUS_LABELS[before.status]} → ${STATUS_LABELS[nextStatus]}`);
    }
    if (assigneeChanged) {
      await log('assign_ticket', nextAssignee === null ? `${code}: ยกเลิกผู้รับผิดชอบ` : `${code}: มอบหมายให้ ${assigneeName}`);
    }

    return getById(ticketId, client);
  });
}

/** ลบเคส (เจ้าของร้านเท่านั้น ตรวจที่ route) — คืน true ถ้าลบได้ · log ยังเก็บหัวข้อของเคสไว้ */
async function remove(actorId, ticketId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('DELETE FROM support_ticket WHERE ticket_id = $1 RETURNING subject', [ticketId]);
    if (!rows[0]) return false;
    await logAdminAction(client, {
      adminId: actorId,
      actionType: 'delete_ticket',
      targetType: 'support_ticket',
      targetId: ticketId,
      note: `${ticketCode(ticketId)}: ${rows[0].subject}`.slice(0, 300),
    });
    return true;
  });
}

module.exports = {
  CATEGORIES,
  ORDER_CATEGORIES,
  PRODUCT_REPORT_CATEGORIES,
  STATUSES,
  SUBJECT_MAX,
  create,
  listForUser,
  getForUser,
  list,
  getById,
  listAssignees,
  update,
  remove,
};
