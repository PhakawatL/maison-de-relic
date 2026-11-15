// สรุปยอดขาย (R3) — หน้า /admin/sales
// API: GET /admin/sales-summary?from=&to=&top= (docs/api.md หัวข้อ "สรุปยอดขาย")
// กราฟวาดเองเป็น SVG (ไม่ใช้ไลบรารี) · ข้อความอยู่ใน js/locales/*.js หมวด sl.* และ order.status.*
import { api } from '../api.js';
import { requireAdminPage } from '../auth-guard.js';
import { errorText } from '../forms.js';
import { applyI18n, getLang, has, onLangChange, t } from '../i18n.js';
import { escapeHtml } from '../utils.js';

applyI18n();
await requireAdminPage();

const TZ = 'Asia/Bangkok';
const PRESETS = ['7d', '30d', '90d', 'month', 'custom'];

const $ = (id) => document.getElementById(id);
const els = {
  message: $('page-message'),
  form: $('range-form'),
  custom: $('custom-range'),
  rangeText: $('range-text'),
  kpis: $('kpis'),
  chart: $('chart'),
  chartSub: $('chart-sub'),
  top: $('top-list'),
  cats: $('cat-list'),
  status: $('status-list'),
};

const state = { preset: '30d', from: null, to: null, data: null, loading: false, error: null, seq: 0 };

/* ---------- วันที่ (ทำงานกับสตริง YYYY-MM-DD ตามเวลาไทย กันวันเลื่อนตามเครื่องผู้ใช้) ---------- */
const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const addDays = (s, n) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const locale = () => (getLang() === 'en' ? 'en-GB' : 'th-TH');
const fmtDay = (s, opts = { day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat(locale(), { ...opts, timeZone: 'UTC' }).format(new Date(`${s}T00:00:00Z`));
const fmtRange = (from, to) =>
  from === to
    ? fmtDay(from, { day: 'numeric', month: 'short', year: 'numeric' })
    : `${fmtDay(from, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmtDay(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;

const baht = (n, digits = 0) =>
  new Intl.NumberFormat(locale(), { style: 'currency', currency: 'THB', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
const int = (n) => new Intl.NumberFormat(locale()).format(n);
// แกนกราฟ: ตัวเลขสั้น ๆ เช่น ฿12K
const bahtShort = (n) =>
  `฿${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`;

function rangeFor(preset) {
  const today = todayStr();
  if (preset === '7d') return { from: addDays(today, -6), to: today };
  if (preset === '90d') return { from: addDays(today, -89), to: today };
  if (preset === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  return { from: addDays(today, -29), to: today };
}

/* ---------- ข้อความแจ้ง ---------- */
function showError(err) {
  els.message.hidden = false;
  els.message.className = 'alert alert-error';
  els.message.textContent = errorText(err);
}
function clearError() {
  els.message.hidden = true;
}

/* ---------- ตัวเลขสรุป ---------- */
// เทียบช่วงก่อนหน้าที่ยาวเท่ากัน · goodWhenUp = false สำหรับยอดคืนเงิน (เพิ่ม = แย่)
function delta(cur, prev, goodWhenUp = true) {
  if (!prev && !cur) return '';
  if (!prev) return `<span class="sl-delta is-new">${escapeHtml(t('sl.delta.new'))}</span>`;
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 0.05) return `<span class="sl-delta">${escapeHtml(t('sl.delta.same'))}</span>`;
  const up = pct > 0;
  const good = up === goodWhenUp;
  const text = `${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`;
  return `<span class="sl-delta ${good ? 'is-good' : 'is-bad'}" title="${escapeHtml(t('sl.delta.vs'))}">${text}</span>`;
}

function renderKpis() {
  const d = state.data;
  if (!d) {
    els.kpis.innerHTML = Array.from({ length: 6 }, () => '<div class="sl-kpi is-loading"><span></span><strong></strong></div>').join('');
    return;
  }
  const c = d.totals;
  const p = d.previous;
  const items = [
    ['sl.kpi.gross', baht(c.gross), delta(c.gross, p.gross), 'is-main'],
    ['sl.kpi.net', baht(c.net), delta(c.net, p.net), ''],
    ['sl.kpi.orders', int(c.orders), delta(c.orders, p.orders), ''],
    ['sl.kpi.units', int(c.units), delta(c.units, p.units), ''],
    ['sl.kpi.avg', baht(c.avg_order), delta(c.avg_order, p.avg_order), ''],
    ['sl.kpi.refunds', baht(c.refunds), delta(c.refunds, p.refunds, false), '', t('sl.kpi.refundCount', { n: int(c.refund_count) })],
  ];
  els.kpis.innerHTML = items
    .map(
      ([key, value, d1, cls, note]) => `
    <div class="sl-kpi ${cls}">
      <span class="sl-kpi-label">${escapeHtml(t(key))}</span>
      <strong class="sl-kpi-value">${escapeHtml(value)}</strong>
      <span class="sl-kpi-foot">${d1}${note ? ` <span class="sl-kpi-note">${escapeHtml(note)}</span>` : ''}</span>
    </div>`
    )
    .join('');
}

/* ---------- กราฟยอดรายวัน (SVG) ---------- */
function niceMax(v) {
  if (v <= 0) return 1000;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

function renderChart() {
  const d = state.data;
  if (!d) {
    els.chart.innerHTML = '<div class="sl-chart-skel"></div>';
    els.chartSub.textContent = '';
    return;
  }
  const days = d.daily;
  els.chartSub.textContent = t('sl.chart.sub', { total: baht(d.totals.gross), days: int(days.length) });
  if (!d.totals.orders) {
    els.chart.innerHTML = `<p class="sl-empty">${escapeHtml(t('sl.empty'))}</p>`;
    return;
  }

  const W = Math.max(320, els.chart.clientWidth || 640);
  const H = 240;
  const pad = { top: 12, right: 8, bottom: 28, left: 52 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;
  const max = niceMax(Math.max(...days.map((x) => x.gross)));
  const slot = iw / days.length;
  const bw = Math.max(2, Math.min(28, slot * 0.68));
  const y = (v) => pad.top + ih - (v / max) * ih;

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const yy = y(max * f);
      return `<line class="grid" x1="${pad.left}" x2="${W - pad.right}" y1="${yy}" y2="${yy}"/>
              <text class="axis" x="${pad.left - 8}" y="${yy + 4}" text-anchor="end">${escapeHtml(bahtShort(max * f))}</text>`;
    })
    .join('');

  // ป้ายวันที่ใต้แกน ไม่เกิน ~7 ป้าย (วันแรก วันสุดท้าย และระหว่างกลาง)
  const every = Math.max(1, Math.ceil(days.length / 7));
  const labels = days
    .map((x, i) => {
      const last = i === days.length - 1;
      if (i % every !== 0 && !last) return '';
      if (!last && days.length - 1 - i < every / 2 && i !== 0) return ''; // ไม่ให้ชนป้ายสุดท้าย
      return `<text class="axis" x="${pad.left + slot * i + slot / 2}" y="${H - 8}" text-anchor="middle">${escapeHtml(fmtDay(x.date))}</text>`;
    })
    .join('');

  const bars = days
    .map((x, i) => {
      const cx = pad.left + slot * i + slot / 2;
      const h = Math.max(x.gross > 0 ? 2 : 0, pad.top + ih - y(x.gross));
      const tip = `${fmtDay(x.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${baht(x.gross)} · ${t('sl.chart.orders', { n: int(x.orders) })}`;
      return `<g class="bar" data-i="${i}">
        <rect class="hit" x="${pad.left + slot * i}" y="${pad.top}" width="${slot}" height="${ih}"/>
        <rect class="col" x="${cx - bw / 2}" y="${pad.top + ih - h}" width="${bw}" height="${h}" rx="${Math.min(3, bw / 3)}"/>
        <title>${escapeHtml(tip)}</title>
      </g>`;
    })
    .join('');

  const best = days.reduce((a, b) => (b.gross > a.gross ? b : a), days[0]);
  const aria = t('sl.chart.aria', { days: int(days.length), total: baht(d.totals.gross), best: fmtDay(best.date), bestValue: baht(best.gross) });
  els.chart.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${escapeHtml(aria)}">
      ${grid}
      <line class="base" x1="${pad.left}" x2="${W - pad.right}" y1="${y(0)}" y2="${y(0)}"/>
      ${bars}
      ${labels}
    </svg>
    <div class="sl-tip" id="chart-tip" hidden></div>`;

  // ป้ายลอยตอนชี้ (title ของ SVG ยังอยู่ไว้ให้โปรแกรมอ่านหน้าจอ / มือถือกดค้าง)
  const svg = els.chart.querySelector('svg');
  const tip = els.chart.querySelector('#chart-tip');
  svg.addEventListener('pointermove', (e) => {
    const g = e.target.closest('.bar');
    svg.querySelectorAll('.bar.is-on').forEach((b) => b !== g && b.classList.remove('is-on'));
    if (!g) {
      tip.hidden = true;
      return;
    }
    g.classList.add('is-on');
    const x = days[Number(g.dataset.i)];
    tip.innerHTML = `<strong>${escapeHtml(baht(x.gross))}</strong><span>${escapeHtml(fmtDay(x.date, { weekday: 'short', day: 'numeric', month: 'short' }))} · ${escapeHtml(t('sl.chart.orders', { n: int(x.orders) }))}</span>`;
    tip.hidden = false;
    const box = els.chart.getBoundingClientRect();
    const left = Math.min(Math.max(e.clientX - box.left, 70), box.width - 70);
    tip.style.left = `${left}px`;
  });
  svg.addEventListener('pointerleave', () => {
    tip.hidden = true;
    svg.querySelectorAll('.bar.is-on').forEach((b) => b.classList.remove('is-on'));
  });
}

/* ---------- สินค้าขายดี / หมวด / สถานะ ---------- */
function renderTop() {
  const d = state.data;
  if (!d) {
    els.top.innerHTML = '<li class="sl-skel-row"></li>'.repeat(3);
    return;
  }
  if (!d.top_products.length) {
    els.top.innerHTML = `<li class="sl-none">${escapeHtml(t('sl.top.empty'))}</li>`;
    return;
  }
  const max = d.top_products[0].revenue || 1;
  els.top.innerHTML = d.top_products
    .map(
      (p) => `
    <li>
      <a class="sl-top-item" href="/admin/products#edit/${p.product_id}">
        <span class="sl-thumb">${p.cover_image_url ? `<img src="${escapeHtml(p.cover_image_url)}" alt="" loading="lazy">` : ''}</span>
        <span class="sl-top-main">
          <span class="sl-top-title">${escapeHtml(p.title)}</span>
          <span class="sl-top-meta">P${String(p.product_id).padStart(3, '0')} · ${escapeHtml(t('sl.top.units', { n: int(p.units) }))}${p.status !== 'available' ? ` · ${escapeHtml(t(`status.${p.status}`))}` : ''}</span>
          <span class="sl-meter"><span style="width:${((p.revenue / max) * 100).toFixed(1)}%"></span></span>
        </span>
        <span class="sl-top-rev">${escapeHtml(baht(p.revenue))}</span>
      </a>
    </li>`
    )
    .join('');
}

function renderCats() {
  const d = state.data;
  if (!d) {
    els.cats.innerHTML = '<li class="sl-skel-row"></li>'.repeat(3);
    els.status.innerHTML = '';
    return;
  }
  els.cats.innerHTML = d.categories.length
    ? d.categories
        .map(
          (c) => `
      <li>
        <span class="sl-bar-label">${escapeHtml(has(`cat.${c.slug}`) /* ชื่อหมวดแปลได้ ไม่มีคำแปล → ชื่อจากฐานข้อมูล */ ? t(`cat.${c.slug}`) : c.name)}</span>
        <span class="sl-bar-value">${escapeHtml(baht(c.revenue))} <small>${c.share}%</small></span>
        <span class="sl-meter"><span style="width:${c.share}%"></span></span>
      </li>`
        )
        .join('')
    : `<li class="sl-none">${escapeHtml(t('sl.top.empty'))}</li>`;

  els.status.innerHTML = d.by_status
    .map(
      (s) => `
      <li class="${s.status === 'cancelled' ? 'is-muted' : ''}">
        <span>${escapeHtml(t(`order.status.${s.status}`))}</span>
        <span>${escapeHtml(int(s.orders))} · ${escapeHtml(baht(s.amount))}</span>
      </li>`
    )
    .join('') || `<li class="sl-none">${escapeHtml(t('sl.top.empty'))}</li>`;
}

function renderRange() {
  const f = els.form.elements;
  f.preset.value = state.preset;
  els.custom.hidden = state.preset !== 'custom';
  f.from.value = state.from;
  f.to.value = state.to;
  f.from.max = todayStr();
  f.to.max = todayStr();
  els.rangeText.textContent = state.data
    ? t('sl.rangeText', {
        range: fmtRange(state.from, state.to),
        prev: fmtRange(state.data.previous_range.from, state.data.previous_range.to),
      })
    : fmtRange(state.from, state.to);
}

function renderAll() {
  renderRange();
  renderKpis();
  renderChart();
  renderTop();
  renderCats();
}

/* ---------- โหลดข้อมูล ---------- */
async function load() {
  const seq = ++state.seq;
  state.data = null;
  clearError();
  renderAll();
  try {
    const res = await api.get('/admin/sales-summary', { from: state.from, to: state.to, top: 5 });
    if (seq !== state.seq) return; // เปลี่ยนช่วงไปแล้วระหว่างโหลด
    state.data = res.data;
    renderAll();
  } catch (err) {
    if (seq !== state.seq) return;
    showError(err);
  }
}

function setPreset(preset, { from, to } = {}) {
  state.preset = preset;
  const r = preset === 'custom' ? { from, to } : rangeFor(preset);
  state.from = r.from;
  state.to = r.to;
  if (preset !== 'custom') history.replaceState(null, '', `#${preset}`);
  else history.replaceState(null, '', window.location.pathname);
  load();
}

els.form.addEventListener('change', (e) => {
  if (e.target.name !== 'preset') return;
  if (e.target.value === 'custom') {
    state.preset = 'custom';
    renderRange();
    els.form.elements.from.focus();
    return;
  }
  setPreset(e.target.value);
});

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = els.form.elements;
  if (!f.from.value || !f.to.value || f.from.value > f.to.value) {
    showError({ message: t('sl.err.range') });
    return;
  }
  setPreset('custom', { from: f.from.value, to: f.to.value });
});

// วาดกราฟใหม่เมื่อความกว้างเปลี่ยน (หมุนจอ / ย่อหน้าต่าง)
let lastWidth = 0;
new ResizeObserver(() => {
  const w = els.chart.clientWidth;
  if (state.data && Math.abs(w - lastWidth) > 8) {
    lastWidth = w;
    renderChart();
  }
}).observe(els.chart);

onLangChange(renderAll);

const fromHash = window.location.hash.slice(1);
setPreset(PRESETS.includes(fromHash) && fromHash !== 'custom' ? fromHash : '30d');
