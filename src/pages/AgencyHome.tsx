import { AppLayout } from "@/components/layout/AppLayout";
import { useOrganization } from "@/context/OrganizationContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Globe, 
  ExternalLink, 
  Trash2, 
  AlertCircle,
  BookOpen,
  MessageCircle,
  Youtube,
  PlayCircle,
  Mail,
  Bug,
  Calendar,
  HelpCircle,
  Copy,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Brain,
  BarChart3,
  Users,
  MessageSquare,
  TrendingUp,
  Zap,
  Activity,
  Bot
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { WelcomeModal } from "@/components/onboarding/WelcomeModal";
import { WhatsNewModal } from "@/components/dashboard/WhatsNewModal";
import { motion } from "framer-motion";
import { SimpleAnimatedCounter } from "@/components/ui/animated-counter";
import { useClientsMetrics } from "@/hooks/useClientsMetrics";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";

const AgencyHome = () => {
  const { selectedOrg } = useOrganization();
  const [copiedDomain, setCopiedDomain] = useState(false);
  const navigate = useNavigate();
  const { data: clientMetrics } = useClientsMetrics();
  const { data: dashboardMetrics } = useDashboardMetrics();

  const customDomain = selectedOrg?.domain;
  const hasCustomDomain = !!customDomain;

  const handleCopyDomain = () => {
    if (customDomain) {
      navigator.clipboard.writeText(customDomain);
      setCopiedDomain(true);
      toast.success("Domain copied to clipboard");
      setTimeout(() => setCopiedDomain(false), 2000);
    }
  };

  const handleVisitDomain = () => {
    if (customDomain) {
      window.open(`https://${customDomain}`, '_blank');
    }
  };

  const handleRemoveDomain = () => {
    toast.info("Domain removal feature coming soon");
  };

  // Statistiques principales avec animations
  const mainStats = [
    {
      title: "Active Clients",
      value: clientMetrics?.activeClients || 0,
      icon: Users,
      gradient: "from-electric-blue to-vivid-purple",
      glow: "shadow-electric-blue/30",
      trend: "+12%",
      trendPositive: true
    },
    {
      title: "AI Agents",
      value: clientMetrics?.assignedAgents || 0,
      icon: Bot,
      gradient: "from-vivid-purple to-hot-pink",
      glow: "shadow-vivid-purple/30",
      trend: "+5",
      trendPositive: true
    },
    {
      title: "Conversations",
      value: dashboardMetrics?.totalConversations || 0,
      icon: MessageSquare,
      gradient: "from-hot-pink to-sunset-orange",
      glow: "shadow-hot-pink/30",
      trend: "+24%",
      trendPositive: true
    },
    {
      title: "Satisfaction",
      value: dashboardMetrics?.avgSatisfaction || 0,
      suffix: "/10",
      icon: TrendingUp,
      gradient: "from-neon-green to-cyber-cyan",
      glow: "shadow-neon-green/30",
      trend: "+0.5",
      trendPositive: true
    }
  ];

  const resources = [
    {
      title: "Demo Center",
      description: "Discover all the features of the platform",
      icon: PlayCircle,
      href: "/demo",
      gradient: "from-electric-blue to-cyber-cyan",
      internal: true
    },
    {
      title: "Help Center",
      description: "Documentation and user guides",
      icon: BookOpen,
      href: "/docs",
      gradient: "from-vivid-purple to-hot-pink",
      internal: true
    },
    {
      title: "Training Content",
      description: "Guides and tutorials to master the platform",
      icon: Youtube,
      href: "/docs?tab=training",
      gradient: "from-sunset-orange to-hot-pink",
      internal: true
    },
    {
      title: "Video Tutorials",
      description: "Learn visually with our videos",
      icon: PlayCircle,
      href: "/docs?tab=videos",
      gradient: "from-neon-green to-electric-blue",
      internal: true
    }
  ];

  const helpOptions = [
    {
      title: "Contact Support",
      description: "Our team is here to help you",
      icon: Mail,
      action: () => window.open('mailto:support@example.com', '_blank'),
      variant: "default" as const,
      gradient: "from-electric-blue to-vivid-purple"
    },
    {
      title: "Report an issue",
      description: "Report a bug or malfunction",
      icon: Bug,
      action: () => toast.info("Reporting form coming soon"),
      variant: "outline" as const,
      gradient: "from-sunset-orange to-hot-pink"
    },
    {
      title: "Schedule a call",
      description: "Book a slot with our team",
      icon: Calendar,
      action: () => window.open('https://calendly.com', '_blank'),
      variant: "outline" as const,
      gradient: "from-neon-green to-cyber-cyan"
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <AppLayout>
      <WelcomeModal />
      <WhatsNewModal />
      <motion.div 
        className="container mx-auto px-6 py-8 space-y-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Hero Header avec Logo AVA Statistics */}
        <motion.div 
          variants={itemVariants}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-vivid-purple/10 to-hot-pink/10 p-8 border border-primary/20"
        >
          {/* Background decorations */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-electric-blue/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-hot-pink/20 to-transparent rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
          <div className="absolute top-1/2 left-1/2 w-48 h-48 bg-gradient-to-r from-vivid-purple/10 to-cyber-cyan/10 rounded-full blur-2xl -translate-x-1/2 -translate-y-1/2" />
          
          <div className="relative flex flex-col lg:flex-row items-center gap-6">
            {/* Logo AVA */}
            <motion.div 
              className="relative"
              animate={{ 
                scale: [1, 1.05, 1],
                rotate: [0, 2, -2, 0]
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-electric-blue via-vivid-purple to-hot-pink flex items-center justify-center shadow-2xl shadow-vivid-purple/40">
                <div className="w-20 h-20 rounded-xl bg-background/10 backdrop-blur-sm flex items-center justify-center">
                  <span className="text-4xl font-black text-white tracking-tight">AVA</span>
                </div>
              </div>
              {/* Glow effect */}
              <div className="absolute inset-0 w-24 h-24 rounded-2xl bg-gradient-to-br from-electric-blue via-vivid-purple to-hot-pink opacity-50 blur-xl -z-10 animate-pulse" />
            </motion.div>
            
            {/* Title & Subtitle */}
            <div className="flex-1 text-center lg:text-left">
              <motion.h1 
                className="text-4xl lg:text-5xl font-black mb-2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <span className="bg-gradient-to-r from-electric-blue via-vivid-purple to-hot-pink bg-clip-text text-transparent">
                  AVA Statistics
                </span>
              </motion.h1>
              <motion.p 
                className="text-lg text-muted-foreground flex items-center gap-2 justify-center lg:justify-start"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Sparkles className="h-5 w-5 text-vivid-purple animate-pulse" />
                Welcome, {selectedOrg?.name || 'Agency'}
                <Sparkles className="h-5 w-5 text-hot-pink animate-pulse" />
              </motion.p>
            </div>

            {/* Quick access buttons */}
            <div className="flex gap-3">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  onClick={() => navigate('/dashboard')}
                  className="gap-2 bg-gradient-to-r from-electric-blue to-vivid-purple hover:opacity-90 shadow-lg shadow-vivid-purple/30"
                >
                  <BarChart3 className="h-4 w-4" />
                  Dashboard
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  variant="outline"
                  onClick={() => navigate('/agents')}
                  className="gap-2 border-vivid-purple/50 hover:bg-vivid-purple/10"
                >
                  <Bot className="h-4 w-4" />
                  Agents
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Main Statistics with Animated Counters */}
        <motion.div variants={itemVariants}>
          <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Activity className="h-6 w-6 text-electric-blue" />
            <span className="bg-gradient-to-r from-electric-blue to-vivid-purple bg-clip-text text-transparent">
              Overview
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {mainStats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.03, y: -5 }}
                >
                  <Card className={`relative overflow-hidden border-0 bg-gradient-to-br ${stat.gradient} p-[1px] shadow-xl ${stat.glow}`}>
                    <div className="absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-20 animate-pulse" />
                    <CardContent className="relative bg-background/95 backdrop-blur-xl rounded-[inherit] p-5">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground font-medium">{stat.title}</p>
                          <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black">
                              <SimpleAnimatedCounter value={stat.value} duration={1500} />
                            </span>
                            {stat.suffix && <span className="text-lg text-muted-foreground">{stat.suffix}</span>}
                          </div>
                          <div className={`flex items-center gap-1 text-xs ${stat.trendPositive ? 'text-neon-green' : 'text-destructive'}`}>
                            <TrendingUp className="h-3 w-3" />
                            {stat.trend} this month
                          </div>
                        </div>
                        <motion.div 
                          className={`p-3 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg`}
                          animate={{ rotate: [0, 5, -5, 0] }}
                          transition={{ duration: 3, repeat: Infinity, delay: index * 0.2 }}
                        >
                          <Icon className="h-6 w-6 text-white" />
                        </motion.div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Section Custom Domain */}
        <motion.div variants={itemVariants}>
          <Card className="relative overflow-hidden border-vivid-purple/20 bg-gradient-to-br from-vivid-purple/5 to-hot-pink/5">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-vivid-purple/10 to-transparent rounded-full blur-2xl" />
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div 
                    className="w-12 h-12 rounded-xl bg-gradient-to-br from-electric-blue to-vivid-purple flex items-center justify-center shadow-lg shadow-vivid-purple/30"
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 4, repeat: Infinity }}
                  >
                    <Globe className="w-6 h-6 text-white" />
                  </motion.div>
                  <div>
                    <CardTitle className="bg-gradient-to-r from-electric-blue to-vivid-purple bg-clip-text text-transparent">
                      Custom Domain
                    </CardTitle>
                    <CardDescription>Configure your custom domain</CardDescription>
                  </div>
                </div>
                {hasCustomDomain && (
                  <Badge className="bg-neon-green/20 text-neon-green border-neon-green/30">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Actif
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 relative">
              {hasCustomDomain ? (
                <>
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 border border-border/50">
                    <Globe className="w-5 h-5 text-muted-foreground" />
                    <span className="font-mono text-lg flex-1">{customDomain}</span>
                    <Button variant="ghost" size="icon" onClick={handleCopyDomain}>
                      {copiedDomain ? (
                        <CheckCircle2 className="w-4 h-4 text-neon-green" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <div className="flex gap-3">
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button onClick={handleVisitDomain} className="gap-2 bg-gradient-to-r from-electric-blue to-vivid-purple">
                        <ExternalLink className="w-4 h-4" />
                        Visiter
                      </Button>
                    </motion.div>
                    <Button variant="destructive" onClick={handleRemoveDomain} className="gap-2">
                      <Trash2 className="w-4 h-4" />
                      Retirer
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Globe className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  </motion.div>
                  <p className="text-muted-foreground mb-4">
                    No custom domain configured
                  </p>
                  <Button 
                    variant="outline" 
                    onClick={() => toast.info("Configuration is available in Settings → Domains")}
                    className="border-vivid-purple/50 hover:bg-vivid-purple/10"
                  >
                    Configure a domain
                  </Button>
                </div>
              )}

              {/* Notice DNS/Cloudflare */}
              <Alert className="mt-4 border-sunset-orange/30 bg-sunset-orange/5">
                <AlertCircle className="h-4 w-4 text-sunset-orange" />
                <AlertTitle className="text-sunset-orange">DNS Configuration</AlertTitle>
                <AlertDescription className="text-muted-foreground">
                  To connect your domain, add an A record pointing to <code className="bg-muted px-1 rounded">185.158.133.1</code> and a TXT record for verification. 
                  DNS propagation can take up to 72 hours.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </motion.div>

        {/* Section Ressources */}
        <motion.div variants={itemVariants} className="space-y-4">
          <h3 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-hot-pink" />
            <span className="bg-gradient-to-r from-hot-pink to-sunset-orange bg-clip-text text-transparent">
              Resources
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {resources.map((resource, index) => {
              const Icon = resource.icon;
              return (
                <motion.div
                  key={resource.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  whileHover={{ scale: 1.03, y: -5 }}
                  onClick={() => resource.internal ? navigate(resource.href) : window.open(resource.href, '_blank')}
                >
                  <Card className="cursor-pointer group relative overflow-hidden border-transparent hover:border-primary/30 transition-all bg-gradient-to-br from-muted/50 to-muted/30">
                    <div className={`absolute inset-0 bg-gradient-to-br ${resource.gradient} opacity-0 group-hover:opacity-10 transition-opacity`} />
                    <CardContent className="p-6 relative">
                      <motion.div 
                        className={`w-12 h-12 rounded-xl bg-gradient-to-br ${resource.gradient} flex items-center justify-center mb-4 shadow-lg`}
                        whileHover={{ rotate: 10, scale: 1.1 }}
                      >
                        <Icon className="w-6 h-6 text-white" />
                      </motion.div>
                      <h4 className="font-semibold mb-1 flex items-center gap-2 group-hover:text-primary transition-colors">
                        {resource.title}
                        <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1" />
                      </h4>
                      <p className="text-sm text-muted-foreground">{resource.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Additional Help Section */}
        <motion.div variants={itemVariants}>
          <Card className="relative overflow-hidden border-neon-green/20 bg-gradient-to-br from-neon-green/5 to-cyber-cyan/5">
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-gradient-to-tl from-neon-green/10 to-transparent rounded-full blur-3xl" />
            <CardHeader>
              <div className="flex items-center gap-3">
                <motion.div 
                  className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-green to-cyber-cyan flex items-center justify-center shadow-lg shadow-neon-green/30"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <HelpCircle className="w-6 h-6 text-white" />
                </motion.div>
                <div>
                  <CardTitle className="bg-gradient-to-r from-neon-green to-cyber-cyan bg-clip-text text-transparent">
                    Need help?
                  </CardTitle>
                  <CardDescription>Our team is here to support you</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {helpOptions.map((option, index) => {
                  const Icon = option.icon;
                  return (
                    <motion.div
                      key={option.title}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 + index * 0.1 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Button
                        variant={option.variant}
                        className={`h-auto w-full py-6 flex-col gap-3 ${option.variant === 'default' ? `bg-gradient-to-r ${option.gradient} hover:opacity-90` : 'hover:border-primary/50'}`}
                        onClick={option.action}
                      >
                        <motion.div
                          animate={{ y: [0, -3, 0] }}
                          transition={{ duration: 2, repeat: Infinity, delay: index * 0.3 }}
                        >
                          <Icon className="w-8 h-8" />
                        </motion.div>
                        <div className="text-center">
                          <div className="font-semibold">{option.title}</div>
                          <div className="text-xs opacity-80 font-normal mt-1">
                            {option.description}
                          </div>
                        </div>
                      </Button>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AppLayout>
  );
};

export default AgencyHome;
