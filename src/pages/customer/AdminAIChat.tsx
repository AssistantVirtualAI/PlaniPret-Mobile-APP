import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, ShieldAlert, Send, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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

type Action = {
  id: string;
  prompt: string;
  interpreted_action: string | null;
  proposed_changes_json: any;
  confirmation_status: "pending" | "confirmed" | "rejected";
  execution_status: "pending" | "success" | "failed";
  execution_result_json: any;
  created_at: string;
};

export default function AdminAIChat() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("telecom_admin_ai_actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25);
    setActions((data as Action[]) ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-ai-actions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telecom_admin_ai_actions" },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const propose = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "telecom-admin-ai-agent",
        { body: { mode: "propose", prompt: prompt.trim() } },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.detail || data.error);
      setPrompt("");
      await load();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const execute = async (id: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "telecom-admin-ai-agent",
        { body: { mode: "execute", action_id: id } },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.detail || data.error);
      toast({ title: "Action exécutée" });
      await load();
    } catch (e: any) {
      toast({ title: "Échec", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setConfirmId(null);
    }
  };

  const reject = async (id: string) => {
    await supabase
      .from("telecom_admin_ai_actions")
      .update({ confirmation_status: "rejected" })
      .eq("id", id);
    await load();
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">AVA AI Telecom Admin</h1>
        <p className="text-sm text-muted-foreground">
          Configure your phone system through a guided AI assistant. Every change is
          confirmed before execution and audited.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4" /> Ask AVA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex: Crée des horaires d'ouverture Lun-Ven 9h-17h"
            rows={3}
            disabled={loading}
          />
          <div className="flex justify-end">
            <Button onClick={propose} disabled={loading || !prompt.trim()}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Proposer
            </Button>
          </div>
        </CardContent>
      </Card>

      {actions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Aucune action proposée pour le moment.
          </CardContent>
        </Card>
      ) : (
        actions.map((a) => (
          <Card key={a.id}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-xs uppercase tracking-wide text-primary">
                  {a.interpreted_action ?? "Proposed action"}
                </CardTitle>
                <p className="text-sm mt-1">{a.prompt}</p>
              </div>
              <StatusBadge conf={a.confirmation_status} exec={a.execution_status} />
            </CardHeader>
            <CardContent className="space-y-2">
              <pre className="text-xs bg-muted p-3 rounded max-h-48 overflow-auto">
                {JSON.stringify(a.proposed_changes_json, null, 2)}
              </pre>
              {a.execution_result_json && (
                <pre
                  className={`text-xs p-3 rounded max-h-40 overflow-auto ${
                    a.execution_status === "success"
                      ? "bg-green-500/10"
                      : "bg-destructive/10"
                  }`}
                >
                  {JSON.stringify(a.execution_result_json, null, 2)}
                </pre>
              )}
              {a.confirmation_status === "pending" && (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => setConfirmId(a.id)}
                    disabled={loading}
                  >
                    <Check className="h-3 w-3 mr-1" /> Confirmer et exécuter
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reject(a.id)}
                    disabled={loading}
                  >
                    <X className="h-3 w-3 mr-1" /> Rejeter
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-amber-600">
            <ShieldAlert className="h-4 w-4" /> Sécurité
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          AVA n'applique jamais une modification sans votre confirmation explicite.
          Toutes les actions sont écrites dans le journal d'audit.
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer l'action ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action sera appliquée immédiatement à votre système téléphonique
              et inscrite dans l'audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmId && execute(confirmId)}>
              Exécuter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ conf, exec }: { conf: string; exec: string }) {
  const k = `${conf}|${exec}`;
  if (k === "pending|pending")
    return <Badge variant="secondary">En attente</Badge>;
  if (k === "confirmed|pending")
    return <Badge variant="secondary">Exécution…</Badge>;
  if (k === "confirmed|success")
    return <Badge className="bg-green-600">Exécuté</Badge>;
  if (k === "confirmed|failed")
    return <Badge variant="destructive">Échec</Badge>;
  if (conf === "rejected") return <Badge variant="outline">Rejeté</Badge>;
  return <Badge variant="outline">{conf}</Badge>;
}
