// หน้าค้นหา — ผู้รับผิดชอบ: R4
// ลำดับการทำงาน: แปลข้อความ → โหลดหมวดหมู่ → อ่านเงื่อนไขจาก URL → ค้นหา → แสดงการ์ด + ปุ่มเปลี่ยนหน้า
import { api, ApiError } from '../api.js';
import { escapeHtml } from '../utils.js';
import { t, has, applyI18n, onLangChange } from '../i18n.js';

applyI18n(); // แปลข้อความที่มี data-i18n ในหน้า (คำแปลอยู่ที่ js/locales/th.js และ en.js)

const PAGE_SIZE = 12; // จำนวนสินค้าต่อหน้า (API รับได้ 1–50)

const form = document.getElementById('search-form');
const results = document.getElementById('results');
const countEl = document.getElementById('result-count');
const pager = document.getElementById('pager');
const filters = document.getElementById('filters'); // กล่องตัวกรอง <details>
const applyBtn = document.getElementById('apply-filters'); // ปุ่ม "แสดง N ชิ้น" ในกล่องตัวกรอง
const filterBadge = document.getElementById('filter-badge'); // ตัวเลขบนปุ่ม "ตัวกรอง"
const searchIcon = document.querySelector('.hero-search .search-icon');

const priceFormat = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  maximumFractionDigits: 0,
});

// เก็บผลค้นหาล่าสุดไว้ ตอนสลับภาษาจะวาดใหม่ได้โดยไม่ต้องเรียก API ซ้ำ
let last = { params: {}, items: [], meta: null };

// =========================================================
// ขั้นที่ 2: เติมตัวเลือกหมวดหมู่จาก API
// =========================================================
async function loadCategories() {
  const select = document.getElementById('category');
  try {
    const { data } = await api.get('/categories');
    for (const c of data) {
      const option = document.createElement('option');
      option.value = c.slug; // API สินค้ารับได้ทั้ง slug และ id · ใช้ slug เพราะอ่านใน URL รู้เรื่อง
      option.dataset.i18n = `cat.${c.slug}`; // ให้ระบบแปลเปลี่ยนชื่อหมวดตามภาษา
      option.textContent = has(`cat.${c.slug}`) ? t(`cat.${c.slug}`) : c.name;
      select.append(option); // ใส่ต่อท้ายใน <select> (ต่อจาก "ทั้งหมด")
    }
  } catch {
    // โหลดหมวดไม่ได้ ก็ยังค้นด้วยเงื่อนไขอื่นได้ ไม่ต้องหยุดทั้งหน้า
  }
}

// =========================================================
// ขั้นที่ 3: การ์ดสินค้า + แสดงผล
// ชื่อฟิลด์ตาม GET /api/products ของ R3: title, price, condition, in_stock, cover_image_url, category { slug, name }
// =========================================================
const conditionText = (c) => (has(`cond.${c}`) ? t(`cond.${c}`) : c);
const categoryText = (cat) => (cat && has(`cat.${cat.slug}`) ? t(`cat.${cat.slug}`) : cat?.name ?? '');

// i = ลำดับการ์ด ใช้หน่วงให้ค่อย ๆ โผล่ทีละใบ · animate = false ตอนวาดซ้ำเฉย ๆ (เช่นสลับภาษา) ไม่ต้องเล่นซ้ำ
function productCard(p, i, animate) {
  // ทุกข้อมูลจาก API ต้องผ่าน escapeHtml ก่อนใส่ใน innerHTML (กัน XSS)
  const cover = p.cover_image_url
    ? `<img src="${escapeHtml(p.cover_image_url)}" alt="" loading="lazy">`
    : '';
  const outOfStock = p.in_stock ? '' : `<span class="out-badge">${t('search.outOfStock')}</span>`;
  // card-enter = animation ลอยขึ้นจาก home.css · --i บอกว่าเป็นใบที่เท่าไหร่ ใบหลังโผล่ช้ากว่านิดหนึ่ง
  return `<a class="product-card${animate ? ' card-enter' : ''}" style="--i:${i}" href="/detail?id=${encodeURIComponent(p.product_id)}">
      <div class="product-media">
        ${cover}
        <span class="cond-badge">${escapeHtml(conditionText(p.condition))}</span>
        ${outOfStock}
      </div>
      <div class="product-body">
        <span class="product-tag">${escapeHtml(categoryText(p.category))}</span>
        <h3 class="product-title">${escapeHtml(p.title)}</h3>
        <div class="product-foot">
          <span class="product-price">${priceFormat.format(p.price)}</span>
        </div>
      </div>
    </a>`;
}

function render(animate = true) {
  const { items, meta } = last;
  if (!items.length) {
    results.innerHTML = `<p class="shelf-empty">${t('search.empty')}</p>`;
    countEl.textContent = '';
    pager.innerHTML = '';
    return;
  }
  results.innerHTML = items.map((p, i) => productCard(p, i, animate)).join('');
  countEl.textContent = t('search.count', { n: meta.total.toLocaleString('th-TH') });
  renderPager(meta);
}

// =========================================================
// ขั้นที่ 5: ปุ่มเปลี่ยนหน้า (ใช้ meta จาก API: page, pageSize, total)
// =========================================================
function renderPager(meta) {
  const pages = Math.ceil(meta.total / meta.pageSize); // เช่น 56 ชิ้น หน้าละ 12 → 4.67 ปัดขึ้นเป็น 5 หน้า
  if (pages <= 1) {
    pager.innerHTML = '';
    return;
  }
  pager.innerHTML = `
    <button class="btn btn-ghost btn-pill" type="button" data-page="${meta.page - 1}" ${meta.page <= 1 ? 'disabled' : ''}>${t('search.prev')}</button>
    <span>${t('search.page', { page: meta.page, pages })}</span>
    <button class="btn btn-ghost btn-pill" type="button" data-page="${meta.page + 1}" ${meta.page >= pages ? 'disabled' : ''}>${t('search.next')}</button>`;
}

// ฟังที่ตัว pager ทีเดียว (event delegation) เพราะปุ่มถูกสร้างใหม่ทุกครั้งที่วาด
pager.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-page]');
  if (!btn) return;
  search({ ...last.params, page: btn.dataset.page }); // เงื่อนไขเดิมทั้งหมด เปลี่ยนแค่เลขหน้า
  form.scrollIntoView({ behavior: 'smooth', block: 'start' }); // เลื่อนกลับขึ้นไปดูผลหน้าใหม่ตั้งแต่ใบแรก
});

// =========================================================
// ขั้นที่ 6: แสดง error ใต้ช่องที่กรอกผิด
// API ตอบ 400 VALIDATION_ERROR พร้อม details = [{ field: 'minPrice', issue: '...' }, ...]
// =========================================================
function clearErrors() {
  form.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
  form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
}

function showErrors(details) {
  for (const { field, issue } of details) {
    const box = form.querySelector(`[data-error-for="${field}"]`);
    if (box) box.textContent = issue;
    const input = form.elements[field];
    input?.classList.add('is-invalid'); // ?. = ถ้าไม่มีช่องชื่อนี้ในฟอร์ม (เช่น page) ก็ข้ามไป ไม่พัง
    // ช่องที่ผิดอยู่ในกล่องตัวกรองที่หุบอยู่ → กางให้เห็น ไม่งั้นผู้ใช้มองไม่เห็นข้อความ
    if (input && filters.contains(input)) filters.open = true;
  }
}

// =========================================================
// ขั้นที่ 4: เก็บเงื่อนไขไว้ใน URL เช่น /search?q=gundam&sort=price_asc
// กด F5 แล้วไม่หาย · กด back ได้ · ส่งลิงก์ให้เพื่อนได้ · ลิงก์จากหน้าแรกเลือกหมวดให้เลย
// =========================================================
function formToParams() {
  // FormData อ่านทุกช่องในฟอร์มที่มี name → { q: 'gundam', category: '', ... }
  const params = Object.fromEntries(new FormData(form));
  for (const key of Object.keys(params)) {
    if (params[key] === '') delete params[key]; // ตัดช่องว่างทิ้ง URL จะได้สั้น
  }
  return params;
}

function readUrl() {
  // ?q=gundam&category=art-toys → { q: 'gundam', category: 'art-toys' }
  return Object.fromEntries(new URLSearchParams(window.location.search));
}

function writeUrl(params) {
  const qs = new URLSearchParams(params).toString();
  // pushState = เปลี่ยน URL บนแถบด้านบนโดยไม่โหลดหน้าใหม่ และเพิ่มประวัติให้กด back ย้อนได้
  history.pushState(null, '', qs ? `?${qs}` : window.location.pathname);
}

function fillForm(params) {
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') {
      el.checked = params[el.name] === 'true';
    } else {
      el.value = params[el.name] ?? '';
      if (el.selectedIndex === -1) el.selectedIndex = 0; // select ที่ไม่มีค่านี้ (เช่น sort=recommended) → ตัวเลือกแรก
    }
  }
  updateFilterBadge();
}

// ป้ายตัวเลขบนปุ่ม "ตัวกรอง" = ตอนนี้ตั้งตัวกรองไว้กี่อย่าง (กล่องหุบอยู่ก็ยังรู้ว่ามีตัวกรองค้าง)
function updateFilterBadge() {
  const p = formToParams();
  const active = ['category', 'condition', 'minPrice', 'maxPrice', 'inStock'].filter((k) => p[k]).length
    + (p.sort && p.sort !== 'newest' ? 1 : 0); // เรียงแบบอื่นที่ไม่ใช่ค่าเริ่มต้นก็นับด้วย
  filterBadge.textContent = active;
  filterBadge.hidden = active === 0;
}

// =========================================================
// animation เล็ก ๆ: เล่นซ้ำได้ทุกครั้งที่เรียก
// ถอดคลาสออก → อ่าน offsetWidth (บังคับให้เบราว์เซอร์วาดใหม่ก่อน) → ใส่คลาสกลับ animation จะเริ่มใหม่
// =========================================================
function replay(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

// =========================================================
// ค้นหา: ทุกทางมาจบที่ฟังก์ชันนี้ (กดค้นหา, ใช้ตัวกรอง, แสดงทั้งหมด, เปลี่ยนหน้า, กด back, เปิดหน้า)
// =========================================================
// ติ๊ก "ค้นตามความหมาย" และมีคำค้นไหม (ไม่มีคำค้น = ไม่มีอะไรให้เทียบความหมาย → ค้นแบบเดิม)
const isSemantic = (params) => params.semantic === 'true' && Boolean(params.q);

// GET /api/search/semantic (R4) — ค้นตามความหมายแบบผสม แล้วตัวกรองกรองผลอีกชั้น
// ส่งเฉพาะตัวกรองที่ API นี้รับ (inStock / sort / page ไม่ใช้: แสดงเฉพาะของที่มี · เรียงตามความใกล้เสมอ · ไม่แบ่งหน้า)
// API ตอบแค่ { data } → ทำ meta ให้มีหน้าเดียว render() และปุ่มเปลี่ยนหน้าเดิมใช้ได้เลย (ปุ่มเปลี่ยนหน้าซ่อนเอง)
async function semanticSearch(params) {
  const { q, category, condition, minPrice, maxPrice } = params;
  const { data } = await api.get('/search/semantic', { q, category, condition, minPrice, maxPrice });
  return { data, meta: { page: 1, pageSize: Math.max(data.length, 1), total: data.length } };
}

let searchRequest = 0; // นับรอบการค้นหา กดค้นหาซ้ำเร็ว ๆ แล้วคำตอบเก่ามาช้า จะได้ไม่ทับผลใหม่

async function search(params, { pushUrl = true } = {}) {
  const myRequest = ++searchRequest;
  clearErrors();
  if (pushUrl) writeUrl(params);
  results.setAttribute('aria-busy', 'true'); // บอกโปรแกรมอ่านหน้าจอว่ากำลังโหลด + CSS ทำให้ผลเดิมจางลง
  countEl.textContent = t('search.loading');
  try {
    // ติ๊ก "ค้นตามความหมาย" + มีคำค้น → semantic search · ไม่งั้นค้นแบบเดิมของ R3 (ชื่อ + ตัวกรอง + แบ่งหน้า)
    // api.js ข้ามค่าที่ว่างให้เอง · pageSize ใส่เพิ่มทุกครั้ง
    const res = isSemantic(params)
      ? await semanticSearch(params)
      : await api.get('/products', { ...params, pageSize: PAGE_SIZE });
    if (myRequest !== searchRequest) return; // มีการค้นหาใหม่กว่าแล้ว ทิ้งผลนี้
    last = { params, items: res.data, meta: res.meta };
    render();
  } catch (err) {
    if (myRequest !== searchRequest) return;
    results.innerHTML = '';
    pager.innerHTML = '';
    if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
      showErrors(err.details ?? []);
      countEl.textContent = err.message; // "เงื่อนไขการค้นหาไม่ถูกต้อง"
    } else {
      countEl.textContent = '';
      results.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  } finally {
    // finally ทำเสมอ ไม่ว่าจะสำเร็จหรือ error (ยกเว้นตอน return เพราะมีการค้นหาใหม่กว่า ซึ่งรอบใหม่จะจัดการเอง)
    if (myRequest === searchRequest) results.removeAttribute('aria-busy');
  }
}

// =========================================================
// กล่องตัวกรอง (<details id="filters">)
// กดปุ่ม "ตัวกรอง" เปิด/ปิดได้เองอยู่แล้ว ส่วนนี้เพิ่มให้ปิดแบบ dropdown ทั่วไป
// =========================================================
// คลิกที่อื่นนอกกล่องตัวกรอง → ปิด
document.addEventListener('click', (event) => {
  if (filters.open && !filters.contains(event.target)) filters.open = false;
});

// กด Esc → ปิด แล้วย้ายเคอร์เซอร์กลับไปที่ปุ่ม "ตัวกรอง" (คนที่ใช้คีย์บอร์ดจะได้ไม่หลง)
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && filters.open) {
    filters.open = false;
    filters.querySelector('summary').focus();
  }
});

// =========================================================
// ปุ่ม "แสดง N ชิ้น" ในกล่องตัวกรอง (แบบ Airbnb)
// เปลี่ยนตัวกรองเมื่อไหร่ ถาม API ว่าจะได้กี่ชิ้น ผู้ใช้จะรู้ก่อนกดว่าเจอเท่าไหร่
// ขอแค่ pageSize: 1 เพราะใช้แค่ meta.total ไม่ต้องโหลดสินค้าทั้งหน้า
// =========================================================
let countRequest = 0; // นับรอบการถาม กันคำตอบเก่าที่มาช้ามาทับคำตอบใหม่

async function updateApplyCount() {
  const myRequest = ++countRequest;
  // โหมดความหมาย: ไม่นับล่วงหน้า เพราะแต่ละครั้งต้องให้โมเดลคิด (API จำกัด 30 ครั้ง/นาที)
  // เปลี่ยนตัวกรองถี่ ๆ จะเปลืองและชนลิมิต → ปุ่มขึ้นแค่ "ใช้ตัวกรอง"
  if (isSemantic(formToParams())) {
    applyBtn.textContent = t('search.applyFilters');
    return;
  }
  try {
    const res = await api.get('/products', { ...formToParams(), pageSize: 1 });
    if (myRequest !== countRequest) return; // ระหว่างรอ ผู้ใช้เปลี่ยนตัวกรองอีกแล้ว → ทิ้งคำตอบนี้
    const n = res.meta.total;
    const text = n ? t('search.showN', { n: n.toLocaleString('th-TH') }) : t('search.showNone');
    if (text !== applyBtn.textContent) replay(applyBtn, 'is-popping'); // ตัวเลขเปลี่ยน → ปุ่มเด้งเบา ๆ
    applyBtn.textContent = text;
  } catch {
    if (myRequest !== countRequest) return;
    applyBtn.textContent = t('search.applyFilters'); // กรอกผิด/เชื่อมต่อไม่ได้ → กลับเป็น "ใช้ตัวกรอง"
  }
}

// change = ค่าในช่องเปลี่ยนเสร็จแล้ว (select เลือกใหม่, ติ๊กเช็กบ็อกซ์, ช่องราคาพิมพ์เสร็จแล้วคลิกออกหรือกด Enter)
filters.addEventListener('change', () => {
  updateApplyCount();
  updateFilterBadge();
});
// เปิดกล่องเมื่อไหร่ นับให้เลย ปุ่มจะได้มีตัวเลขตั้งแต่แรก
filters.addEventListener('toggle', () => {
  if (filters.open) updateApplyCount();
});

// =========================================================
// ปุ่มและเหตุการณ์
// =========================================================
form.addEventListener('submit', (event) => {
  event.preventDefault(); // ไม่ให้เบราว์เซอร์โหลดหน้าใหม่ เราเรียก API เอง
  filters.open = false; // กดค้นหา/ใช้ตัวกรองแล้ว หุบกล่องตัวกรองให้เห็นผลลัพธ์
  replay(searchIcon, 'is-nudging'); // แว่นขยาย "ส่อง" ทีหนึ่ง
  updateFilterBadge();
  search(formToParams()); // ค้นใหม่เริ่มหน้า 1 เสมอ (ฟอร์มไม่มีช่อง page)
});

document.getElementById('show-all').addEventListener('click', () => {
  form.reset();
  updateFilterBadge();
  search({}); // ไม่มีเงื่อนไข = แสดงทั้งหมด (โจทย์บังคับ)
});

// กด back/forward ของเบราว์เซอร์ → อ่าน URL ใหม่แล้วค้นตามนั้น (ไม่ต้อง push URL ซ้ำ)
window.addEventListener('popstate', () => {
  const params = readUrl();
  fillForm(params);
  search(params, { pushUrl: false });
});

// สลับภาษา: วาดผลลัพธ์เดิมใหม่ด้วยภาษาใหม่
onLangChange(() => {
  if (last.meta) render(false); // ไม่ต้องเล่น animation ซ้ำ
  if (filters.open) updateApplyCount(); // ระบบแปลเพิ่งเปลี่ยนปุ่มกลับเป็น "ใช้ตัวกรอง" → นับใหม่เป็นภาษาใหม่
});

// =========================================================
// เริ่มทำงาน
// โหลดหมวดก่อน dropdown จะได้มีตัวเลือกให้เลือกตาม URL (เช่น ?category=art-toys จากหน้าแรก)
// =========================================================
await loadCategories();
const initial = readUrl();
fillForm(initial);
search(initial, { pushUrl: false });
