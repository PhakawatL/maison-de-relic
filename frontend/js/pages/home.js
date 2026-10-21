// หน้าแรก — ผู้รับผิดชอบ: R4 (Figma: 01-Home)
import { api } from '../api.js';
import { escapeHtml } from '../utils.js';
import { t, has, applyI18n, onLangChange } from '../i18n.js';

const SHELF_SIZE = 4;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// แปลข้อความในหน้า (คำแปลอยู่ที่ js/locales/th.js และ en.js หมวด "หน้าแรก")
applyI18n();

// สี ไอคอน และโทนพื้นของแต่ละหมวด (ตัวแปรสีอยู่ใน home.css)
const CATEGORY_STYLE = {
  'art-toys': { color: 'var(--cat-arttoy)', icon: 'i-toy', tone: 'tone-peach' },
  'trading-cards': { color: 'var(--cat-card)', icon: 'i-card', tone: 'tone-sage' },
  'model-kits': { color: 'var(--cat-model)', icon: 'i-car', tone: 'tone-sky' },
};
const DEFAULT_STYLE = { color: 'var(--ink-3)', icon: 'i-card', tone: 'tone-sand' };

// ข้อมูลตัวอย่าง ใช้เฉพาะตอนเรียก API สินค้าไม่ได้ (เช่น กล่อง api ยังไม่เปิด)
// รูปข้อมูลเหมือนที่ GET /api/products ของ R3 ส่งมาจริง: category เป็น object ซ้อน { slug, name }
const IMG = '/assets/images/';
const SAMPLE_PRODUCTS = [
  { product_id: 1, title: 'Labubu The Monsters — Exciting Macaron', price: 1290, condition: 'like_new', category: { slug: 'art-toys', name: 'อาร์ตทอย' }, cover_image_url: IMG + 'p-labubu.jpg' },
  { product_id: 2, title: 'Charizard Base Set Holo (1999)', price: 8900, condition: 'excellent', category: { slug: 'trading-cards', name: 'การ์ด' }, cover_image_url: IMG + 'p-charizard-base.jpg' },
  { product_id: 3, title: 'Mobile Suit Gundam MG 1/100 — Built', price: 2450, condition: 'excellent', category: { slug: 'model-kits', name: 'โมเดล' }, cover_image_url: IMG + 'p-gundam.jpg' },
  { product_id: 4, title: 'Mr. Bone Astronaut Series — Set of 3', price: 1590, condition: 'new', category: { slug: 'art-toys', name: 'อาร์ตทอย' }, cover_image_url: IMG + 'p-mrbone.jpg' },
  { product_id: 5, title: 'Pokémon Holo Graded Slabs — Set of 3', price: 4200, condition: 'like_new', category: { slug: 'trading-cards', name: 'การ์ด' }, cover_image_url: IMG + 'p-slab-set.jpg' },
  { product_id: 6, title: 'Classic Sports Coupe Diecast 1/43', price: 1150, condition: 'good', category: { slug: 'model-kits', name: 'โมเดล' }, cover_image_url: IMG + 'p-red-classic.jpg' },
  { product_id: 7, title: 'Labubu Mini Figure — Orange Bunny', price: 650, condition: 'excellent', category: { slug: 'art-toys', name: 'อาร์ตทอย' }, cover_image_url: IMG + 'p-orange-bunny.jpg' },
  { product_id: 8, title: 'Charizard V Full Art', price: 1890, condition: 'like_new', category: { slug: 'trading-cards', name: 'การ์ด' }, cover_image_url: IMG + 'p-charizard-v.jpg' },
];
let usingSample = false;

// สินค้าที่แสดงอยู่ เก็บไว้วาดใหม่ตอนสลับภาษาโดยไม่ต้องโหลดซ้ำ
const shown = { recommended: [], newest: [] };

const priceFormat = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  maximumFractionDigits: 0,
});

const icon = (id) => `<svg aria-hidden="true"><use href="#${id}"></use></svg>`;
const conditionLabel = (condition) => (has(`cond.${condition}`) ? t(`cond.${condition}`) : '');
// ชื่อหมวดใช้คำแปลตาม slug ถ้ามี ไม่งั้นใช้ชื่อที่ API ส่งมา
// ?. (optional chaining) = ถ้า p.category ไม่มีค่า ให้ได้ undefined แทนที่จะ error
const categoryLabel = (p) =>
  has(`cat.${p.category?.slug}`) ? t(`cat.${p.category?.slug}`) : p.category?.name;

// =========================================================
// การ์ดสินค้า
// ชื่อฟิลด์ยึดตามที่ GET /api/products ของ R3 ส่งมา (ดู products.service.js → toSummary)
//   title, price, condition, cover_image_url, category: { slug, name }
// avg_rating: ซ่อนไว้ก่อน รอระบบรีวิว (issue #7) — ทั้ง API และ mockup ยังไม่มีค่านี้ การ์ดจึงไม่แสดงดาว
//   พอ API ส่ง avg_rating มา ดาวจะขึ้นเองโดยไม่ต้องแก้โค้ดตรงนี้
// =========================================================
function productCard(p, i) {
  const title = p.title ?? t('home.untitled');
  const style = CATEGORY_STYLE[p.category?.slug] || DEFAULT_STYLE;
  const media = p.cover_image_url
    ? `<img src="${escapeHtml(p.cover_image_url)}" alt="" loading="lazy">`
    : `<svg class="media-icon" aria-hidden="true"><use href="#${style.icon}"></use></svg>`;
  const condition = conditionLabel(p.condition)
    ? `<span class="cond-badge">${conditionLabel(p.condition)}</span>`
    : '';
  const category = categoryLabel(p);
  const tag = category
    ? `<span class="product-tag" style="--tag:${style.color}">${escapeHtml(category)}</span>`
    : '';
  const rating = p.avg_rating
    ? `<span class="product-rating">★ ${Number(p.avg_rating).toFixed(1)}</span>`
    : '';

  return `<a class="product-card card-enter" style="--i:${i}" href="/detail?id=${encodeURIComponent(p.product_id)}">
      <div class="product-media ${style.tone}">${media}${condition}</div>
      <div class="product-body">
        ${tag}
        <h3 class="product-title">${escapeHtml(title)}</h3>
        <div class="product-foot">
          <span class="product-price">${priceFormat.format(Number(p.price) || 0)}</span>
          ${rating}
        </div>
        <span class="product-link">${t('home.viewDetail')}${icon('i-arrow')}</span>
      </div>
    </a>`;
}

function skeletonCard() {
  return `<div class="product-card is-loading" aria-hidden="true">
      <div class="product-media"></div>
      <div class="product-body">
        <span class="skel" style="width:35%"></span>
        <span class="skel" style="width:85%"></span>
        <span class="skel" style="width:55%"></span>
      </div>
    </div>`;
}

function showSkeletons(el) {
  el.innerHTML = Array.from({ length: SHELF_SIZE }, skeletonCard).join('');
}

function renderShelf(el, products) {
  shown[el.id] = products;
  el.innerHTML = products.length
    ? products.map(productCard).join('')
    : `<p class="shelf-empty">${t('home.shelfEmpty')}</p>`;
}

// แสดงแถบบอกว่ากำลังใช้ข้อมูลตัวอย่าง
// reasonKey = คีย์คำแปลของเหตุผล (home.sampleNote = เรียก API ไม่ได้, home.sampleEmpty = ร้านยังไม่มีสินค้า)
// detail = ข้อความ error จาก API (ถ้ามี)
function showSampleNote(reasonKey, detail = '') {
  usingSample = true;
  const text = document.querySelector('#sample-note [data-i18n]');
  text.dataset.i18n = reasonKey; // เปลี่ยนคีย์ไว้ด้วย ตอนสลับภาษาจะได้แปลข้อความที่ถูกต้อง
  text.textContent = t(reasonKey);
  document.getElementById('sample-reason').textContent = detail ? `(${detail})` : '';
  document.getElementById('sample-note').hidden = false;
}

// =========================================================
// โหลดสินค้า
// query ที่ API ของ R3 รับ: sort = newest | price_asc | price_desc, category = slug หรือ id,
// pageSize = จำนวนต่อหน้า (1–50) ส่งค่าอื่นนอกจากนี้จะได้ 400 VALIDATION_ERROR
// =========================================================
async function fetchProducts(params) {
  const { data } = await api.get('/products', { pageSize: SHELF_SIZE, ...params });
  return data;
}

async function loadRecommended() {
  const el = document.getElementById('recommended');
  showSkeletons(el);
  let products = [];
  try {
    // TODO (R4): เปลี่ยนไปเรียก GET /api/recommend/popular เมื่อทำเสร็จ (W5)
    // ตอนนี้ API สินค้าไม่มี sort แบบ "แนะนำ" จึงใช้สินค้าใหม่ล่าสุดไปก่อน
    products = await fetchProducts({ sort: 'newest' });
  } catch (err) {
    showSampleNote('home.sampleNote', err.message);
  }
  // API ตอบได้แต่ร้านยังไม่มีสินค้าเลย (seed ยังว่าง) → โชว์ mockup แทนชั้นว่าง ๆ
  // พอมีสินค้าจริงในตาราง product แล้ว หน้าแรกจะใช้ของจริงแทนเอง
  if (!usingSample && products.length === 0) showSampleNote('home.sampleEmpty');
  if (usingSample) products = SAMPLE_PRODUCTS.slice(0, SHELF_SIZE);
  renderShelf(el, products);
  fillHeroArt(products);
}

async function loadNewest(category = '') {
  const el = document.getElementById('newest');
  if (!usingSample) showSkeletons(el);
  let products;
  try {
    if (usingSample) throw new Error('sample');
    products = await fetchProducts({ sort: 'newest', category });
  } catch (err) {
    if (!usingSample) showSampleNote('home.sampleNote', err.message);
    const pool = [...SAMPLE_PRODUCTS].reverse();
    products = (category ? pool.filter((p) => p.category.slug === category) : pool).slice(0, SHELF_SIZE);
  }
  renderShelf(el, products);
}

// ปุ่มกรองหมวดของแถว "มาใหม่ล่าสุด"
function setupNewestFilter() {
  const group = document.getElementById('new-filter');
  const grid = document.getElementById('newest');
  group.addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-cat]');
    if (!btn || btn.getAttribute('aria-pressed') === 'true') return;
    group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));

    grid.classList.add('is-switching');
    await new Promise((r) => setTimeout(r, reduceMotion ? 0 : 220));
    await loadNewest(btn.dataset.cat);
    grid.classList.remove('is-switching');
  });
}

// =========================================================
// Hero: การ์ดลอยบนภาพตัดปะ ใช้ข้อมูลสินค้าแนะนำ (รูปภาพตัดปะเป็นรูปคงที่ใน index.html)
// =========================================================
function fillHeroArt(products) {
  const [first] = products;
  if (first) {
    document.getElementById('fc1-title').textContent = first.title ?? '';
    document.getElementById('fc1-price').textContent = priceFormat.format(Number(first.price) || 0);
  }
  const best = [...products].sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0))[0];
  const fc2 = document.querySelector('.fc2');
  if (best && best.avg_rating) {
    document.getElementById('fc2-rating').textContent = Number(best.avg_rating).toFixed(1);
    document.getElementById('fc2-cond').textContent = conditionLabel(best.condition);
  } else if (fc2) {
    fc2.hidden = true; // ยังไม่มีคะแนนรีวิว ไม่ต้องโชว์
  }
}

// ภาพตัดปะขยับตามเมาส์ (เฉพาะอุปกรณ์ที่มีเมาส์)
function setupParallax() {
  const art = document.getElementById('hero-art');
  if (!art || reduceMotion || !window.matchMedia('(pointer: fine)').matches) return;
  const hero = art.closest('.hero');
  const layers = [...art.querySelectorAll('[data-depth]')];
  let x = 0;
  let y = 0;
  let frame = 0;

  const apply = () => {
    frame = 0;
    for (const layer of layers) {
      const depth = Number(layer.dataset.depth);
      layer.style.translate = `${(-x * depth).toFixed(1)}px ${(-y * depth).toFixed(1)}px`;
    }
  };
  const queue = () => {
    if (!frame) frame = requestAnimationFrame(apply);
  };

  hero.addEventListener('pointermove', (event) => {
    const rect = hero.getBoundingClientRect();
    x = (event.clientX - rect.left) / rect.width - 0.5;
    y = (event.clientY - rect.top) / rect.height - 0.5;
    queue();
  });
  hero.addEventListener('pointerleave', () => {
    x = 0;
    y = 0;
    queue();
  });
}

// ตัวอย่างคำค้นในช่องค้นหาเปลี่ยนเองทุก ๆ 3 วินาที (ข้อความ home.hint0–4)
function setupSearchHints() {
  const input = document.getElementById('hero-q');
  if (!input || reduceMotion) return;
  const HINT_COUNT = 5;
  let i = 0;
  onLangChange(() => {
    input.placeholder = t(`home.hint${i}`);
  });
  setInterval(() => {
    if (document.activeElement === input || input.value) return;
    input.classList.add('ph-out');
    setTimeout(() => {
      i = (i + 1) % HINT_COUNT;
      input.placeholder = t(`home.hint${i}`);
      input.classList.remove('ph-out');
    }, 300);
  }, 3000);
}

// =========================================================
// ลูกเล่นทั่วหน้า
// =========================================================

// ส่วนที่มี data-reveal ค่อย ๆ โผล่เมื่อเลื่อนมาถึง
function setupReveal() {
  const items = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window) || reduceMotion) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );
  items.forEach((el) => observer.observe(el));
}

// header เบลอพื้นหลังเมื่อเลื่อนจอลงมา
function setupStickyHeader() {
  const header = document.getElementById('site-header');
  if (!header) return;
  const update = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

// ทำสำเนาแถบชื่อซีรีส์ ให้เลื่อนวนต่อกันไม่มีช่องว่าง (สำเนามี data-i18n ด้วย จึงแปลตามได้)
function setupMarquee() {
  const track = document.getElementById('marquee-track');
  if (!track) return;
  const clone = track.cloneNode(true);
  clone.removeAttribute('id');
  track.after(clone);
}

// สลับภาษา: วาดส่วนที่สร้างด้วย JS ใหม่ (ข้อความใน HTML แปลโดย applyI18n แล้ว)
onLangChange(() => {
  renderShelf(document.getElementById('recommended'), shown.recommended);
  renderShelf(document.getElementById('newest'), shown.newest);
  fillHeroArt(shown.recommended);
});

setupStickyHeader();
setupMarquee();
setupReveal();
setupParallax();
setupSearchHints();
setupNewestFilter();
await loadRecommended();
loadNewest();
