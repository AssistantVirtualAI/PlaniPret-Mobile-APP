import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function MasterSystem() {
  const services = [
    { name: "FusionPBX", status: "🟢 Connected", detail: "wss://lemtel.lemtel.tel:7443" },
    { name: "Supabase", status: "🟢 Connected", detail: "Database, Auth, Storage, Edge functions" },
    { name: "Telnyx SMS", status: "🟢 Active", detail: "Outbound SMS and MMS" },
    { name: "Twilio Voice", status: "🟢 Active", detail: "DID provisioning + TwiML routing" },
    { name: "ElevenLabs", status: "🟢 Active", detail: "TTS for IVR, voicemail greetings, MOH" },
    { name: "Stripe", status: "🟢 Active", detail: "Subscription billing" },
    { name: "Resend", status: "🟢 Active", detail: "Transactional + branded emails" },
  ];
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-3xl font-bold">System health</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {services.map((s) => (
          <Card key={s.name}>
            <CardContent className="pt-6 flex items-start justify-between">
              <div>
                <div className="font-medium text-lg">{s.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.detail}</div>
              </div>
              <Badge variant="default" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                {s.status}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
