// หน้ารายละเอียดสินค้า — ผู้รับผิดชอบ: R4 (ส่วนรีวิว: R1)
// ลำดับการทำงาน: แปลข้อความ → อ่าน id จาก URL → ถาม GET /api/products/:id → วาดหน้า (หรือแสดง error)
import { api, ApiError } from '../api.js';
import { escapeHtml } from '../utils.js';
import { t, has, applyI18n, onLangChange } from '../i18n.js';

applyI18n(); // แปลข้อความที่มี data-i18n ในหน้า (คำแปลอยู่ที่ js/locales/th.js และ en.js)

const box = document.getElementById('product-detail');
// /detail?id=5 → '5' · ไม่มี ?id= → null
const id = new URLSearchParams(window.location.search).get('id');
const priceFormat = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 });

// จำว่าตอนนี้หน้ากำลังโชว์อะไรอยู่ (สินค้า หรือ error) เป็นฟังก์ชัน
// สลับภาษาเมื่อไหร่ แค่เรียกฟังก์ชันนี้ซ้ำ ข้อความจะเปลี่ยนเป็นภาษาใหม่ โดยไม่ต้องถาม API อีก
let view = null;
function show(fn) {
  view = fn;
  fn();
}

// 'excellent' → 'สภาพดีมาก' (คีย์ cond.* มีอยู่แล้วในไฟล์คำแปล ใช้ร่วมกับหน้าแรก)
const conditionText = (c) => (has(`cond.${c}`) ? t(`cond.${c}`) : c);

/* ---------- วาดสินค้า ---------- */
function renderProduct(p) {
  // ทุกค่าจาก API ผ่าน escapeHtml() กันโค้ดแปลกปลอมในชื่อ/คำอธิบาย (XSS) เหมือนหน้า Search
  const title = escapeHtml(p.title);
  // สินค้าบางชิ้นอาจยังไม่มีรูป → โชว์กล่องข้อความแทน รูปจะได้ไม่แตก
  const media = p.cover_image_url
    ? `<img src="${escapeHtml(p.cover_image_url)}" alt="${title}">`
    : `<span class="no-image">${t('detail.noImage')}</span>`;
  // series เป็น null ได้ (เช่นเหรียญ แสตมป์) มีค่อยต่อท้ายหมวด
  const series = p.series ? ` · ${escapeHtml(p.series.name)}` : '';
  const stock = p.in_stock
    ? `<dd class="stock-ok">${t('detail.inStock', { n: p.stock_quantity })}</dd>`
    : `<dd class="stock-out">${t('detail.outOfStock')}</dd>`;

  box.innerHTML = `
    <div class="detail-media card-enter" style="--i:0">${media}</div>
    <div class="detail-info card-enter" style="--i:1">
      <p class="kicker">${escapeHtml(p.category.name)}${series}</p>
      <h1>${title}</h1>
      <p class="detail-price">${priceFormat.format(p.price)}</p>
      <dl class="detail-facts">
        <div>
          <dt>${t('detail.condition')}</dt>
          <dd>${conditionText(p.condition)} <small>${t('detail.score', { n: p.condition_score })}</small></dd>
        </div>
        <div>
          <dt>${t('detail.stock')}</dt>
          ${stock}
        </div>
      </dl>
      <section class="detail-desc">
        <h2>${t('detail.description')}</h2>
        <p>${p.description ? escapeHtml(p.description) : t('detail.noDescription')}</p>
      </section>
    </div>`;
  // ชื่อแท็บเบราว์เซอร์เป็นชื่อสินค้า (ตอนแชร์ลิงก์หรือเปิดหลายแท็บจะได้รู้ว่าแท็บไหนของอะไร)
  document.title = `${p.title} · Maison de Relic`;
}

/* ---------- วาด error ---------- */
// message = ข้อความที่จะโชว์ · มีปุ่มพากลับไปหน้าค้นหาเสมอ ผู้ใช้จะได้ไม่ติดอยู่หน้าว่าง
function renderError(message) {
  box.innerHTML = `
    <div class="detail-error">
      <p class="alert alert-error">${escapeHtml(message)}</p>
      <a class="btn-dark" href="/search">${t('detail.backToSearch')}</a>
    </div>`;
}

/* ---------- โหลดข้อมูล ---------- */
async function load() {
  // ไม่มี ?id= ใน URL → ไม่ต้องถาม API เลย
  if (!id) {
    show(() => renderError(t('detail.noId')));
    box.removeAttribute('aria-busy');
    return;
  }
  try {
    // encodeURIComponent กันกรณี id มีอักขระแปลก ๆ (เช่น /) ทำให้ path ผิด
    const { data } = await api.get(`/products/${encodeURIComponent(id)}`);
    show(() => renderProduct(data));
  } catch (err) {
    // INVALID_ID = id ไม่ใช่ตัวเลข · PRODUCT_NOT_FOUND = ไม่มีสินค้านี้ หรือซ่อน/ยังเป็น draft
    // ทั้งสองแบบผู้ใช้ไม่ต้องรู้ความต่าง บอกแค่ว่า "ไม่พบสินค้านี้"
    if (err instanceof ApiError && ['INVALID_ID', 'PRODUCT_NOT_FOUND'].includes(err.code)) {
      show(() => renderError(t('detail.notFound')));
    } else {
      // error อื่น เช่น API ล่ม เน็ตหลุด → โชว์ข้อความจาก api.js ตรง ๆ
      show(() => renderError(err.message));
    }
  } finally {
    box.removeAttribute('aria-busy'); // โหลดเสร็จ (ไม่ว่าสำเร็จหรือไม่)
  }
}

// สลับภาษา TH/EN → วาดสิ่งที่โชว์อยู่ใหม่
onLangChange(() => view && view());

load();
