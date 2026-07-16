import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { 
  Palette, 
  Upload, 
  Users, 
  Bot, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft,
  Sparkles,
  X
} from 'lucide-react';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useOrganization } from '@/context/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/useTranslation';

const COLOR_PRESETS = [
  { name: 'Violet', value: '#8B5CF6' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Green', value: '#10B981' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Orange', value: '#F97316' },
];

export function WelcomeModal() {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showWelcomeModal, currentStep, setCurrentStep, completeOnboarding, skipOnboarding } = useOnboarding();
  const { selectedOrg, selectedOrgId, refreshOrganization } = useOrganization();
  
  const [primaryColor, setPrimaryColor] = useState('#8B5CF6');
  const [logoUrl, setLogoUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  // Client form
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientLanguage, setClientLanguage] = useState('fr');
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  
  // Agent form
  const [agentPlatform, setAgentPlatform] = useState('elevenlabs');
  const [agentName, setAgentName] = useState('');
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);

  const STEPS = [
    { id: 1, title: language === 'fr' ? 'Bienvenue' : 'Welcome', icon: Sparkles },
    { id: 2, title: language === 'fr' ? 'Apparence' : 'Appearance', icon: Palette },
    { id: 3, title: language === 'fr' ? 'Premier Client' : 'First Client', icon: Users },
    { id: 4, title: language === 'fr' ? 'Premier Agent' : 'First Agent', icon: Bot },
  ];

  const progress = (currentStep / STEPS.length) * 100;

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOrgId) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${selectedOrgId}/logo.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('organization-assets')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('organization-assets')
        .getPublicUrl(fileName);

      setLogoUrl(publicUrl);
      toast.success(language === 'fr' ? 'Logo téléchargé !' : 'Logo uploaded!');
    } catch (error: any) {
      toast.error(error.message || t('messages.unknownError'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveAppearance = async () => {
    if (!selectedOrgId) return;

    try {
      const updates: Record<string, any> = { primary_color: primaryColor };
      if (logoUrl) updates.logo_dashboard_url = logoUrl;

      const { error } = await (supabase
        .from('organizations') as any)
        .update(updates)
        .eq('id', selectedOrgId);


      if (error) throw error;
      
      await refreshOrganization();
      toast.success(t('messages.saveSuccess'));
      setCurrentStep(3);
    } catch (error: any) {
      toast.error(error.message || t('messages.saveError'));
    }
  };

  const handleCreateClient = async () => {
    if (!clientName.trim() || !clientEmail.trim() || !selectedOrgId) {
      toast.error(t('messages.requiredFields'));
      return;
    }

    setIsCreatingClient(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('messages.notAuthenticated'));

      const username = clientName.toLowerCase().replace(/[^a-z0-9]/g, '');

      const { data, error } = await supabase
        .from('clients')
        .insert({
          organization_id: selectedOrgId,
          name: clientName,
          email: clientEmail,
          username,
          login_id: username,
          language: clientLanguage,
          status: 'active',
          created_by: user.id,
        })
        .select('id')
        .single();

      if (error) throw error;

      setCreatedClientId(data.id);
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(t('messages.createSuccess'));
      setCurrentStep(4);
    } catch (error: any) {
      toast.error(error.message || t('messages.createError'));
    } finally {
      setIsCreatingClient(false);
    }
  };

  const handleCreateAgent = async () => {
    if (!agentName.trim() || !selectedOrgId) {
      toast.error(t('messages.requiredFields'));
      return;
    }

    setIsCreatingAgent(true);
    try {
      const { error } = await supabase
        .from('agents')
        .insert({
          organization_id: selectedOrgId,
          name: agentName,
          platform: agentPlatform,
          is_external: true,
          client_id: createdClientId,
        });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success(t('messages.agentCreated'));
      await completeOnboarding();
      navigate('/agents');
    } catch (error: any) {
      toast.error(error.message || t('messages.agentCreateError'));
    } finally {
      setIsCreatingAgent(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="text-center space-y-6 py-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent mx-auto flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-bold mb-2">
                {language === 'fr' ? 'Bienvenue sur AVA Statistics !' : 'Welcome to AVA Statistics!'}
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {language === 'fr' 
                  ? 'Configurons votre agence en quelques étapes simples. Vous pourrez personnaliser votre plateforme, créer votre premier client et configurer votre premier agent IA.'
                  : 'Let\'s set up your agency in a few simple steps. You can customize your platform, create your first client, and configure your first AI agent.'}
              </p>
            </div>
            <div className="bg-accent/10 rounded-lg p-4 text-sm text-muted-foreground">
              <p>🎉 {language === 'fr' ? 'Votre essai gratuit de' : 'Your free'} <strong>7 {language === 'fr' ? 'jours' : 'day'}</strong> {language === 'fr' ? 'est activé !' : 'trial is activated!'}</p>
            </div>
            <Button onClick={() => setCurrentStep(2)} className="gap-2">
              {language === 'fr' ? 'Commencer' : 'Get Started'}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label>{language === 'fr' ? 'Logo de l\'agence' : 'Agency Logo'}</Label>
                <div className="mt-2 flex items-center gap-4">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-16 h-16 rounded-lg object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                      <Upload className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={isUploading}
                    />
                    <Button variant="outline" size="sm" asChild disabled={isUploading}>
                      <span>{isUploading ? (language === 'fr' ? 'Téléchargement...' : 'Uploading...') : (language === 'fr' ? 'Choisir un fichier' : 'Choose a file')}</span>
                    </Button>
                  </label>
                </div>
              </div>

              <div>
                <Label>{language === 'fr' ? 'Couleur principale' : 'Primary Color'}</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => setPrimaryColor(color.value)}
                      className={`w-10 h-10 rounded-lg transition-all ${
                        primaryColor === color.value 
                          ? 'ring-2 ring-offset-2 ring-primary scale-110' 
                          : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCurrentStep(1)} className="flex-1">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {language === 'fr' ? 'Retour' : 'Back'}
              </Button>
              <Button onClick={handleSaveAppearance} className="flex-1">
                {language === 'fr' ? 'Continuer' : 'Continue'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              {language === 'fr' 
                ? 'Créez votre premier client. Il aura accès à un portail dédié pour voir ses conversations et analytics.'
                : 'Create your first client. They will have access to a dedicated portal to view their conversations and analytics.'}
            </p>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="clientName">{language === 'fr' ? 'Nom du client' : 'Client Name'} *</Label>
                <Input
                  id="clientName"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder={language === 'fr' ? 'Ex: Entreprise ABC' : 'E.g., ABC Company'}
                />
              </div>

              <div>
                <Label htmlFor="clientEmail">Email *</Label>
                <Input
                  id="clientEmail"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder={language === 'fr' ? 'contact@entreprise.com' : 'contact@company.com'}
                />
              </div>

              <div>
                <Label htmlFor="clientLanguage">{language === 'fr' ? 'Langue' : 'Language'}</Label>
                <Select value={clientLanguage} onValueChange={setClientLanguage}>
                  <SelectTrigger id="clientLanguage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCurrentStep(2)} className="flex-1">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {language === 'fr' ? 'Retour' : 'Back'}
              </Button>
              <Button 
                onClick={handleCreateClient} 
                disabled={isCreatingClient || !clientName.trim() || !clientEmail.trim()}
                className="flex-1"
              >
                {isCreatingClient ? (language === 'fr' ? 'Création...' : 'Creating...') : (language === 'fr' ? 'Créer le client' : 'Create Client')}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              {language === 'fr' 
                ? 'Dernière étape ! Créez votre premier agent IA. Vous pourrez le configurer en détail ensuite.'
                : 'Last step! Create your first AI agent. You can configure it in detail later.'}
            </p>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="agentPlatform">{language === 'fr' ? 'Plateforme' : 'Platform'}</Label>
                <Select value={agentPlatform} onValueChange={setAgentPlatform}>
                  <SelectTrigger id="agentPlatform">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                    <SelectItem value="vapi">Vapi</SelectItem>
                    <SelectItem value="retell">Retell AI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="agentName">{language === 'fr' ? 'Nom de l\'agent' : 'Agent Name'} *</Label>
                <Input
                  id="agentName"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder={language === 'fr' ? 'Ex: Assistant Vocal ABC' : 'E.g., ABC Voice Assistant'}
                />
              </div>

              {createdClientId && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-accent/10 p-3 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>{language === 'fr' ? 'Sera assigné au client:' : 'Will be assigned to client:'} <strong>{clientName}</strong></span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCurrentStep(3)} className="flex-1">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {language === 'fr' ? 'Retour' : 'Back'}
              </Button>
              <Button 
                onClick={handleCreateAgent} 
                disabled={isCreatingAgent || !agentName.trim()}
                className="flex-1"
              >
                {isCreatingAgent ? (language === 'fr' ? 'Création...' : 'Creating...') : (language === 'fr' ? 'Terminer' : 'Finish')}
                <CheckCircle2 className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (!showWelcomeModal) return null;

  return (
    <Dialog open={showWelcomeModal} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              {STEPS[currentStep - 1]?.icon && (
                <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  {(() => {
                    const Icon = STEPS[currentStep - 1].icon;
                    return <Icon className="w-4 h-4 text-primary" />;
                  })()}
                </span>
              )}
              {STEPS[currentStep - 1]?.title}
            </DialogTitle>
            <Button variant="ghost" size="sm" onClick={skipOnboarding}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <DialogDescription className="sr-only">
            {language === 'fr' ? 'Étape' : 'Step'} {currentStep} {language === 'fr' ? 'sur' : 'of'} {STEPS.length}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{language === 'fr' ? 'Étape' : 'Step'} {currentStep}/{STEPS.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="py-4">
          {renderStep()}
        </div>

        <div className="flex items-center justify-center gap-1.5">
          {STEPS.map((step) => (
            <div
              key={step.id}
              className={`w-2 h-2 rounded-full transition-colors ${
                step.id === currentStep
                  ? 'bg-primary'
                  : step.id < currentStep
                  ? 'bg-primary/50'
                  : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}