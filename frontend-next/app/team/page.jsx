'use client';
// หน้าทีม (แปลงจาก team.html + js/pages/team.js)
import { useEffect, useRef } from 'react';
import '../../styles/team.css';
import { useI18n } from '../../lib/i18n';

const MEMBERS = [
  { name: 'ภควรรษ ลิโมทัย (Peem)', studentId: '6887109', roleKey: 'team.role.peem', photo: '/assets/team/PeemProfile.webp',
    socials: [{ label: 'GitHub', url: 'https://github.com/PhakawatL' }] },
  { name: 'ศุภวิชญ์ ธรรมราษฎร์ (Bonus)', studentId: '6887059', roleKey: 'team.role.bonus', photo: '/assets/team/BonusProfile.webp',
    socials: [{ label: 'GitHub', url: 'https://github.com/SuphawitBonus' }] },
  { name: 'ญาณวุฒิ ทองยัง (Yu)', studentId: '6887012', roleKey: 'team.role.yu', photo: '/assets/team/YuProfile.webp',
    socials: [{ label: 'GitHub', url: 'https://github.com/yarnawutthongyoung-hue' }] },
  { name: 'ดนยกฤตย์ ภัทร์ธนะวัตน์ (Pleng)', studentId: '6887019', roleKey: 'team.role.pleng', photo: '/assets/team/PlengProfile2.webp',
    socials: [{ label: 'GitHub', url: 'https://github.com/N3ptz' }] },
  { name: 'นรบดี ศรีดีเลิศ (Captain)', studentId: '6887031', roleKey: 'team.role.narabodee', photo: '/assets/team/CaptainProfile.webp',
    socials: [{ label: 'GitHub', url: 'https://github.com/tainnnn' }] },
];

const GithubIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

function splitName(full) {
  const m = full.match(/^(.*?)\s*\((.+)\)\s*$/);
  const name = m ? m[1] : full;
  const nick = m ? m[2] : '';
  return { name, nick, initial: (nick || name).charAt(0).toUpperCase() };
}

function MemberCard({ m, i }) {
  const { t } = useI18n();
  const { name, nick, initial } = splitName(m.name);
  return (
    <article className="member" data-reveal style={{ '--i': i % 3 }}>
      <div className="member-photo">
        <span className="member-index" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
        <span className="member-initial" aria-hidden="true">{initial}</span>
        <img src={m.photo} alt={t('team.photoAlt', { name: m.name })} width="400" height="400" loading="lazy"
             onError={(e) => e.currentTarget.remove()} />
      </div>
      <div className="member-body">
        <h2 className="member-name">
          {name}
          {nick && <> <span className="member-nick">({nick})</span></>}
        </h2>
        <p className="member-id">{m.studentId}</p>
        <p className="member-role">{t(m.roleKey)}</p>
        <div className="member-socials">
          {m.socials.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
              {s.label === 'GitHub' && <GithubIcon />}
              {s.label}
            </a>
          ))}
        </div>
      </div>
    </article>
  );
}

// การ์ดโผล่ทีละใบตอนเลื่อนมาถึง (ตรรกะเดิมจาก setupReveal)
function useReveal(ref) {
  useEffect(() => {
    const items = ref.current.querySelectorAll('[data-reveal]');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-visible', 'is-done'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          entry.target.addEventListener('transitionend', () => entry.target.classList.add('is-done'), { once: true });
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ref]);
}

export default function TeamPage() {
  const { t } = useI18n();
  const listRef = useRef(null);
  useReveal(listRef);

  useEffect(() => {
    document.body.className = 'page-team';
    document.title = t('team.pageTitle');
  }, [t]);

  return (
    <main className="container">
      <header className="team-hero">
        <p className="team-eyebrow anim" style={{ '--d': 0 }}>Maison de Relic</p>
        <h1 className="anim" style={{ '--d': 1 }}>
          <span>{t('team.title1')}</span>
          <span className="accent">
            <span>{t('team.title2')}</span>
            <svg className="scribble" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true">
              <path d="M4 11C46 4 112 2 196 7" />
            </svg>
          </span>
        </h1>
        <p className="muted team-lede anim" style={{ '--d': 2 }}>{t('team.subtitle')}</p>
      </header>
      <div ref={listRef} className="team-grid">
        {MEMBERS.map((m, i) => <MemberCard key={m.studentId} m={m} i={i} />)}
      </div>
    </main>
  );
}
