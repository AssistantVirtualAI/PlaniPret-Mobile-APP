import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/context/LanguageContext';
import { useTranslation } from '@/hooks/useTranslation';

export const SUPPORTED_LANGUAGES = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
] as const;

interface LanguageSelectorProps {
  variant?: 'select' | 'buttons' | 'dropdown';
  showLabel?: boolean;
  className?: string;
}

export const LanguageSelector = ({ 
  variant = 'select', 
  showLabel = true,
  className 
}: LanguageSelectorProps) => {
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();

  const handleLanguageChange = async (lang: string) => {
    setLanguage(lang as 'fr' | 'en');
    
    // Save to profile if user is logged in
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({ locale: lang })
        .eq('id', user.id);
    }
    // No reload needed - React context handles the update
  };

  if (variant === 'buttons') {
    return (
      <div className={className}>
        {showLabel && (
          <p className="text-sm font-medium mb-2">{t('settings.language')}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <Button
              key={lang.code}
              variant={language === lang.code ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleLanguageChange(lang.code)}
              className="gap-2"
            >
              <span>{lang.flag}</span>
              <span>{lang.name}</span>
            </Button>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'dropdown') {
    return (
      <Select value={language} onValueChange={handleLanguageChange}>
        <SelectTrigger className={className || "w-[50px]"}>
          <span className="text-lg">
            {SUPPORTED_LANGUAGES.find(l => l.code === language)?.flag || '🌐'}
          </span>
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              <span className="flex items-center gap-2">
                <span>{lang.flag}</span>
                <span>{lang.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className={className}>
      {showLabel && (
        <p className="text-sm font-medium mb-2 flex items-center gap-2">
          <Globe className="h-4 w-4" />
          {t('settings.language')}
        </p>
      )}
      <Select value={language} onValueChange={handleLanguageChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t('settings.selectLanguage')} />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              <span className="flex items-center gap-2">
                <span>{lang.flag}</span>
                <span>{lang.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
