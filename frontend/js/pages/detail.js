// หน้ารายละเอียดสินค้า — ผู้รับผิดชอบ: R4 (ส่วนรีวิว: R1)
// ลำดับการทำงาน: แปลข้อความ → อ่าน id จาก URL → ถาม GET /api/products/:id → วาดหน้า (หรือแสดง error)
import { api, ApiError } from '../api.js';
import { escapeHtml } from '../utils.js';
import { t, has, applyI18n, onLangChange } from '../i18n.js';
import { heartButton, setupHeartButtons } from '../wishlist-button.js'; // ปุ่มหัวใจ wishlist (R1)
import { mountProductReviews } from '../product-reviews.js'; // ส่วนรีวิว + ลิงก์รายงานสินค้า (R1)

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

/* ---------- แกลเลอรีรูป ---------- */
// รูปของสินค้าที่กำลังโชว์ [{ url, alt }] และลำดับรูปที่เลือกอยู่ (0 = รูปแรก)
// เก็บไว้นอกฟังก์ชันวาด เพื่อให้สลับภาษาแล้วยังอยู่ที่รูปเดิม ไม่เด้งกลับรูปแรก
let gallery = [];
let current = 0;

// รวมรายการรูปจาก API ให้เหลือรูปแบบเดียว
// - ปกติใช้ images[] (เรียงตาม seq มาจาก API แล้ว)
// - ถ้า images[] ว่าง แต่มี cover_image_url → ใช้รูปปกรูปเดียว
// - ไม่มีอะไรเลย → [] (วาดกล่อง "ยังไม่มีรูป")
function collectImages(p) {
  const list = (p.images || [])
    .filter((img) => img.url)
    .map((img) => ({ url: img.url, alt: img.alt_text || p.title }));
  if (list.length === 0 && p.cover_image_url) list.push({ url: p.cover_image_url, alt: p.title });
  return list;
}

// HTML ของฝั่งรูป: รูปใหญ่ 1 รูป + แถวรูปย่อย (thumbnail) ถ้ามีมากกว่า 1 รูป
function galleryHtml() {
  if (gallery.length === 0) {
    // สินค้าบางชิ้นอาจยังไม่มีรูป → โชว์กล่องข้อความแทน รูปจะได้ไม่แตก
    return `<div class="detail-media"><span class="no-image">${t('detail.noImage')}</span></div>`;
  }
  const img = gallery[current];
  const main = `<div class="detail-media"><img id="detail-main-img" src="${escapeHtml(img.url)}" alt="${escapeHtml(img.alt)}"></div>`;
  if (gallery.length === 1) return main; // รูปเดียว ไม่ต้องมีแถวรูปย่อย

  // รูปย่อยเป็น <button> (ไม่ใช่ <img> เฉย ๆ) เพื่อให้กด Tab มาโฟกัส แล้วกด Enter/Space เลือกได้
  // data-index = ลำดับรูป ไว้บอกว่าปุ่มนี้คือรูปที่เท่าไร · aria-pressed บอกโปรแกรมอ่านหน้าจอว่ารูปไหนถูกเลือก
  const thumbs = gallery
    .map(
      (g, i) => `
        <button type="button" class="detail-thumb" data-index="${i}" aria-pressed="${i === current}"
                aria-label="${t('detail.imageN', { n: i + 1, total: gallery.length })}">
          <img src="${escapeHtml(g.url)}" alt="" loading="lazy">
        </button>`
    )
    .join('');
  return `${main}<div class="detail-thumbs">${thumbs}</div>`;
}

// เปลี่ยนรูปใหญ่เป็นรูปที่ index (ไม่วาดทั้งหน้าใหม่ แก้แค่ src/alt และสถานะปุ่ม)
function selectImage(index) {
  if (index === current || !gallery[index]) return;
  current = index;
  const main = document.getElementById('detail-main-img');
  main.src = gallery[index].url; // ใส่ผ่าน property ไม่ใช่ innerHTML จึงไม่ต้อง escape
  main.alt = gallery[index].alt;
  // เล่น animation "pop" (keyframes จาก home.css) ใหม่ทุกครั้งที่เปลี่ยนรูป:
  // ลบคลาส → อ่าน offsetWidth บังคับให้เบราว์เซอร์คำนวณหน้าใหม่ → ใส่คลาสกลับ
  main.classList.remove('img-swap');
  void main.offsetWidth;
  main.classList.add('img-swap');
  box.querySelectorAll('.detail-thumb').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.index) === index));
  });
}

// ฟังคลิกที่ box ครั้งเดียว (event delegation) แทนการผูกกับทุกปุ่ม
// เพราะ renderProduct เขียน innerHTML ใหม่ทุกครั้งที่สลับภาษา ปุ่มเก่าจะหายไป แต่ box ยังอยู่
box.addEventListener('click', (e) => {
  const btn = e.target.closest('.detail-thumb'); // คลิกโดนรูปข้างในปุ่มก็นับเป็นปุ่ม
  if (btn) selectImage(Number(btn.dataset.index));
});

/* ---------- วาดสินค้า ---------- */
function renderProduct(p) {
  // ทุกค่าจาก API ผ่าน escapeHtml() กันโค้ดแปลกปลอมในชื่อ/คำอธิบาย (XSS) เหมือนหน้า Search
  const title = escapeHtml(p.title);
  // series เป็น null ได้ (เช่นเหรียญ แสตมป์) มีค่อยต่อท้ายหมวด
  const series = p.series ? ` · ${escapeHtml(p.series.name)}` : '';
  const stock = p.in_stock
    ? `<dd class="stock-ok">${t('detail.inStock', { n: p.stock_quantity })}</dd>`
    : `<dd class="stock-out">${t('detail.outOfStock')}</dd>`;

  box.innerHTML = `
    <div class="detail-gallery card-enter" style="--i:0">${galleryHtml()}</div>
    <div class="detail-info card-enter" style="--i:1">
      <p class="kicker">${escapeHtml(p.category.name)}${series}</p>
      <div class="detail-title-row">
        <h1>${title}</h1>
        ${heartButton(p.product_id)}
      </div>
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
  // ปุ่มหัวใจถูกวาดใหม่ทุกครั้ง (รวมตอนสลับภาษา) จึงต้องเรียกทุกครั้ง ให้มันระบายหัวใจตามว่าอยู่ใน wishlist ไหม
  // (R1 เขียนไว้ว่าเรียกซ้ำได้ · ผูกคลิกกับ box แค่ครั้งแรก)
  setupHeartButtons(box);
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
    gallery = collectImages(data); // เตรียมรูปครั้งเดียวตอนโหลด (สลับภาษาไม่ต้องทำใหม่)
    current = 0;
    show(() => renderProduct(data));
    // ส่วนรีวิวของ R1 เรียกครั้งเดียวพอ (ไม่อยู่ใน renderProduct) เพราะมันดูแลการสลับภาษาของมันเอง
    // เรียกเฉพาะตอนโหลดสินค้าสำเร็จ ถ้า error จะไม่มีส่วนรีวิว
    mountProductReviews(document.getElementById('reviews'), data);
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
