import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import fr from './locales/fr.json';

export const LANGUAGE_KEY = 'bizik.language';
export const LANGUAGES = ['en', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Saved choice wins; otherwise English. Read synchronously so the first client
 *  render is already in the right language. */
function initialLanguage(): Language {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(LANGUAGE_KEY);
    if (saved === 'en' || saved === 'fr') return saved;
  }
  return 'en';
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    lng: initialLanguage(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

/** Switch language everywhere and remember the choice. */
export function setAppLanguage(language: Language) {
  void i18n.changeLanguage(language);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LANGUAGE_KEY, language);
  }
}

export default i18n;
