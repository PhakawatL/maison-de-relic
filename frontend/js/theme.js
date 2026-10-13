// โหมดมืด / สว่าง ของทั้งเว็บ
// ธีมเก็บไว้ที่ <html data-theme="light|dark"> — CSS เปลี่ยนสีจากตัวแปรใน [data-theme='dark']
// ถ้าผู้ใช้ยังไม่เคยกดเลือก จะใช้ตามที่ตั้งไว้ในเครื่อง (prefers-color-scheme) และเปลี่ยนตามเครื่องอัตโนมัติ

const STORAGE_KEY = 'mdr_theme';
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function getTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

export function initTheme() {
  apply(readStored() || (systemDark.matches ? 'dark' : 'light'));
  systemDark.addEventListener('change', (event) => {
    if (!readStored()) apply(event.matches ? 'dark' : 'light');
  });
}

/**
 * สลับธีม — ถ้าเบราว์เซอร์รองรับ View Transitions จะเปิดธีมใหม่เป็นวงกลมกระจายออกจากปุ่มที่กด
 * @param {HTMLElement} [origin] ปุ่มที่กด (ใช้เป็นจุดศูนย์กลางของวงกลม)
 */
export function toggleTheme(origin) {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  const commit = () => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    apply(next);
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduceMotion || !origin) {
    commit();
    return;
  }

  const rect = origin.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

  const transition = document.startViewTransition(commit);
  transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' }
    );
  });
}
