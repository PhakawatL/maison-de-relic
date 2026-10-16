// จัดการสินค้า (แอดมิน) — ผู้รับผิดชอบ: R3
import { requireAdminPage } from '../auth-guard.js';

// ไม่ใช่แอดมิน (ยังไม่ล็อกอิน / ลูกค้า / token หมดอายุ) → ส่งไปหน้า /login แล้วกลับมาหน้านี้หลังล็อกอิน
// ถ้าต้องใช้ข้อมูลแอดมิน: const me = await requireAdminPage();  → me.user_id, me.admin_role ('owner' | 'staff')
await requireAdminPage();

// TODO (R3): ตารางสินค้า + ฟอร์มเพิ่ม/แก้ไข + ปุ่มลบ (เรียกผ่าน api.get/post/put/delete จาก '../api.js')
