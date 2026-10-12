// หน้าแรก — ผู้รับผิดชอบ: R4
import { api } from '../api.js';

// ตัวเช็กการเชื่อมต่อ API (ลบได้เมื่อหน้าแรกเสร็จ)
const status = document.getElementById('api-status');
if (status) {
  try {
    const res = await api.get('/health');
    status.textContent = `API เชื่อมต่อแล้ว · ฐานข้อมูล: ${res.db}`;
  } catch (err) {
    status.textContent = `API ยังเชื่อมต่อไม่ได้: ${err.message}`;
  }
}

// TODO (R4): สินค้าแนะนำ / สินค้ามาใหม่
