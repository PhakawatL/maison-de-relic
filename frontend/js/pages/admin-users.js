// จัดการบัญชีผู้ดูแลระบบ (แอดมิน) — ผู้รับผิดชอบ: R2
import { requireAdminPage } from '../admin-guard.js';

await requireAdminPage(); // ไม่ใช่แอดมิน → ส่งไปหน้า /login

// TODO (R2 · #14): ตารางผู้ดูแล + ฟอร์มเพิ่ม/แก้ไข + ปิดบัญชี (is_active = false)
