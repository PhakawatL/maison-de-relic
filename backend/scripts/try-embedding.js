// try-embedding.js — ลองวัดว่าโมเดลเข้าใจความหมายภาษาไทยแค่ไหน (R4 · ไว้ทดลอง ไม่ได้ใช้ในเว็บ)
// รัน: docker compose exec api node scripts/try-embedding.js
const { embedText } = require('../src/modules/search/embedding');

// cosine similarity ของเวกเตอร์ที่ normalize แล้ว = ผลคูณจุด (dot product)
// 1 = ความหมายเหมือนกัน · 0 = ไม่เกี่ยวกัน
function similarity(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// เอาคำตั้งต้น 1 คำ ไปเทียบกับหลายประโยค แล้วเรียงจากใกล้สุดไปไกลสุด
async function compare(base, others) {
  const baseVec = await embedText(base);
  const rows = [];
  for (const text of others) {
    rows.push({ text, score: similarity(baseVec, await embedText(text)) });
  }
  rows.sort((x, y) => y.score - x.score); // มากไปน้อย
  console.log(`\nเทียบกับ "${base}"`);
  for (const r of rows) console.log(`  ${r.score.toFixed(3)}  ${r.text}`);
}

async function main() {
  await compare('การ์ดโปเกมอน', ['Pokémon trading card', 'Pikachu card', 'ฟิกเกอร์นารูโตะ']);
  await compare('ฟิกเกอร์กันดั้ม', [
    'หุ่นยนต์ Gundam ประกอบเสร็จแล้ว', 'Gundam action figure', 'โมเดลพลาสติกหุ่นยนต์',
    'แสตมป์เก่าจากคิวบา', 'เหรียญเงินแคนาดา',
  ]);
  await compare('ฟิกเกอร์ Gundam', ['Gundam action figure', 'หุ่นยนต์ Gundam ประกอบเสร็จแล้ว', 'แสตมป์เก่าจากคิวบา']);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});