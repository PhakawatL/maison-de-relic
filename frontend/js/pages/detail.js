// หน้ารายละเอียดสินค้า — ผู้รับผิดชอบ: R4 (ส่วนรีวิว: R1)
import { api } from '../api.js';
import { escapeHtml } from '../utils.js';

const box = document.getElementById('product-detail');
const id = new URLSearchParams(window.location.search).get('id');

if (!id) {
  box.innerHTML = '<div class="alert alert-error">ไม่ได้ระบุสินค้า</div>';
} else {
  try {
    const { data: product } = await api.get(`/products/${encodeURIComponent(id)}`);
    // TODO (R4): แสดงรายละเอียดให้ครบตาม Data Model (รูป ราคา สภาพ สถานะของแท้ สต็อก ฯลฯ)
    // ชื่อสินค้าคือ title ตามตาราง product และ GET /api/products/:id ของ R3
    box.innerHTML = `<h1>${escapeHtml(product.title)}</h1>`;
  } catch (err) {
    box.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}
