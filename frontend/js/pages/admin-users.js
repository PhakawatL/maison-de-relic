// จัดการบัญชีผู้ดูแลระบบ (แอดมิน) — ผู้รับผิดชอบ: R2
import { auth } from '../api.js';

if (!auth.getToken()) window.location.replace('/login');

// TODO (R2): ตารางผู้ดูแล + ฟอร์มเพิ่ม/แก้ไข + ปิดบัญชี (is_active = false)
