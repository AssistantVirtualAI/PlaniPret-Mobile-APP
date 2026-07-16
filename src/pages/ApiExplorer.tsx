import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Code, Wrench, Globe, Webhook, Server, ArrowLeft, Zap, Activity } from 'lucide-react';
import { EndpointExplorer } from '@/components/api-explorer/EndpointExplorer';
import { MCPServerTester } from '@/components/api-explorer/MCPServerTester';
import { WebhookManager } from '@/components/api-explorer/WebhookManager';
import { MCPManager } from '@/components/api-explorer/MCPManager';
import { useLanguage } from '@/context/LanguageContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

const ApiExplorer = () => {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState('endpoints');

  const texts = {
    title: language === 'fr' ? 'Explorateur API' : 'API Explorer',
    description: language === 'fr' 
      ? 'Testez les endpoints, gérez les webhooks et configurez les serveurs MCP'
      : 'Test API endpoints, manage webhooks, and configure MCP servers',
    endpoints: language === 'fr' ? 'Endpoints API' : 'API Endpoints',
    webhooks: language === 'fr' ? 'Webhooks' : 'Webhooks',
    mcpConfig: language === 'fr' ? 'Config MCP' : 'MCP Config',
    mcpTester: language === 'fr' ? 'Testeur MCP' : 'MCP Tester',
    backToDashboard: language === 'fr' ? 'Retour au Dashboard' : 'Back to Dashboard',
  };

  const tabItems = [
    { id: 'endpoints', label: texts.endpoints, icon: Code, color: 'from-blue-500/20 to-blue-500/5' },
    { id: 'webhooks', label: texts.webhooks, icon: Webhook, color: 'from-green-500/20 to-green-500/5' },
    { id: 'mcp-config', label: texts.mcpConfig, icon: Server, color: 'from-purple-500/20 to-purple-500/5' },
    { id: 'mcp-tester', label: texts.mcpTester, icon: Wrench, color: 'from-amber-500/20 to-amber-500/5' },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header with gradient background */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20 p-6"
        >
          <div className="absolute inset-0 bg-grid-pattern opacity-5" />
          <div className="relative z-10">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="mb-4 gap-2 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" />
                {texts.backToDashboard}
              </Button>
            </Link>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20">
                <Globe className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
                  {texts.title}
                  <Badge variant="outline" className="text-xs border-primary/40 bg-primary/10">
                    <Activity className="w-3 h-3 mr-1" />
                    {language === 'fr' ? 'Avancé' : 'Advanced'}
                  </Badge>
                </h1>
                <p className="text-muted-foreground mt-1">{texts.description}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {tabItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 + index * 0.05 }}
              >
                <Card 
                  className={`cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-2 ${
                    activeTab === item.id ? 'border-primary shadow-primary/20' : 'border-transparent hover:border-muted'
                  } bg-gradient-to-br ${item.color}`}
                  onClick={() => setActiveTab(item.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${activeTab === item.id ? 'bg-primary/20' : 'bg-muted'}`}>
                        <Icon className={`w-5 h-5 ${activeTab === item.id ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{item.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {activeTab === item.id 
                            ? (language === 'fr' ? 'Actif' : 'Active')
                            : (language === 'fr' ? 'Cliquez pour voir' : 'Click to view')
                          }
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Tabs Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-2">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <CardHeader className="border-b bg-muted/30">
                <TabsList className="grid w-full grid-cols-4 bg-muted/50">
                  {tabItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <TabsTrigger 
                        key={item.id}
                        value={item.id} 
                        className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                      >
                        <Icon className="h-4 w-4" />
                        <span className="hidden sm:inline">{item.label}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </CardHeader>

              <CardContent className="p-6">
                <TabsContent value="endpoints" className="mt-0">
                  <EndpointExplorer />
                </TabsContent>

                <TabsContent value="webhooks" className="mt-0">
                  <WebhookManager />
                </TabsContent>

                <TabsContent value="mcp-config" className="mt-0">
                  <MCPManager />
                </TabsContent>

                <TabsContent value="mcp-tester" className="mt-0">
                  <MCPServerTester />
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default ApiExplorer;
