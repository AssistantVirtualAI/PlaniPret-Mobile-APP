import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Headphones, 
  Calendar, 
  ShoppingCart, 
  Users, 
  MessageSquare, 
  Sparkles,
  Wrench,
  Phone,
  Play,
  Check
} from 'lucide-react';
import type { ElevenLabsAgentTemplate } from '@/types/elevenlabs';

// Pre-configured templates with ElevenLabs optimized settings
export const ELEVENLABS_TEMPLATES: ElevenLabsAgentTemplate[] = [
  {
    id: 'support-technique',
    name: 'Support Technique',
    description: 'Agent optimisé pour la résolution de problèmes IT avec patience et clarté.',
    icon: 'Wrench',
    color: 'from-blue-500 to-cyan-500',
    systemPrompt: `Tu es un agent de support technique expert et patient. Tes responsabilités:
- Diagnostiquer les problèmes techniques avec méthode
- Guider l'utilisateur étape par étape
- Expliquer les solutions de manière simple et claire
- Escalader vers un humain si le problème dépasse tes compétences
- Toujours confirmer que le problème est résolu avant de terminer`,
    firstMessage: 'Bonjour ! Je suis votre assistant technique. Décrivez-moi le problème que vous rencontrez, je vais vous aider à le résoudre.',
    language: 'fr',
    tts: {
      voice_id: 'JBFqnCBsd6RMkjVDRZzb', // George - calme et professionnel
      model_id: 'eleven_multilingual_v2',
      stability: 0.8,
      similarity_boost: 0.8,
      style: 0.2,
      speed: 1.0,
      optimize_streaming_latency: 3,
    },
    asr: {
      quality: 'high',
      keywords: ['redémarrer', 'erreur', 'bug', 'problème', 'crash', 'connexion', 'mot de passe'],
    },
    turn: {
      turn_timeout: 15,
      silence_end_call_timeout: 60,
      turn_eagerness: 'relaxed',
    },
    conversation: {
      max_duration_seconds: 1800, // 30 minutes
    },
    tags: ['Support', 'IT', 'Technique', 'Assistance'],
  },
  {
    id: 'vente-b2b',
    name: 'Vente B2B',
    description: 'Agent commercial persuasif pour la qualification et conversion de prospects.',
    icon: 'ShoppingCart',
    color: 'from-green-500 to-emerald-500',
    systemPrompt: `Tu es un commercial B2B expérimenté et persuasif. Tes objectifs:
- Identifier rapidement les besoins et le budget du prospect
- Qualifier le lead (décideur, budget, timing, besoin)
- Mettre en avant les avantages compétitifs
- Gérer les objections avec tact
- Proposer un next step concret (démo, rendez-vous, essai)
- Collecter les coordonnées complètes`,
    firstMessage: 'Bonjour ! Je suis ravi de vous accueillir. Puis-je en savoir plus sur votre entreprise et vos besoins actuels ?',
    language: 'fr',
    tts: {
      voice_id: 'TX3LPaxmHKxFdv7VOQHJ', // Liam - dynamique et engageant
      model_id: 'eleven_turbo_v2_5',
      stability: 0.6,
      similarity_boost: 0.75,
      style: 0.4,
      speed: 1.05,
      optimize_streaming_latency: 2,
    },
    asr: {
      quality: 'high',
      keywords: ['budget', 'décideur', 'timeline', 'concurrent', 'prix', 'devis', 'démo'],
    },
    turn: {
      turn_timeout: 8,
      silence_end_call_timeout: 30,
      turn_eagerness: 'eager',
    },
    conversation: {
      max_duration_seconds: 900, // 15 minutes
    },
    tags: ['Vente', 'B2B', 'Qualification', 'Commercial'],
  },
  {
    id: 'service-client-premium',
    name: 'Service Client Premium',
    description: 'Agent haut de gamme pour une relation client exceptionnelle.',
    icon: 'Headphones',
    color: 'from-purple-500 to-pink-500',
    systemPrompt: `Tu es un agent de service client premium, représentant une marque haut de gamme. Ton rôle:
- Offrir une expérience client exceptionnelle et personnalisée
- Écouter attentivement et faire preuve d'empathie
- Résoudre les problèmes avec élégance et efficacité
- Anticiper les besoins du client
- Proposer des solutions alternatives ou compensations si nécessaire
- Maintenir un ton chaleureux mais professionnel`,
    firstMessage: 'Bonjour et bienvenue ! Je suis à votre entière disposition. Comment puis-je vous être utile aujourd\'hui ?',
    language: 'fr',
    tts: {
      voice_id: 'EXAVITQu4vr4xnSDxMaL', // Sarah - chaleureuse et professionnelle
      model_id: 'eleven_multilingual_v2',
      stability: 0.7,
      similarity_boost: 0.85,
      style: 0.3,
      speed: 0.95,
      optimize_streaming_latency: 3,
    },
    asr: {
      quality: 'high',
      keywords: ['réclamation', 'remboursement', 'satisfaction', 'commande', 'livraison'],
    },
    turn: {
      turn_timeout: 12,
      silence_end_call_timeout: 45,
      turn_eagerness: 'normal',
    },
    conversation: {
      max_duration_seconds: 1200, // 20 minutes
    },
    tags: ['Premium', 'Relation client', 'Empathie', 'Luxe'],
  },
  {
    id: 'prise-rdv',
    name: 'Prise de Rendez-vous',
    description: 'Agent efficace pour la gestion et la prise de rendez-vous.',
    icon: 'Calendar',
    color: 'from-orange-500 to-amber-500',
    systemPrompt: `Tu es un assistant de prise de rendez-vous efficace. Tes responsabilités:
- Proposer des créneaux disponibles clairement
- Collecter les informations nécessaires (nom, email, téléphone)
- Confirmer le rendez-vous avec tous les détails
- Gérer les modifications et annulations
- Envoyer des rappels si demandé
- Être concis et aller droit au but`,
    firstMessage: 'Bonjour ! Je peux vous aider à prendre rendez-vous. Quel service vous intéresse ?',
    language: 'fr',
    tts: {
      voice_id: 'pFZP5JQG7iQjIQuC4Bku', // Lily - claire et efficace
      model_id: 'eleven_turbo_v2_5',
      stability: 0.75,
      similarity_boost: 0.7,
      style: 0.2,
      speed: 1.1,
      optimize_streaming_latency: 1,
    },
    asr: {
      quality: 'standard',
      keywords: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'matin', 'après-midi', 'annuler', 'reporter'],
    },
    turn: {
      turn_timeout: 10,
      silence_end_call_timeout: 25,
      turn_eagerness: 'eager',
    },
    conversation: {
      max_duration_seconds: 300, // 5 minutes
    },
    tags: ['Rendez-vous', 'Calendrier', 'Réservation', 'Efficace'],
  },
  {
    id: 'qualification-leads',
    name: 'Qualification de Leads',
    description: 'Agent spécialisé dans la qualification et le scoring des prospects.',
    icon: 'Users',
    color: 'from-indigo-500 to-violet-500',
    systemPrompt: `Tu es un agent de qualification de leads expert. Tes objectifs:
- Identifier les besoins et défis du prospect
- Évaluer le budget et le timing
- Déterminer le décideur et le processus d'achat
- Scorer le lead (chaud, tiède, froid)
- Collecter les coordonnées complètes
- Qualifier pour transmission à l'équipe commerciale`,
    firstMessage: 'Bonjour ! Merci de votre intérêt. Pouvez-vous me parler de votre projet et de vos besoins actuels ?',
    language: 'fr',
    tts: {
      voice_id: 'onwK4e9ZLuTAKqWW03F9', // Daniel - professionnel et engageant
      model_id: 'eleven_turbo_v2_5',
      stability: 0.65,
      similarity_boost: 0.8,
      style: 0.35,
      speed: 1.0,
      optimize_streaming_latency: 2,
    },
    asr: {
      quality: 'high',
      keywords: ['budget', 'équipe', 'décision', 'concurrent', 'délai', 'urgence', 'projet'],
    },
    turn: {
      turn_timeout: 10,
      silence_end_call_timeout: 35,
      turn_eagerness: 'normal',
    },
    conversation: {
      max_duration_seconds: 600, // 10 minutes
    },
    tags: ['Qualification', 'Leads', 'B2B', 'Scoring'],
  },
  {
    id: 'telephonique-entrant',
    name: 'Accueil Téléphonique',
    description: 'Agent d\'accueil pour gérer les appels entrants et router les demandes.',
    icon: 'Phone',
    color: 'from-teal-500 to-cyan-500',
    systemPrompt: `Tu es un standardiste virtuel professionnel. Tes responsabilités:
- Accueillir chaleureusement les appelants
- Identifier rapidement le motif de l'appel
- Router vers le bon service ou interlocuteur
- Prendre des messages détaillés si nécessaire
- Fournir les informations de base (horaires, adresse, etc.)
- Maintenir un ton professionnel et accueillant`,
    firstMessage: 'Bonjour et bienvenue ! Comment puis-je orienter votre appel aujourd\'hui ?',
    language: 'fr',
    tts: {
      voice_id: 'XrExE9yKIg1WjnnlVkGX', // Matilda - accueillante
      model_id: 'eleven_turbo_v2_5',
      stability: 0.75,
      similarity_boost: 0.75,
      style: 0.25,
      speed: 1.0,
      optimize_streaming_latency: 1,
    },
    asr: {
      quality: 'high',
      keywords: ['commercial', 'technique', 'comptabilité', 'direction', 'réclamation', 'information'],
    },
    turn: {
      turn_timeout: 8,
      silence_end_call_timeout: 20,
      turn_eagerness: 'eager',
    },
    conversation: {
      max_duration_seconds: 180, // 3 minutes
    },
    tags: ['Accueil', 'Standard', 'Téléphone', 'Routage'],
  },
];

const iconMap: Record<string, React.ReactNode> = {
  Wrench: <Wrench className="h-6 w-6" />,
  ShoppingCart: <ShoppingCart className="h-6 w-6" />,
  Headphones: <Headphones className="h-6 w-6" />,
  Calendar: <Calendar className="h-6 w-6" />,
  Users: <Users className="h-6 w-6" />,
  Phone: <Phone className="h-6 w-6" />,
  MessageSquare: <MessageSquare className="h-6 w-6" />,
  Sparkles: <Sparkles className="h-6 w-6" />,
};

interface AgentTemplateSelectorProps {
  onSelectTemplate: (template: ElevenLabsAgentTemplate) => void;
  selectedTemplateId?: string;
  onPreviewVoice?: (voiceId: string) => void;
}

export function AgentTemplateSelector({ 
  onSelectTemplate, 
  selectedTemplateId,
  onPreviewVoice 
}: AgentTemplateSelectorProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Templates d'Agents Pré-configurés</h2>
        <p className="text-muted-foreground">
          Choisissez un template optimisé pour ElevenLabs avec des paramètres voix, ASR et turn-taking adaptés.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ELEVENLABS_TEMPLATES.map((template, index) => (
          <motion.div
            key={template.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onMouseEnter={() => setHoveredId(template.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <Card
              className={`cursor-pointer transition-all duration-300 h-full ${
                selectedTemplateId === template.id
                  ? 'ring-2 ring-primary shadow-lg shadow-primary/20'
                  : 'hover:ring-1 hover:ring-primary/50 hover:shadow-lg'
              }`}
              onClick={() => onSelectTemplate(template)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div
                    className={`p-3 rounded-xl bg-gradient-to-br ${template.color} text-white shadow-md`}
                  >
                    {iconMap[template.icon] || <MessageSquare className="h-6 w-6" />}
                  </div>
                  <div className="flex items-center gap-2">
                    {onPreviewVoice && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreviewVoice(template.tts.voice_id);
                        }}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    )}
                    {selectedTemplateId === template.id && (
                      <Badge variant="default" className="bg-primary">
                        <Check className="h-3 w-3 mr-1" />
                        Sélectionné
                      </Badge>
                    )}
                  </div>
                </div>
                <CardTitle className="text-lg mt-3">{template.name}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  {template.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {template.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
                
                {/* Show settings preview on hover */}
                {hoveredId === template.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="pt-3 border-t space-y-2 text-xs text-muted-foreground"
                  >
                    <div className="flex justify-between">
                      <span>Stabilité voix:</span>
                      <span className="font-medium text-foreground">{template.tts.stability * 100}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Turn timeout:</span>
                      <span className="font-medium text-foreground">{template.turn.turn_timeout}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Durée max:</span>
                      <span className="font-medium text-foreground">{Math.round(template.conversation.max_duration_seconds / 60)} min</span>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}

        {/* Blank template */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: ELEVENLABS_TEMPLATES.length * 0.1 }}
        >
          <Card
            className={`cursor-pointer transition-all duration-300 h-full border-dashed ${
              selectedTemplateId === 'blank'
                ? 'ring-2 ring-primary shadow-lg'
                : 'hover:ring-1 hover:ring-muted-foreground/20'
            }`}
            onClick={() =>
              onSelectTemplate({
                id: 'blank',
                name: 'Agent Personnalisé',
                description: 'Créez votre agent de zéro avec vos propres paramètres.',
                icon: 'Sparkles',
                color: 'from-gray-500 to-slate-500',
                systemPrompt: '',
                firstMessage: '',
                language: 'fr',
                tts: {
                  voice_id: 'JBFqnCBsd6RMkjVDRZzb',
                  model_id: 'eleven_multilingual_v2',
                  stability: 0.7,
                  similarity_boost: 0.75,
                  style: 0.3,
                  speed: 1.0,
                  optimize_streaming_latency: 2,
                },
                asr: {
                  quality: 'high',
                  keywords: [],
                },
                turn: {
                  turn_timeout: 10,
                  silence_end_call_timeout: 30,
                  turn_eagerness: 'normal',
                },
                conversation: {
                  max_duration_seconds: 600,
                },
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
                    <Check className="h-3 w-3 mr-1" />
                    Sélectionné
                  </Badge>
                )}
              </div>
              <CardTitle className="text-lg mt-3">Commencer de zéro</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Créez un agent entièrement personnalisé avec vos propres paramètres ElevenLabs.
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
        </motion.div>
      </div>
    </div>
  );
}
