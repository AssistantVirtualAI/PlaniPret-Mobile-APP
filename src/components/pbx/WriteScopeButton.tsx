import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Save, Upload, RefreshCw, ChevronDown } from "lucide-react";

interface Props {
  onSaveLocal?: () => void;
  onPushToPbx?: () => void;
  onSyncFromPbx?: () => void;
  primary?: "save" | "push" | "sync";
  disabled?: boolean;
  busy?: boolean;
}

export function WriteScopeButton({
  onSaveLocal, onPushToPbx, onSyncFromPbx,
  primary = "save", disabled, busy,
}: Props) {
  const primaryAction =
    primary === "push"
      ? { label: "Push to PBX", icon: Upload, onClick: onPushToPbx }
      : primary === "sync"
        ? { label: "Sync from PBX", icon: RefreshCw, onClick: onSyncFromPbx }
        : { label: "Save in AVA", icon: Save, onClick: onSaveLocal };
  const Icon = primaryAction.icon;
  return (
    <div className="inline-flex">
      <Button
        size="sm"
        onClick={primaryAction.onClick}
        disabled={disabled || busy || !primaryAction.onClick}
        className="rounded-r-none"
      >
        <Icon className="h-4 w-4 mr-1" />
        {busy ? "Working…" : primaryAction.label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="secondary" className="rounded-l-none px-2" disabled={disabled || busy}>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Write scope</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {onSaveLocal && (
            <DropdownMenuItem onClick={onSaveLocal}>
              <Save className="h-4 w-4 mr-2" /> Save in AVA only
            </DropdownMenuItem>
          )}
          {onPushToPbx && (
            <DropdownMenuItem onClick={onPushToPbx}>
              <Upload className="h-4 w-4 mr-2" /> Push to PBX
            </DropdownMenuItem>
          )}
          {onSyncFromPbx && (
            <DropdownMenuItem onClick={onSyncFromPbx}>
              <RefreshCw className="h-4 w-4 mr-2" /> Sync from PBX
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
