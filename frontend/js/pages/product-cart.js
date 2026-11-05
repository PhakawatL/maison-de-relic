// R5 purchase controls; mounted by R4's product detail page.
import {getR5SessionId} from './r5-session.js';
import { api, auth } from '../api.js';
import { escapeHtml as esc } from '../utils.js';
import { t, onLangChange } from '../i18n.js';

export function mountProductCart(root, product) {
  let busy=false, quantity=1, notice='', noticeKey='', uncertain=false;
  const available=()=>product.status==='available' && product.stock_quantity>0;
  function render(){
    root.innerHTML=`<section class="product-cart-panel">
      <p class="product-cart-price">${new Intl.NumberFormat(document.documentElement.lang==='en'?'en-US':'th-TH',{style:'currency',currency:'THB'}).format(product.price)}</p>
      <p>${t('productCart.stock',{n:product.stock_quantity})}</p>
      <form class="product-cart-form"><label>${t('productCart.quantity')}<input name="quantity" type="number" min="1" max="${product.stock_quantity}" step="1" value="${quantity}" required ${busy||!available()||uncertain?'disabled':''}></label>
      <button class="btn btn-primary" type="submit" ${busy||!available()||uncertain?'disabled':''}>${t(busy?'productCart.adding':available()?'productCart.add':'productCart.soldOut')}</button>
      <a class="btn" href="/cart">${t('productCart.view')}</a></form>
      <p role="status" aria-live="polite" class="product-cart-message">${esc(noticeKey?t(noticeKey):notice)}</p>
      ${uncertain?`<p>${t('productCart.uncertain')}</p>`:''}
    </section>`;
  }
  root.addEventListener('input',event=>{
    if(event.target.name==='quantity')quantity=Number(event.target.value);
  });
  root.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||uncertain||!available())return;
    if(!auth.getToken()){
      location.assign('/login?next='+encodeURIComponent(location.pathname+location.search));return;
    }
    if(!Number.isSafeInteger(quantity)||quantity<1||quantity>product.stock_quantity){noticeKey='productCart.invalid';render();return;}
    busy=true;notice='';noticeKey='';render();
    try {
      await api.post('/cart/items',{product_id:product.product_id,quantity,session_id:getR5SessionId()});
      noticeKey='productCart.added';
    }catch(error){
      if(error.status===401){location.assign('/login?next='+encodeURIComponent(location.pathname+location.search));return;}
      notice=error.message;
      // A lost POST response may already have added the item. Do not blindly repeat it.
      if(error.status===0||error.status>=500){uncertain=true;}
    }finally{busy=false;render();}
  });
  onLangChange(render);render();
}
