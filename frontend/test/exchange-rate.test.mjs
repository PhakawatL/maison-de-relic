// test ของ js/exchange-rate.js และ js/image-credits.js (รันด้วย node --test frontend/test/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRates, getThbRates, convertPrice, RATE_API_URL } from '../js/exchange-rate.js';
import { creditForUrl } from '../js/image-credits.js';

const okBody = { amount: 1, base: 'THB', date: '2026-11-25', rates: { USD: 0.029, JPY: 4.4 } };
const fakeFetch = (body, ok = true) => {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    return { ok, status: ok ? 200 : 500, json: async () => body };
  };
  fn.calls = calls;
  return fn;
};

test('parseRates รับเฉพาะข้อมูลที่ base เป็น THB และอัตราเป็นตัวเลขบวก', () => {
  assert.deepEqual(parseRates(okBody), { date: '2026-11-25', rates: { USD: 0.029, JPY: 4.4 } });
  assert.equal(parseRates({ ...okBody, base: 'EUR' }), null);
  assert.equal(parseRates({ base: 'THB', rates: { USD: 'x', JPY: -1 } }), null);
  assert.equal(parseRates(null), null);
});

test('getThbRates เรียก Frankfurter ด้วย base=THB และคืน null เมื่อ API ล่ม', async () => {
  const good = fakeFetch(okBody);
  const rates = await getThbRates(good);
  assert.equal(good.calls[0], `${RATE_API_URL}?base=THB&symbols=USD,JPY`);
  assert.equal(rates.rates.USD, 0.029);
  assert.equal(await getThbRates(fakeFetch(okBody, false)), null);
  assert.equal(await getThbRates(async () => { throw new Error('offline'); }), null);
});

test('convertPrice แปลงราคาบาทเป็น USD และ JPY แบบปัดเศษ', () => {
  assert.deepEqual(convertPrice(2500, okBody.rates), [
    { code: 'USD', text: '$73' },
    { code: 'JPY', text: '¥11,000' },
  ]);
  assert.deepEqual(convertPrice(2500, null), []);
});

test('creditForUrl หาเครดิตจากชื่อไฟล์ท้าย URL ของรูปตัวอย่าง', () => {
  const url = 'https://x.supabase.co/storage/v1/object/public/Product_image/seed/c01-charizard-holo.webp?v=2';
  assert.equal(creditForUrl(url).photographer, 'Erik Mclean');
  assert.match(creditForUrl(url).source, /^https:\/\/www\.pexels\.com\/photo\//);
  assert.equal(creditForUrl('https://x.supabase.co/storage/v1/object/public/Product_image/12/abc.webp'), null);
  assert.equal(creditForUrl(''), null);
});
