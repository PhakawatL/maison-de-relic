'use client';
// ระบบสลับภาษา TH / EN (แปลงจาก js/i18n.js) — ใช้ React context แทน data-i18n + applyI18n()
//   const { t, lang, setLang } = useI18n();
//   <h1>{t('team.title1')}</h1>
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import th from './locales/th.js';
import en from './locales/en.js';

const STORAGE_KEY = 'mdr_lang';
export const LANGS = ['th', 'en'];
const messages = { th, en };

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState('th');

  // อ่านภาษาที่เคยเลือกหลังโหลดหน้า (ตอน build ไม่มี localStorage)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (LANGS.includes(saved)) setLangState(saved);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.classList.remove('i18n-pending');
  }, [lang]);

  const setLang = useCallback((next) => {
    if (!LANGS.includes(next)) return;
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const t = useCallback(
    (key, vars = {}) => {
      const text = messages[lang]?.[key] ?? messages.th[key] ?? key;
      return text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
    },
    [lang]
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
