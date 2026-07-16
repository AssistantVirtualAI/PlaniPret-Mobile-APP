import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, UserPlus, AlertTriangle, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ClientAvatar } from "./ClientAvatar";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";

interface ClientMembersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  /** Whether the current user is a client admin (can add members up to limit) */
  isClientAdmin?: boolean;
  /** Whether to enforce the 2 member limit (true for client portal, false for agency admin) */
  enforceMemberLimit?: boolean;
}

const CLIENT_MEMBER_LIMIT = 2;

export const ClientMembersModal = ({
  open,
  onOpenChange,
  clientId,
  clientName,
  isClientAdmin = false,
  enforceMemberLimit = false,
}: ClientMembersModalProps) => {
  const queryClient = useQueryClient();
  const { t, language } = useTranslation();
  const [newMember, setNewMember] = useState({ email: "", name: "", role: "member" });
  const [showRequestDialog, setShowRequestDialog] = useState(false);

  const { data: members, isLoading } = useQuery({
    queryKey: ["client-members", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_members_safe")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: open && !!clientId,
  });

  const currentMemberCount = members?.length || 0;
  const isAtLimit = enforceMemberLimit && currentMemberCount >= CLIENT_MEMBER_LIMIT;
  const canAddMember = !enforceMemberLimit || (isClientAdmin && currentMemberCount < CLIENT_MEMBER_LIMIT);

  const addMemberMutation = useMutation({
    mutationFn: async (member: { email: string; name: string; role: string }) => {
      // Check limit before adding (only for client portal)
      if (enforceMemberLimit && currentMemberCount >= CLIENT_MEMBER_LIMIT) {
        throw new Error(t('messages.memberLimitReached'));
      }

      const { error } = await supabase.from("client_members").insert({
        client_id: clientId,
        email: member.email,
        name: member.name,
        role: member.role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-members", clientId] });
      setNewMember({ email: "", name: "", role: "member" });
      toast.success(t('messages.memberAdded'));
    },
    onError: (error: any) => {
      toast.error(error.message || t('messages.memberAddError'));
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from("client_members")
        .delete()
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-members", clientId] });
      toast.success(t('messages.memberRemoved'));
    },
    onError: (error: any) => {
      toast.error(error.message || t('messages.memberRemoveError'));
    },
  });

  const handleAddMember = () => {
    if (!newMember.email || !newMember.name) {
      toast.error(t('messages.emailAndNameRequired'));
      return;
    }

    // If at limit, show request dialog instead
    if (isAtLimit && enforceMemberLimit) {
      setShowRequestDialog(true);
      return;
    }

    addMemberMutation.mutate(newMember);
  };

  const handleRequestMoreMembers = () => {
    // This could send a notification to super admin - for now just show a toast
    toast.info(t('messages.requestSent'));
    setShowRequestDialog(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              {t('pages.members.title')} {clientName}
            </DialogTitle>
            <DialogDescription>
              {t('pages.members.description')}
              {enforceMemberLimit && (
                <span className="ml-2 text-xs">
                  ({currentMemberCount}/{CLIENT_MEMBER_LIMIT} {t('pages.members.membersCount')})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Limit warning for client portal */}
          {enforceMemberLimit && isAtLimit && (
            <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-600 dark:text-amber-400">
                {t('pages.members.limitWarning').replace('{limit}', String(CLIENT_MEMBER_LIMIT))}
              </AlertDescription>
            </Alert>
          )}

          {/* Add new member form */}
          <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">{t('pages.members.addMember')}</h4>
              {isClientAdmin && enforceMemberLimit && (
                <Badge variant="outline" className="gap-1">
                  <Shield className="w-3 h-3" />
                  {t('pages.members.clientAdmin')}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="memberName" className="text-xs">{t('pages.members.memberName')}</Label>
                <Input
                  id="memberName"
                  placeholder="Jean Dupont"
                  value={newMember.name}
                  onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                  disabled={isAtLimit && !isClientAdmin}
                />
              </div>
              <div>
                <Label htmlFor="memberEmail" className="text-xs">{t('pages.members.memberEmail')}</Label>
                <Input
                  id="memberEmail"
                  type="email"
                  placeholder="jean@example.com"
                  value={newMember.email}
                  onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                  disabled={isAtLimit && !isClientAdmin}
                />
              </div>
              <div>
                <Label htmlFor="memberRole" className="text-xs">{t('pages.members.memberRole')}</Label>
                <Select
                  value={newMember.role}
                  onValueChange={(value) => setNewMember({ ...newMember, role: value })}
                  disabled={isAtLimit && !isClientAdmin}
                >
                  <SelectTrigger id="memberRole">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t('pages.members.admin')}</SelectItem>
                    <SelectItem value="member">{t('pages.members.member')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleAddMember}
                disabled={addMemberMutation.isPending || (!canAddMember && enforceMemberLimit)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                {isAtLimit && enforceMemberLimit ? t('pages.members.requestAuthorization') : t('common.add')}
              </Button>
            </div>
          </div>

          {/* Members list */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('pages.members.member')}</TableHead>
                  <TableHead>{t('pages.members.memberEmail')}</TableHead>
                  <TableHead>{t('pages.members.memberRole')}</TableHead>
                  <TableHead>{t('pages.members.addedOn')}</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {t('pages.members.loading')}
                    </TableCell>
                  </TableRow>
                ) : members?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {t('pages.members.noMembers')}
                    </TableCell>
                  </TableRow>
                ) : (
                  members?.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ClientAvatar name={member.name || member.email} size="sm" />
                          <span className="font-medium">{member.name || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{member.email}</TableCell>
                      <TableCell>
                        <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                          {member.role === "admin" ? t('pages.members.admin') : t('pages.members.member')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(member.created_at).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeMemberMutation.mutate(member.id)}
                          disabled={removeMemberMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Request more members dialog */}
      <AlertDialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pages.members.limitReachedTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('pages.members.limitReachedDescription').replace('{limit}', String(CLIENT_MEMBER_LIMIT))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRequestMoreMembers}>
              {t('pages.members.sendRequest')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};