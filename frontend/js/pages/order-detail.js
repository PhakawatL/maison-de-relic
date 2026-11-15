import { loadOrderActions, orderItemActions } from './order-actions.js';
import { api, auth } from '../api.js';
import { escapeHtml as esc } from '../utils.js';
import { t, applyI18n, onLangChange } from '../i18n.js';
import { itemRows, summaryRows, addressText, emptyPanel, money } from './checkout-view.js';
import { statusLabel, orderDate, orderNumber } from './order-display.js';
import { previewOrder, updateFulfillmentPreview } from './orders-preview.js';
const params = new URLSearchParams(location.search);
const preview = params.get('preview') === '1';
const content = document.getElementById('order-content');
const message = document.getElementById('order-message');
let order = null, state = 'loading', actions = null;
let receiving=false, confirmReceipt=false, receiptNeedsReload=false;
function receiptActions(){
  if(order.current_status==='completed')return `<p class="checkout-note">${t('receipt.completed')}</p>`;
  if(order.current_status!=='delivered')return '';
  return `<section class="receipt-actions"><p class="checkout-note">${t('receipt.note')}</p>${confirmReceipt?`<p>${t('receipt.confirmText')}</p><button class="cart-primary" data-receive ${receiving||receiptNeedsReload?'disabled':''}>${t(receiving?'adminOrders.saving':'receipt.confirm')}</button><button class="admin-text-button" data-cancel-receipt ${receiving?'disabled':''}>${t('receipt.cancel')}</button>`:`<button class="cart-primary" data-confirm-receipt ${receiptNeedsReload?'disabled':''}>${t('receipt.action')}</button>`}${receiptNeedsReload?`<button class="admin-text-button" data-retry>${t('adminOrders.reload')}</button>`:''}</section>`;
}
const historyUrl = preview ? '/orders?preview=1' : '/orders';
function paymentSection() {
  const p = order.payment;
  if (!p) return `<p class="checkout-note">${t('orders.noPayment')}</p>`;
  const method = p.method.replace(/^simulated_/, '').replace(/^omise_test_/, '');
  const methodText = ['bank_transfer','promptpay','card','truemoney'].includes(method) ? t('orders.pay.'+method) : p.method;
  const stateKey = ['succeeded','failed','refunded'].includes(p.status) ? p.status : 'unknown';
  return `<section class="checkout-notice ${p.status==='succeeded'?'order-success':''}"><strong>${t('orders.payment.'+stateKey)}</strong><dl class="order-facts"><div><dt>${t('orders.paymentMethod')}</dt><dd>${esc(methodText)}${p.method.startsWith('omise_test_')?' · Omise Test':p.simulated?' · '+t('orders.simulated'):''}</dd></div>${p.amount!=null?`<div><dt>${t('order.amount')}</dt><dd>${money(p.amount)}</dd></div>`:''}${p.paid_at?`<div><dt>${t('orders.paymentRecorded')}</dt><dd>${orderDate(p.paid_at,true)}</dd></div>`:''}</dl>${p.simulated?`<p>${t('checkout.simulationNotice')}</p>`:''}</section>`;
}
function progress() {
  const steps = ['paid','packing','shipped','delivered','completed'];
  const active = steps.indexOf(order.current_status);
  if (active < 0) return '';
  return `<ol class="order-progress" aria-label="${t('order.progress')}">${steps.map((s,i)=>`<li class="${i<=active?'is-done status-color':''} ${i<active?'is-past':''}" ${i<=active?`data-status="${s}"`:''} ${i===active?'aria-current="step"':''}><span class="order-step-icon step-icon-${s}" aria-hidden="true"></span>${statusLabel(s)}</li>`).join('')}</ol>`;
}
function timeline() {
  const entries = Array.isArray(order.status_history) ? order.status_history : [];
  if (!entries.length) return `<p class="checkout-note">${t('orders.noHistory')}</p>`;
  return `<ol class="order-timeline">${entries.map(log=>`<li><span class="order-badge status-color" data-status="${esc(log.to_status)}">${statusLabel(log.to_status)}${log.from_status===log.to_status?' · '+t('adminOrders.trackingOnly'):''}</span><time datetime="${esc(log.changed_at)}">${orderDate(log.changed_at,true)}</time></li>`).join('')}</ol>`;
}
function render() {
  applyI18n();
  document.getElementById('order-preview').hidden = !preview;
  document.getElementById('order-back').href = historyUrl;
  content.setAttribute('aria-busy', String(state === 'loading'));
  if (state === 'loading') { content.textContent = t('cart.loading'); return; }
  if (state === 'login') {
    content.innerHTML = emptyPanel('orders.loginTitle','orders.loginText',`/login?next=${encodeURIComponent(location.pathname+location.search)}`,'auth.signIn'); return;
  }
  if (state === 'error') {
    content.innerHTML = `<section class="cart-empty"><h2>${t('orders.detailError')}</h2><button class="cart-primary" data-retry>${t('cart.retry')}</button><a href="${historyUrl}">${t('orders.back')}</a></section>`; return;
  }
  if (state !== 'ready') {
    content.innerHTML = emptyPanel('order.missing','order.missingText',historyUrl,'orders.back'); return;
  }
  const ship = order.shipping_address;
  content.innerHTML = `
    <div class="order-title"><h1>${t('order.title')} #${esc(orderNumber(order.order_id))}</h1><time datetime="${esc(order.placed_at)}">${t('order.placedAt')} ${orderDate(order.placed_at,true)}</time></div>
    <p class="order-current"><span class="order-badge status-color" data-status="${esc(order.current_status)}">${statusLabel(order.current_status)}</span></p>
    ${progress()}
    <div class="checkout-columns"><div class="checkout-sections">
      <section class="checkout-card"><h2>${t('checkout.items')}</h2>${itemRows(order.items,true,false,item=>orderItemActions(item,actions,preview,order))}${actions?.unavailable?`<p class="checkout-note">${t('orderActions.unavailable')} <button class="cart-text-button" data-retry>${t('cart.retry')}</button></p>`:''}</section>
      <section class="checkout-card"><h2>${t('order.delivery')}</h2><dl class="order-facts">
        <div><dt>${t('order.carrier')}</dt><dd>${esc(order.carrier||t('order.notShipped'))}</dd></div>
        <div><dt>${t('order.tracking')}</dt><dd>${esc(order.tracking_no||'—')}</dd></div>
        <div><dt>${t('checkout.shipping')}</dt><dd>${['standard','express'].includes(order.shipping_method)?t('orders.delivery.'+order.shipping_method):'—'}</dd></div>
        <div><dt>${t('checkout.address')}</dt><dd>${esc(ship.ship_name)} · ${esc(ship.ship_phone)}<br>${addressText(ship)}</dd></div>
      </dl><p class="checkout-note">${t('orders.carrierNote')}</p></section>
      <section class="checkout-card"><h2>${t('orders.history')}</h2>${timeline()}</section>
      <section class="checkout-card"><h2>Maison de Relic</h2><p class="checkout-note">${t('order.storeNote')}</p></section>
    </div><aside class="cart-summary"><h2>${t('order.amount')}</h2>${summaryRows(order)}
      ${order.subtotal===null||order.shipping_fee===null?`<p class="checkout-note">${t('orders.legacyTotal')}</p>`:''}
      ${paymentSection()}${receiptActions()}<a class="cart-primary" href="${historyUrl}">${t('orders.viewHistory')}</a><a class="order-shop" href="/search">${t('cart.shop')}</a>
    </aside></div>`;
}
async function load() {
  confirmReceipt=false;receiptNeedsReload=false;actions=null;
  delete message.dataset.i18n;
  state='loading';message.textContent='';render();
  try {
    if (preview) {
      order=previewOrder(params.get('id'));
      state=order?'ready':'missing';
    } else if (!auth.getToken()) state='login';
    else {
      const id=params.get('id');
      if(!id||!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<1)state='missing';
      else { order=(await api.get(`/orders/${encodeURIComponent(id)}`)).data;state='ready'; }
    }
    if (!preview && state==='ready') actions=await loadOrderActions(order);
  } catch(err) { state=err.status===401?'login':err.status===404?'missing':'error';message.textContent=err.message; }
  render();
}
content.addEventListener('click',async event=>{
  if(receiving)return;
  if(event.target.closest('[data-retry]')){void load();return;}
  if(event.target.closest('[data-confirm-receipt]')){confirmReceipt=true;render();return;}
  if(event.target.closest('[data-cancel-receipt]')){confirmReceipt=false;render();return;}
  if(!event.target.closest('[data-receive]')||receiptNeedsReload||!confirmReceipt||order.current_status!=='delivered')return;
  receiving=true;delete message.dataset.i18n;message.textContent='';render();
  try{
    order=preview?updateFulfillmentPreview(order.order_id,{},true):(await api.post(`/orders/${order.order_id}/receipt`,{})).data;
    if(!preview)actions=await loadOrderActions(order);
    confirmReceipt=false;message.dataset.i18n=preview?'receipt.savedPreview':'receipt.saved';message.textContent=t(message.dataset.i18n);
  }catch(err){receiptNeedsReload=true;message.textContent=err.message+' · '+t('adminOrders.reloadBeforeRetry');if(err.status===401)state='login';}
  finally{receiving=false;render();}
});
onLangChange(render);
await load();
