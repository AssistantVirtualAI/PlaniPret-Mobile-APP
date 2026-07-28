import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shield, LogOut, User as UserIcon, Settings, KeyRound, Circle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const STATUSES: Array<{ value: string; label: string; color: string }> = [
  { value: "available",  label: "Available",   color: "text-emerald-500" },
  { value: "busy",       label: "Busy",        color: "text-rose-500" },
  { value: "in_meeting", label: "In a meeting",color: "text-amber-500" },
  { value: "away",       label: "Away",        color: "text-yellow-500" },
  { value: "dnd",        label: "Do not disturb", color: "text-red-600" },
  { value: "offline",    label: "Appear offline", color: "text-muted-foreground" },
];

export function WorkspaceHeaderExtras() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ full_name: string | null; email: string | null; avatar_url: string | null }>({
    full_name: null, email: null, avatar_url: null,
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuper, setIsSuper] = useState(false);
  const [status, setStatus] = useState<string>("available");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: p }, { data: sa }, { data: roles }, { data: orgMembers }, { data: pres }] = await Promise.all([
        supabase.from("profiles").select("full_name,email,avatar_url").eq("id", user.id).maybeSingle(),
        supabase.rpc("is_super_admin", { _user_id: user.id }),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("org_members").select("role").eq("user_id", user.id),
        supabase.from("user_presence").select("status").eq("user_id", user.id).maybeSingle(),
      ]);
      if (p) setProfile(p as any);
      const isMaster = !!orgMembers?.some((r: any) => ["ava_admin", "master_admin"].includes(r.role));
      const isOrgAdmin =
        !!roles?.some((r: any) => ["org_admin", "reseller_admin", "manager"].includes(r.role)) ||
        !!orgMembers?.some((r: any) => ["reseller_admin", "customer_admin"].includes(r.role));
      setIsSuper(!!sa || isMaster);
      setIsAdmin(!!sa || isMaster || isOrgAdmin);
      if (pres?.status) setStatus(pres.status);
    })();
  }, [user]);

  const updateStatus = async (next: string) => {
    setStatus(next);
    try {
      await (supabase.rpc as any)("upsert_user_presence", { _status: next });
    } catch (e) { console.warn("presence update failed", e); }
  };

  const initials = (profile.full_name || profile.email || user?.email || "U")
    .split(/\s|@/).filter(Boolean).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const current = STATUSES.find((s) => s.value === status) ?? STATUSES[0];

  return (
    <div className="flex items-center gap-2">
      {isAdmin && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          onClick={() => navigate(isSuper ? "/platform" : "/customer")}
        >
          <Shield className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Admin Portal</span>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="relative rounded-full focus:outline-none focus:ring-2 focus:ring-primary/40">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile.avatar_url ?? undefined} alt="" />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className={`absolute -bottom-0.5 -right-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full bg-background ring-2 ring-background`}>
              <Circle className={`h-2 w-2 fill-current ${current.color}`} />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 z-[1100]">
          <DropdownMenuLabel className="flex flex-col gap-1">
            <span className="text-sm font-medium truncate">{profile.full_name || profile.email}</span>
            <span className="text-xs text-muted-foreground truncate">{profile.email}</span>
            {isSuper && <Badge variant="outline" className="w-fit text-[10px]">Super Admin</Badge>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Circle className={`h-3 w-3 mr-2 fill-current ${current.color}`} />
              {current.label}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="z-[1200]">
                <DropdownMenuRadioGroup value={status} onValueChange={updateStatus}>
                  {STATUSES.map((s) => (
                    <DropdownMenuRadioItem key={s.value} value={s.value}>
                      <Circle className={`h-3 w-3 mr-2 fill-current ${s.color}`} />
                      {s.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/my/profile")}><UserIcon className="h-4 w-4 mr-2" />Profile</DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/my/settings")}><Settings className="h-4 w-4 mr-2" />Settings</DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/my/settings?tab=security")}><KeyRound className="h-4 w-4 mr-2" />Change password</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut?.()} className="text-destructive focus:text-destructive">
            <LogOut className="h-4 w-4 mr-2" />Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
