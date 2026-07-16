import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Button } from "@/components/ui/button";
import { AlertTriangle, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function ImpersonationBanner() {
  const { isImpersonating, orgName, exit } = useImpersonation();
  const navigate = useNavigate();
  if (!isImpersonating) return null;
  return (
    <div className="sticky top-0 z-[100] w-full bg-orange-500 text-black border-b border-orange-700 px-4 py-2 flex items-center justify-between text-sm font-medium">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span>
          Viewing <strong>{orgName}</strong> as Lemtel Admin — all actions are logged.
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="bg-black/10 text-black border-black/30 hover:bg-black/20"
        onClick={() => {
          exit();
          navigate("/org/lemtel/master/dashboard");
        }}
      >
        <LogOut className="h-3 w-3 mr-1" /> Exit to Lemtel Portal
      </Button>
    </div>
  );
}
