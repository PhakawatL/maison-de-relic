// จัดการสินค้า (แอดมิน) — ผู้รับผิดชอบ: R3
import { auth } from '../api.js';

// ยังไม่ล็อกอิน → ส่งไปหน้า login
if (!auth.getToken()) window.location.replace('/login');

// TODO (R3): ตารางสินค้า + ฟอร์มเพิ่ม/แก้ไข + ปุ่มลบ (เรียกผ่าน api.get/post/put/delete)
