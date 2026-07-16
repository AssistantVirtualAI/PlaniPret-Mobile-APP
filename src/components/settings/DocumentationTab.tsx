import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen,
  Search,
  Bot,
  Users,
  Settings as SettingsIcon,
  Sparkles,
  Plug,
  Phone,
  ChevronRight,
  PlayCircle,
  CheckCircle2,
  Lightbulb,
  BarChart3,
  ShieldCheck,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { motion } from 'framer-motion';
import { translations } from '@/locales';
import shotAgents from '@/assets/docs/agents.png.asset.json';
import shotAgentBuilder from '@/assets/docs/agent-builder.png.asset.json';
import shotClients from '@/assets/docs/clients.png.asset.json';
import shotSettings from '@/assets/docs/settings.png.asset.json';
import shotIntegrations from '@/assets/docs/integrations.png.asset.json';
import shotDashboard from '@/assets/docs/dashboard.png.asset.json';
import shotAnalytics from '@/assets/docs/analytics.png.asset.json';
import shotTopics from '@/assets/docs/topics.png.asset.json';
import shotLeads from '@/assets/docs/leads.png.asset.json';
import shotPhone from '@/assets/docs/phone.png.asset.json';
import shotApiKeys from '@/assets/docs/api-keys.png.asset.json';
import shotBilling from '@/assets/docs/billing.png.asset.json';
import shotTeam from '@/assets/docs/team.png.asset.json';
import shotWebhooks from '@/assets/docs/webhooks.png.asset.json';

const LESSON_IMAGES: Record<string, string> = {
  'create-agent': shotAgents.url,
  'tune-prompt': shotAgentBuilder.url,
  'test-agent': shotAgentBuilder.url,
  'create-client': shotClients.url,
  'assign-agents': shotClients.url,
  'client-portal': shotClients.url,
  branding: shotSettings.url,
  members: shotTeam.url,
  billing: shotBilling.url,
  elevenlabs: shotIntegrations.url,
  vapi: shotIntegrations.url,
  retell: shotIntegrations.url,
  phone: shotPhone.url,
  webhooks: shotWebhooks.url,
  dashboard: shotDashboard.url,
  voiceAnalytics: shotAnalytics.url,
  topics: shotTopics.url,
  leads: shotLeads.url,
  roles: shotSettings.url,
  audit: shotSettings.url,
  gdpr: shotSettings.url,
  apiKeys: shotApiKeys.url,
};


type Lesson = {
  id: string;
  titleKey: string;
  descKey: string;
  stepsKey: string; // array key
  tipKey?: string;
  minutes: number;
  level: 'beginner' | 'intermediate' | 'advanced';
};

type Module = {
  id: string;
  icon: typeof Bot;
  color: string;
  titleKey: string;
  subtitleKey: string;
  lessons: Lesson[];
};

const MODULES: Module[] = [
  {
    id: 'agents',
    icon: Bot,
    color: 'from-violet-500 to-fuchsia-500',
    titleKey: 'training.modules.agents.title',
    subtitleKey: 'training.modules.agents.subtitle',
    lessons: [
      {
        id: 'create-agent',
        titleKey: 'training.lessons.createAgent.title',
        descKey: 'training.lessons.createAgent.desc',
        stepsKey: 'training.lessons.createAgent.steps',
        tipKey: 'training.lessons.createAgent.tip',
        minutes: 5,
        level: 'beginner',
      },
      {
        id: 'tune-prompt',
        titleKey: 'training.lessons.tunePrompt.title',
        descKey: 'training.lessons.tunePrompt.desc',
        stepsKey: 'training.lessons.tunePrompt.steps',
        tipKey: 'training.lessons.tunePrompt.tip',
        minutes: 7,
        level: 'intermediate',
      },
      {
        id: 'test-agent',
        titleKey: 'training.lessons.testAgent.title',
        descKey: 'training.lessons.testAgent.desc',
        stepsKey: 'training.lessons.testAgent.steps',
        minutes: 4,
        level: 'beginner',
      },
    ],
  },
  {
    id: 'clients',
    icon: Users,
    color: 'from-emerald-500 to-teal-500',
    titleKey: 'training.modules.clients.title',
    subtitleKey: 'training.modules.clients.subtitle',
    lessons: [
      {
        id: 'create-client',
        titleKey: 'training.lessons.createClient.title',
        descKey: 'training.lessons.createClient.desc',
        stepsKey: 'training.lessons.createClient.steps',
        minutes: 4,
        level: 'beginner',
      },
      {
        id: 'assign-agents',
        titleKey: 'training.lessons.assignAgents.title',
        descKey: 'training.lessons.assignAgents.desc',
        stepsKey: 'training.lessons.assignAgents.steps',
        tipKey: 'training.lessons.assignAgents.tip',
        minutes: 5,
        level: 'beginner',
      },
      {
        id: 'client-portal',
        titleKey: 'training.lessons.clientPortal.title',
        descKey: 'training.lessons.clientPortal.desc',
        stepsKey: 'training.lessons.clientPortal.steps',
        minutes: 6,
        level: 'intermediate',
      },
    ],
  },
  {
    id: 'settings',
    icon: SettingsIcon,
    color: 'from-blue-500 to-cyan-500',
    titleKey: 'training.modules.settings.title',
    subtitleKey: 'training.modules.settings.subtitle',
    lessons: [
      {
        id: 'branding',
        titleKey: 'training.lessons.branding.title',
        descKey: 'training.lessons.branding.desc',
        stepsKey: 'training.lessons.branding.steps',
        minutes: 5,
        level: 'beginner',
      },
      {
        id: 'members',
        titleKey: 'training.lessons.members.title',
        descKey: 'training.lessons.members.desc',
        stepsKey: 'training.lessons.members.steps',
        tipKey: 'training.lessons.members.tip',
        minutes: 4,
        level: 'beginner',
      },
      {
        id: 'billing',
        titleKey: 'training.lessons.billing.title',
        descKey: 'training.lessons.billing.desc',
        stepsKey: 'training.lessons.billing.steps',
        minutes: 3,
        level: 'beginner',
      },
    ],
  },
  {
    id: 'integrations',
    icon: Plug,
    color: 'from-orange-500 to-pink-500',
    titleKey: 'training.modules.integrations.title',
    subtitleKey: 'training.modules.integrations.subtitle',
    lessons: [
      {
        id: 'elevenlabs',
        titleKey: 'training.lessons.elevenlabs.title',
        descKey: 'training.lessons.elevenlabs.desc',
        stepsKey: 'training.lessons.elevenlabs.steps',
        minutes: 6,
        level: 'intermediate',
      },
      {
        id: 'vapi',
        titleKey: 'training.lessons.vapi.title',
        descKey: 'training.lessons.vapi.desc',
        stepsKey: 'training.lessons.vapi.steps',
        minutes: 5,
        level: 'intermediate',
      },
      {
        id: 'retell',
        titleKey: 'training.lessons.retell.title',
        descKey: 'training.lessons.retell.desc',
        stepsKey: 'training.lessons.retell.steps',
        minutes: 5,
        level: 'intermediate',
      },
      {
        id: 'phone',
        titleKey: 'training.lessons.phone.title',
        descKey: 'training.lessons.phone.desc',
        stepsKey: 'training.lessons.phone.steps',
        tipKey: 'training.lessons.phone.tip',
        minutes: 8,
        level: 'advanced',
      },
      {
        id: 'webhooks',
        titleKey: 'training.lessons.webhooks.title',
        descKey: 'training.lessons.webhooks.desc',
        stepsKey: 'training.lessons.webhooks.steps',
        tipKey: 'training.lessons.webhooks.tip',
        minutes: 6,
        level: 'advanced',
      },
    ],
  },
  {
    id: 'analytics',
    icon: BarChart3,
    color: 'from-indigo-500 to-purple-500',
    titleKey: 'training.modules.analytics.title',
    subtitleKey: 'training.modules.analytics.subtitle',
    lessons: [
      {
        id: 'dashboard',
        titleKey: 'training.lessons.dashboard.title',
        descKey: 'training.lessons.dashboard.desc',
        stepsKey: 'training.lessons.dashboard.steps',
        minutes: 4,
        level: 'beginner',
      },
      {
        id: 'voiceAnalytics',
        titleKey: 'training.lessons.voiceAnalytics.title',
        descKey: 'training.lessons.voiceAnalytics.desc',
        stepsKey: 'training.lessons.voiceAnalytics.steps',
        tipKey: 'training.lessons.voiceAnalytics.tip',
        minutes: 6,
        level: 'intermediate',
      },
      {
        id: 'topics',
        titleKey: 'training.lessons.topics.title',
        descKey: 'training.lessons.topics.desc',
        stepsKey: 'training.lessons.topics.steps',
        minutes: 5,
        level: 'intermediate',
      },
      {
        id: 'leads',
        titleKey: 'training.lessons.leads.title',
        descKey: 'training.lessons.leads.desc',
        stepsKey: 'training.lessons.leads.steps',
        minutes: 5,
        level: 'beginner',
      },
    ],
  },
  {
    id: 'security',
    icon: ShieldCheck,
    color: 'from-rose-500 to-red-500',
    titleKey: 'training.modules.security.title',
    subtitleKey: 'training.modules.security.subtitle',
    lessons: [
      {
        id: 'roles',
        titleKey: 'training.lessons.roles.title',
        descKey: 'training.lessons.roles.desc',
        stepsKey: 'training.lessons.roles.steps',
        tipKey: 'training.lessons.roles.tip',
        minutes: 5,
        level: 'intermediate',
      },
      {
        id: 'audit',
        titleKey: 'training.lessons.audit.title',
        descKey: 'training.lessons.audit.desc',
        stepsKey: 'training.lessons.audit.steps',
        minutes: 4,
        level: 'beginner',
      },
      {
        id: 'gdpr',
        titleKey: 'training.lessons.gdpr.title',
        descKey: 'training.lessons.gdpr.desc',
        stepsKey: 'training.lessons.gdpr.steps',
        tipKey: 'training.lessons.gdpr.tip',
        minutes: 6,
        level: 'advanced',
      },
      {
        id: 'apiKeys',
        titleKey: 'training.lessons.apiKeys.title',
        descKey: 'training.lessons.apiKeys.desc',
        stepsKey: 'training.lessons.apiKeys.steps',
        minutes: 4,
        level: 'intermediate',
      },
    ],
  },
];

const levelColor: Record<string, string> = {
  beginner: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  intermediate: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  advanced: 'bg-rose-500/15 text-rose-500 border-rose-500/30',
};

export const DocumentationTab = () => {
  const { t, language } = useTranslation();
  const [query, setQuery] = useState('');
  const [activeModule, setActiveModule] = useState<string>('agents');

  const arr = (key: string): string[] => {
    const value = key.split('.').reduce<any>((acc, part) => acc?.[part], translations[language]);
    return Array.isArray(value) ? value : [];
  };

  const filteredModules = MODULES.map((m) => ({
    ...m,
    lessons: m.lessons.filter((l) => {
      const q = query.toLowerCase().trim();
      if (!q) return true;
      return (
        String(t(l.titleKey)).toLowerCase().includes(q) ||
        String(t(l.descKey)).toLowerCase().includes(q)
      );
    }),
  })).filter((m) => m.lessons.length > 0);

  const totalLessons = MODULES.reduce((a, m) => a + m.lessons.length, 0);
  const totalMinutes = MODULES.reduce(
    (a, m) => a + m.lessons.reduce((b, l) => b + l.minutes, 0),
    0,
  );

  const current = filteredModules.find((m) => m.id === activeModule) ?? filteredModules[0];

  return (
    <div className="space-y-6 pb-32">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-background to-secondary/15 p-6 md:p-8"
      >
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.3),transparent_60%)]" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <Badge className="bg-primary/20 text-primary border-primary/30 hover:bg-primary/20">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              {t('training.hero.badge')}
            </Badge>
            <h2 className="text-2xl md:text-3xl font-bold gradient-text leading-tight">
              {t('training.hero.title')}
            </h2>
            <p className="text-muted-foreground">{t('training.hero.subtitle')}</p>
            <div className="flex flex-wrap gap-4 pt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-primary" />
                {totalLessons} {t('training.stats.lessons')}
              </span>
              <span className="flex items-center gap-1.5">
                <PlayCircle className="w-4 h-4 text-primary" />
                ~{totalMinutes} {t('training.stats.minutes')}
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                {MODULES.length} {t('training.stats.modules')}
              </span>
            </div>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('training.searchPlaceholder')}
              className="pl-9 bg-background/80 backdrop-blur"
            />
          </div>
        </div>
      </motion.div>

      {/* Module nav + content */}
      <div className="grid lg:grid-cols-[260px_1fr] gap-6">
        <div className="space-y-2">
          {filteredModules.map((m) => {
            const Icon = m.icon;
            const active = current?.id === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setActiveModule(m.id)}
                className={`w-full text-left rounded-xl border transition-all p-3 flex items-center gap-3 group ${
                  active
                    ? 'border-primary/40 bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/30 hover:bg-muted/40'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg bg-gradient-to-br ${m.color} flex items-center justify-center shrink-0 shadow-md`}
                >
                  <Icon className="w-4.5 h-4.5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground truncate">
                    {t(m.titleKey)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {m.lessons.length} {t('training.stats.lessons')}
                  </div>
                </div>
                <ChevronRight
                  className={`w-4 h-4 text-muted-foreground transition-transform ${
                    active ? 'translate-x-0.5 text-primary' : 'group-hover:translate-x-0.5'
                  }`}
                />
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          {current && (
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${current.color} flex items-center justify-center shadow-lg`}
                >
                  <current.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">{t(current.titleKey)}</h3>
                  <p className="text-sm text-muted-foreground">{t(current.subtitleKey)}</p>
                </div>
              </div>

              <Card className="border-border/60">
                <CardContent className="p-2 md:p-4">
                  <Accordion type="multiple" defaultValue={current.lessons.map((l) => l.id)}>
                    {current.lessons.map((lesson, i) => {
                      const steps = arr(lesson.stepsKey);
                      return (
                        <AccordionItem
                          key={lesson.id}
                          value={lesson.id}
                          className="border-border/60"
                        >
                          <AccordionTrigger className="hover:no-underline px-2 py-3">
                            <div className="flex items-start gap-3 text-left flex-1 min-w-0">
                              <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                                {i + 1}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-foreground">
                                    {t(lesson.titleKey)}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] py-0 px-1.5 ${levelColor[lesson.level]}`}
                                  >
                                    {t(`training.level.${lesson.level}`)}
                                  </Badge>
                                  <span className="text-[11px] text-muted-foreground">
                                    · {lesson.minutes} {t('training.stats.min')}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                  {t(lesson.descKey)}
                                </p>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-2 pb-4">
                            <div className="pl-10 space-y-3">
                              {LESSON_IMAGES[lesson.id] && (
                                <div className="rounded-lg border border-border overflow-hidden bg-muted/20">
                                  <img
                                    src={LESSON_IMAGES[lesson.id]}
                                    alt={String(t(lesson.titleKey))}
                                    loading="lazy"
                                    className="w-full h-auto block"
                                  />
                                </div>
                              )}
                              <p className="text-sm text-muted-foreground">{t(lesson.descKey)}</p>
                              <ol className="space-y-2">
                                {steps.map((step, idx) => (
                                  <li key={idx} className="flex gap-3 text-sm">
                                    <span className="mt-0.5 w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
                                      {idx + 1}
                                    </span>
                                    <span className="text-foreground/90 leading-relaxed">
                                      {step}
                                    </span>
                                  </li>
                                ))}
                              </ol>
                              {lesson.tipKey && (
                                <div className="flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                  <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                  <p className="text-xs text-foreground/90">
                                    <span className="font-semibold text-amber-500">
                                      {t('training.tip')}:
                                    </span>{' '}
                                    {t(lesson.tipKey)}
                                  </p>
                                </div>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {filteredModules.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                {t('training.noResults')}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
