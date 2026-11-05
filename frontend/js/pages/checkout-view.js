import { escapeHtml as esc } from '../utils.js';
import { t, getLang } from '../i18n.js';
export const money = value => new Intl.NumberFormat(getLang() === 'en' ? 'en-US' : 'th-TH', { style:'currency', currency:'THB' }).format(value);
export function itemRows(items, purchased = false, numbered = false, actions = () => '') {
  return items.map((p, index) => {
    const title = purchased ? p.title_snapshot : p.title;
    const price = purchased ? p.unit_price_at_purchase : p.price;
    const image = typeof p.cover_image_url === 'string' && /^(https?:\/\/|\/(?!\/))/.test(p.cover_image_url) ? `<img class="checkout-item-image" src="${esc(p.cover_image_url)}" alt="" loading="lazy">` : '<div class="checkout-item-image" aria-hidden="true"></div>';
    return `<article class="checkout-item">${numbered?`<span class="checkout-item-index" aria-hidden="true">${index+1}</span>`:''}${image}<div class="checkout-item-info"><h3>${esc(title)}</h3><p>Maison de Relic</p>${p.category_name ? `<span class="cart-category">${esc(p.category_name)}</span>` : ''}${actions(p)}</div><div class="checkout-item-price"><span>${money(price)}</span><span>× ${p.quantity}</span></div></article>`;
  }).join('');
}
export function summaryRows(q) {
  return `<dl><div><dt>${t('cart.subtotal')}</dt><dd>${q.subtotal === null ? '—' : money(q.subtotal)}</dd></div><div><dt>${t('checkout.shippingFee')}</dt><dd>${q.shipping_fee === null ? '—' : money(q.shipping_fee)}</dd></div><div class="cart-total"><dt>${t('cart.total')}</dt><dd>${money(q.grand_total)}</dd></div></dl>`;
}
export function addressText(s) {
  return `${esc(s.ship_line1)} ${esc(s.ship_district)} ${esc(s.ship_province)} ${esc(s.ship_postcode)}`;
}
export function emptyPanel(titleKey, textKey, href, buttonKey) {
  return `<section class="cart-empty"><h2>${t(titleKey)}</h2><p>${t(textKey)}</p><a class="cart-primary" href="${href}">${t(buttonKey)}</a></section>`;
}
