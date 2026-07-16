import { useLanguage } from '@/context/LanguageContext';
import { translations, TranslationKeys } from '@/locales';

type PathsToStringProps<T> = T extends string
  ? []
  : {
      [K in Extract<keyof T, string>]: [K, ...PathsToStringProps<T[K]>];
    }[Extract<keyof T, string>];

type Join<T extends string[], D extends string> = T extends []
  ? never
  : T extends [infer F]
  ? F
  : T extends [infer F, ...infer R]
  ? F extends string
    ? `${F}${D}${Join<Extract<R, string[]>, D>}`
    : never
  : string;

type TranslationPath = Join<PathsToStringProps<TranslationKeys>, '.'>;

function getNestedValue(obj: any, path: string): string {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj) || path;
}

export const useTranslation = () => {
  const { language } = useLanguage();

  const t = (path: TranslationPath | string): string => {
    const value = getNestedValue(translations[language], path);
    return typeof value === 'string' ? value : path;
  };

  return { t, language };
};
