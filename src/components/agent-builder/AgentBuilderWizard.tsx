import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  MessageSquare,
  Settings,
  Rocket,
  Check,
  Lightbulb,
  Wand2,
} from 'lucide-react';
import { AgentTemplates, AgentTemplate, AGENT_TEMPLATES } from './AgentTemplates';
import { AgentBuilderConfig } from '@/hooks/useAgentBuilder';

interface AgentBuilderWizardProps {
  config: AgentBuilderConfig;
  agentName: string;
  onConfigChange: (updates: Partial<AgentBuilderConfig>) => void;
  onAgentNameChange: (name: string) => void;
  onComplete: () => void;
  isSaving: boolean;
}

const WIZARD_STEPS = [
  { id: 1, title: 'Template', icon: Sparkles, description: 'Choose a starting point' },
  { id: 2, title: 'Personality', icon: MessageSquare, description: 'Define the behavior' },
  { id: 3, title: 'Welcome message', icon: MessageSquare, description: 'First contact' },
  { id: 4, title: 'Settings', icon: Settings, description: 'Fine-tune settings' },
  { id: 5, title: 'Deploy', icon: Rocket, description: 'Go live' },
];

export function AgentBuilderWizard({
  config,
  agentName,
  onConfigChange,
  onAgentNameChange,
  onComplete,
  isSaving,
}: AgentBuilderWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);

  const progress = (currentStep / WIZARD_STEPS.length) * 100;

  const handleTemplateSelect = (template: AgentTemplate) => {
    setSelectedTemplate(template);
    if (template.id !== 'blank') {
      onConfigChange({
        systemPrompt: template.systemPrompt,
        firstMessage: template.firstMessage,
        temperature: template.temperature,
        maxTokens: template.maxTokens,
      });
      if (!agentName) {
        onAgentNameChange(template.name);
      }
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return selectedTemplate !== null;
      case 2:
        return config.systemPrompt.trim().length > 0;
      case 3:
        return true; // First message is optional
      case 4:
        return agentName.trim().length > 0;
      case 5:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < WIZARD_STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Choisissez un template</h2>
              <p className="text-muted-foreground">
                Sélectionnez un template pré-configuré ou commencez de zéro
              </p>
            </div>
            <AgentTemplates
              onSelectTemplate={handleTemplateSelect}
              selectedTemplateId={selectedTemplate?.id}
            />
          </div>
        );

      case 2:
        return (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Définissez la personnalité</h2>
              <p className="text-muted-foreground">
                Le System Prompt définit comment votre agent se comporte et répond
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-primary" />
                  System Prompt
                </CardTitle>
                <CardDescription>
                  Décrivez le rôle, le ton et les instructions de votre agent
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={config.systemPrompt}
                  onChange={(e) => onConfigChange({ systemPrompt: e.target.value })}
                  placeholder="Tu es un assistant virtuel..."
                  className="min-h-[200px] resize-none"
                />
                <div className="flex justify-between items-center text-sm text-muted-foreground">
                  <span>{config.systemPrompt.length} caractères</span>
                  <span className="flex items-center gap-1">
                    <Lightbulb className="h-4 w-4" />
                    Conseil : Soyez précis et détaillé
                  </span>
                </div>

                {selectedTemplate && selectedTemplate.id !== 'blank' && (
                  <div className="p-3 rounded-lg bg-muted/50 text-sm">
                    <span className="font-medium">Template utilisé :</span> {selectedTemplate.name}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Message d'accueil</h2>
              <p className="text-muted-foreground">
                C'est la première chose que vos utilisateurs verront
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  Premier message
                </CardTitle>
                <CardDescription>
                  Un message chaleureux pour accueillir vos visiteurs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={config.firstMessage}
                  onChange={(e) => onConfigChange({ firstMessage: e.target.value })}
                  placeholder="Bonjour ! Comment puis-je vous aider ?"
                  className="min-h-[120px] resize-none"
                />

                {/* Preview */}
                <div className="mt-4">
                  <Label className="text-sm text-muted-foreground mb-2 block">Aperçu</Label>
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="h-4 w-4 text-primary-foreground" />
                      </div>
                      <div className="bg-background rounded-lg p-3 shadow-sm border max-w-[80%]">
                        <p className="text-sm">
                          {config.firstMessage || 'Votre message d\'accueil apparaîtra ici...'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Advanced Settings</h2>
              <p className="text-muted-foreground">
                Fine-tune your agent behavior
              </p>
            </div>

            <Card>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="agentName">Nom de l'agent *</Label>
                  <Input
                    id="agentName"
                    value={agentName}
                    onChange={(e) => onAgentNameChange(e.target.value)}
                    placeholder="Mon agent"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label>Température : {config.temperature}</Label>
                    <Badge variant="secondary">
                      {config.temperature < 0.4 ? 'Précis' : config.temperature < 0.7 ? 'Équilibré' : 'Créatif'}
                    </Badge>
                  </div>
                  <Slider
                    value={[config.temperature]}
                    onValueChange={([v]) => onConfigChange({ temperature: v })}
                    min={0}
                    max={1}
                    step={0.1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Une valeur basse donne des réponses plus cohérentes, une valeur haute plus de créativité.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label>Longueur max : {config.maxTokens} tokens</Label>
                    <Badge variant="secondary">
                      {config.maxTokens < 100 ? 'Court' : config.maxTokens < 200 ? 'Moyen' : 'Long'}
                    </Badge>
                  </div>
                  <Slider
                    value={[config.maxTokens]}
                    onValueChange={([v]) => onConfigChange({ maxTokens: v })}
                    min={50}
                    max={500}
                    step={10}
                  />
                  <p className="text-xs text-muted-foreground">
                    Contrôle la longueur maximale des réponses de l'agent.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 mb-4">
                <Rocket className="h-8 w-8 text-primary-foreground" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Prêt à déployer !</h2>
              <p className="text-muted-foreground">
                Votre agent est configuré et prêt à être mis en ligne
              </p>
            </div>

            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">Récapitulatif</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">Nom</span>
                    <span className="font-medium">{agentName || 'Non défini'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">Template</span>
                    <span className="font-medium">{selectedTemplate?.name || 'Personnalisé'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">System Prompt</span>
                    <Badge variant={config.systemPrompt ? 'default' : 'destructive'}>
                      {config.systemPrompt ? 'Configuré' : 'Non défini'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">Message d'accueil</span>
                    <Badge variant={config.firstMessage ? 'default' : 'secondary'}>
                      {config.firstMessage ? 'Configuré' : 'Optionnel'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">Température</span>
                    <span className="font-medium">{config.temperature}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button
              size="lg"
              className="w-full"
              onClick={onComplete}
              disabled={isSaving || !agentName}
            >
              {isSaving ? (
                'Déploiement en cours...'
              ) : (
                <>
                  <Rocket className="mr-2 h-5 w-5" />
                  Déployer l'agent
                </>
              )}
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Progress Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {WIZARD_STEPS.map((step, index) => {
                const StepIcon = step.icon;
                const isActive = step.id === currentStep;
                const isCompleted = step.id < currentStep;

                return (
                  <div key={step.id} className="flex items-center">
                    <div
                      className={`flex items-center justify-center h-10 w-10 rounded-full transition-all ${
                        isCompleted
                          ? 'bg-primary text-primary-foreground'
                          : isActive
                          ? 'bg-primary/20 text-primary ring-2 ring-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <StepIcon className="h-5 w-5" />
                      )}
                    </div>
                    {index < WIZARD_STEPS.length - 1 && (
                      <div
                        className={`w-8 h-0.5 mx-1 ${
                          isCompleted ? 'bg-primary' : 'bg-muted'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-right">
              <p className="font-medium">{WIZARD_STEPS[currentStep - 1].title}</p>
              <p className="text-sm text-muted-foreground">
                Étape {currentStep} sur {WIZARD_STEPS.length}
              </p>
            </div>
          </div>
          <Progress value={progress} className="h-1" />
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-auto py-8 px-6">
        <div className="max-w-5xl mx-auto">{renderStepContent()}</div>
      </div>

      {/* Navigation Footer */}
      <div className="border-t bg-card/50 backdrop-blur-sm sticky bottom-0">
        <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 1}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Précédent
          </Button>

          {currentStep < WIZARD_STEPS.length && (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Suivant
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
