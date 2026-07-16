import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Languages, Save, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';

const defaultTranslations = {
  fr: {
    dashboard: 'Tableau de bord',
    conversations: 'Conversations',
    analytics: 'Analytiques',
    agents: 'Agents',
    clients: 'Clients',
    settings: 'Paramètres',
    logout: 'Déconnexion',
  },
  en: {
    dashboard: 'Dashboard',
    conversations: 'Conversations',
    analytics: 'Analytics',
    agents: 'Agents',
    clients: 'Clients',
    settings: 'Settings',
    logout: 'Logout',
  },
  es: {
    dashboard: 'Panel',
    conversations: 'Conversaciones',
    analytics: 'Analíticas',
    agents: 'Agentes',
    clients: 'Clientes',
    settings: 'Configuración',
    logout: 'Cerrar sesión',
  },
  de: {
    dashboard: 'Dashboard',
    conversations: 'Gespräche',
    analytics: 'Analytik',
    agents: 'Agenten',
    clients: 'Kunden',
    settings: 'Einstellungen',
    logout: 'Abmelden',
  },
};

const languages = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
];

export function TranslationTab() {
  const { t, language: currentLang } = useTranslation();
  type LangCode = 'fr' | 'en' | 'es' | 'de';
  const [selectedLang, setSelectedLang] = useState<LangCode>(currentLang as LangCode);
  const [translations, setTranslations] = useState(defaultTranslations);
  const [newKey, setNewKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const currentTranslations = translations[selectedLang as keyof typeof translations] || {};

  const handleTranslationChange = (key: string, value: string) => {
    setTranslations((prev) => ({
      ...prev,
      [selectedLang]: {
        ...prev[selectedLang as keyof typeof prev],
        [key]: value,
      },
    }));
  };

  const handleAddKey = () => {
    if (!newKey.trim()) return;
    
    const keyName = newKey.toLowerCase().replace(/\s+/g, '_');
    
    // Add to all languages
    setTranslations((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((lang) => {
        updated[lang as keyof typeof updated] = {
          ...updated[lang as keyof typeof updated],
          [keyName]: '',
        };
      });
      return updated;
    });
    
    setNewKey('');
    toast.success(t('messages.createSuccess'));
  };

  const handleDeleteKey = (key: string) => {
    setTranslations((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((lang) => {
        const langTranslations = { ...updated[lang as keyof typeof updated] };
        delete langTranslations[key as keyof typeof langTranslations];
        updated[lang as keyof typeof updated] = langTranslations;
      });
      return updated;
    });
    toast.success(t('messages.deleteSuccess'));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Here you would save to Supabase
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.success(t('messages.saveSuccess'));
    } catch (error) {
      toast.error(t('messages.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Languages className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle>{currentLang === 'fr' ? 'Personnalisation des traductions' : 'Translation Customization'}</CardTitle>
              <CardDescription>{currentLang === 'fr' ? 'Adaptez les textes de l\'interface à votre marque' : 'Adapt interface texts to your brand'}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Language Selector */}
          <div className="flex items-center gap-4">
            <Label>{currentLang === 'fr' ? 'Langue :' : 'Language:'}</Label>
            <div className="flex gap-2">
              {languages.map((lang) => (
                <Button
                  key={lang.code}
                  variant={selectedLang === lang.code ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedLang(lang.code as LangCode)}
                  className="gap-2"
                >
                  <span>{lang.flag}</span>
                  {lang.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Add New Key */}
          <div className="flex gap-2">
            <Input
              placeholder={currentLang === 'fr' ? 'Nouvelle clé (ex: welcome_message)' : 'New key (e.g., welcome_message)'}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleAddKey} disabled={!newKey.trim()}>
              <Plus className="w-4 h-4 mr-2" />
              {t('common.add')}
            </Button>
          </div>

          {/* Translations List */}
          <div className="space-y-4">
            {Object.entries(currentTranslations).map(([key, value]) => (
              <div key={key} className="flex items-center gap-4">
                <Badge variant="outline" className="min-w-[150px] font-mono text-xs">
                  {key}
                </Badge>
                <Input
                  value={value as string}
                  onChange={(e) => handleTranslationChange(key, e.target.value)}
                  className="flex-1 bg-background/50"
                  placeholder={`${currentLang === 'fr' ? 'Traduction pour' : 'Translation for'} "${key}"`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteKey(key)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? t('common.loading') : t('common.save')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}