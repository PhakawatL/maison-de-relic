// หน้าทีม (หน้าบังคับ) — ผู้รับผิดชอบ: R1
// แก้ข้อมูลสมาชิกในรายการด้านล่าง แล้ววางรูปไว้ที่ frontend/assets/team/ ตามชื่อไฟล์ใน photo
// TODO: ใส่รูปจริงของทุกคน (สี่เหลี่ยมจัตุรัส) ถ้าอยากใส่ลิงก์โซเชียลอื่นเพิ่มใส่ใน socials ได้
// ใบงานกำหนด: ข้อมูล + รูปภาพสมาชิกทุกคน + ลิงก์ Social Media อย่างน้อยคนละ 1 ช่องทาง
import { escapeHtml } from '../utils.js';
import { t, applyI18n, onLangChange } from '../i18n.js';

const MEMBERS = [
  {
    name: 'ภควรรษ ลิโมทัย (Peem)',
    studentId: '6887109',
    roleKey: 'team.role.peem',
    photo: '/assets/team/PeemProfile.webp',
    socials: [{ label: 'GitHub', url: 'https://github.com/PhakawatL' }],
  },
  {
    name: 'ศุภวิชญ์ ธรรมราษฎร์ (Bonus)',
    studentId: '6887059',
    roleKey: 'team.role.bonus',
    photo: '/assets/team/BonusProfile.webp',
    socials: [{ label: 'GitHub', url: 'https://github.com/SuphawitBonus' }],
  },
  {
    name: 'ญาณวุฒิ ทองยัง (Yu)',
    studentId: '6887012',
    roleKey: 'team.role.yu',
    photo: '/assets/team/YuProfile.webp',
    socials: [{ label: 'GitHub', url: 'https://github.com/yarnawutthongyoung-hue' }],
  },
  {
    name: 'ดนยกฤตย์ ภัทร์ธนะวัตน์ (Pleng)',
    studentId: '6887019',
    roleKey: 'team.role.pleng',
    photo: '/assets/team/PlengProfile2.webp',
    socials: [{ label: 'GitHub', url: 'https://github.com/N3ptz' }],
  },
  {
    name: 'นรบดี ศรีดีเลิศ (Captain)',
    studentId: '6887031',
    roleKey: 'team.role.narabodee',
    photo: '/assets/team/CaptainProfile.webp',
    socials: [{ label: 'GitHub', url: 'https://github.com/tainnnn' }],
  },
];

const GITHUB_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';

// แยก "ชื่อ (ชื่อเล่น)" ออกเป็นสองส่วน ตัวอักษรย่อใช้ชื่อเล่นก่อน ไม่มีก็ใช้ตัวแรกของชื่อ
function splitName(full) {
  const m = full.match(/^(.*?)\s*\((.+)\)\s*$/);
  const name = m ? m[1] : full;
  const nick = m ? m[2] : '';
  return { name, nick, initial: (nick || name).charAt(0).toUpperCase() };
}

function card(m, i) {
  const { name, nick, initial } = splitName(m.name);
  const links = m.socials
    .map(
      (s) =>
        `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${
          s.label === 'GitHub' ? GITHUB_ICON : ''
        }${escapeHtml(s.label)}</a>`
    )
    .join('');
  return `
    <article class="member" data-reveal style="--i:${i % 3}">
      <div class="member-photo">
        <span class="member-index" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
        <span class="member-initial" aria-hidden="true">${escapeHtml(initial)}</span>
        <img src="${escapeHtml(m.photo)}" alt="${escapeHtml(t('team.photoAlt', { name: m.name }))}" width="400" height="400"
             loading="lazy" onerror="this.remove()">
      </div>
      <div class="member-body">
        <h2 class="member-name">${escapeHtml(name)}${nick ? ` <span class="member-nick">(${escapeHtml(nick)})</span>` : ''}</h2>
        <p class="member-id">${escapeHtml(m.studentId)}</p>
        <p class="member-role">${escapeHtml(t(m.roleKey))}</p>
        <div class="member-socials">${links}</div>
      </div>
    </article>`;
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let revealed = false; // สลับภาษาแล้ววาดใหม่ ไม่ต้องเล่น animation ซ้ำ

// การ์ดโผล่ทีละใบตอนเลื่อนมาถึง พอโผล่เสร็จเติม is-done ให้ hover ตอบสนองทันที
function setupReveal(items) {
  const show = (el) => {
    el.classList.add('is-visible');
    el.addEventListener('transitionend', () => el.classList.add('is-done'), { once: true });
  };
  if (revealed || reduceMotion || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible', 'is-done'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        show(entry.target);
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );
  items.forEach((el) => observer.observe(el));
}

function render() {
  const list = document.getElementById('team-list');
  list.innerHTML = MEMBERS.map(card).join('');
  setupReveal(list.querySelectorAll('[data-reveal]'));
  revealed = true;
}

render();
applyI18n();
onLangChange(() => {
  render();
  applyI18n();
});
