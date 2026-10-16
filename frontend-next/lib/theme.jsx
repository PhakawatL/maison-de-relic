'use client';
// โหมดมืด / สว่าง (แปลงจาก js/theme.js) — ตรรกะเดิมเกือบทั้งหมด ต่างแค่ห้ามแตะ window ตอน import
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'mdr_theme';

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

const current = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

export function useTheme() {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (next) => {
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    apply(readStored() || (systemDark.matches ? 'dark' : 'light'));
    const onChange = (e) => !readStored() && apply(e.matches ? 'dark' : 'light');
    systemDark.addEventListener('change', onChange);
    return () => systemDark.removeEventListener('change', onChange);
  }, []);

  function toggle(origin) {
    const next = current() === 'dark' ? 'light' : 'dark';
    const commit = () => {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduceMotion || !origin) return commit();

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

  return { theme, toggle };
}
