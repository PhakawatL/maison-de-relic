// หน้าค้นหา — ผู้รับผิดชอบ: R4
import { api } from '../api.js';
import { escapeHtml } from '../utils.js';

const form = document.getElementById('search-form');
const results = document.getElementById('results');

function render(products) {
  if (!products.length) {
    results.innerHTML = '<p class="muted">ไม่พบสินค้าที่ตรงกับเงื่อนไข</p>';
    return;
  }
  // TODO (R4): ปรับชื่อฟิลด์ให้ตรงกับ API ของ R3
  results.innerHTML = products
    .map(
      (p) => `<a class="card" href="/detail?id=${encodeURIComponent(p.product_id)}">
        <strong>${escapeHtml(p.name)}</strong>
      </a>`
    )
    .join('');
}

async function search(params) {
  results.innerHTML = '<p class="muted">กำลังค้นหา...</p>';
  try {
    const res = await api.get('/products', params);
    render(res.data);
  } catch (err) {
    results.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  search(Object.fromEntries(new FormData(form)));
});

document.getElementById('show-all').addEventListener('click', () => {
  form.reset();
  search({});
});
