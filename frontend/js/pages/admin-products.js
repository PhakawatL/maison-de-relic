// จัดการสินค้า (แอดมิน) — ผู้รับผิดชอบ: R3 · wireframe 05–08
// มุมมองสลับด้วย # ใน URL:   (ว่าง) = รายการ · #new = เพิ่ม · #edit/<id> = แก้ไข
// ข้อความทุกตัวอยู่ใน js/locales/th.js และ en.js (หมวด admin.*, ap.*, status.*, cond.*, cat.*)
//
// API ที่ใช้:
//   GET    /products, /products/:id, /categories, /series   ← มีแล้ว
//   POST   /products, PUT /products/:id, DELETE /products/:id ← TODO (R3) รอ auth แอดมินของ R2
// ตอนนี้ GET /products คืนเฉพาะสินค้า available — เมื่อมี API ฝั่งแอดมิน ให้เปลี่ยน LIST_PATH
import { api, ApiError } from '../api.js';
import { escapeHtml, formatBaht } from '../utils.js';
import { t, has, applyI18n, onLangChange } from '../i18n.js';
import { requireAdminPage } from '../auth-guard.js';

// ไม่ใช่แอดมิน (ยังไม่ล็อกอิน / ลูกค้า / token หมดอายุ) → ส่งไปหน้า /login แล้วกลับมาหน้านี้หลังล็อกอิน (R2)
await requireAdminPage();

const LIST_PATH = '/products'; // TODO (R3): เปลี่ยนเป็น endpoint ของแอดมินที่เห็นทุกสถานะ
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
  dropzoneText: $('dropzone-text'),
  dialog: $('delete-dialog'),
  deleteName: $('delete-name'),
  deleteConfirm: $('delete-confirm'),
};

const state = {
  page: 1,
  q: '',
  category: '',
  editingId: null,
  imageFile: null,
  deleting: null,
  categories: [],
  series: [],
  // เก็บผลล่าสุดไว้ วาดใหม่ได้ทันทีตอนสลับภาษาโดยไม่ต้องโหลดซ้ำ
  lastRows: null,
  lastMeta: null,
  lastListError: null,
  message: null, // { key, vars, type } หรือ { text, type }
  fieldErrors: {}, // { name: { key } | { text } }
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
        const { data } = await api.get(`/products/${Number(code[1])}`);
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
    await api.delete(`/products/${state.deleting}`);
    closeDialog();
    showMessage({ key: 'ap.ok.deleted' }, 'success');
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
    stock_quantity: Number(v.stock_quantity),
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
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
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

  const images = product.images || [];
  const cover = images.find((i) => i.is_cover) || images[0];
  const url = cover?.url || product.cover_image_url;
  if (url) {
    els.preview.src = url;
    els.preview.alt = cover?.alt_text || product.title;
    els.preview.hidden = false;
    renderDropzoneText();
  }
}

function renderFormTitle() {
  const id = state.editingId;
  els.formTitle.textContent = id ? t('ap.editTitle', { code: productCode(id) }) : t('ap.addTitle');
  document.title = t(id ? 'ap.editTitleTab' : 'ap.addTitleTab');
}

async function openForm(id) {
  els.form.reset();
  clearFieldErrors();
  resetImage();
  state.editingId = id;
  renderFormTitle();
  if (!id) {
    els.form.elements.status.value = 'draft'; // สินค้าใหม่เริ่มเป็นฉบับร่าง กันเผลอขึ้นเว็บ
    els.form.elements.stock_quantity.value = '1';
    els.form.elements.title.focus({ preventScroll: true });
    return;
  }
  els.saveBtn.disabled = true;
  try {
    const { data } = await api.get(`/products/${id}`);
    fillForm(data);
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

    // TODO (R3): อัปโหลดรูปเมื่อมี API รูปสินค้า เช่น POST /products/:id/images (FormData)
    if (state.imageFile && res?.data?.product_id) {
      const body = new FormData();
      body.append('image', state.imageFile);
      await api.post(`/products/${res.data.product_id}/images`, body);
    }

    const okKey = state.editingId ? 'ap.ok.saved' : 'ap.ok.added';
    window.location.hash = '';
    showMessage({ key: okKey }, 'success');
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
