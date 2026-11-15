import {getR5SessionId} from './r5-session.js';
import { paymentPanel } from './payment-view.js';
import { api, auth } from '../api.js';
import { escapeHtml as esc } from '../utils.js';
import { t, applyI18n, onLangChange } from '../i18n.js';
import { itemRows, summaryRows, addressText, emptyPanel } from './checkout-view.js';
import { previewItems, previewAddresses, previewQuote, readSession, saveSession, clearSession, PREVIEW_ORDER_KEY } from './checkout-preview.js';
const preview = new URLSearchParams(location.search).get('preview') === '1';
const content = document.getElementById('checkout-content');
const message = document.getElementById('checkout-message');
let state = 'loading', addresses = [], items = [], productIds = [], quote = null;
let addressId, shipping = 'standard', payment = 'promptpay', result = 'succeeded';
let showAddresses = false, refreshing = false, placing = false, userId, pending = null;
let paymentAttempt = null, pollTimer = null, walletPhone = '';
let existingPayment = null;
let existingWarning = false;
const pendingKey = () => `mdr_checkout_attempt_${userId}`;
function input() { return { product_ids: productIds, address_id: addressId, shipping_method: shipping, payment_method: payment, session_id:getR5SessionId() }; }
function notice(text, key) {
  if (key) message.dataset.i18n = key;
  else delete message.dataset.i18n;
  message.textContent = key ? t(key) : text;
  message.focus();
}
function symbol(name) { return `<span class="checkout-symbol symbol-${name}" aria-hidden="true"></span>`; }
function paymentOptions() {
  return ['promptpay','truemoney'].map(method => `<label class="checkout-option checkout-payment-option"><input type="radio" name="payment_method" value="${method}" ${payment===method?'checked':''} required><span>${t('payment.'+method)}</span><img class="promptpay-logo" src="/assets/checkout/${method}.svg" alt="${method==='promptpay'?'PromptPay':'TrueMoney Wallet'}" width="112" height="44"></label>`).join('') + (payment==='truemoney'?`<label class="wallet-phone">${t('payment.walletPhone')}<input type="tel" name="wallet_phone" autocomplete="tel-national" inputmode="numeric" pattern="0[0-9]{9}" maxlength="10" placeholder="0812345678" value="${esc(walletPhone)}" required><small>${t('payment.walletPhoneNote')}</small></label>`:'');
}
function render() {
  applyI18n();
  document.getElementById('checkout-preview').hidden = !preview;
  document.getElementById('checkout-back').href = preview ? '/cart?preview=1' : '/cart';
  content.setAttribute('aria-busy', String(state === 'loading' || refreshing || placing));
  if (state === 'loading') { content.textContent = t('cart.loading'); return; }
  if (state === 'login') { content.innerHTML = emptyPanel('checkout.loginTitle','checkout.loginText','/login?next='+encodeURIComponent(location.pathname+location.search),'auth.signIn'); return; }
  if (state === 'unverified') { content.innerHTML = emptyPanel('cart.verifyTitle','cart.verifyText','/verify-email','cart.verify'); return; }
  if (state === 'empty') { content.innerHTML = emptyPanel('checkout.noSelection','checkout.noSelectionText','/cart','checkout.back'); return; }
  if (state === 'noAddress') { content.innerHTML = emptyPanel('checkout.noAddress','checkout.noAddressText','/profile','checkout.manageAddresses'); return; }
  if (state === 'error') { content.innerHTML = `<section class="cart-empty"><h2>${t('checkout.error')}</h2><button class="cart-primary" data-reload>${t('cart.retry')}</button><a href="/cart">${t('checkout.back')}</a></section>`; return; }
  if (state === 'payment' && paymentAttempt) { content.innerHTML = paymentPanel(paymentAttempt, placing); return; }
  if (state === 'recover') {
    content.innerHTML = `<section class="cart-empty"><h2>${t('checkout.recoverTitle')}</h2><p>${t('checkout.recoverText')}</p><button class="cart-primary" data-recover ${placing?'disabled':''}>${placing?t('checkout.processing'):t('checkout.recover')}</button></section>`; return;
  }
  const address = addresses.find(a => a.address_id === addressId);
  if(existingPayment) {
    message.innerHTML=`${esc(t(existingWarning?'payment.finishExisting':'payment.existingNotice'))} <button type="button" class="cart-text-button" data-payment-resume>${esc(t('payment.resume'))}</button>`;
  }
  const locked = refreshing || placing || !!pending;
  content.innerHTML = `<form id="checkout-form" class="checkout-columns"><div class="checkout-sections"><section class="checkout-card checkout-address"><div class="checkout-heading"><h2>${symbol('house')}${t('checkout.address')}</h2><button type="button" data-addresses ${locked?'disabled':''}>${t('checkout.change')}</button></div>${address?`<div class="checkout-address-details"><p class="checkout-recipient">${esc(address.recipient_name)}</p><p class="checkout-phone"><span>${t('checkout.phone')}</span> ${esc(address.phone)}</p><address>${esc(address.line1)}<br>${esc(address.district)} ${esc(address.province)} ${esc(address.postcode)}</address></div>`:''}${showAddresses?`<label>${t('checkout.chooseAddress')}<select name="address_id" ${locked?'disabled':''}>${addresses.map(a=>`<option value="${a.address_id}" ${a.address_id===addressId?'selected':''}>${esc(a.recipient_name)} · ${esc(a.line1)}</option>`).join('')}</select></label>${!preview?`<a href="/profile">${t('checkout.manageAddresses')}</a>`:''}`:''}</section><section class="checkout-card"><fieldset ${locked?'disabled':''}><legend>${symbol('truck')}${t('checkout.shipping')}</legend><div class="checkout-options">${['standard','express'].map(method=>`<label class="checkout-option"><input type="radio" name="shipping_method" value="${method}" ${shipping===method?'checked':''} required>${symbol('truck')}${method==='express'?symbol('zap'):''}<span>${t('checkout.'+method)}</span></label>`).join('')}</div><p class="checkout-note">${t('cart.shippingNote')}</p></fieldset></section><section class="checkout-card"><fieldset ${locked?'disabled':''}><legend>${symbol('credit-card')}${t(preview?'checkout.payment':'payment.paymentMethod')}</legend><div class="checkout-options">${paymentOptions()}</div><p class="checkout-notice">${t(preview?'checkout.simulationNotice':'payment.testNotice')}</p>${preview?`<label>${t('checkout.simulationResult')}<select name="simulation_result"><option value="succeeded" ${result==='succeeded'?'selected':''}>${t('checkout.succeeded')}</option><option value="failed" ${result==='failed'?'selected':''}>${t('checkout.failed')}</option></select></label>`:''}</fieldset></section><section class="checkout-card"><h2>${symbol('package')}${t('checkout.items')}</h2>${itemRows(quote?.items ?? items,false,true)}</section></div><aside class="cart-summary checkout-summary"><h2><span class="summary-list-symbol" aria-hidden="true"></span>${t('cart.summary')}</h2>${quote?`<p class="summary-item-count">${t('checkout.selectedCount',{n:quote.items.reduce((sum,item)=>sum+item.quantity,0)})}</p>`:''}${quote?summaryRows(quote):`<p>${t('checkout.checking')}</p>`}<button class="cart-primary" type="submit" ${placing||refreshing||!quote?'disabled':''}>${placing?t('checkout.processing'):pending?t('checkout.retryOrder'):t(preview?'checkout.confirm':'payment.confirm')}</button>${!quote&&!refreshing?`<button type="button" class="cart-text-button" data-requote>${t('checkout.refreshQuote')}</button>`:''}<p class="checkout-notice">${t(pending?'checkout.recoverText':preview?'checkout.simulationNotice':'payment.testNotice')}</p></aside></form>`;
}
async function refreshQuote() {
  quote = null; refreshing = true; render();
  try {
    quote = preview ? previewQuote(items, addresses.find(a=>a.address_id===addressId), shipping, payment) : (await api.post('/orders/quotes', input())).data;
  } catch (err) {
    if (err.status === 401) state = 'login';
    else if (err.code === 'EMAIL_NOT_VERIFIED') state = 'unverified';
    notice(err.message);
  } finally { refreshing = false; render(); }
}
async function load() {
  state = 'loading'; render();
  try {
    if (preview) { addresses = previewAddresses; items = previewItems(); productIds = items.map(p=>p.product_id); }
    else {
      if (!auth.getToken()) { state='login';render();return; }
      const me = (await api.get('/auth/me')).data;
      userId = me.user_id;
      if (!me.is_email_verified) { state='unverified';render();return; }
      const returnedAttempt = new URLSearchParams(location.search).get('payment_attempt');
      if (returnedAttempt !== null) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(returnedAttempt)) {
          state='error'; notice(t('payment.invalidReturn')); render(); return;
        }
        // The URL identifies a payment only. Ownership and paid status come from the API.
        const returned = (await api.get('/orders/payment-attempts/'+encodeURIComponent(returnedAttempt))).data;
        acceptPayment(returned);
        if (!returned.order_id && ['pending','unknown','needs_review'].includes(returned.status)) await syncPayment();
        return;
      }
      const active = (await api.get('/orders/payment-attempts/active')).data;
      const selection = readSession('mdr_checkout_product_ids', []);
      // Cart → Checkout must still show the method picker. Only a recovery without
      // a cart selection resumes a payment immediately; never create another charge.
      existingPayment = active || null;
      if (active && (!Array.isArray(selection)||!selection.length)) { acceptPayment(active); return; }
      const saved = readSession(pendingKey());
      if (!active && saved?.checkout_key && saved?.quote_hash && Array.isArray(saved.product_ids)) { pending=saved;state='recover';render();return; }
      const selected = readSession('mdr_checkout_product_ids', []);
      if (!Array.isArray(selected)||!selected.length||selected.length>100||selected.some(id=>!Number.isSafeInteger(id)||id<1)) {state='empty';render();return;}
      productIds=[...new Set(selected)].sort((a,b)=>a-b);
      const [cartResponse,addressResponse]=await Promise.all([api.get('/cart'),api.get('/addresses')]);
      items=cartResponse.data.items.filter(p=>productIds.includes(p.product_id));
      addresses=addressResponse.data;
      if(items.length!==productIds.length||items.some(p=>!p.available||!p.quantity_valid)) {state='empty';render();return;}
    }
    if (!addresses.length) {state='noAddress';render();return;}
    addressId=(addresses.find(a=>a.is_default)||addresses[0]).address_id;
    state='ready'; await refreshQuote();
  } catch(err) {state=err.status===401?'login':'error';notice(err.message);render();}
}
async function submit() {
  if(placing||refreshing||(!quote&&!pending))return;
  placing=true;delete message.dataset.i18n;message.textContent='';render();
  try {
    if(!preview && existingPayment) {
      if(existingPayment.payment_method!==payment){existingWarning=true;notice(t('payment.finishExisting'));return;}
      const resumed=existingPayment;existingPayment=null;pending=null;acceptPayment(resumed);return;
    }
    if(preview) {
      if(result==='failed'){notice(t('checkout.paymentFailed'));return;}
      const sample={order_id:'PREVIEW',current_status:'paid',placed_at:new Date().toISOString(),...quote,
        items:quote.items.map(p=>({...p,title_snapshot:p.title,unit_price_at_purchase:p.price})),
        payment:{method:`simulated_${payment}`,status:'succeeded',simulated:true},carrier:null,tracking_no:null};
      if(!saveSession(PREVIEW_ORDER_KEY,sample)){notice(t('checkout.storageError'));return;}
      location.assign('/order-detail?preview=1');return;
    }
    if(!pending) {
      pending={...input(),...(payment==='truemoney'?{phone_number:walletPhone}:{}),quote_hash:quote.quote_hash,checkout_key:crypto.randomUUID(),simulation_result:result};
      if(!saveSession(pendingKey(),pending)){
        pending=null;notice(t('checkout.storageError'));return;
      }
    }
    const response=await api.post('/orders/payment-attempts',pending);
    acceptPayment(response.data);
  } catch(err) {
    const uncertain=err.status===0||err.status>=500&&err.status!==503||err.code==='PAYMENT_MISMATCH';
    if(!uncertain){clearSession(pendingKey());pending=null;}
    if(err.status===401)state='login';
    else if(err.code==='EMAIL_NOT_VERIFIED')state='unverified';
    else if(err.code==='QUOTE_CHANGED'){await refreshQuote();}
    else if(state==='recover'&&!uncertain)state='error';
    const key = err.code==='INVENTORY_NOT_READY' ? 'checkout.inventoryNotReady' : undefined;
    notice(err.code==='PAYMENT_SIMULATED_FAILED'?t('checkout.paymentFailed'):err.message, key);
  } finally {placing=false;render();}
}
content.addEventListener('submit',event=>{event.preventDefault();void submit();});
content.addEventListener('input',event=>{if(event.target.name==='wallet_phone')walletPhone=event.target.value.trim();});
content.addEventListener('change',event=>{
  if(refreshing||placing||pending)return;
  delete message.dataset.i18n;message.textContent='';
  if(event.target.name==='wallet_phone'){walletPhone=event.target.value.trim();return;}
  if(event.target.name==='simulation_result'){result=event.target.value;return;}
  if(event.target.name==='address_id')addressId=Number(event.target.value);
  else if(event.target.name==='shipping_method')shipping=event.target.value;
  else if(event.target.name==='payment_method')payment=event.target.value;
  else return;
  void refreshQuote();
});
content.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.hasAttribute('data-payment-sync')){void syncPayment();return;}
  if(button.hasAttribute('data-payment-test')){void testPayment(button.dataset.paymentTest);return;}
  if(button.hasAttribute('data-payment-new')){clearSession(pendingKey());pending=null;paymentAttempt=null;clearTimeout(pollTimer);if(new URLSearchParams(location.search).has('payment_attempt')){location.assign('/checkout');return;}void load();return;}
  if(button.hasAttribute('data-addresses')){showAddresses=!showAddresses;render();}
  else if(button.hasAttribute('data-reload'))void load();
  else if(button.hasAttribute('data-requote'))void refreshQuote();
  else if(button.hasAttribute('data-recover'))void submit();
});
message.addEventListener('click',event=>{
  if(event.target.closest('[data-payment-resume]')&&existingPayment){const resumed=existingPayment;existingPayment=null;pending=null;message.textContent='';acceptPayment(resumed);}
});
function acceptPayment(attempt) {
  paymentAttempt=attempt; state='payment';
  if(attempt.order_id) {
    clearSession(pendingKey());clearSession('mdr_checkout_product_ids');
    location.assign('/order-detail?id='+encodeURIComponent(attempt.order_id)); return;
  }
  render(); schedulePoll();
}
function schedulePoll() {
  clearTimeout(pollTimer);
  if(!document.hidden && paymentAttempt && ['pending','initializing'].includes(paymentAttempt.status))
    pollTimer=setTimeout(()=>void syncPayment(),6000);
}
async function syncPayment() {
  if(placing||!paymentAttempt)return;
  placing=true;render();
  try { acceptPayment((await api.post('/orders/payment-attempts/'+encodeURIComponent(paymentAttempt.attempt_id)+'/sync',{})).data); }
  catch(err){notice(err.message);if(err.status===401){state='login';clearTimeout(pollTimer);}}
  finally{placing=false;render();if(state==='payment')schedulePoll();}
}
async function testPayment(result) {
  if(placing||!paymentAttempt||preview)return;
  placing=true;clearTimeout(pollTimer);render();
  try { acceptPayment((await api.post('/orders/payment-attempts/'+encodeURIComponent(paymentAttempt.attempt_id)+'/test-result',{result})).data); }
  catch(err){notice(err.message);if(err.status===401)state='login';}
  finally{placing=false;render();if(state==='payment')schedulePoll();}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(pollTimer);else schedulePoll();});
function updateCountdown() {
  if (document.hidden || state !== 'payment' || paymentAttempt?.status !== 'pending' || placing) return;
  const remaining = Math.max(0, Math.ceil((new Date(paymentAttempt.expires_at).getTime() - Date.now()) / 1000));
  const clock = content.querySelector('.payment-countdown strong');
  if (!clock || !Number.isFinite(remaining)) return;
  if (remaining === 0 && clock.textContent !== '00:00') { render(); return; }
  clock.textContent = String(Math.floor(remaining / 60)).padStart(2,'0') + ':' + String(remaining % 60).padStart(2,'0');
}
let countdownTimer = setInterval(updateCountdown, 1000);
window.addEventListener('pageshow',event=>{if(event.persisted){clearInterval(countdownTimer);countdownTimer=setInterval(updateCountdown,1000);if(state==='payment')void syncPayment();}});
window.addEventListener('pagehide',()=>{clearTimeout(pollTimer);clearInterval(countdownTimer);});
onLangChange(render);
await load();
