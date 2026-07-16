import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Save, Eye, BarChart3, BookOpen, Download, Bot, Layers, Clock, PhoneOff, TrendingUp } from 'lucide-react';
import { ClientDetail } from '@/hooks/useClientDetail';
import { ClientPasswordReset } from './ClientPasswordReset';

interface AccessControl {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  section?: string;
}

const ACCESS_CONTROLS: AccessControl[] = [
  {
    key: 'can_view_conversations',
    label: 'Voir les conversations',
    description: 'Accès à l\'historique des conversations',
    icon: <Eye className="h-4 w-4" />,
  },
  {
    key: 'can_view_analytics',
    label: 'Voir les analytics',
    description: 'Accès aux statistiques et rapports',
    icon: <BarChart3 className="h-4 w-4" />,
  },
  {
    key: 'can_view_knowledge_base',
    label: 'Voir la base de connaissances',
    description: 'Accès en lecture à la knowledge base',
    icon: <BookOpen className="h-4 w-4" />,
  },
  {
    key: 'can_export_data',
    label: 'Exporter les données',
    description: 'Possibilité de télécharger les données',
    icon: <Download className="h-4 w-4" />,
  },
  {
    key: 'can_manage_agents',
    label: 'Gérer les agents',
    description: 'Configurer les agents assignés',
    icon: <Bot className="h-4 w-4" />,
  },
  {
    key: 'unified_analytics',
    label: 'Analytics & Conversations unifiés',
    description: 'Voir les analytics et conversations de tous les agents en un seul tableau de bord',
    icon: <Layers className="h-4 w-4" />,
    section: 'new',
  },
  {
    key: 'after_hours_tracking',
    label: 'Suivi des appels hors horaires',
    description: 'Taguer automatiquement les appels reçus en dehors des heures de bureau',
    icon: <Clock className="h-4 w-4" />,
    section: 'new',
  },
  {
    key: 'elevenlabs_call_ended_reason',
    label: 'Raison de fin d\'appel ElevenLabs',
    description: 'Afficher la raison de fin d\'appel et le taux de transfert dans les analytics',
    icon: <PhoneOff className="h-4 w-4" />,
    section: 'new',
  },
  {
    key: 'elevenlabs_transfer_rate',
    label: 'Taux de transfert ElevenLabs',
    description: 'Afficher le taux de transfert des appels dans les analytics',
    icon: <TrendingUp className="h-4 w-4" />,
    section: 'new',
  },
];

interface ClientAccessTabProps {
  client: ClientDetail;
  onUpdate: (updates: Partial<ClientDetail>) => void;
  isUpdating: boolean;
  hasPassword?: boolean;
}

export const ClientAccessTab = ({ client, onUpdate, isUpdating, hasPassword = false }: ClientAccessTabProps) => {
  const [controls, setControls] = useState<Record<string, boolean>>({
    can_view_conversations: true,
    can_view_analytics: true,
    can_view_knowledge_base: true,
    can_export_data: false,
    can_manage_agents: false,
    unified_analytics: false,
    after_hours_tracking: false,
    elevenlabs_call_ended_reason: false,
    elevenlabs_transfer_rate: false,
  });

  const [businessHours, setBusinessHours] = useState({
    start_time: '09:00',
    end_time: '18:00',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'] as string[],
    timezone: 'Europe/Paris',
  });

  useEffect(() => {
    if (client.access_controls) {
      const ac = client.access_controls as any;
      setControls((prev) => ({
        ...prev,
        ...ac,
      }));
      if (ac.business_hours) {
        setBusinessHours((prev) => ({ ...prev, ...ac.business_hours }));
      }
    }
  }, [client.access_controls]);

  const handleToggle = (key: string) => {
    setControls((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = () => {
    onUpdate({ 
      access_controls: {
        ...controls,
        business_hours: controls.after_hours_tracking ? businessHours : undefined,
      } as any,
    });
  };

  const enabledCount = Object.values(controls).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Password Management Section */}
      <ClientPasswordReset 
        clientId={client.id} 
        clientEmail={client.email}
        hasPassword={hasPassword}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Contrôles d'accès
          </CardTitle>
          <CardDescription>
            Définissez les permissions granulaires pour ce client
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Standard Controls */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Permissions standard</h4>
            {ACCESS_CONTROLS.filter(c => !c.section).map((control) => (
              <div
                key={control.key}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    {control.icon}
                  </div>
                  <div>
                    <Label htmlFor={control.key} className="font-medium cursor-pointer">
                      {control.label}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {control.description}
                    </p>
                  </div>
                </div>
                <Switch
                  id={control.key}
                  checked={controls[control.key]}
                  onCheckedChange={() => handleToggle(control.key)}
                />
              </div>
            ))}
          </div>

          {/* New April 2026 Features */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              Nouvelles fonctionnalités
              <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-normal normal-case">Avril 2026</span>
            </h4>
            {ACCESS_CONTROLS.filter(c => c.section === 'new').map((control) => (
              <div
                key={control.key}
                className="flex items-center justify-between p-4 border rounded-lg border-primary/20 bg-primary/5"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    {control.icon}
                  </div>
                  <div>
                    <Label htmlFor={control.key} className="font-medium cursor-pointer">
                      {control.label}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {control.description}
                    </p>
                  </div>
                </div>
                <Switch
                  id={control.key}
                  checked={controls[control.key]}
                  onCheckedChange={() => handleToggle(control.key)}
                />
              </div>
            ))}
          </div>

          {/* Business Hours Config (shown when after_hours_tracking is enabled) */}
          {controls.after_hours_tracking && (
            <div className="space-y-4 p-4 border rounded-lg border-primary/20 bg-primary/5">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Configuration des heures de bureau
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Heure de début</Label>
                  <Input
                    type="time"
                    value={businessHours.start_time}
                    onChange={(e) => setBusinessHours(prev => ({ ...prev, start_time: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Heure de fin</Label>
                  <Input
                    type="time"
                    value={businessHours.end_time}
                    onChange={(e) => setBusinessHours(prev => ({ ...prev, end_time: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Jours ouvrés</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'mon', label: 'Lun' },
                    { key: 'tue', label: 'Mar' },
                    { key: 'wed', label: 'Mer' },
                    { key: 'thu', label: 'Jeu' },
                    { key: 'fri', label: 'Ven' },
                    { key: 'sat', label: 'Sam' },
                    { key: 'sun', label: 'Dim' },
                  ].map(day => (
                    <button
                      key={day.key}
                      type="button"
                      onClick={() => {
                        setBusinessHours(prev => ({
                          ...prev,
                          days: prev.days.includes(day.key)
                            ? prev.days.filter(d => d !== day.key)
                            : [...prev.days, day.key],
                        }));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        businessHours.days.includes(day.key)
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Fuseau horaire</Label>
                <Input
                  value={businessHours.timezone}
                  onChange={(e) => setBusinessHours(prev => ({ ...prev, timezone: e.target.value }))}
                  placeholder="Europe/Paris"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {enabledCount} permission(s) activée(s) sur {ACCESS_CONTROLS.length}
            </p>
            <Button onClick={handleSave} disabled={isUpdating}>
              <Save className="h-4 w-4 mr-2" />
              Enregistrer les permissions
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
