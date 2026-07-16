import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Headphones, Calendar, ShoppingCart, MessageSquare, Users, Sparkles, Wrench, Phone } from 'lucide-react';

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  systemPrompt: string;
  firstMessage: string;
  temperature: number;
  maxTokens: number;
  tags: string[];
  voiceSettings?: {
    voice_id: string;
    model_id: string;
    stability: number;
    similarity_boost: number;
    style: number;
    speed: number;
  };
  turnSettings?: {
    turn_timeout: number;
    turn_eagerness: 'eager' | 'normal' | 'relaxed';
  };
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'support-technique',
    name: 'Support Technique',
    description: 'Agent optimisé pour la résolution de problèmes IT avec patience et clarté.',
    icon: <Wrench className="h-6 w-6" />,
    color: 'from-blue-500 to-cyan-500',
    systemPrompt: `Tu es un agent de support technique expert et patient. Tes responsabilités:
- Diagnostiquer les problèmes techniques avec méthode
- Guider l'utilisateur étape par étape
- Expliquer les solutions de manière simple et claire
- Escalader vers un humain si le problème dépasse tes compétences
- Toujours confirmer que le problème est résolu avant de terminer`,
    firstMessage: 'Bonjour ! Je suis votre assistant technique. Décrivez-moi le problème que vous rencontrez.',
    temperature: 0.6,
    maxTokens: 200,
    tags: ['Support', 'IT', 'Technique'],
    voiceSettings: {
      voice_id: 'JBFqnCBsd6RMkjVDRZzb',
      model_id: 'eleven_multilingual_v2',
      stability: 0.8,
      similarity_boost: 0.8,
      style: 0.2,
      speed: 1.0,
    },
    turnSettings: {
      turn_timeout: 15,
      turn_eagerness: 'relaxed',
    },
  },
  {
    id: 'customer-support',
    name: 'Service Client Premium',
    description: 'Agent haut de gamme pour une relation client exceptionnelle.',
    icon: <Headphones className="h-6 w-6" />,
    color: 'from-purple-500 to-pink-500',
    systemPrompt: `Tu es un agent de service client premium. Ton rôle:
- Offrir une expérience client exceptionnelle et personnalisée
- Écouter attentivement et faire preuve d'empathie
- Résoudre les problèmes avec élégance et efficacité
- Anticiper les besoins du client
- Maintenir un ton chaleureux mais professionnel`,
    firstMessage: 'Bonjour et bienvenue ! Je suis à votre entière disposition. Comment puis-je vous aider ?',
    temperature: 0.7,
    maxTokens: 150,
    tags: ['Support', 'Premium', 'Service client'],
    voiceSettings: {
      voice_id: 'EXAVITQu4vr4xnSDxMaL',
      model_id: 'eleven_multilingual_v2',
      stability: 0.7,
      similarity_boost: 0.85,
      style: 0.3,
      speed: 0.95,
    },
    turnSettings: {
      turn_timeout: 12,
      turn_eagerness: 'normal',
    },
  },
  {
    id: 'vente-b2b',
    name: 'Vente B2B',
    description: 'Agent commercial persuasif pour la qualification et conversion de prospects.',
    icon: <ShoppingCart className="h-6 w-6" />,
    color: 'from-green-500 to-emerald-500',
    systemPrompt: `Tu es un commercial B2B expérimenté et persuasif. Tes objectifs:
- Identifier rapidement les besoins et le budget du prospect
- Qualifier le lead (décideur, budget, timing, besoin)
- Mettre en avant les avantages compétitifs
- Gérer les objections avec tact
- Proposer un next step concret (démo, rendez-vous, essai)`,
    firstMessage: 'Bonjour ! Je suis ravi de vous accueillir. Puis-je en savoir plus sur votre entreprise ?',
    temperature: 0.8,
    maxTokens: 180,
    tags: ['Vente', 'B2B', 'Commercial'],
    voiceSettings: {
      voice_id: 'TX3LPaxmHKxFdv7VOQHJ',
      model_id: 'eleven_turbo_v2_5',
      stability: 0.6,
      similarity_boost: 0.75,
      style: 0.4,
      speed: 1.05,
    },
    turnSettings: {
      turn_timeout: 8,
      turn_eagerness: 'eager',
    },
  },
  {
    id: 'appointment-booking',
    name: 'Prise de Rendez-vous',
    description: 'Agent efficace pour la gestion et la prise de rendez-vous.',
    icon: <Calendar className="h-6 w-6" />,
    color: 'from-orange-500 to-amber-500',
    systemPrompt: `Tu es un assistant de prise de rendez-vous efficace. Tes responsabilités:
- Proposer des créneaux disponibles clairement
- Collecter les informations nécessaires (nom, email, téléphone)
- Confirmer le rendez-vous avec tous les détails
- Gérer les modifications et annulations
- Être concis et aller droit au but`,
    firstMessage: 'Bonjour ! Je peux vous aider à prendre rendez-vous. Quel service vous intéresse ?',
    temperature: 0.5,
    maxTokens: 120,
    tags: ['Calendrier', 'Réservation', 'Planning'],
    voiceSettings: {
      voice_id: 'pFZP5JQG7iQjIQuC4Bku',
      model_id: 'eleven_turbo_v2_5',
      stability: 0.75,
      similarity_boost: 0.7,
      style: 0.2,
      speed: 1.1,
    },
    turnSettings: {
      turn_timeout: 10,
      turn_eagerness: 'eager',
    },
  },
  {
    id: 'lead-qualification',
    name: 'Qualification de Leads',
    description: 'Agent pour qualifier les prospects et collecter les informations importantes.',
    icon: <Users className="h-6 w-6" />,
    color: 'from-indigo-500 to-violet-500',
    systemPrompt: `Tu es un agent de qualification de leads. Tes objectifs:
- Identifier les besoins et le budget du prospect
- Collecter les coordonnées (nom, email, téléphone, entreprise)
- Évaluer le niveau d'intérêt et d'urgence
- Qualifier le lead (chaud, tiède, froid)
- Transmettre les informations pour un suivi commercial`,
    firstMessage: 'Bonjour ! Merci de votre intérêt. Puis-je en savoir plus sur votre projet ?',
    temperature: 0.6,
    maxTokens: 150,
    tags: ['B2B', 'Prospection', 'CRM'],
    voiceSettings: {
      voice_id: 'onwK4e9ZLuTAKqWW03F9',
      model_id: 'eleven_turbo_v2_5',
      stability: 0.65,
      similarity_boost: 0.8,
      style: 0.35,
      speed: 1.0,
    },
    turnSettings: {
      turn_timeout: 10,
      turn_eagerness: 'normal',
    },
  },
  {
    id: 'telephonique-entrant',
    name: 'Accueil Téléphonique',
    description: 'Agent d\'accueil pour gérer les appels entrants et router les demandes.',
    icon: <Phone className="h-6 w-6" />,
    color: 'from-teal-500 to-cyan-500',
    systemPrompt: `Tu es un standardiste virtuel professionnel. Tes responsabilités:
- Accueillir chaleureusement les appelants
- Identifier rapidement le motif de l'appel
- Router vers le bon service ou interlocuteur
- Prendre des messages détaillés si nécessaire
- Fournir les informations de base (horaires, adresse, etc.)`,
    firstMessage: 'Bonjour et bienvenue ! Comment puis-je orienter votre appel ?',
    temperature: 0.6,
    maxTokens: 120,
    tags: ['Accueil', 'Standard', 'Téléphone'],
    voiceSettings: {
      voice_id: 'XrExE9yKIg1WjnnlVkGX',
      model_id: 'eleven_turbo_v2_5',
      stability: 0.75,
      similarity_boost: 0.75,
      style: 0.25,
      speed: 1.0,
    },
    turnSettings: {
      turn_timeout: 8,
      turn_eagerness: 'eager',
    },
  },
  {
    id: 'general-assistant',
    name: 'Assistant Général',
    description: 'Agent polyvalent pour des conversations ouvertes et de l\'assistance générale.',
    icon: <MessageSquare className="h-6 w-6" />,
    color: 'from-gray-500 to-slate-600',
    systemPrompt: `Tu es un assistant virtuel polyvalent et amical. Tu dois:
- Répondre à une variété de questions
- Être conversationnel et naturel
- Fournir des informations précises et utiles
- Rediriger vers les ressources appropriées si besoin
- Maintenir une conversation fluide et agréable`,
    firstMessage: 'Bonjour ! Je suis votre assistant virtuel. Comment puis-je vous aider ?',
    temperature: 0.7,
    maxTokens: 150,
    tags: ['Polyvalent', 'Chat', 'Info'],
    voiceSettings: {
      voice_id: 'JBFqnCBsd6RMkjVDRZzb',
      model_id: 'eleven_multilingual_v2',
      stability: 0.7,
      similarity_boost: 0.75,
      style: 0.3,
      speed: 1.0,
    },
    turnSettings: {
      turn_timeout: 10,
      turn_eagerness: 'normal',
    },
  },
];

interface AgentTemplatesProps {
  onSelectTemplate: (template: AgentTemplate) => void;
  selectedTemplateId?: string;
}

export function AgentTemplates({ onSelectTemplate, selectedTemplateId }: AgentTemplatesProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {AGENT_TEMPLATES.map((template) => (
        <Card
          key={template.id}
          className={`cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg ${
            selectedTemplateId === template.id
              ? 'ring-2 ring-primary shadow-lg'
              : 'hover:ring-1 hover:ring-muted-foreground/20'
          }`}
          onClick={() => onSelectTemplate(template)}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div
                className={`p-3 rounded-xl bg-gradient-to-br ${template.color} text-white shadow-md`}
              >
                {template.icon}
              </div>
              {selectedTemplateId === template.id && (
                <Badge variant="default" className="bg-primary">
                  Sélectionné
                </Badge>
              )}
            </div>
            <CardTitle className="text-lg mt-3">{template.name}</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              {template.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-1.5">
              {template.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Start Blank Card */}
      <Card
        className={`cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg border-dashed ${
          selectedTemplateId === 'blank'
            ? 'ring-2 ring-primary shadow-lg'
            : 'hover:ring-1 hover:ring-muted-foreground/20'
        }`}
        onClick={() =>
          onSelectTemplate({
            id: 'blank',
            name: 'Agent Personnalisé',
            description: 'Créez votre agent de zéro',
            icon: <Sparkles className="h-6 w-6" />,
            color: 'from-gray-500 to-slate-500',
            systemPrompt: '',
            firstMessage: '',
            temperature: 0.7,
            maxTokens: 150,
            tags: [],
          })
        }
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="p-3 rounded-xl bg-gradient-to-br from-muted to-muted-foreground/20 text-muted-foreground">
              <Sparkles className="h-6 w-6" />
            </div>
            {selectedTemplateId === 'blank' && (
              <Badge variant="default" className="bg-primary">
                Sélectionné
              </Badge>
            )}
          </div>
          <CardTitle className="text-lg mt-3">Commencer de zéro</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            Créez un agent entièrement personnalisé selon vos besoins.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-xs">
              Personnalisé
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
