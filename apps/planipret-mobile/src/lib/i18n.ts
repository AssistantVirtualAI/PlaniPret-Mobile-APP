import { translations, Language } from '@/locales';

// Get the current language from localStorage or default to English
function getCurrentLanguage(): Language {
  const stored = localStorage.getItem('ava-language');
  if (stored && (stored === 'en' || stored === 'fr')) {
    return stored;
  }
  return 'en';
}

// Get a nested value from an object using a dot-separated path
function getNestedValue(obj: any, path: string): string {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj) || path;
}

// Translate a key to the current language
export function t(path: string): string {
  const language = getCurrentLanguage();
  const value = getNestedValue(translations[language], path);
  return typeof value === 'string' ? value : path;
}

// Export for external use
export { getCurrentLanguage };
