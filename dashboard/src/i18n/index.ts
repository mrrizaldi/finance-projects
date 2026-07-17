import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import id from './locales/id/common.json';
import en from './locales/en/common.json';

export type Locale = 'id' | 'en';
export const LOCALES: Locale[] = ['id', 'en'];
const STORAGE_KEY = 'locale';

export function storedLocale(): Locale {
  if (typeof window === 'undefined') return 'id';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'en' || v === 'id' ? v : 'id';
}

// Sudah ada locale tersimpan di device ini? Kalau ya, jangan fetch profiles.locale
// dari DB lagi (locale = client state, sinkron dari localStorage). Cegah delay id→en
// tiap navigasi karena app-layout loader revalidate per-nav.
export function hasStoredLocale(): boolean {
  if (typeof window === 'undefined') return true;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'en' || v === 'id';
}

// Resources inline (no async backend) -> siap sinkron, useTranslation langsung dapat string.
i18n.use(initReactI18next).init({
  resources: {
    id: { common: id },
    en: { common: en },
  },
  lng: storedLocale(),
  fallbackLng: 'id',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

// Ganti bahasa + persist. Dipakai toggle settings & bootstrap dari profiles.locale.
export function setLocale(locale: Locale) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, locale);
  if (i18n.language !== locale) i18n.changeLanguage(locale);
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

export default i18n;
