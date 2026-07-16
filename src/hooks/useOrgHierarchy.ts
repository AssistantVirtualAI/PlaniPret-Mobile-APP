import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const LEMTEL_ORG_ID = "71755d33-ed64-4ad5-a828-61c9d2029eb7";

export interface OrgNode {
  id: string;
  name: string;
  slug: string;
  org_type: string;
  org_level: number;
  parent_org_id: string | null;
  status: string;
  brand_logo_url?: string | null;
  children: OrgNode[];
  user_count?: number;
  extension_count?: number;
}

export function useOrgHierarchy() {
  return useQuery({
    queryKey: ["org-hierarchy"],
    queryFn: async (): Promise<OrgNode[]> => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name,slug,org_type,org_level,parent_org_id,status,brand_logo_url")
        .order("org_level", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      const all = (data || []) as any[];

      // Only include Lemtel + its descendants. Excludes "AVA Main Dashboard"
      // and any other internal/unrelated organizations.
      const included = new Set<string>([LEMTEL_ORG_ID]);
      let added = true;
      while (added) {
        added = false;
        for (const o of all) {
          if (!included.has(o.id) && o.parent_org_id && included.has(o.parent_org_id)) {
            included.add(o.id);
            added = true;
          }
        }
      }
      const scoped = all.filter(
        (o) => included.has(o.id) && o.org_type !== "internal"
      );

      const map = new Map<string, OrgNode>();
      scoped.forEach((o) => map.set(o.id, { ...o, children: [] }));
      const roots: OrgNode[] = [];
      map.forEach((node) => {
        if (node.parent_org_id && map.has(node.parent_org_id)) {
          map.get(node.parent_org_id)!.children.push(node);
        } else {
          roots.push(node);
        }
      });
      return roots;
    },
    staleTime: 30_000,
  });
}

export function useOrgMembership(orgId?: string) {
  return useQuery({
    queryKey: ["org-membership", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("org_members" as any)
        .select("*")
        .eq("org_id", orgId!)
        .maybeSingle();
      return data;
    },
  });
}
