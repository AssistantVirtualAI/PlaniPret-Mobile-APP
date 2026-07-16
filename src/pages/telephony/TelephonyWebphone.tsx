import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Smartphone, Phone } from 'lucide-react';

export default function TelephonyWebphone() {
  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Phone className="w-7 h-7" /> Softphone
        </h1>
        <p className="text-muted-foreground">
          The in-browser softphone has been retired.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" /> Use the mobile app
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Calling now happens exclusively in the Lemtel mobile app, which uses
            the PJSIP + CallKit native stack for the best audio quality and
            background reliability.
          </p>
          <p>
            Install the app on iOS or Android, sign in with the same account, and
            your extension will register automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
