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

module.exports = { logAdminAction };
