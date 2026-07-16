import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Save } from 'lucide-react';

const AgentConfig = () => {
  return (
    <AppLayout>
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 gradient-text">AI Agent Configuration</h1>
          <p className="text-muted-foreground text-lg">
            Customize your voice assistant behavior
          </p>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="glass-card">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="voice">Voice</TabsTrigger>
            <TabsTrigger value="conversation">Conversation</TabsTrigger>
            <TabsTrigger value="behavior">Behavior</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle>General Information</CardTitle>
                    <CardDescription>Basic agent configuration</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Agent name</Label>
                  <Input
                    id="name"
                    defaultValue="AVA Assistant"
                    className="bg-background/50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prompt">System Prompt</Label>
                  <Textarea
                    id="prompt"
                    placeholder="You are an intelligent AI voice assistant..."
                    rows={8}
                    defaultValue="You are AVA, a professional and helpful AI voice assistant. Your goal is to help users with their questions clearly and concisely."
                    className="bg-background/50 font-mono text-sm"
                  />
                  <p className="text-sm text-muted-foreground">
                    Defines the agent's overall behavior and personality
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="firstMessage">First Message</Label>
                  <Input
                    id="firstMessage"
                    defaultValue="Hello! How can I help you today?"
                    className="bg-background/50"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Active Agent</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable or disable this agent
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="voice" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Voice Settings</CardTitle>
                <CardDescription>Configure the agent voice</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="voiceId">Voice ID (ElevenLabs)</Label>
                  <Input
                    id="voiceId"
                    placeholder="21m00Tcm4TlvDq8ikWAM"
                    className="bg-background/50"
                  />
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Stability</Label>
                      <span className="text-sm text-muted-foreground">0.5</span>
                    </div>
                    <Slider defaultValue={[0.5]} max={1} step={0.01} />
                    <p className="text-sm text-muted-foreground">
                      Controls voice consistency
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Similarity</Label>
                      <span className="text-sm text-muted-foreground">0.75</span>
                    </div>
                    <Slider defaultValue={[0.75]} max={1} step={0.01} />
                    <p className="text-sm text-muted-foreground">
                      Closeness to the original voice
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Style</Label>
                      <span className="text-sm text-muted-foreground">0.0</span>
                    </div>
                    <Slider defaultValue={[0]} max={1} step={0.01} />
                    <p className="text-sm text-muted-foreground">
                      Voice expressiveness
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="conversation" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Conversation Settings</CardTitle>
                <CardDescription>LLM model configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Temperature</Label>
                      <span className="text-sm text-muted-foreground">0.8</span>
                    </div>
                    <Slider defaultValue={[0.8]} max={2} step={0.1} />
                    <p className="text-sm text-muted-foreground">
                      Response creativity (0 = precise, 2 = creative)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxTokens">Tokens Maximum</Label>
                    <Input
                      id="maxTokens"
                      type="number"
                      defaultValue="150"
                      className="bg-background/50"
                    />
                    <p className="text-sm text-muted-foreground">
                      Maximum response length
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="behavior" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Behavior</CardTitle>
                <CardDescription>Advanced behavior options</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Interruptions Allowed</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow the user to interrupt the agent
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Sentiment Detection</Label>
                    <p className="text-sm text-muted-foreground">
                      Adapt responses based on detected emotion
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Detailed Logs</Label>
                    <p className="text-sm text-muted-foreground">
                      Record all interactions
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Save Button */}
        <div className="flex justify-end mt-8">
          <Button size="lg" className="gap-2 bg-gradient-to-r from-primary to-accent">
            <Save className="w-5 h-5" />
            Save Configuration
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default AgentConfig;