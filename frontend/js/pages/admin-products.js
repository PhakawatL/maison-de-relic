// จัดการสินค้า (แอดมิน) — ผู้รับผิดชอบ: R3 · wireframe 05–08
// มุมมองสลับด้วย # ใน URL:   (ว่าง) = รายการ · #new = เพิ่ม · #edit/<id> = แก้ไข
// ข้อความทุกตัวอยู่ใน js/locales/th.js และ en.js (หมวด admin.*, ap.*, status.*, cond.*, cat.*)
//
// API ที่ใช้ (ต้องล็อกอินเป็นแอดมิน):
//   GET    /admin/products, /admin/products/:id  ← เห็นทุกสถานะ (available / hidden / draft)
//   POST   /products, PUT /products/:id, DELETE /products/:id (เคยขายแล้ว → ซ่อนแทนการลบ)
//   GET    /categories, /series
//   POST   /products/:id/images (ส่งไฟล์เป็น body) · DELETE /products/:id/images/:seq · PUT .../:seq/cover
//          รูปเก็บใน Supabase Storage — เครื่องที่ยังไม่ใส่ key ใน .env บันทึกสินค้าได้ แต่อัปโหลดรูปไม่ได้
//   POST   /products/:id/stock, GET /products/:id/stock-movements ← กล่อง "สต็อก" ตอนแก้ไข
import { api, ApiError } from '../api.js';
import { escapeHtml, formatBaht } from '../utils.js';
import { t, has, applyI18n, onLangChange, getLang } from '../i18n.js';
import { requireAdminPage } from '../auth-guard.js';

// ไม่ใช่แอดมิน (ยังไม่ล็อกอิน / ลูกค้า / token หมดอายุ) → ส่งไปหน้า /login แล้วกลับมาหน้านี้หลังล็อกอิน (R2)
await requireAdminPage();

const LIST_PATH = '/admin/products';
const PAGE_SIZE = 10;

const STATUSES = ['available', 'hidden', 'draft'];
const CONDITIONS = ['new', 'like_new', 'excellent', 'good', 'fair', 'poor'];
// ค่าที่เก็บลงฐานข้อมูลเป็นรหัสภาษาอังกฤษ (ไม่ขึ้นกับภาษาที่เลือก) ข้อความที่แสดงมาจาก i18n
const BOX_OPTIONS = [
  ['with_cert', 'ap.box.withCert'],
  ['yes', 'ap.box.yes'],
  ['no', 'ap.box.no'],
];
const GRADERS = [
  ['none', 'ap.grader.none'],
  ['PSA', null],
  ['BGS', null],
  ['CGC', null],
  ['other', 'ap.grader.other'],
];
// ช่องที่เก็บใน product.attributes (JSON) แทนคอลัมน์จริงในตาราง
const ATTRIBUTE_FIELDS = ['year', 'size', 'material', 'original_box', 'grading_company', 'grade'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const $ = (id) => document.getElementById(id);
const els = {
  message: $('page-message'),
  listView: $('list-view'),
  formView: $('form-view'),
  searchForm: $('search-form'),
  rows: $('product-rows'),
  pager: $('pager'),
  form: $('product-form'),
  formTitle: $('form-title'),
  saveBtn: $('save-btn'),
  dropzone: $('dropzone'),
  fileInput: $('f-image'),
  preview: $('image-preview'),
  gallery: $('image-gallery'),
  galleryList: $('gallery-list'),
  dropzoneText: $('dropzone-text'),
  dialog: $('delete-dialog'),
  deleteName: $('delete-name'),
  deleteConfirm: $('delete-confirm'),
  stockHint: $('f-stock-hint'),
  stockCard: $('stock-card'),
  stockNow: $('stock-now'),
  stockForm: $('stock-form'),
  stockQty: $('stock-qty'),
  stockQtyLabel: $('stock-qty-label'),
  stockNote: $('stock-note'),
  stockNoteReq: $('stock-note-req'),
  stockPreview: $('stock-preview'),
  stockSave: $('stock-save'),
  stockRows: $('stock-rows'),
  stockEmpty: $('stock-empty'),
  stockMore: $('stock-more'),
  toast: $('toast'),
};

const state = {
  page: 1,
  q: '',
  category: '',
  editingId: null,
  imageFile: null,
  images: [], // รูปที่มีอยู่แล้วของสินค้าที่กำลังแก้ [{ seq, url, alt_text, is_cover }]
  confirmDeleteSeq: null,
  deleting: null,
  categories: [],
  series: [],
  // เก็บผลล่าสุดไว้ วาดใหม่ได้ทันทีตอนสลับภาษาโดยไม่ต้องโหลดซ้ำ
  lastRows: null,
  lastMeta: null,
  lastListError: null,
  message: null, // { key, vars, type } หรือ { text, type }
  fieldErrors: {}, // { name: { key } | { text } }
  // กล่องสต็อก (ตอนแก้ไข): current = ยอดคงเหลือล่าสุดจาก API · movements = ประวัติที่โหลดแล้ว
  stock: { current: 0, movements: [], page: 1, total: 0 },
};

// ---------- ทั่วไป ----------
function productCode(id) {
  return `P${String(id).padStart(3, '0')}`;
}

function categoryLabel(cat) {
  if (!cat) return '';
  return has(`cat.${cat.slug}`) ? t(`cat.${cat.slug}`) : cat.name;
}

/** เล่น animation ซ้ำ: ถอด class ออก บังคับให้เบราว์เซอร์วาดใหม่ แล้วใส่กลับ */
function replay(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

/** แปลง error เป็นข้อความ (เก็บเป็นคีย์ไว้ ถ้าเป็นข้อความของเราเอง จะได้แปลตามภาษาตอนสลับ) */
function errorMessage(err) {
  if (err instanceof ApiError && err.code === 'ROUTE_NOT_FOUND') return { key: 'ap.err.notReady' };
  if (err?.message) return { text: err.message }; // ข้อความจาก backend (ภาษาไทย)
  return { key: 'ap.err.generic' };
}
const resolve = (m) => (m.key ? t(m.key, m.vars) : m.text);

function renderMessage() {
  const m = state.message;
  if (!m) {
    els.message.hidden = true;
    return;
  }
  els.message.textContent = resolve(m);
  els.message.className = `alert alert-${m.type}`;
  els.message.hidden = false;
}
function showMessage(m, type = 'error') {
  state.message = { ...m, type };
  renderMessage();
  replay(els.message, 'is-shown');
  els.message.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
/* ---------- ป๊อปอัป (toast) ---------- */
// ใช้กับปุ่มที่ทำทันทีกลางหน้า (กล่องสต็อก, ตั้งปก / ลบรูป) — แสดงผลตรงที่มองอยู่ ไม่เลื่อนหน้ากลับขึ้นบน
let toastTimer = null;
let lastToast = null;
function renderToast() {
  if (!lastToast) return;
  els.toast.textContent = resolve(lastToast);
  els.toast.className = `toast toast-${lastToast.type}`;
}
function showToast(m, type = 'success') {
  lastToast = { ...m, type };
  renderToast();
  els.toast.hidden = false;
  replay(els.toast, 'is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
    lastToast = null;
  }, type === 'error' ? 6000 : 3200);
}
els.toast.addEventListener('click', () => {
  els.toast.hidden = true;
  lastToast = null;
});

function clearMessage() {
  state.message = null;
  renderMessage();
}

/** เติม option ใน select โดยคงค่าที่เลือกไว้ (ใช้ตอนสลับภาษาด้วย) */
function fillSelect(select, options) {
  const current = select.value;
  const placeholder = select.querySelector('option[value=""]');
  select.innerHTML = '';
  if (placeholder) select.append(placeholder);
  for (const [value, label] of options) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    select.append(opt);
  }
  select.value = current;
}

// ---------- ตัวเลือกใน dropdown ----------
function renderSelects() {
  fillSelect($('f-status'), STATUSES.map((s) => [s, t(`status.${s}`)]));
  fillSelect($('f-condition'), CONDITIONS.map((c) => [c, t(`cond.${c}`)]));
  fillSelect($('f-box'), BOX_OPTIONS.map(([v, key]) => [v, t(key)]));
  fillSelect($('f-grader'), GRADERS.map(([v, key]) => [v, key ? t(key) : v]));
  const cats = state.categories.map((c) => [c.category_id, categoryLabel(c)]);
  fillSelect(els.searchForm.elements.category, cats);
  fillSelect($('f-category'), cats);
  fillSelect($('f-series'), state.series.map((s) => [s.series_id, s.name]));
}

async function loadLookups() {
  const [categories, series] = await Promise.allSettled([api.get('/categories'), api.get('/series')]);
  if (categories.status === 'fulfilled') state.categories = categories.value.data;
  if (series.status === 'fulfilled') state.series = series.value.data;
  renderSelects();
  if (categories.status === 'rejected' || series.status === 'rejected') {
    showMessage({ key: 'ap.lookupFailed' });
  }
}

// ---------- 05 รายการสินค้า ----------
const svg = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON_EDIT = svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>');
const ICON_DELETE = svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>');
const ICON_BOX = svg('<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5M12 13v8"/>');
const ICON_SEARCH = svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>');

function thumb(p) {
  if (p.cover_image_url) {
    return `<span class="thumb"><img src="${escapeHtml(p.cover_image_url)}" alt="" loading="lazy"></span>`;
  }
  const initial = escapeHtml([...(p.title || '?').trim()][0] || '?');
  return `<span class="thumb" aria-hidden="true">${initial}</span>`;
}

function renderRows() {
  if (state.lastListError) {
    els.rows.innerHTML = `<tr class="empty-state"><td colspan="6">${escapeHtml(resolve(state.lastListError))}</td></tr>`;
    return;
  }
  const products = state.lastRows || [];
  if (!products.length) {
    const filtered = Boolean(state.q || state.category);
    els.rows.innerHTML = `<tr class="empty-state"><td colspan="6">
        <span class="empty-icon">${filtered ? ICON_SEARCH : ICON_BOX}</span>
        <div>${escapeHtml(t(filtered ? 'ap.emptyFilter' : 'ap.emptyAll'))}</div>
        ${filtered ? `<button type="button" class="btn btn-ghost btn-pill" id="clear-filter">${escapeHtml(t('ap.clearFilter'))}</button>` : ''}
      </td></tr>`;
    return;
  }
  els.rows.innerHTML = products
    .map((p, i) => {
      const name = escapeHtml(p.title);
      const meta = [categoryLabel(p.category), p.series?.name].filter(Boolean).map(escapeHtml).join(' · ');
      const stock =
        p.stock_quantity > 0
          ? p.stock_quantity
          : `<span class="stock-out">0 · ${escapeHtml(t('ap.outOfStock'))}</span>`;
      const statusText = escapeHtml(has(`status.${p.status}`) ? t(`status.${p.status}`) : p.status);
      const statusPill = `<span class="status status-${escapeHtml(p.status)}">${statusText}</span>`;
      return `<tr class="row-enter" style="--i:${i}">
        <td class="code col-code">${productCode(p.product_id)}</td>
        <td class="col-name">
          <div class="product-cell">
            ${thumb(p)}
            <div>
              <div class="product-name">${name}</div>
              <span class="product-meta"><span class="cat-dot" data-cat="${escapeHtml(p.category?.slug || '')}"></span>${meta}</span>
            </div>
          </div>
        </td>
        <td class="num price col-price">${formatBaht(p.price)}</td>
        <td class="num col-stock">${stock}</td>
        <td class="col-status">${statusPill}</td>
        <td class="col-meta"><span class="code">${productCode(p.product_id)}</span><span>${escapeHtml(t('ap.col.stock'))} ${stock}</span>${statusPill}</td>
        <td class="actions col-actions">
          <a class="row-btn" href="#edit/${p.product_id}" title="${escapeHtml(t('ap.edit'))}" aria-label="${escapeHtml(t('ap.editItem', { name: p.title }))}">${ICON_EDIT}</a>
          <button type="button" class="row-btn danger" data-delete="${p.product_id}" data-title="${name}" title="${escapeHtml(t('ap.delete'))}" aria-label="${escapeHtml(t('ap.deleteItem', { name: p.title }))}">${ICON_DELETE}</button>
        </td>
      </tr>`;
    })
    .join('');
}

/** หน้าที่จะแสดงปุ่ม: หน้าแรก หน้าสุดท้าย และรอบ ๆ หน้าปัจจุบัน (ที่เหลือเป็น …) */
function pageList(page, pages) {
  const set = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((n, i) => {
    if (i && n - sorted[i - 1] > 1) out.push('…');
    out.push(n);
  });
  return out;
}

function renderPager() {
  const meta = state.lastMeta;
  if (!meta || state.lastListError) {
    els.pager.innerHTML = '';
    return;
  }
  const { page, pageSize, total } = meta;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  els.pager.setAttribute('aria-label', t('ap.pagerLabel'));
  const nav =
    pages > 1
      ? `<button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="${escapeHtml(t('ap.prev'))}">‹</button>
         ${pageList(page, pages)
           .map((n) =>
             n === '…'
               ? '<span class="pager-gap" aria-hidden="true">…</span>'
               : `<button type="button" data-page="${n}"${n === page ? ' aria-current="page"' : ''}>${n}</button>`
           )
           .join('')}
         <button type="button" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="${escapeHtml(t('ap.next'))}">›</button>`
      : '';
  els.pager.innerHTML = `<span class="pager-total">${escapeHtml(t('ap.total', { n: total }))}</span>${nav}`;
}

const SKELETON_ROW = `<tr class="skeleton" aria-hidden="true">${[40, 70, 50, 30, 45, 35]
  .map((w) => `<td><span style="width:${w}%"></span></td>`)
  .join('')}</tr>`;

async function loadList() {
  els.rows.innerHTML = SKELETON_ROW.repeat(3);
  els.rows.setAttribute('aria-busy', 'true');
  state.lastListError = null;
  try {
    // ค้นหาด้วยรหัส เช่น "P012" → เปิดดูชิ้นนั้นตรง ๆ
    const code = /^p0*(\d+)$/i.exec(state.q);
    if (code) {
      try {
        const { data } = await api.get(`${LIST_PATH}/${Number(code[1])}`);
        state.lastRows = [data];
        state.lastMeta = { page: 1, pageSize: PAGE_SIZE, total: 1 };
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
        state.lastRows = [];
        state.lastMeta = { page: 1, pageSize: PAGE_SIZE, total: 0 };
      }
    } else {
      const res = await api.get(LIST_PATH, {
        q: state.q,
        category: state.category,
        page: state.page,
        pageSize: PAGE_SIZE,
      });
      state.lastRows = res.data;
      state.lastMeta = res.meta;
    }
  } catch (err) {
    state.lastListError = errorMessage(err);
  } finally {
    els.rows.removeAttribute('aria-busy');
  }
  renderRows();
  renderPager();
}

els.searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(els.searchForm);
  state.q = String(data.get('q') || '').trim();
  state.category = String(data.get('category') || '');
  state.page = 1;
  loadList();
});
els.searchForm.elements.category.addEventListener('change', () => els.searchForm.requestSubmit());
// ลบคำค้นจนว่าง (หรือกด × ในช่องค้นหา) → แสดงทั้งหมดอีกครั้ง
els.searchForm.elements.q.addEventListener('search', () => els.searchForm.requestSubmit());

els.pager.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-page]');
  if (!btn || btn.disabled) return;
  state.page = Number(btn.dataset.page);
  loadList();
  els.listView.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

els.rows.addEventListener('click', (event) => {
  if (event.target.closest('#clear-filter')) {
    els.searchForm.reset();
    els.searchForm.requestSubmit();
    return;
  }
  // ---------- 08 ยืนยันลบ ----------
  const btn = event.target.closest('button[data-delete]');
  if (!btn) return;
  state.deleting = Number(btn.dataset.delete);
  els.deleteName.textContent = `${productCode(state.deleting)} · ${btn.dataset.title}`;
  els.dialog.showModal();
});

/** ปิด popup แบบมี animation (รอให้เล่นจบก่อนค่อยปิดจริง) */
function closeDialog() {
  if (!els.dialog.open || els.dialog.classList.contains('closing')) return;
  els.dialog.classList.add('closing');
  els.dialog.addEventListener(
    'animationend',
    () => {
      els.dialog.classList.remove('closing');
      els.dialog.close();
    },
    { once: true }
  );
}
$('delete-cancel').addEventListener('click', closeDialog);
els.dialog.addEventListener('cancel', (event) => {
  event.preventDefault(); // กด Esc → ปิดแบบมี animation เหมือนกัน
  closeDialog();
});
els.dialog.addEventListener('click', (event) => {
  if (event.target === els.dialog) closeDialog(); // คลิกพื้นหลังมืด → ปิด
});
els.dialog.addEventListener('close', () => {
  state.deleting = null;
});
els.deleteConfirm.addEventListener('click', async () => {
  if (!state.deleting) return;
  els.deleteConfirm.disabled = true;
  els.deleteConfirm.classList.add('is-loading');
  try {
    const res = await api.delete(`/products/${state.deleting}`);
    closeDialog();
    // เคยขายแล้ว → backend ซ่อนแทนการลบ (คำสั่งซื้อ / รีวิว ยังอ้างถึงสินค้านี้อยู่)
    showMessage({ key: res?.data?.result === 'hidden' ? 'ap.ok.hidden' : 'ap.ok.deleted' }, 'success');
    loadList();
  } catch (err) {
    closeDialog();
    showMessage(errorMessage(err));
  } finally {
    els.deleteConfirm.disabled = false;
    els.deleteConfirm.classList.remove('is-loading');
  }
});

// ---------- 06 / 07 ฟอร์มเพิ่ม-แก้ไข ----------
function renderFieldErrors() {
  els.form.querySelectorAll('.has-error').forEach((f) => f.classList.remove('has-error'));
  els.form.querySelectorAll('.field-error').forEach((m) => m.remove());
  els.form.querySelectorAll('[aria-invalid]').forEach((i) => {
    i.removeAttribute('aria-invalid');
    i.removeAttribute('aria-describedby');
  });
  for (const [name, msg] of Object.entries(state.fieldErrors)) {
    const input = els.form.elements[name];
    if (!input) continue;
    const field = input.closest('.field');
    field.classList.add('has-error');
    input.setAttribute('aria-invalid', 'true');
    const note = document.createElement('span');
    note.className = 'field-error';
    note.id = `${input.id}-error`;
    note.textContent = resolve(msg);
    input.setAttribute('aria-describedby', note.id);
    field.append(note);
  }
}
function clearFieldErrors() {
  state.fieldErrors = {};
  renderFieldErrors();
}

/** ตรวจในหน้าเว็บก่อนส่ง (backend จะตรวจซ้ำอีกครั้งเสมอ) */
function validate(v) {
  const e = {};
  if (!v.title) e.title = { key: 'ap.err.title' };
  if (!v.status) e.status = { key: 'ap.err.status' };
  if (!v.category_id) e.category_id = { key: 'ap.err.category' };
  if (v.price === '' || !(Number(v.price) >= 0)) e.price = { key: 'ap.err.price' };
  if (!v.condition) e.condition = { key: 'ap.err.condition' };
  const stock = Number(v.stock_quantity);
  if (v.stock_quantity === '' || !Number.isInteger(stock) || stock < 0) e.stock_quantity = { key: 'ap.err.stock' };
  return e;
}

/** แปลงค่าจากฟอร์มเป็น body ที่ส่งให้ API */
function toPayload(v) {
  const attributes = {};
  for (const key of ATTRIBUTE_FIELDS) if (v[key]) attributes[key] = v[key];
  return {
    title: v.title,
    description: v.description || null,
    category_id: Number(v.category_id),
    series_id: v.series_id ? Number(v.series_id) : null,
    status: v.status,
    condition: v.condition,
    price: Number(v.price),
    // สต็อกส่งเฉพาะตอนเพิ่มสินค้าใหม่ · ตอนแก้ไขเปลี่ยนที่กล่องสต็อกเท่านั้น
    // (ส่งยอดที่โหลดไว้ตอนเปิดฟอร์มกลับไป จะทับสต็อกที่คนอื่นเพิ่งเติม / ลูกค้าเพิ่งซื้อ)
    ...(state.editingId ? {} : { stock_quantity: Number(v.stock_quantity) }),
    attributes,
  };
}

function renderDropzoneText() {
  if (state.imageFile) {
    els.dropzoneText.textContent = t('ap.dropPicked', { name: state.imageFile.name });
    els.preview.alt = t('ap.previewAlt', { name: state.imageFile.name });
  } else if (!els.preview.hidden) {
    els.dropzoneText.textContent = t('ap.dropChange');
  } else {
    els.dropzoneText.textContent = t('ap.drop');
  }
}

function resetImage() {
  state.imageFile = null;
  els.fileInput.value = '';
  els.preview.hidden = true;
  els.preview.removeAttribute('src');
  renderDropzoneText();
}

function pickImage(file) {
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    showMessage({ key: 'ap.err.imageType' });
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    showMessage({ key: 'ap.err.imageSize' });
    return;
  }
  clearMessage();
  state.imageFile = file;
  els.preview.src = URL.createObjectURL(file);
  els.preview.hidden = false;
  renderDropzoneText();
}

els.dropzone.addEventListener('click', () => els.fileInput.click());
els.dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    els.fileInput.click();
  }
});
els.fileInput.addEventListener('change', () => pickImage(els.fileInput.files[0]));
['dragenter', 'dragover'].forEach((type) =>
  els.dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    els.dropzone.classList.add('dragover');
  })
);
['dragleave', 'drop'].forEach((type) =>
  els.dropzone.addEventListener(type, () => els.dropzone.classList.remove('dragover'))
);
els.dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  pickImage(event.dataTransfer.files[0]);
});

// ปุ่ม − / + ข้างช่องจำนวน
els.form.addEventListener('click', (event) => {
  const btn = event.target.closest('.stepper-btn');
  if (!btn) return;
  const input = els.form.elements.stock_quantity;
  if (input.readOnly) return; // ตอนแก้ไข เปลี่ยนจำนวนที่กล่องสต็อกเท่านั้น
  const next = Math.max(0, (Number(input.value) || 0) + Number(btn.dataset.step));
  input.value = String(next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

// แก้ช่องที่ผิดแล้ว → ลบข้อความแดงของช่องนั้นทันที ไม่ต้องรอกดบันทึกใหม่
['input', 'change'].forEach((type) =>
  els.form.addEventListener(type, (event) => {
    const name = event.target.name;
    if (name && state.fieldErrors[name]) {
      delete state.fieldErrors[name];
      renderFieldErrors();
    }
  })
);

function fillForm(product) {
  const f = els.form.elements;
  f.title.value = product.title || '';
  f.description.value = product.description || '';
  f.category_id.value = product.category?.category_id ?? '';
  f.series_id.value = product.series?.series_id ?? '';
  f.status.value = product.status || '';
  f.condition.value = product.condition || '';
  f.price.value = product.price ?? '';
  f.stock_quantity.value = product.stock_quantity ?? '';
  const attrs = product.attributes || {};
  for (const key of ATTRIBUTE_FIELDS) f[key].value = attrs[key] ?? '';

  setImages(product.images || [], product.title);
}

/* ---------- รูปที่มีอยู่แล้ว (ตอนแก้ไข) ---------- */

// รูปปกโชว์ในกรอบอัปโหลด · รูปทั้งหมดโชว์เป็นแถวเล็กด้านล่าง
function setImages(images, title = els.form.elements.title.value) {
  state.images = images;
  state.confirmDeleteSeq = null;
  if (!state.imageFile) {
    const cover = images.find((i) => i.is_cover) || images[0];
    if (cover) {
      els.preview.src = cover.url;
      els.preview.alt = cover.alt_text || title;
      els.preview.hidden = false;
    } else {
      els.preview.hidden = true;
      els.preview.removeAttribute('src');
    }
    renderDropzoneText();
  }
  renderGallery();
}

function renderGallery() {
  const images = state.images;
  els.gallery.hidden = !state.editingId || images.length === 0;
  els.galleryList.innerHTML = images
    .map((img) => {
      const confirming = state.confirmDeleteSeq === img.seq;
      return `
      <li class="gallery-item${img.is_cover ? ' is-cover' : ''}">
        <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.alt_text || '')}" loading="lazy">
        ${img.is_cover ? `<span class="cover-badge">${escapeHtml(t('ap.gallery.cover'))}</span>` : ''}
        <div class="gallery-actions">
          ${img.is_cover ? '' : `<button type="button" class="gallery-btn" data-cover="${img.seq}">${escapeHtml(t('ap.gallery.makeCover'))}</button>`}
          <button type="button" class="gallery-btn danger${confirming ? ' confirming' : ''}" data-remove="${img.seq}">
            ${escapeHtml(t(confirming ? 'ap.gallery.confirmDelete' : 'ap.gallery.delete'))}
          </button>
        </div>
      </li>`;
    })
    .join('');
}

// ตั้งปก / ลบ ทำทันทีกับ API (ไม่รอปุ่มบันทึก) · ลบต้องกด 2 ครั้ง กันพลาด
els.galleryList.addEventListener('click', async (event) => {
  const btn = event.target.closest('button');
  if (!btn || !state.editingId) return;
  const id = state.editingId;
  const removeSeq = btn.dataset.remove ? Number(btn.dataset.remove) : null;
  if (removeSeq && state.confirmDeleteSeq !== removeSeq) {
    state.confirmDeleteSeq = removeSeq;
    renderGallery();
    return;
  }
  btn.disabled = true;
  try {
    const res = removeSeq
      ? await api.delete(`/products/${id}/images/${removeSeq}`)
      : await api.put(`/products/${id}/images/${Number(btn.dataset.cover)}/cover`);
    setImages(res.data.images);
    showToast({ key: removeSeq ? 'ap.ok.imageDeleted' : 'ap.ok.coverChanged' });
  } catch (err) {
    state.confirmDeleteSeq = null;
    renderGallery();
    showToast(errorMessage(err), 'error');
  }
});

function renderFormTitle() {
  const id = state.editingId;
  els.formTitle.textContent = id ? t('ap.editTitle', { code: productCode(id) }) : t('ap.addTitle');
  document.title = t(id ? 'ap.editTitleTab' : 'ap.addTitleTab');
}

/* ---------- กล่องสต็อก (ตอนแก้ไข) ---------- */
// เติม / ตัดของเสีย / ปรับยอด ทำทันทีกับ API พร้อมเหตุผล → ประวัติครบทุกครั้ง
// ช่อง "จำนวน" ด้านบนเลยล็อกไว้ตอนแก้ไข (กันแก้ตรง ๆ แล้วไม่มีเหตุผล หรือทับยอดที่เพิ่งปรับ)

const stockType = () => els.stockForm.elements.type.value;

function setStockMode(editing) {
  const input = els.form.elements.stock_quantity;
  input.readOnly = editing;
  els.form.querySelectorAll('.stepper-btn').forEach((b) => (b.disabled = editing));
  els.stockHint.hidden = !editing;
  els.stockCard.hidden = !editing;
  state.stock = { current: 0, movements: [], page: 1, total: 0 };
  els.stockForm.reset();
  renderStockForm();
  renderStockHistory();
}

function renderStockNow() {
  els.stockNow.textContent = state.stock.current.toLocaleString();
  els.form.elements.stock_quantity.value = String(state.stock.current);
  renderStockForm();
}

// ยอดหลังบันทึก (โชว์ให้ดูก่อนกด) · กรอกไม่ครบ → null
function stockTarget() {
  const qty = els.stockQty.value === '' ? null : Number(els.stockQty.value);
  if (qty === null || !Number.isInteger(qty) || qty < 0) return null;
  const now = state.stock.current;
  const type = stockType();
  if (type === 'restock') return now + qty;
  if (type === 'write_off') return now - qty;
  return qty;
}

function renderStockForm() {
  const type = stockType();
  els.stockQtyLabel.textContent = t(`ap.stock.qty.${type}`);
  els.stockNoteReq.hidden = type === 'restock'; // ตัดของ / ปรับยอด ต้องบอกเหตุผล
  const after = stockTarget();
  els.stockPreview.textContent =
    after === null ? '' : t('ap.stock.preview', { before: state.stock.current.toLocaleString(), after: after.toLocaleString() });
  els.stockPreview.classList.toggle('is-bad', after !== null && after < 0);
}

const dateFmt = () =>
  new Intl.DateTimeFormat(getLang() === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

function renderStockHistory() {
  const items = state.stock.movements;
  const fmt = dateFmt();
  els.stockRows.innerHTML = items
    .map((m) => {
      const typeText = has(`stock.type.${m.type}`) ? t(`stock.type.${m.type}`) : m.type;
      const by = m.created_by ? m.created_by.display_name || m.created_by.username : '—';
      const order = m.order_id ? `<span class="stock-order">${escapeHtml(t('ap.stock.order', { id: m.order_id }))}</span> ` : '';
      return `
      <tr>
        <td class="stock-date">${escapeHtml(fmt.format(new Date(m.created_at)))}</td>
        <td><span class="stock-type type-${escapeHtml(m.type)}">${escapeHtml(typeText)}</span></td>
        <td class="num stock-change ${m.qty_change > 0 ? 'up' : 'down'}">${m.qty_change > 0 ? '+' : '−'}${Math.abs(m.qty_change).toLocaleString()}</td>
        <td class="num">${m.balance_after.toLocaleString()}</td>
        <td>${escapeHtml(by)}</td>
        <td class="stock-note">${order}${escapeHtml(m.note || '')}</td>
      </tr>`;
    })
    .join('');
  els.stockEmpty.hidden = items.length > 0;
  els.stockRows.closest('.stock-history-wrap').hidden = items.length === 0;
  els.stockMore.hidden = items.length >= state.stock.total;
}

async function loadStockHistory(page) {
  const id = state.editingId;
  if (!id) return;
  try {
    const res = await api.get(`/products/${id}/stock-movements`, { page, pageSize: 10 });
    if (state.editingId !== id) return; // เปลี่ยนสินค้าไปแล้วระหว่างโหลด
    state.stock.page = page;
    state.stock.total = res.meta.total;
    state.stock.movements = page === 1 ? res.data : [...state.stock.movements, ...res.data];
    renderStockHistory();
  } catch (err) {
    showToast(errorMessage(err), 'error');
  }
}

els.stockForm.addEventListener('input', renderStockForm);
els.stockForm.addEventListener('change', renderStockForm);
els.stockMore.addEventListener('click', () => loadStockHistory(state.stock.page + 1));

els.stockForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = state.editingId;
  if (!id) return;
  const type = stockType();
  const qty = els.stockQty.value === '' ? NaN : Number(els.stockQty.value);
  const note = els.stockNote.value.trim();
  const body = type === 'adjust' ? { type, new_quantity: qty, note } : { type, quantity: qty, note };

  els.stockSave.disabled = true;
  try {
    const res = await api.post(`/products/${id}/stock`, body);
    state.stock.current = res.data.after;
    state.stock.movements = [res.data.movement, ...state.stock.movements];
    state.stock.total += 1;
    els.stockForm.reset();
    renderStockNow();
    renderStockHistory();
    showToast({ key: 'ap.ok.stock', vars: { before: res.data.before, after: res.data.after } });
  } catch (err) {
    // ช่องที่ผิด → บอกเป็นข้อความเดียวด้านบน (กล่องสต็อกมีแค่ 2 ช่อง)
    const detail = err instanceof ApiError && Array.isArray(err.details) ? err.details[0] : null;
    showToast(detail ? { text: `${err.message}: ${detail.issue}` } : errorMessage(err), 'error');
  } finally {
    els.stockSave.disabled = false;
  }
});

async function openForm(id) {
  els.form.reset();
  clearFieldErrors();
  resetImage();
  state.editingId = id;
  setImages([]);
  setStockMode(Boolean(id));
  renderFormTitle();
  if (!id) {
    els.form.elements.status.value = 'draft'; // สินค้าใหม่เริ่มเป็นฉบับร่าง กันเผลอขึ้นเว็บ
    els.form.elements.stock_quantity.value = '1';
    els.form.elements.title.focus({ preventScroll: true });
    return;
  }
  els.saveBtn.disabled = true;
  try {
    const { data } = await api.get(`${LIST_PATH}/${id}`);
    fillForm(data);
    state.stock.current = data.stock_quantity;
    renderStockNow();
    loadStockHistory(1);
  } catch (err) {
    showMessage(
      err instanceof ApiError && err.status === 404
        ? { key: 'ap.err.notFound', vars: { code: productCode(id) } }
        : errorMessage(err)
    );
  } finally {
    els.saveBtn.disabled = false;
  }
}

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage();

  const values = Object.fromEntries(
    [...new FormData(els.form)].map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
  );
  state.fieldErrors = validate(values);
  renderFieldErrors();
  if (Object.keys(state.fieldErrors).length) {
    els.form.querySelectorAll('.has-error').forEach((f) => replay(f, 'shake'));
    els.form.querySelector('[aria-invalid="true"]').focus();
    return;
  }

  els.saveBtn.disabled = true;
  els.saveBtn.classList.add('is-loading');
  try {
    const payload = toPayload(values);
    const res = state.editingId
      ? await api.put(`/products/${state.editingId}`, payload)
      : await api.post('/products', payload);

    // สินค้าบันทึกแล้ว → รูปพังก็ไม่ให้ค้างอยู่ในฟอร์ม (กดบันทึกซ้ำจะได้สินค้าซ้ำ) แค่บอกว่ารูปยังไม่ขึ้น
    // แก้ไขสินค้าแล้วเลือกรูปใหม่ = เปลี่ยนรูปปก (รูปเดิมยังอยู่ ลบได้ในแถวรูปด้านล่าง)
    let okKey = state.editingId ? 'ap.ok.saved' : 'ap.ok.added';
    if (state.imageFile && res?.data?.product_id) {
      try {
        await api.post(`/products/${res.data.product_id}/images`, state.imageFile, {
          params: { cover: 'true', alt: payload.title },
        });
      } catch (err) {
        okKey = err?.code === 'STORAGE_NOT_CONFIGURED' ? 'ap.ok.savedNoStorage' : 'ap.ok.savedNoImage';
      }
    }

    // แก้ไข → อยู่หน้าเดิม โหลดข้อมูลที่บันทึกแล้วมาแสดงใหม่ (รูปใหม่ขึ้นในแถวรูปทันที) แจ้งผลเป็นป๊อปอัป
    // เพิ่มใหม่ → กลับไปหน้ารายการเหมือนเดิม
    if (state.editingId) {
      const id = state.editingId;
      const { data } = await api.get(`${LIST_PATH}/${id}`);
      if (state.editingId === id) {
        resetImage();
        fillForm(data);
        state.stock.current = data.stock_quantity;
        renderStockNow();
      }
      showToast({ key: okKey }, okKey === 'ap.ok.saved' ? 'success' : 'error');
    } else {
      window.location.hash = '';
      showMessage({ key: okKey }, 'success');
    }
  } catch (err) {
    // backend ตอบ details: [{ field, issue }] → แสดงใต้ช่องที่ผิด
    if (err instanceof ApiError && Array.isArray(err.details)) {
      for (const d of err.details) state.fieldErrors[d.field] = { text: d.issue };
      renderFieldErrors();
    }
    showMessage(errorMessage(err));
  } finally {
    els.saveBtn.disabled = false;
    els.saveBtn.classList.remove('is-loading');
  }
});

// ---------- สลับมุมมองตาม # ใน URL ----------
function currentView() {
  const hash = window.location.hash;
  const edit = /^#edit\/(\d+)$/.exec(hash);
  if (edit) return { form: true, id: Number(edit[1]) };
  return { form: hash === '#new', id: null };
}

function route() {
  const view = currentView();
  els.listView.hidden = view.form;
  els.formView.hidden = !view.form;
  replay(view.form ? els.formView : els.listView, 'view-enter');

  if (view.form) {
    clearMessage();
    openForm(view.id);
  } else {
    document.title = t('ap.pageTitle');
    loadList();
  }
  window.scrollTo(0, 0);
}

// ---------- สลับภาษา: วาดส่วนที่สร้างด้วย JS ใหม่ (ไม่ต้องโหลดข้อมูลซ้ำ) ----------
onLangChange(() => {
  applyI18n();
  renderSelects();
  renderMessage();
  renderFieldErrors();
  renderDropzoneText();
  renderGallery();
  renderStockForm();
  renderStockHistory();
  renderToast();
  if (currentView().form) {
    renderFormTitle();
  } else {
    document.title = t('ap.pageTitle');
    renderRows();
    renderPager();
  }
});

window.addEventListener('hashchange', route);
await loadLookups();
route();
