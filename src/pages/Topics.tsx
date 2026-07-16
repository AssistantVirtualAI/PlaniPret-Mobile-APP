import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTopics } from '@/hooks/useTopics';
import { Search, RefreshCw, TrendingUp, MessageSquare, Sparkles, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { useTranslation } from '@/hooks/useTranslation';

const CATEGORY_COLORS: Record<string, string> = {
  'Support': 'hsl(var(--primary))',
  'Sales': 'hsl(142 76% 36%)',
  'Technical': 'hsl(221 83% 53%)',
  'Billing': 'hsl(45 93% 47%)',
  'General': 'hsl(var(--muted-foreground))',
  'Product': 'hsl(280 87% 65%)',
  'Shipping': 'hsl(199 89% 48%)',
  'Returns': 'hsl(0 84% 60%)',
};

const SENTIMENT_COLORS = {
  positive: 'hsl(142 76% 36%)',
  neutral: 'hsl(var(--muted-foreground))',
  negative: 'hsl(0 84% 60%)',
};

const Topics = () => {
  const { t } = useTranslation();
  const { aggregates, recentTopics, isLoading, analyzeTopics, refetch } = useTopics();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const result = await analyzeTopics();
      toast.success(`${result.topics?.length || 0} ${t('topics.title').toLowerCase()}`);
      refetch();
    } catch (error) {
      toast.error(t('common.error'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const filteredAggregates = aggregates.filter(t => 
    t.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Prepare chart data
  const categoryData = Object.entries(
    filteredAggregates.reduce((acc, t) => {
      const cat = t.category || 'General';
      acc[cat] = (acc[cat] || 0) + t.total_mentions;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  const topTopics = filteredAggregates.slice(0, 10);

  const sentimentBreakdown = recentTopics.reduce((acc, t) => {
    const s = t.sentiment || 'neutral';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalTopics = aggregates.reduce((sum, t) => sum + t.total_mentions, 0);

  return (
    <AppLayout>
      <div className="container mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('topics.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {t('topics.description')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('topics.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              {t('topics.refresh')}
            </Button>
            <Button
              size="sm"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="gap-2"
            >
              <Sparkles className={`h-4 w-4 ${isAnalyzing ? 'animate-pulse' : ''}`} />
              {t('topics.analyzeConversations')}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('topics.stats.totalTopics')}</p>
                  <p className="text-3xl font-bold">{aggregates.length}</p>
                </div>
                <div className="p-3 rounded-lg bg-primary/10">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('topics.stats.totalMentions')}</p>
                  <p className="text-3xl font-bold">{totalTopics}</p>
                </div>
                <div className="p-3 rounded-lg bg-primary/10">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('topics.stats.categories')}</p>
                  <p className="text-3xl font-bold">{categoryData.length}</p>
                </div>
                <div className="p-3 rounded-lg bg-primary/10">
                  <BarChart3 className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('topics.stats.positiveSentiment')}</p>
                  <p className="text-3xl font-bold">
                    {recentTopics.length > 0 
                      ? Math.round((sentimentBreakdown.positive || 0) / recentTopics.length * 100)
                      : 0}%
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-500/10">
                  <Sparkles className="h-6 w-6 text-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="trending" className="space-y-4">
          <TabsList>
            <TabsTrigger value="trending">{t('topics.tabs.trending')}</TabsTrigger>
            <TabsTrigger value="categories">{t('topics.tabs.categories')}</TabsTrigger>
            <TabsTrigger value="recent">{t('topics.tabs.recent')}</TabsTrigger>
          </TabsList>

          <TabsContent value="trending" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Topics */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('topics.popularTopics')}</CardTitle>
                  <CardDescription>{t('topics.mostMentioned')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {topTopics.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      {t('topics.noTopics')}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {topTopics.map((topic, index) => (
                        <div key={topic.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-semibold text-muted-foreground">
                                #{index + 1}
                              </span>
                              <span className="font-medium">{topic.topic}</span>
                              {topic.category && (
                                <Badge 
                                  variant="secondary"
                                  style={{ 
                                    backgroundColor: `${CATEGORY_COLORS[topic.category] || CATEGORY_COLORS.General}20`,
                                    color: CATEGORY_COLORS[topic.category] || CATEGORY_COLORS.General
                                  }}
                                >
                                  {topic.category}
                                </Badge>
                              )}
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {topic.total_mentions} {t('topics.mentions')}
                            </span>
                          </div>
                          <Progress
                            value={(topic.total_mentions / (topTopics[0]?.total_mentions || 1)) * 100} 
                            className="h-2"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top Topics Bar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('topics.mentionDistribution')}</CardTitle>
                  <CardDescription>{t('topics.top10Topics')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {topTopics.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      {t('topics.noData')}
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={topTopics} layout="vertical">
                        <XAxis type="number" />
                        <YAxis 
                          dataKey="topic" 
                          type="category" 
                          width={100}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip />
                        <Bar 
                          dataKey="total_mentions" 
                          fill="hsl(var(--primary))" 
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Category Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('topics.categoryBreakdown')}</CardTitle>
                  <CardDescription>{t('topics.categoryDistribution')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {categoryData.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      {t('topics.noData')}
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {categoryData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={CATEGORY_COLORS[entry.name] || CATEGORY_COLORS.General}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Category List */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('topics.categoryDetails')}</CardTitle>
                  <CardDescription>{t('topics.mentionsByCategory')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {categoryData.map((cat) => (
                      <div key={cat.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: CATEGORY_COLORS[cat.name] || CATEGORY_COLORS.General }}
                          />
                          <span className="font-medium">{cat.name}</span>
                        </div>
                        <Badge variant="secondary">{cat.value} {t('topics.mentions')}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="recent" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('topics.recentlyAnalyzed')}</CardTitle>
                <CardDescription>{t('topics.lastTopicsExtracted')}</CardDescription>
              </CardHeader>
              <CardContent>
                {recentTopics.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    {t('topics.noRecentTopics')}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {recentTopics.slice(0, 50).map((topic) => (
                      <Badge
                        key={topic.id}
                        variant="outline"
                        className="px-4 py-2 text-sm"
                        style={{
                          borderColor: SENTIMENT_COLORS[topic.sentiment as keyof typeof SENTIMENT_COLORS] || SENTIMENT_COLORS.neutral,
                          color: SENTIMENT_COLORS[topic.sentiment as keyof typeof SENTIMENT_COLORS] || SENTIMENT_COLORS.neutral
                        }}
                      >
                        {topic.topic}
                        {topic.category && (
                          <span className="ml-2 opacity-60">• {topic.category}</span>
                        )}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Topics;
