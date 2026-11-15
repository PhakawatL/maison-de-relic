import { api, auth } from '../api.js';
import { escapeHtml as esc } from '../utils.js';
import { t, applyI18n, onLangChange, getLang } from '../i18n.js';
import { saveSession, PREVIEW_CART_KEY } from './checkout-preview.js';
const content = document.getElementById('cart-content');
const message = document.getElementById('cart-message');
let items = [], selected = new Set(), busy = false, loaded = false, state = 'loading';
const previewMode = new URLSearchParams(location.search).get('preview');
const preview = previewMode === '1' || previewMode === 'empty';
let previewItems = previewMode === 'empty' ? [] : [
  { product_id: 1, title: 'อาร์ตทอยทรงกลม สีดำด้าน', price: 1290, category_name: 'อาร์ตทอย', cover_image_url: '/assets/images/p-mrbone.jpg', stock_quantity: 3 },
  { product_id: 2, title: 'การ์ดมังกร ซีรีส์เนบิวลา', price: 2450, category_name: 'การ์ด', cover_image_url: '/assets/images/p-charizard-v.jpg', stock_quantity: 2 },
  { product_id: 3, title: 'อาร์ตทอย รูปทรงนามธรรม', price: 980, category_name: 'อาร์ตทอย', cover_image_url: '/assets/images/p-labubu.jpg', stock_quantity: 5 },
].map(p => ({ ...p, quantity: 1, status: 'available', available: true, quantity_valid: true }));
// Preview operates entirely in memory. It never calls Cart API or persists sample IDs.
const cartApi = preview ? {
  async get() { return { data: { items: previewItems.map(p => ({ ...p })) } }; },
  async patch(path, { quantity }) {
    const p = previewItems.find(p => p.product_id === Number(path.split('/').pop()));
    if (!p || !Number.isInteger(quantity) || quantity < 1 || quantity > p.stock_quantity) throw new Error(t('cart.invalidQuantity', { n: p?.stock_quantity ?? 0 }));
    p.quantity = quantity;
  },
  async delete(path) { previewItems = previewItems.filter(p => p.product_id !== Number(path.split('/').pop())); },
  async post(path, { product_ids }) { previewItems = previewItems.filter(p => !product_ids.includes(p.product_id)); },
} : api;
const money = value => new Intl.NumberFormat(getLang() === 'en' ? 'en-US' : 'th-TH', { style:'currency', currency:'THB' }).format(value);
const valid = p => p.available && p.quantity_valid;
const cartIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M3 3h2l3 12h10l3-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>';
function panel(title, text, href, button) {
  return `<section class="cart-empty">${cartIcon}<h2>${t(title)}</h2><p>${t(text)}</p>${href ? `<a class="cart-primary" href="${href}">${t(button)}</a>` : '<button class="cart-primary" data-retry>'+t('cart.retry')+'</button>'}</section>`;
}
function render() {
  applyI18n();
  const banner = document.getElementById('cart-preview');
  banner.hidden = !preview;
  if (preview) banner.innerHTML = `<strong>${t('cart.previewTitle')}</strong><p>${t('cart.previewText')}</p><a href="/cart?preview=1">${t('cart.previewFilled')}</a> · <a href="/cart?preview=empty">${t('cart.previewEmpty')}</a> · <a href="/orders?preview=1">${t('orders.viewHistory')}</a> · <a href="/cart">${t('cart.previewExit')}</a>`;
  content.setAttribute('aria-busy', String(busy || state === 'loading'));
  if (state === 'login') { content.innerHTML = panel('cart.loginTitle','cart.loginText','/login?next=%2Fcart','auth.signIn'); return; }
  if (state === 'unverified') { content.innerHTML = panel('cart.verifyTitle','cart.verifyText','/verify-email','cart.verify'); return; }
  if (state === 'loading') { content.textContent = t('cart.loading'); return; }
  if (state === 'error') { content.innerHTML = panel('cart.errorTitle','cart.errorText',null); return; }
  if (!items.length) { content.innerHTML = panel('cart.emptyTitle','cart.emptyText','/search','cart.shop'); return; }
  const eligible = items.filter(valid);
  const chosen = items.filter(p => selected.has(p.product_id));
  const subtotal = chosen.reduce((sum,p) => sum + Math.round(p.price * 100) * p.quantity,0);
  const shipping = !chosen.length || subtotal >= 150000 ? 0 : 4000;
  content.innerHTML = `<div class="cart-layout"><section aria-label="${t('cart.items')}"><div class="cart-toolbar"><label><input type="checkbox" data-all ${eligible.length && eligible.every(p=>selected.has(p.product_id))?'checked':''} ${busy||!eligible.length?'disabled':''}>${t('cart.selectAll')}</label><button class="cart-text-button" data-remove-selected ${busy||!selected.size?'disabled':''}>${t('cart.removeSelected')}</button></div>${items.map(p=>`<article class="cart-row" data-id="${p.product_id}"><label><input type="checkbox" data-select aria-label="${esc(t('cart.select',{title:p.title}))}" ${selected.has(p.product_id)?'checked':''} ${busy||!valid(p)?'disabled':''}></label>${p.cover_image_url && /^(https?:\/\/|\/(?!\/))/.test(p.cover_image_url)?`<img class="cart-image" src="${esc(p.cover_image_url)}" alt="" loading="lazy">`:`<div class="cart-image" aria-hidden="true"></div>`}<div class="cart-info"><h2>${esc(p.title)}</h2><p>${t('cart.store')}</p><span class="cart-category">${esc(p.category_name)}</span>${!valid(p)?`<p class="cart-warning">${p.available?t('cart.stockChanged',{n:p.stock_quantity}):t('cart.unavailable')}</p>`:''}</div><div class="cart-controls"><span>${money(p.price)}</span><div class="cart-quantity"><button data-minus aria-label="${esc(t('cart.decrease',{title:p.title}))}" ${busy||!p.available||p.quantity<=1?'disabled':''}>−</button><input data-quantity type="number" min="1" max="${p.stock_quantity}" step="1" value="${p.quantity}" aria-label="${esc(t('cart.quantity',{title:p.title}))}" ${busy||!p.available?'disabled':''}><button data-plus aria-label="${esc(t('cart.increase',{title:p.title}))}" ${busy||!p.available||p.quantity>=p.stock_quantity?'disabled':''}>+</button></div><button class="cart-text-button" data-remove ${busy?'disabled':''}>${t('cart.remove')}</button></div></article>`).join('')}</section><aside class="cart-summary"><h2><span class="summary-list-symbol" aria-hidden="true"></span>${t('cart.summary')}</h2><dl><div><dt>${t('cart.subtotal')}</dt><dd>${money(subtotal/100)}</dd></div><div><dt>${t('cart.shipping')}</dt><dd>${money(shipping/100)}</dd></div><div class="cart-total"><dt>${t('cart.total')}</dt><dd>${money((subtotal+shipping)/100)}</dd></div></dl><button class="cart-primary" data-checkout ${busy||!selected.size?'disabled':''}>${t('cart.checkout')}</button><small>${t('cart.shippingNote')}</small></aside></div>`;
  const all = content.querySelector('[data-all]');
  all.indeterminate = selected.size > 0 && selected.size < eligible.length;
}
async function load() {
  state = 'loading'; render();
  try {
    const { data } = await cartApi.get('/cart');
    items = data.items;
    selected = new Set(items.filter(p=>valid(p)&&(!loaded||selected.has(p.product_id))).map(p=>p.product_id));
    loaded = true; state = 'ready';
  } catch (err) {
    state = err.status === 401 ? 'login' : 'error';
    message.textContent = err.message;
  }
  render();
}
async function mutate(fn) {
  if (busy) return;
  busy = true; message.textContent = ''; render();
  try { await fn(); await load(); }
  catch (err) {
    if (err.status === 401) state='login';
    else if (err.code === 'EMAIL_NOT_VERIFIED') state='unverified';
    else if (err.code === 'OUT_OF_STOCK' || err.status === 404) await load();
    message.textContent = err.message;
  } finally { busy=false; render(); }
}
content.addEventListener('change', event => {
  if (busy) return;
  const target = event.target;
  const row = target.closest('[data-id]'); const id = Number(row?.dataset.id);
  if (target.matches('[data-all]')) selected=new Set(target.checked?items.filter(valid).map(p=>p.product_id):[]);
  else if (target.matches('[data-select]')) { target.checked?selected.add(id):selected.delete(id); }
  else if (target.matches('[data-quantity]')) {
    const quantity = Number(target.value); const p = items.find(p=>p.product_id===id);
    if (!Number.isInteger(quantity)||quantity<1||quantity>p.stock_quantity) { message.textContent=t('cart.invalidQuantity',{n:p.stock_quantity}); render(); return; }
    void mutate(()=>cartApi.patch(`/cart/items/${id}`,{quantity})); return;
  }
  render();
});
content.addEventListener('click', event => {
  const button=event.target.closest('button'); if(!button||button.disabled||busy)return;
  const id=Number(button.closest('[data-id]')?.dataset.id);
  const p=items.find(p=>p.product_id===id);
  if(button.hasAttribute('data-retry')) { message.textContent=''; void load(); }
  else if(button.hasAttribute('data-remove')) void mutate(()=>cartApi.delete(`/cart/items/${id}`));
  else if(button.hasAttribute('data-remove-selected')) {
    const ids=[...selected];
    void mutate(async()=>{for(let i=0;i<ids.length;i+=100)await cartApi.post('/cart/item-removals',{product_ids:ids.slice(i,i+100)});});
  } else if(button.hasAttribute('data-plus')||button.hasAttribute('data-minus')) void mutate(()=>cartApi.patch(`/cart/items/${id}`,{quantity:p.quantity+(button.hasAttribute('data-plus')?1:-1)}));
  else if(button.hasAttribute('data-checkout')) {
    if (selected.size > 100) { message.textContent=t('checkout.selectionLimit'); return; }
    const saved = preview
      ? saveSession(PREVIEW_CART_KEY, items.filter(p=>selected.has(p.product_id)))
      : saveSession('mdr_checkout_product_ids', [...selected].sort((a,b)=>a-b));
    if (!saved) { message.textContent=t('checkout.storageError'); return; }
    location.assign(preview ? '/checkout?preview=1' : '/checkout');
  }
});
onLangChange(render);
if(!preview && !auth.getToken()){state='login';render();}else await load();
