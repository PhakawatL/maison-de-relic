// ===================== ตัวอย่างข้อมูลสำหรับทดสอบเว็บเซอร์วิสด้วย Postman =====================
// ใช้กับฐานข้อมูลตัวอย่าง (หลังสั่ง npm run db:reset) · ชุดเดียวกับ docs/testing/postman/maison-de-relic.postman_collection.json
// route ที่ต้องล็อกอิน: แท็บ Headers ใส่  Authorization: Bearer <token>  (token ได้จาก POST /api/auth/login)
//
// Testing Search ผู้ดูแลแบบไม่มีเกณฑ์ (Select All)
// method: get
// URL: http://localhost:3000/api/admins
// header: Authorization: Bearer <token ของ ผู้ดูแล>
// ผลที่ควรได้: 200 OK
//
// Testing Search ผู้ดูแลด้วยคำค้น + สถานะ
// method: get
// URL: http://localhost:3000/api/admins?q=staff&status=active
// header: Authorization: Bearer <token ของ ผู้ดูแล>
// ผลที่ควรได้: 200 OK
//
// Testing Insert ผู้ดูแล (ตัวอย่างที่ 1: ทีมงาน)
// method: post
// URL: http://localhost:3000/api/admins
// header: Authorization: Bearer <token ของ เจ้าของร้าน (Neptz)>
// body: raw JSON
// {
//     "username": "postman_staff1",
//     "email": "postman.staff1@example.com",
//     "password": "Postman@1234",
//     "first_name": "สมชาย",
//     "last_name": "ใจดี",
//     "phone": "081-234-5678",
//     "admin_role": "staff"
// }
// ผลที่ควรได้: 201 Created · จด data.user_id ไว้ (หลัง db:reset จะได้ 10) · username ซ้ำ → 409
//
// Testing Insert ผู้ดูแล (ตัวอย่างที่ 2: เจ้าของร้าน)
// method: post
// URL: http://localhost:3000/api/admins
// header: Authorization: Bearer <token ของ เจ้าของร้าน (Neptz)>
// body: raw JSON
// {
//     "username": "postman_owner2",
//     "email": "postman.owner2@example.com",
//     "password": "Postman@1234",
//     "first_name": "สมหญิง",
//     "last_name": "รักดี",
//     "admin_role": "owner"
// }
// ผลที่ควรได้: 201 Created (หลัง db:reset จะได้ 11) · ใช้ token ของ staff → 403
//
// Testing View ผู้ดูแล 1 คน
// method: get
// URL: http://localhost:3000/api/admins/10
// header: Authorization: Bearer <token ของ ผู้ดูแล>
// ผลที่ควรได้: 200 OK
//
// Testing Update ผู้ดูแล (ตัวอย่างที่ 1: แก้ชื่อและเบอร์)
// method: patch
// URL: http://localhost:3000/api/admins/10
// header: Authorization: Bearer <token ของ เจ้าของร้าน (Neptz)>
// body: raw JSON
// {
//     "first_name": "สมชาย (แก้ไข)",
//     "phone": "089-999-0000"
// }
// ผลที่ควรได้: 200 OK
//
// Testing Update ผู้ดูแล (ตัวอย่างที่ 2: ลดระดับเป็นทีมงาน)
// method: patch
// URL: http://localhost:3000/api/admins/11
// header: Authorization: Bearer <token ของ เจ้าของร้าน (Neptz)>
// body: raw JSON
// {
//     "admin_role": "staff"
// }
// ผลที่ควรได้: 200 OK
//
// Testing Delete (ปิดบัญชี) ผู้ดูแล (ตัวอย่างที่ 1)
// method: delete
// URL: http://localhost:3000/api/admins/10
// header: Authorization: Bearer <token ของ เจ้าของร้าน (Neptz)>
// ผลที่ควรได้: 204 No Content · ล็อกอินด้วยบัญชีนี้ไม่ได้อีก
//
// Testing Delete (ปิดบัญชี) ผู้ดูแล (ตัวอย่างที่ 2)
// method: delete
// URL: http://localhost:3000/api/admins/11
// header: Authorization: Bearer <token ของ เจ้าของร้าน (Neptz)>
// ผลที่ควรได้: 204 No Content
// ====================================================================================

// routes จัดการบัญชีผู้ดูแลระบบ (R2 · S13 · หน้า admin/users)
// แอดมินทุกคนดูรายชื่อได้ แต่เพิ่ม / แก้ / ปิดบัญชีได้เฉพาะเจ้าของร้าน (owner)
// "ลบ" = ปิดบัญชี (is_active = false) ไม่ลบแถวจริง เพราะสินค้า ออเดอร์ และ log ยังอ้างถึงบัญชีอยู่
const { Router } = require('express');
const controller = require('./admins.controller');
const { requireAdmin, requireRole } = require('../../middleware/auth');

const router = Router();
const ownerOnly = requireRole('owner');

router.use(requireAdmin);

router.get('/', controller.list);                       // GET    /api/admins?q=&status=&page=&pageSize=
router.get('/:id', controller.getById);                 // GET    /api/admins/:id
router.post('/', ownerOnly, controller.create);         // POST   /api/admins
router.patch('/:id', ownerOnly, controller.update);     // PATCH  /api/admins/:id  (แก้บางช่อง / เปิดบัญชีคืน)
router.delete('/:id', ownerOnly, controller.deactivate); // DELETE /api/admins/:id  (ปิดบัญชี)

module.exports = router;
