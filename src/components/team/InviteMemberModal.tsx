import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UserPlus, Eye, EyeOff } from 'lucide-react';
import { useOrganization } from '@/context/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type Role = 'org_admin' | 'manager' | 'agent' | 'viewer';

interface CreateMemberPayload {
  email: string;
  password: string;
  full_name: string;
  role: Role;
  organization_id: string;
}

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateMember: (data: CreateMemberPayload) => Promise<void>;
  isLoading: boolean;
}

export const InviteMemberModal = ({ isOpen, onClose, onCreateMember, isLoading }: InviteMemberModalProps) => {
  const { user } = useAuth();
  const { organizations, selectedOrgId, isSuperAdmin } = useOrganization();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [orgId, setOrgId] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [adminOrgIds, setAdminOrgIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setOrgId(selectedOrgId || '');
  }, [selectedOrgId, isOpen]);

  // Determine which orgs the caller may add a member to (super admin → all, otherwise org_admin only)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('organization_id, role')
        .eq('user_id', user.id);
      setAdminOrgIds(
        new Set(
          (data ?? [])
            .filter((r) => r.role === 'org_admin' || r.role === 'super_admin')
            .map((r) => r.organization_id),
        ),
      );
    })();
  }, [user, isOpen]);

  const eligibleOrgs = isSuperAdmin
    ? organizations
    : organizations.filter((o) => adminOrgIds.has(o.id));

  const reset = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setRole('agent');
    setOrgId(selectedOrgId || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    await onCreateMember({ email, password, full_name: fullName, role, organization_id: orgId });
    reset();
    onClose();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Créer un membre
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nom complet</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Jean Dupont"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Adresse email</Label>
            <Input
              id="email"
              type="email"
              placeholder="membre@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Minimum 8 caractères"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Le membre pourra se connecter avec cet email et ce mot de passe
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="org">Organisation</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir une organisation" />
              </SelectTrigger>
              <SelectContent>
                {eligibleOrgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {eligibleOrgs.length === 0 && (
              <p className="text-xs text-destructive">
                Vous n'êtes administrateur d'aucune organisation.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="org_admin">Admin — accès complet</SelectItem>
                <SelectItem value="manager">Manager — agents et conversations</SelectItem>
                <SelectItem value="agent">Agent — gérer les conversations</SelectItem>
                <SelectItem value="viewer">Viewer — lecture seule</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>Annuler</Button>
            <Button
              type="submit"
              disabled={isLoading || !email || password.length < 8 || !orgId}
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Créer le membre
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
