import { fr } from './fr';
import { en } from './en';

export const translations = {
  fr,
  en,
} as const;

export type Language = keyof typeof translations;
export type TranslationKeys = typeof fr;
