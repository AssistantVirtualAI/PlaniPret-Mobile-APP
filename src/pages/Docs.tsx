import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  BookOpen, 
  Download, 
  Settings, 
  Key, 
  Webhook, 
  Shield, 
  Code, 
  Terminal,
  Zap,
  Users,
  CreditCard,
  Mail,
  Globe,
  FileText,
  Search,
  X,
  ArrowLeft,
  Play,
  GraduationCap,
  Video,
  Clock,
  CheckCircle2,
  Lightbulb,
  Target,
  Rocket,
  BookMarked,
  PlayCircle,
  LayoutDashboard,
  Bot,
  MessageSquare,
  BarChart3,
  Palette,
  Link as LinkIcon,
  Phone,
  UserPlus
} from "lucide-react";
import { Link } from "react-router-dom";
import { InteractiveSlideshow, Slide } from "@/components/demo/InteractiveSlideshow";

const Docs = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("getting-started");

  // Search content mapping for filtering
  const searchableContent = useMemo(() => ({
    "getting-started": [
      "démarrer", "commencer", "guide", "premier pas", "introduction", "bienvenue",
      "agent", "client", "configuration", "installation", "rapide"
    ],
    training: [
      "formation", "training", "apprendre", "tutoriel", "guide", "pratiques",
      "astuces", "conseils", "use case", "cas d'usage", "best practices"
    ],
    videos: [
      "vidéo", "tutorial", "démonstration", "walkthrough", "youtube", "regarder"
    ],
    installation: [
      "installation", "guide", "prérequis", "node", "bun", "lovable", "stripe", "elevenlabs",
      "cloner", "repository", "npm", "variables", "environnement", "supabase", "smtp", "sentry",
      "démarrer", "serveur", "développement", "build", "production", "base de données", "postgresql",
      "migrations", "tables", "organizations", "clients", "agents", "conversations"
    ],
    integrations: [
      "elevenlabs", "agents vocaux", "api", "widget", "popup", "iframe", "transcription",
      "stripe", "paiements", "abonnements", "checkout", "webhook", "portal", "plans",
      "email", "smtp", "templates", "welcome", "password", "invitation", "2fa",
      "webhooks", "événements", "payload", "signature", "domaine", "dns", "cname"
    ],
    api: [
      "api", "authentification", "clé", "bearer", "token", "scopes", "endpoints",
      "conversations", "agents", "clients", "analytics", "webhooks", "rate limit"
    ]
  }), []);

  // Filter sections based on search
  const matchedSections = useMemo(() => {
    if (!searchQuery.trim()) return ["getting-started", "training", "videos", "installation", "integrations", "api"];
    
    const query = searchQuery.toLowerCase();
    return Object.entries(searchableContent)
      .filter(([_, keywords]) => keywords.some(k => k.includes(query)))
      .map(([section]) => section);
  }, [searchQuery, searchableContent]);

  const hasResults = matchedSections.length > 0;

  const trainingContent = [
    {
      title: "Create Your First Agent",
      description: "Step-by-step guide to configure a working AI voice agent",
      duration: "15 min",
      level: "Beginner",
      icon: Rocket,
      color: "text-blue-500"
    },
    {
      title: "Customize Voice and Behavior",
      description: "Adjust voice settings, tone, and your agent's personality",
      duration: "20 min",
      level: "Intermediate",
      icon: Settings,
      color: "text-purple-500"
    },
    {
      title: "Manage Your Clients Efficiently",
      description: "Organization, permissions, and white-label client portal",
      duration: "25 min",
      level: "Intermediate",
      icon: Users,
      color: "text-green-500"
    },
    {
      title: "Analyze Conversations",
      description: "Understand metrics, sentiment, and insights from your conversations",
      duration: "20 min",
      level: "Advanced",
      icon: Target,
      color: "text-orange-500"
    },
    {
      title: "Automate with Workflows",
      description: "Create automations and webhooks to connect your tools",
      duration: "30 min",
      level: "Advanced",
      icon: Zap,
      color: "text-yellow-500"
    },
    {
      title: "Optimiser les Performances",
      description: "Meilleures pratiques pour maximiser l'efficacité de vos agents",
      duration: "25 min",
      level: "Expert",
      icon: Lightbulb,
      color: "text-cyan-500"
    }
  ];

  // Interactive slideshows data replacing video tutorials
  const platformOverviewSlides: Slide[] = [
    {
      title: "Tableau de Bord",
      description: "Vue d'ensemble de vos métriques clés, conversations récentes et performances globales de vos agents.",
      icon: <LayoutDashboard className="w-8 h-8" />,
      highlights: ["KPIs en temps réel", "Graphiques de tendances", "Alertes importantes"]
    },
    {
      title: "Gestion des Agents",
      description: "Créez, configurez et gérez vos agents vocaux IA depuis une interface intuitive.",
      icon: <Bot className="w-8 h-8" />,
      highlights: ["Création en quelques clics", "Configuration vocale", "Base de connaissances"]
    },
    {
      title: "Portail Clients",
      description: "Offrez à vos clients un accès personnalisé à leurs agents et statistiques.",
      icon: <Users className="w-8 h-8" />,
      highlights: ["White-label complet", "Accès sécurisé", "Personnalisation CSS"]
    },
    {
      title: "Conversations",
      description: "Consultez l'historique des conversations avec transcriptions et analyses de sentiment.",
      icon: <MessageSquare className="w-8 h-8" />,
      highlights: ["Transcriptions complètes", "Analyse sentiment", "Export audio"]
    },
    {
      title: "Analytics Avancés",
      description: "Analyze performance with detailed charts and actionable insights.",
      icon: <BarChart3 className="w-8 h-8" />,
      highlights: ["Detailed metrics", "Exportable reports", "Time trends"]
    }
  ];

  const agentConfigSlides: Slide[] = [
    {
      title: "Create a New Agent",
      description: "Start by giving your voice agent a name and description.",
      icon: <Bot className="w-8 h-8" />,
      highlights: ["Unique name", "Clear description", "Platform selection"]
    },
    {
      title: "Select the Voice",
      description: "Choose from available ElevenLabs voices and adjust voice settings.",
      icon: <Settings className="w-8 h-8" />,
      highlights: ["Voice stability", "Clarity/Similarity", "Expressive style"]
    },
    {
      title: "Configure the Prompt",
      description: "Define your agent's behavior and personality with a system prompt.",
      icon: <FileText className="w-8 h-8" />,
      highlights: ["Business context", "Precise instructions", "Response examples"]
    },
    {
      title: "Knowledge Base",
      description: "Add documents and FAQs to enrich your agent's answers.",
      icon: <BookOpen className="w-8 h-8" />,
      highlights: ["Upload documents", "Dynamic FAQ", "Auto sync"]
    },
    {
      title: "Deploy and Test",
      description: "Test your agent in the prototype before deploying to production.",
      icon: <Rocket className="w-8 h-8" />,
      highlights: ["Live test", "Embeddable widget", "Active monitoring"]
    }
  ];

  const clientPortalSlides: Slide[] = [
    {
      title: "Create a Client",
      description: "Add a new client with contact information and preferences.",
      icon: <UserPlus className="w-8 h-8" />,
      highlights: ["Basic information", "Contact email", "Preferred language"]
    },
    {
      title: "Assign Agents",
      description: "Associate one or more agents with the client for use.",
      icon: <Bot className="w-8 h-8" />,
      highlights: ["Multiple agents", "Granular permissions", "Usage limits"]
    },
    {
      title: "Personnaliser le Branding",
      description: "Appliquez les couleurs et le logo du client pour une expérience white-label.",
      icon: <Palette className="w-8 h-8" />,
      highlights: ["Logo personnalisé", "Couleurs de marque", "CSS avancé"]
    },
    {
      title: "Configurer l'URL",
      description: "Définissez une URL personnalisée pour le portail client.",
      icon: <LinkIcon className="w-8 h-8" />,
      highlights: ["Sous-domaine dédié", "Accès sécurisé", "SSL automatique"]
    },
    {
      title: "Accès Portail",
      description: "Le client peut accéder à son portail personnalisé avec ses identifiants.",
      icon: <Users className="w-8 h-8" />,
      highlights: ["Connexion OTP", "Vue conversations", "Analytics dédiés"]
    }
  ];

  const analyticsSlides: Slide[] = [
    {
      title: "Vue d'Ensemble",
      description: "Accédez au tableau de bord avec les métriques clés de toutes vos conversations.",
      icon: <LayoutDashboard className="w-8 h-8" />,
      highlights: ["Total conversations", "Durée moyenne", "Score satisfaction"]
    },
    {
      title: "Analyse des Conversations",
      description: "Filtrez et analysez les conversations par agent, client ou période.",
      icon: <MessageSquare className="w-8 h-8" />,
      highlights: ["Filtres avancés", "Recherche texte", "Exports CSV"]
    },
    {
      title: "Sentiment Analysis",
      description: "Visualisez la répartition des sentiments détectés dans vos conversations.",
      icon: <Target className="w-8 h-8" />,
      highlights: ["Positif/Négatif/Neutre", "Tendances", "Alertes automatiques"]
    },
    {
      title: "Topics & Tendances",
      description: "Identifiez les sujets récurrents abordés par vos utilisateurs.",
      icon: <Lightbulb className="w-8 h-8" />,
      highlights: ["Catégorisation auto", "Fréquence", "Nuage de mots"]
    },
    {
      title: "Rapports Exportables",
      description: "Générez et exportez des rapports PDF ou CSV pour vos clients.",
      icon: <FileText className="w-8 h-8" />,
      highlights: ["PDF personnalisé", "Données brutes CSV", "Planification auto"]
    }
  ];

  const integrationsSlides: Slide[] = [
    {
      title: "Configuration API",
      description: "Générez vos clés API et configurez l'authentification pour vos intégrations.",
      icon: <Key className="w-8 h-8" />,
      highlights: ["Clés API sécurisées", "Scopes personnalisés", "Rotation facile"]
    },
    {
      title: "Webhooks",
      description: "Configurez des webhooks pour recevoir des événements en temps réel.",
      icon: <Webhook className="w-8 h-8" />,
      highlights: ["Events personnalisables", "Payload JSON", "Retry automatique"]
    },
    {
      title: "ElevenLabs",
      description: "Connectez votre compte ElevenLabs pour les agents vocaux.",
      icon: <Zap className="w-8 h-8" />,
      highlights: ["Clé API simple", "Voix disponibles", "Usage suivi"]
    },
    {
      title: "Stripe",
      description: "Configurez Stripe pour la facturation et les abonnements.",
      icon: <CreditCard className="w-8 h-8" />,
      highlights: ["Paiements sécurisés", "Abonnements récurrents", "Portail client"]
    },
    {
      title: "Email & SMTP",
      description: "Configurez vos templates email et le serveur SMTP.",
      icon: <Mail className="w-8 h-8" />,
      highlights: ["Templates personnalisés", "Variables dynamiques", "Domaine vérifié"]
    }
  ];

  const campaignsSlides: Slide[] = [
    {
      title: "Create a Campaign",
      description: "Define the name, description, and settings for your calling campaign.",
      icon: <Phone className="w-8 h-8" />,
      highlights: ["Clear goals", "Assigned agent", "Calling hours"]
    },
    {
      title: "Importer les Contacts",
      description: "Uploadez votre liste de contacts à appeler via CSV ou saisie manuelle.",
      icon: <Users className="w-8 h-8" />,
      highlights: ["Import CSV", "Validation numéros", "Déduplication auto"]
    },
    {
      title: "Configurer le Script",
      description: "Personnalisez le script et les réponses de l'agent pour la campagne.",
      icon: <FileText className="w-8 h-8" />,
      highlights: ["Variables contact", "Branches conditionnelles", "Objectifs mesurables"]
    },
    {
      title: "Lancer la Campagne",
      description: "Démarrez la campagne et surveillez les appels en temps réel.",
      icon: <Rocket className="w-8 h-8" />,
      highlights: ["Démarrage planifié", "Pause/Reprise", "Monitoring live"]
    },
    {
      title: "Analyser les Résultats",
      description: "Consultez les statistiques de la campagne et les résultats par contact.",
      icon: <BarChart3 className="w-8 h-8" />,
      highlights: ["Taux de succès", "Durée moyenne", "Conversions"]
    }
  ];

  const slideshowData = [
    {
      title: "Présentation de la Plateforme",
      description: "Tour complet de l'interface et des fonctionnalités principales",
      duration: "5 slides",
      category: "Introduction",
      slides: platformOverviewSlides
    },
    {
      title: "Configurer un Agent ElevenLabs",
      description: "De la création à la mise en production de votre premier agent",
      duration: "5 slides",
      category: "Agents",
      slides: agentConfigSlides
    },
    {
      title: "Gérer le Portail Client",
      description: "Configuration du white-label et personnalisation CSS",
      duration: "5 slides",
      category: "Clients",
      slides: clientPortalSlides
    },
    {
      title: "Comprendre les Analytics",
      description: "Lecture des métriques et prise de décisions basées sur les données",
      duration: "5 slides",
      category: "Analytics",
      slides: analyticsSlides
    },
    {
      title: "Intégrations et Webhooks",
      description: "Connecter vos outils existants à la plateforme",
      duration: "5 slides",
      category: "Intégrations",
      slides: integrationsSlides
    },
    {
      title: "Campagnes d'Appels Sortants",
      description: "Lancer et gérer des campagnes automatisées",
      duration: "5 slides",
      category: "Campagnes",
      slides: campaignsSlides
    }
  ];

  const quickStartSteps = [
    {
      step: 1,
      title: "Connect ElevenLabs",
      description: "Add your ElevenLabs API key in integration settings",
      completed: false
    },
    {
      step: 2,
      title: "Create an Agent",
      description: "Use the Agent Builder to configure your first voice agent",
      completed: false
    },
    {
      step: 3,
      title: "Add a Client",
      description: "Create a client and assign an agent to them",
      completed: false
    },
    {
      step: 4,
      title: "Test the Widget",
      description: "Test the voice widget on the prototype page",
      completed: false
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl py-12 px-4">
        {/* Header with back link */}
        <div className="mb-6">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <BookOpen className="h-10 w-10 text-primary" />
            <h1 className="text-4xl font-bold">AVA Statistics Help Center</h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Guides, tutorials, and complete documentation to master the platform
          </p>
          <Badge variant="secondary" className="mt-4">v1.0.0</Badge>
        </div>

        {/* Search Bar */}
        <div className="max-w-xl mx-auto mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search the documentation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {searchQuery && (
            <p className="text-sm text-muted-foreground mt-2 text-center">
              {hasResults 
                ? `${matchedSections.length} section(s) found` 
                : "No results found"}
            </p>
          )}
        </div>

        {/* Section Filters */}
        {searchQuery && hasResults && (
          <div className="flex justify-center flex-wrap gap-2 mb-6">
            {matchedSections.map((section) => (
              <Badge 
                key={section} 
                variant={activeTab === section ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setActiveTab(section)}
              >
                {section === "getting-started" && "Démarrage"}
                {section === "training" && "Formation"}
                {section === "videos" && "Vidéos"}
                {section === "installation" && "Installation"}
                {section === "integrations" && "Intégrations"}
                {section === "api" && "API Reference"}
              </Badge>
            ))}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 lg:w-auto lg:inline-flex">
            <TabsTrigger 
              value="getting-started" 
              className="gap-2"
              disabled={searchQuery && !matchedSections.includes("getting-started")}
            >
              <Rocket className="h-4 w-4" />
              <span className="hidden sm:inline">Démarrage</span>
            </TabsTrigger>
            <TabsTrigger 
              value="training" 
              className="gap-2"
              disabled={searchQuery && !matchedSections.includes("training")}
            >
              <GraduationCap className="h-4 w-4" />
              <span className="hidden sm:inline">Formation</span>
            </TabsTrigger>
            <TabsTrigger 
              value="videos" 
              className="gap-2"
              disabled={searchQuery && !matchedSections.includes("videos")}
            >
              <Video className="h-4 w-4" />
              <span className="hidden sm:inline">Vidéos</span>
            </TabsTrigger>
            <TabsTrigger 
              value="installation" 
              className="gap-2"
              disabled={searchQuery && !matchedSections.includes("installation")}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Installation</span>
            </TabsTrigger>
            <TabsTrigger 
              value="integrations" 
              className="gap-2"
              disabled={searchQuery && !matchedSections.includes("integrations")}
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Intégrations</span>
            </TabsTrigger>
            <TabsTrigger 
              value="api" 
              className="gap-2"
              disabled={searchQuery && !matchedSections.includes("api")}
            >
              <Code className="h-4 w-4" />
              <span className="hidden sm:inline">API</span>
            </TabsTrigger>
          </TabsList>

          {/* Getting Started Tab */}
          <TabsContent value="getting-started" className="space-y-6">
            <Card className="border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-primary" />
                  Bienvenue sur AVA Statistics
                </CardTitle>
                <CardDescription>
                  Suivez ces étapes pour commencer à utiliser la plateforme
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {quickStartSteps.map((item) => (
                    <div key={item.step} className="flex items-start gap-4 p-4 border rounded-lg">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        item.completed ? 'bg-green-500/10 text-green-500' : 'bg-primary/10 text-primary'
                      }`}>
                        {item.completed ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <span className="font-bold">{item.step}</span>
                        )}
                      </div>
                      <div>
                        <h4 className="font-semibold">{item.title}</h4>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="glass-card hover:border-primary/50 transition-all cursor-pointer" onClick={() => setActiveTab("training")}>
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <GraduationCap className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Contenu de Formation</h4>
                    <p className="text-sm text-muted-foreground">Guides détaillés et best practices</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="glass-card hover:border-primary/50 transition-all cursor-pointer" onClick={() => setActiveTab("videos")}>
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                    <Video className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Tutoriels Vidéo</h4>
                    <p className="text-sm text-muted-foreground">Apprenez visuellement avec nos vidéos</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Training Content Tab */}
          <TabsContent value="training" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-primary" />
                  Contenu de Formation
                </CardTitle>
                <CardDescription>
                  Guides détaillés pour maîtriser chaque aspect de la plateforme
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {trainingContent.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <Card key={index} className="hover:border-primary/50 transition-all cursor-pointer">
                        <CardContent className="p-6">
                          <div className="flex items-start gap-4">
                            <Icon className={`w-8 h-8 ${item.color} flex-shrink-0`} />
                            <div className="flex-1">
                              <h4 className="font-semibold mb-1">{item.title}</h4>
                              <p className="text-sm text-muted-foreground mb-3">{item.description}</p>
                              <div className="flex items-center gap-3">
                                <Badge variant="secondary" className="gap-1">
                                  <Clock className="w-3 h-3" />
                                  {item.duration}
                                </Badge>
                                <Badge variant="outline">{item.level}</Badge>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Best Practices */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-yellow-500" />
                  Meilleures Pratiques
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2">Configuration Agent</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Définir un premier message clair</li>
                      <li>• Tester le ton avant déploiement</li>
                      <li>• Configurer les limites de conversation</li>
                    </ul>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2">Gestion Clients</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Personnaliser le branding par client</li>
                      <li>• Définir des accès granulaires</li>
                      <li>• Former les utilisateurs client</li>
                    </ul>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2">Analytics</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Surveiller les métriques clés</li>
                      <li>• Analyser les topics récurrents</li>
                      <li>• Exporter les rapports régulièrement</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Use Cases */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-green-500" />
                  Cas d'Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <Badge className="mb-2">Support Client</Badge>
                    <h4 className="font-semibold">Service Client 24/7</h4>
                    <p className="text-sm text-muted-foreground">
                      Déployez un agent vocal qui répond aux questions fréquentes, qualifie les demandes 
                      et transfère vers un humain si nécessaire.
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <Badge className="mb-2">Ventes</Badge>
                    <h4 className="font-semibold">Qualification de Leads</h4>
                    <p className="text-sm text-muted-foreground">
                      Qualifiez automatiquement vos prospects avec un agent qui pose les bonnes questions 
                      et capture les informations essentielles.
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <Badge className="mb-2">Rendez-vous</Badge>
                    <h4 className="font-semibold">Prise de Rendez-vous</h4>
                    <p className="text-sm text-muted-foreground">
                      Automatisez la prise de rendez-vous avec synchronisation calendrier et confirmations 
                      automatiques.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Video Tutorials Tab - Now Interactive Slideshows */}
          <TabsContent value="videos" className="space-y-6" id="videos">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Video className="h-5 w-5 text-red-500" />
                  Tutoriels Interactifs
                </CardTitle>
                <CardDescription>
                  Apprenez avec nos présentations interactives - cliquez sur Play pour lancer la lecture automatique
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {slideshowData.map((slideshow, index) => (
                    <div key={index} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{slideshow.category}</Badge>
                        <Badge variant="secondary" className="gap-1">
                          <PlayCircle className="w-3 h-3" />
                          {slideshow.duration}
                        </Badge>
                      </div>
                      <InteractiveSlideshow 
                        slides={slideshow.slides} 
                        title={slideshow.title}
                        autoPlayInterval={4000}
                      />
                      <p className="text-sm text-muted-foreground">{slideshow.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Video Categories */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookMarked className="h-5 w-5" />
                  Catégories
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {["Introduction", "Agents", "Clients", "Analytics", "Intégrations", "Campagnes", "Avancé"].map((category) => (
                    <Button key={category} variant="outline" className="gap-2">
                      <Play className="w-4 h-4" />
                      {category}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Installation Tab */}
          <TabsContent value="installation" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Guide d'Installation
                </CardTitle>
                <CardDescription>
                  Suivez ces étapes pour déployer votre instance AVA Statistics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Prerequisites */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Prérequis</h3>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>Node.js 18+ ou Bun</li>
                    <li>Compte Lovable (pour déploiement Cloud)</li>
                    <li>Compte Stripe (pour les paiements)</li>
                    <li>Clé API ElevenLabs (pour les agents vocaux)</li>
                  </ul>
                </div>

                <Separator />

                {/* Clone & Install */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">1. Cloner le Repository</h3>
                  <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
                    <code>git clone https://github.com/your-org/ava-statistics.git</code><br />
                    <code>cd ava-statistics</code><br />
                    <code>npm install</code>
                  </div>
                </div>

                <Separator />

                {/* Environment Variables */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">2. Variables d'Environnement</h3>
                  <p className="text-muted-foreground mb-4">
                    Les variables sont gérées automatiquement par Lovable Cloud. Pour un déploiement local, créez un fichier <code className="bg-muted px-1 rounded">.env</code> :
                  </p>
                  <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto space-y-1">
                    <code># Supabase (auto-configuré par Lovable Cloud)</code><br />
                    <code>VITE_SUPABASE_URL=https://your-project.supabase.co</code><br />
                    <code>VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key</code><br /><br />
                    <code># Stripe</code><br />
                    <code>STRIPE_SECRET_KEY=sk_live_...</code><br />
                    <code>STRIPE_WEBHOOK_SECRET=whsec_...</code><br /><br />
                    <code># Email (SMTP)</code><br />
                    <code>SMTP_HOST=smtp.example.com</code><br />
                    <code>SMTP_PORT=587</code><br />
                    <code>SMTP_USER=your-email</code><br />
                    <code>SMTP_PASSWORD=your-password</code><br />
                    <code>EMAIL_FROM=noreply@example.com</code><br /><br />
                    <code># Monitoring (optionnel)</code><br />
                    <code>VITE_SENTRY_DSN=https://...</code>
                  </div>
                </div>

                <Separator />

                {/* Development Server */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">3. Démarrer le Serveur de Développement</h3>
                  <div className="bg-muted rounded-lg p-4 font-mono text-sm">
                    <code>npm run dev</code>
                  </div>
                  <p className="text-muted-foreground mt-2">
                    L'application sera accessible sur <code className="bg-muted px-1 rounded">http://localhost:5173</code>
                  </p>
                </div>

                <Separator />

                {/* Production Build */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">4. Build Production</h3>
                  <div className="bg-muted rounded-lg p-4 font-mono text-sm">
                    <code>npm run build</code><br />
                    <code>npm run preview</code>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Database Setup */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Configuration Base de Données
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Lovable Cloud gère automatiquement la base de données PostgreSQL avec Supabase. 
                  Les migrations sont appliquées automatiquement lors du déploiement.
                </p>
                <div>
                  <h4 className="font-medium mb-2">Tables Principales</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {["organizations", "clients", "agents", "conversations", "billing_config", "user_roles", "webhook_endpoints", "audit_logs"].map((table) => (
                      <Badge key={table} variant="outline">{table}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Integrations Tab */}
          <TabsContent value="integrations" className="space-y-6">
            {/* ElevenLabs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  ElevenLabs - Agents Vocaux
                </CardTitle>
                <CardDescription>
                  Intégration avec ElevenLabs Conversational AI pour les agents vocaux
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Configuration</h4>
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li>Créez un compte sur <a href="https://elevenlabs.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">elevenlabs.io</a></li>
                    <li>Générez une clé API dans les paramètres développeur</li>
                    <li>Créez un agent conversationnel dans la console ElevenLabs</li>
                    <li>Copiez l'ID de l'agent</li>
                    <li>Dans AVA Statistics : Intégrations → ElevenLabs → Ajouter</li>
                    <li>Entrez la clé API et l'ID de l'agent</li>
                  </ol>
                </div>
                <Separator />
                <div>
                  <h4 className="font-medium mb-2">Fonctionnalités</h4>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Widget popup et iframe intégrables</li>
                    <li>Transcription en temps réel</li>
                    <li>Historique des conversations</li>
                    <li>Analyse de sentiment automatique</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Stripe */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-purple-500" />
                  Stripe - Paiements
                </CardTitle>
                <CardDescription>
                  Gestion des abonnements et paiements via Stripe
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Configuration</h4>
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li>Créez un compte sur <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">stripe.com</a></li>
                    <li>Récupérez votre clé secrète (Developers → API Keys)</li>
                    <li>Configurez le webhook endpoint : <code className="bg-muted px-1 rounded">/functions/v1/stripe-webhook</code></li>
                    <li>Ajoutez les secrets dans Lovable Cloud</li>
                  </ol>
                </div>
                <Separator />
                <div>
                  <h4 className="font-medium mb-2">Plans Disponibles</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="border rounded-lg p-4">
                      <h5 className="font-semibold">Starter</h5>
                      <p className="text-2xl font-bold">$1,200<span className="text-sm font-normal">/an</span></p>
                      <p className="text-muted-foreground text-sm">3 clients inclus</p>
                    </div>
                    <div className="border rounded-lg p-4 border-primary">
                      <h5 className="font-semibold">Growth</h5>
                      <p className="text-2xl font-bold">$3,000<span className="text-sm font-normal">/an</span></p>
                      <p className="text-muted-foreground text-sm">5 clients inclus</p>
                    </div>
                    <div className="border rounded-lg p-4">
                      <h5 className="font-semibold">Ultimate</h5>
                      <p className="text-2xl font-bold">$6,000<span className="text-sm font-normal">/an</span></p>
                      <p className="text-muted-foreground text-sm">10 clients inclus</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Email */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-blue-500" />
                  Email - SMTP
                </CardTitle>
                <CardDescription>
                  Configuration des emails transactionnels
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Secrets Requis</h4>
                  <div className="bg-muted rounded-lg p-4 font-mono text-sm space-y-1">
                    <code>SMTP_HOST</code> - Serveur SMTP<br />
                    <code>SMTP_PORT</code> - Port (587 pour TLS)<br />
                    <code>SMTP_USER</code> - Utilisateur<br />
                    <code>SMTP_PASSWORD</code> - Mot de passe<br />
                    <code>EMAIL_FROM</code> - Adresse expéditeur
                  </div>
                </div>
                <Separator />
                <div>
                  <h4 className="font-medium mb-2">Templates Disponibles</h4>
                  <div className="flex flex-wrap gap-2">
                    {["welcome", "password_reset", "invitation", "subscription_confirm", "subscription_cancelled", "2fa"].map((template) => (
                      <Badge key={template} variant="secondary">{template}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Webhooks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Webhook className="h-5 w-5 text-green-500" />
                  Webhooks Sortants
                </CardTitle>
                <CardDescription>
                  Configurez des webhooks pour recevoir des événements en temps réel
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Événements Supportés</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      "conversation.created",
                      "conversation.completed",
                      "agent.created",
                      "agent.updated",
                      "client.created",
                      "subscription.updated"
                    ].map((event) => (
                      <Badge key={event} variant="outline" className="justify-start">
                        {event}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Separator />
                <div>
                  <h4 className="font-medium mb-2">Format de Payload</h4>
                  <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
                    <pre>{`{
  "event": "conversation.completed",
  "timestamp": "2025-01-15T10:30:00Z",
  "data": {
    "id": "conv_123",
    "agent_id": "agent_456",
    "duration": 180,
    "transcript": "..."
  },
  "signature": "sha256=..."
}`}</pre>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Custom Domain */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-cyan-500" />
                  Domaine Personnalisé
                </CardTitle>
                <CardDescription>
                  Configurez votre propre domaine pour le white-label
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Accédez à SaaS Config → Domaine</li>
                  <li>Entrez votre domaine (ex: app.votreagence.com)</li>
                  <li>Ajoutez les enregistrements DNS fournis chez votre registrar</li>
                  <li>Attendez la propagation DNS (jusqu'à 48h)</li>
                  <li>Cliquez sur "Vérifier" pour activer</li>
                </ol>
                <div className="bg-muted rounded-lg p-4">
                  <h4 className="font-medium mb-2">Enregistrements DNS Requis</h4>
                  <div className="font-mono text-sm">
                    <code>CNAME app → app.avastatistic.com</code>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Reference Tab */}
          <TabsContent value="api" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Authentification API
                </CardTitle>
                <CardDescription>
                  Use API keys to access API endpoints
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Create an API Key</h4>
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li>Go to Settings → API Keys</li>
                    <li>Click "Create key"</li>
                    <li>Select the required scopes</li>
                    <li>Copy the key (shown only once)</li>
                  </ol>
                </div>
                <Separator />
                <div>
                  <h4 className="font-medium mb-2">Usage</h4>
                  <div className="bg-muted rounded-lg p-4 font-mono text-sm">
                    <code>Authorization: Bearer YOUR_API_KEY</code>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Available Scopes</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      "read:analytics",
                      "read:conversations",
                      "write:agents",
                      "write:clients",
                      "admin:billing",
                      "admin:settings"
                    ].map((scope) => (
                      <Badge key={scope} variant="outline">{scope}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Endpoints */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Endpoints
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-6">
                    {/* Conversations */}
                    <div>
                      <h4 className="font-semibold text-lg mb-3 flex items-center gap-2">
                        <Badge>Conversations</Badge>
                      </h4>
                      <div className="space-y-3">
                        <EndpointItem
                          method="GET"
                          path="/api/conversations"
                          description="List all conversations"
                          scope="read:conversations"
                        />
                        <EndpointItem
                          method="GET"
                          path="/api/conversations/:id"
                          description="Conversation details"
                          scope="read:conversations"
                        />
                        <EndpointItem
                          method="DELETE"
                          path="/api/conversations/:id"
                          description="Delete a conversation"
                          scope="write:conversations"
                        />
                      </div>
                    </div>

                    <Separator />

                    {/* Agents */}
                    <div>
                      <h4 className="font-semibold text-lg mb-3 flex items-center gap-2">
                        <Badge>Agents</Badge>
                      </h4>
                      <div className="space-y-3">
                        <EndpointItem
                          method="GET"
                          path="/api/agents"
                          description="List all agents"
                          scope="read:agents"
                        />
                        <EndpointItem
                          method="POST"
                          path="/api/agents"
                          description="Create an agent"
                          scope="write:agents"
                        />
                        <EndpointItem
                          method="PUT"
                          path="/api/agents/:id"
                          description="Edit an agent"
                          scope="write:agents"
                        />
                        <EndpointItem
                          method="DELETE"
                          path="/api/agents/:id"
                          description="Delete an agent"
                          scope="write:agents"
                        />
                      </div>
                    </div>

                    <Separator />

                    {/* Clients */}
                    <div>
                      <h4 className="font-semibold text-lg mb-3 flex items-center gap-2">
                        <Badge>Clients</Badge>
                      </h4>
                      <div className="space-y-3">
                        <EndpointItem
                          method="GET"
                          path="/api/clients"
                          description="List all clients"
                          scope="read:clients"
                        />
                        <EndpointItem
                          method="POST"
                          path="/api/clients"
                          description="Create a client"
                          scope="write:clients"
                        />
                        <EndpointItem
                          method="PUT"
                          path="/api/clients/:id"
                          description="Edit a client"
                          scope="write:clients"
                        />
                        <EndpointItem
                          method="DELETE"
                          path="/api/clients/:id"
                          description="Delete a client"
                          scope="write:clients"
                        />
                      </div>
                    </div>

                    <Separator />

                    {/* Analytics */}
                    <div>
                      <h4 className="font-semibold text-lg mb-3 flex items-center gap-2">
                        <Badge>Analytics</Badge>
                      </h4>
                      <div className="space-y-3">
                        <EndpointItem
                          method="GET"
                          path="/api/analytics/overview"
                          description="Métriques globales"
                          scope="read:analytics"
                        />
                        <EndpointItem
                          method="GET"
                          path="/api/analytics/conversations"
                          description="Statistiques conversations"
                          scope="read:analytics"
                        />
                        <EndpointItem
                          method="GET"
                          path="/api/analytics/agents/:id"
                          description="Métriques par agent"
                          scope="read:analytics"
                        />
                      </div>
                    </div>

                    <Separator />

                    {/* Webhooks */}
                    <div>
                      <h4 className="font-semibold text-lg mb-3 flex items-center gap-2">
                        <Badge>Webhooks</Badge>
                      </h4>
                      <div className="space-y-3">
                        <EndpointItem
                          method="GET"
                          path="/api/webhooks"
                          description="Liste des endpoints webhook"
                          scope="admin:settings"
                        />
                        <EndpointItem
                          method="POST"
                          path="/api/webhooks"
                          description="Create an endpoint"
                          scope="admin:settings"
                        />
                        <EndpointItem
                          method="DELETE"
                          path="/api/webhooks/:id"
                          description="Delete an endpoint"
                          scope="admin:settings"
                        />
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Rate Limits */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Rate Limits
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold">1000</p>
                    <p className="text-muted-foreground">requêtes/heure</p>
                    <Badge className="mt-2">Starter</Badge>
                  </div>
                  <div className="border rounded-lg p-4 text-center border-primary">
                    <p className="text-3xl font-bold">5000</p>
                    <p className="text-muted-foreground">requêtes/heure</p>
                    <Badge className="mt-2">Growth</Badge>
                  </div>
                  <div className="border rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold">∞</p>
                    <p className="text-muted-foreground">illimité</p>
                    <Badge className="mt-2">Ultimate</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="mt-12 text-center text-muted-foreground">
          <p>Besoin d'aide ? Contactez <a href="mailto:support@avastatistics.com" className="text-primary hover:underline">support@avastatistics.com</a></p>
          <p className="mt-2">
            <a href="/legal" className="hover:underline">Mentions légales</a>
            {" • "}
            <a href="/privacy" className="hover:underline">Politique de confidentialité</a>
          </p>
        </div>
      </div>
    </div>
  );
};

// Helper component for API endpoints
const EndpointItem = ({ 
  method, 
  path, 
  description, 
  scope 
}: { 
  method: string; 
  path: string; 
  description: string; 
  scope: string;
}) => {
  const methodColors: Record<string, string> = {
    GET: "bg-green-500/10 text-green-600 border-green-500/20",
    POST: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    PUT: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    DELETE: "bg-red-500/10 text-red-600 border-red-500/20",
  };

  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg bg-card">
      <Badge variant="outline" className={methodColors[method]}>
        {method}
      </Badge>
      <code className="font-mono text-sm flex-1">{path}</code>
      <span className="text-muted-foreground text-sm hidden md:block">{description}</span>
      <Badge variant="secondary" className="text-xs">{scope}</Badge>
    </div>
  );
};

export default Docs;
