import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard, Users, Phone, MessageSquare, Voicemail, BarChart3,
  Flame, Zap, ClipboardList, ShieldCheck, CheckSquare, Plug, User,
} from "lucide-react";

const NAV = [
  { to: "/planipret/admin/overview", label: "Vue d'ensemble", Icon: LayoutDashboard, shortcut: "g o" },
  { to: "/planipret/admin/users", label: "Utilisateurs", Icon: Users, shortcut: "g u" },
  { to: "/planipret/admin/calls", label: "Appels", Icon: Phone, shortcut: "g c" },
  { to: "/planipret/admin/leads", label: "Leads & Pipeline", Icon: Flame, shortcut: "g l" },
  { to: "/planipret/admin/messages", label: "Messages", Icon: MessageSquare, shortcut: "g m" },
  { to: "/planipret/admin/voicemails", label: "Voicemails", Icon: Voicemail, shortcut: "g v" },
  { to: "/planipret/admin/templates", label: "Templates SMS", Icon: Zap },
  { to: "/planipret/admin/reports", label: "Rapports", Icon: BarChart3, shortcut: "g r" },
  { to: "/planipret/admin/audit", label: "Journal d'audit", Icon: ClipboardList },
  { to: "/planipret/admin/compliance", label: "Conformité", Icon: ShieldCheck },
  { to: "/planipret/admin/audit-checklist", label: "Audit système", Icon: CheckSquare },
  { to: "/planipret/admin/integrations", label: "Intégrations", Icon: Plug },
];

type Result = {
  type: "user" | "call" | "message";
  id: string;
  label: string;
  sub?: string;
  href: string;
};

export default function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const q = query.trim();
      const like = `%${q}%`;
      const [usersR, callsR, msgsR] = await Promise.all([
        supabase.from("planipret_profiles")
          .select("id, full_name, email, extension")
          .or(`full_name.ilike.${like},email.ilike.${like},extension.ilike.${like}`)
          .limit(5),
        supabase.from("planipret_phone_calls")
          .select("id, from_number, to_number, from_name, to_name, started_at")
          .or(`from_number.ilike.${like},to_number.ilike.${like},from_name.ilike.${like},to_name.ilike.${like}`)
          .order("started_at", { ascending: false }).limit(5),
        supabase.from("planipret_phone_messages")
          .select("id, from_number, to_number, body, created_at")
          .or(`from_number.ilike.${like},to_number.ilike.${like},body.ilike.${like}`)
          .order("created_at", { ascending: false }).limit(5),
      ]);
      if (cancelled) return;
      const r: Result[] = [];
      (usersR.data ?? []).forEach((u: any) => r.push({
        type: "user", id: u.id,
        label: u.full_name || u.email,
        sub: u.extension ? `Ext. ${u.extension}` : u.email,
        href: "/planipret/admin/users",
      }));
      (callsR.data ?? []).forEach((c: any) => r.push({
        type: "call", id: c.id,
        label: c.from_name || c.to_name || c.from_number || c.to_number || "Appel",
        sub: new Date(c.started_at).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" }),
        href: "/planipret/admin/calls",
      }));
      (msgsR.data ?? []).forEach((m: any) => r.push({
        type: "message", id: m.id,
        label: m.from_number || m.to_number || "Message",
        sub: (m.body ?? "").slice(0, 60),
        href: "/planipret/admin/messages",
      }));
      setResults(r);
      setLoading(false);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const grouped = useMemo(() => ({
    user: results.filter((r) => r.type === "user"),
    call: results.filter((r) => r.type === "call"),
    message: results.filter((r) => r.type === "message"),
  }), [results]);

  const go = (href: string) => { onOpenChange(false); setQuery(""); navigate(href); };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Rechercher courtier, appel, message…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{loading ? "Recherche…" : "Aucun résultat."}</CommandEmpty>

        {grouped.user.length > 0 && (
          <CommandGroup heading="Courtiers">
            {grouped.user.map((r) => (
              <CommandItem key={r.id} onSelect={() => go(r.href)}>
                <User className="w-4 h-4 mr-2" />
                <span className="flex-1">{r.label}</span>
                {r.sub && <span className="text-xs opacity-60">{r.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {grouped.call.length > 0 && (
          <CommandGroup heading="Appels">
            {grouped.call.map((r) => (
              <CommandItem key={r.id} onSelect={() => go(r.href)}>
                <Phone className="w-4 h-4 mr-2" />
                <span className="flex-1">{r.label}</span>
                {r.sub && <span className="text-xs opacity-60">{r.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {grouped.message.length > 0 && (
          <CommandGroup heading="Messages">
            {grouped.message.map((r) => (
              <CommandItem key={r.id} onSelect={() => go(r.href)}>
                <MessageSquare className="w-4 h-4 mr-2" />
                <span className="flex-1 truncate">{r.label}</span>
                {r.sub && <span className="text-xs opacity-60 truncate ml-2">{r.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading="Navigation">
          {NAV.map(({ to, label, Icon, shortcut }) => (
            <CommandItem key={to} onSelect={() => go(to)}>
              <Icon className="w-4 h-4 mr-2" />
              <span className="flex-1">{label}</span>
              {shortcut && <span className="text-xs opacity-60 font-mono">{shortcut}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
