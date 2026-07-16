import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  Bot, 
  Users, 
  MessageSquare, 
  Calendar, 
  Phone, 
  GitBranch, 
  Settings,
  Play,
  ArrowRight,
  Sparkles,
  Globe,
  Headphones,
  UserPlus,
  TrendingUp,
  Zap,
  ArrowLeft,
  Gamepad2,
  LayoutGrid
} from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { ChatDemo } from "@/components/demo/ChatDemo";
import { AnalyticsDemo } from "@/components/demo/AnalyticsDemo";
import { VoiceConfigDemo } from "@/components/demo/VoiceConfigDemo";
import { LeadFormDemo } from "@/components/demo/LeadFormDemo";
import { CalendarDemo } from "@/components/demo/CalendarDemo";
import { WidgetPreviewDemo } from "@/components/demo/WidgetPreviewDemo";

const DemoCenter = () => {
  const navigate = useNavigate();

  const features = [
    {
      id: "dashboard",
      title: "Dashboard & Analytics",
      description: "Vue d'ensemble complète de vos performances avec des métriques en temps réel, graphiques interactifs et indicateurs clés.",
      icon: BarChart3,
      color: "from-blue-500 to-cyan-500",
      href: "/dashboard",
      highlights: ["Métriques en temps réel", "Graphiques interactifs", "KPIs personnalisables"]
    },
    {
      id: "agents",
      title: "Gestion des Agents IA",
      description: "Créez, configurez et déployez des agents vocaux IA intelligents avec une interface intuitive.",
      icon: Bot,
      color: "from-purple-500 to-pink-500",
      href: "/agents",
      highlights: ["Configuration vocale", "Personnalité IA", "Multi-langues"]
    },
    {
      id: "agent-builder",
      title: "Agent Builder",
      description: "Construisez visuellement vos agents avec notre builder drag-and-drop et templates prédéfinis.",
      icon: Sparkles,
      color: "from-amber-500 to-orange-500",
      href: "/agent-builder",
      highlights: ["Visual builder", "Templates", "Preview en direct"]
    },
    {
      id: "conversations",
      title: "Gestion des Conversations",
      description: "Suivez et analysez toutes les conversations en temps réel avec transcription et sentiment.",
      icon: MessageSquare,
      color: "from-green-500 to-emerald-500",
      href: "/conversations",
      highlights: ["Transcription auto", "Analyse sentiment", "Export données"]
    },
    {
      id: "clients",
      title: "Portail Client",
      description: "Offrez à vos clients un espace dédié avec analytics, conversations et configuration personnalisée.",
      icon: Users,
      color: "from-indigo-500 to-violet-500",
      href: "/clients",
      highlights: ["Accès sécurisé", "White-label", "Personnalisation CSS"]
    },
    {
      id: "handoffs",
      title: "Transfert Humain",
      description: "Gérez les demandes de transfert vers des agents humains quand l'IA atteint ses limites.",
      icon: Headphones,
      color: "from-rose-500 to-red-500",
      href: "/handoffs",
      highlights: ["Notifications temps réel", "File d'attente", "Chat intégré"]
    },
    {
      id: "leads",
      title: "CRM & Leads",
      description: "Capturez et qualifiez automatiquement les leads générés par vos agents vocaux.",
      icon: UserPlus,
      color: "from-teal-500 to-cyan-500",
      href: "/leads",
      highlights: ["Scoring automatique", "Pipeline visuel", "Intégrations CRM"]
    },
    {
      id: "appointments",
      title: "Prise de Rendez-vous",
      description: "Intégration calendrier pour permettre à vos agents de prendre des rendez-vous automatiquement.",
      icon: Calendar,
      color: "from-sky-500 to-blue-500",
      href: "/appointments",
      highlights: ["Google Calendar", "Rappels auto", "Confirmation email"]
    },
    {
      id: "campaigns",
      title: "Campagnes Sortantes",
      description: "Lancez des campagnes d'appels automatisés avec suivi des performances et résultats.",
      icon: Phone,
      color: "from-lime-500 to-green-500",
      href: "/campaigns",
      highlights: ["Appels batch", "Scheduling", "Rapports détaillés"]
    },
    {
      id: "workflows",
      title: "Automatisation",
      description: "Créez des workflows automatisés pour connecter vos outils et déclencher des actions.",
      icon: GitBranch,
      color: "from-fuchsia-500 to-purple-500",
      href: "/workflows",
      highlights: ["Triggers événements", "Actions conditionnelles", "Webhooks"]
    },
    {
      id: "analytics",
      title: "Voice Analytics",
      description: "Analyse approfondie des conversations vocales avec insights et recommandations IA.",
      icon: TrendingUp,
      color: "from-orange-500 to-amber-500",
      href: "/analytics",
      highlights: ["Topics trending", "Sentiment analysis", "Performance metrics"]
    },
    {
      id: "integrations",
      title: "Intégrations",
      description: "Connectez votre plateforme à vos outils existants : ElevenLabs, Stripe, Webhooks et plus.",
      icon: Zap,
      color: "from-yellow-500 to-amber-500",
      href: "/integrations",
      highlights: ["ElevenLabs", "Stripe", "API REST"]
    }
  ];

  const quickStart = [
    {
      step: 1,
      title: "Créer un Agent",
      description: "Configurez votre premier agent vocal IA avec notre wizard guidé",
      action: () => navigate('/agent-builder'),
      buttonText: "Créer un agent"
    },
    {
      step: 2,
      title: "Ajouter un Client",
      description: "Invitez votre premier client et configurez son espace personnalisé",
      action: () => navigate('/clients'),
      buttonText: "Ajouter un client"
    },
    {
      step: 3,
      title: "Configurer les Intégrations",
      description: "Connectez ElevenLabs et vos autres outils pour activer les fonctionnalités",
      action: () => navigate('/integrations'),
      buttonText: "Configurer"
    }
  ];

  return (
    <AppLayout>
      <div className="container mx-auto px-6 py-8 space-y-8">
        {/* Back Link */}
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Retour à l'accueil
        </Link>

        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Play className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-4">Centre de Démonstration</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Découvrez et testez toutes les fonctionnalités de la plateforme AVA Statistics directement sur cette page.
          </p>
        </div>

        {/* Tabs for Demo vs Features */}
        <Tabs defaultValue="interactive" className="space-y-6">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
            <TabsTrigger value="interactive" className="gap-2">
              <Gamepad2 className="w-4 h-4" />
              Widgets Interactifs
            </TabsTrigger>
            <TabsTrigger value="features" className="gap-2">
              <LayoutGrid className="w-4 h-4" />
              Toutes les Fonctionnalités
            </TabsTrigger>
          </TabsList>

          {/* Interactive Widgets Tab */}
          <TabsContent value="interactive" className="space-y-6">
            <div className="text-center mb-6">
              <Badge variant="secondary" className="gap-2">
                <Sparkles className="w-3 h-3" />
                Testez sans navigation
              </Badge>
            </div>

            {/* Interactive Widgets Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <ChatDemo />
              <AnalyticsDemo />
              <VoiceConfigDemo />
              <LeadFormDemo />
              <CalendarDemo />
              <WidgetPreviewDemo />
            </div>
          </TabsContent>

          {/* All Features Tab */}
          <TabsContent value="features" className="space-y-6">
            {/* Quick Start */}
            <Card className="glass-card neon-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Démarrage Rapide
                </CardTitle>
                <CardDescription>
                  Suivez ces 3 étapes pour commencer à utiliser la plateforme
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {quickStart.map((item) => (
                    <div key={item.step} className="relative">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="font-bold text-primary">{item.step}</span>
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold mb-1">{item.title}</h4>
                          <p className="text-sm text-muted-foreground mb-3">{item.description}</p>
                          <Button variant="outline" size="sm" onClick={item.action} className="gap-2">
                            {item.buttonText}
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Features Grid */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Toutes les Fonctionnalités</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {features.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <Card 
                      key={feature.id}
                      className="glass-card hover:border-primary/50 transition-all cursor-pointer group"
                      onClick={() => navigate(feature.href)}
                    >
                      <CardContent className="p-6">
                        <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                          <Icon className="w-7 h-7 text-white" />
                        </div>
                        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                          {feature.title}
                          <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">{feature.description}</p>
                        <div className="flex flex-wrap gap-2">
                          {feature.highlights.map((highlight) => (
                            <Badge key={highlight} variant="secondary" className="text-xs">
                              {highlight}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Widget Preview */}
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                    <Globe className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle>Widget Intégrable</CardTitle>
                    <CardDescription>
                      Testez le widget vocal que vos clients peuvent intégrer sur leurs sites
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button onClick={() => navigate('/widget-prototype')} className="gap-2">
                    <Play className="w-4 h-4" />
                    Tester le Widget
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/agents')}>
                    Configurer un Agent
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default DemoCenter;
