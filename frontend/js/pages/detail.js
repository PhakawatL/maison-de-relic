// หน้ารายละเอียดสินค้า — ผู้รับผิดชอบ: R4 (ส่วนรีวิว: R1)
import { api } from '../api.js';
import { escapeHtml } from '../utils.js';
import { heartButton, setupHeartButtons } from '../wishlist-button.js'; // ปุ่มหัวใจ (R1)

const box = document.getElementById('product-detail');
const id = new URLSearchParams(window.location.search).get('id');

if (!id) {
  box.innerHTML = '<div class="alert alert-error">ไม่ได้ระบุสินค้า</div>';
} else {
  try {
    const { data: product } = await api.get(`/products/${encodeURIComponent(id)}`);
    // TODO (R4): แสดงรายละเอียดให้ครบตาม Data Model (รูป ราคา สภาพ สถานะของแท้ สต็อก ฯลฯ)
    // ชื่อสินค้าคือ title ตามตาราง product และ GET /api/products/:id ของ R3
    // ปุ่มหัวใจ wishlist (R1) — ย้ายไปวางตรงไหนก็ได้ตอนทำหน้าเต็ม แค่ใส่ heartButton() แล้วเรียก setupHeartButtons()
    box.innerHTML = `<div style="display:flex;align-items:center;gap:12px">
        <h1>${escapeHtml(product.title)}</h1>${heartButton(product.product_id)}
      </div>`;
    setupHeartButtons(box);
  } catch (err) {
    box.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}
