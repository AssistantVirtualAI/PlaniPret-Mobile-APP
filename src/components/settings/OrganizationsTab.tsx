import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Building2, Plus, Check, Loader2 } from 'lucide-react';
import { useOrganization } from '@/context/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function OrganizationsTab() {
  const { organizations, selectedOrg, setSelectedOrgId, refreshOrganization } = useOrganization();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const slugify = (v: string) =>
    v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Le nom est requis');
      return;
    }
    setIsCreating(true);
    try {
      const { data, error } = await (supabase.rpc as any)('create_organization_for_user', {
        _name: name.trim(),
        _slug: slug.trim() || slugify(name),
      });
      if (error) throw error;
      toast.success('Organisation créée');
      await refreshOrganization();
      if (data) setSelectedOrgId(data as string);
      setIsOpen(false);
      setName('');
      setSlug('');
    } catch (e: any) {
      toast.error(e.message || 'Échec de création');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Vos organisations
            </CardTitle>
            <CardDescription>
              Basculez entre vos organisations ou créez-en une nouvelle. Chaque organisation a ses
              propres membres, clients et agents.
            </CardDescription>
          </div>
          <Button onClick={() => setIsOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Nouvelle organisation
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {organizations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Aucune organisation. Créez-en une pour commencer.
            </p>
          ) : (
            organizations.map((org) => {
              const isActive = selectedOrg?.id === org.id;
              return (
                <div
                  key={org.id}
                  className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                    isActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{org.name}</div>
                      <div className="text-xs text-muted-foreground truncate">/{org.slug}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isActive ? (
                      <Badge className="gap-1">
                        <Check className="w-3 h-3" /> Active
                      </Badge>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setSelectedOrgId(org.id)}>
                        Sélectionner
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gestion des membres et agents</CardTitle>
          <CardDescription>
            Pour ajouter des membres (admin, manager, agent, viewer) à l'organisation actuellement
            sélectionnée, ouvrez l'onglet <strong>Membres</strong>. Pour créer des agents et les
            assigner à des clients, utilisez les pages <strong>Agents</strong> et{' '}
            <strong>Clients</strong> — elles affichent automatiquement les données de
            l'organisation active.
          </CardDescription>
        </CardHeader>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer une organisation</DialogTitle>
            <DialogDescription>
              Vous deviendrez automatiquement administrateur de cette nouvelle organisation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="org-name">Nom *</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug) setSlug(slugify(e.target.value));
                }}
                placeholder="Mon Agence"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-slug">Slug</Label>
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder="mon-agence"
              />
              <p className="text-xs text-muted-foreground">
                Identifiant unique. Auto-généré depuis le nom.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
