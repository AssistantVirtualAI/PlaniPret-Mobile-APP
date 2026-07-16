import { useOrgHierarchy, OrgNode } from "@/hooks/useOrgHierarchy";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, ChevronDown, Plus, Store, Briefcase } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

function flatten(nodes: OrgNode[], depth = 0): { node: OrgNode; depth: number }[] {
  const out: { node: OrgNode; depth: number }[] = [];
  nodes.forEach((n) => {
    out.push({ node: n, depth });
    if (n.children?.length) out.push(...flatten(n.children, depth + 1));
  });
  return out;
}

function typeIcon(t: string) {
  if (t === "master") return <Building2 className="h-4 w-4 text-primary" />;
  if (t === "reseller") return <Briefcase className="h-4 w-4 text-blue-500" />;
  return <Store className="h-4 w-4 text-emerald-500" />;
}

export function OrgSwitcher() {
  const { data: tree = [] } = useOrgHierarchy();
  const { slug } = useParams();
  const navigate = useNavigate();
  const flat = flatten(tree);
  const current = flat.find((f) => f.node.slug === slug)?.node;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {current ? typeIcon(current.org_type) : <Building2 className="h-4 w-4" />}
          <span className="truncate max-w-[180px]">{current?.name || "Select organization"}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-h-[70vh] overflow-y-auto">
        <DropdownMenuLabel>Switch organization</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {flat.map(({ node, depth }) => (
          <DropdownMenuItem
            key={node.id}
            onClick={() => {
              const base =
                node.org_type === "master"
                  ? `/org/${node.slug}/master/dashboard`
                  : node.org_type === "reseller"
                  ? `/org/${node.slug}/reseller/dashboard`
                  : `/org/${node.slug}/admin/dashboard`;
              navigate(base);
            }}
            style={{ paddingLeft: 8 + depth * 16 }}
            className="flex items-center gap-2"
          >
            {typeIcon(node.org_type)}
            <span className="flex-1 truncate">{node.name}</span>
            <span className="text-xs text-muted-foreground capitalize">{node.org_type}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/org/lemtel/master/organizations?create=1")}>
          <Plus className="h-4 w-4 mr-2" /> Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
