import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Smartphone, Plus, Circle, Loader2 } from 'lucide-react';
import { usePbxSoftphoneUsers } from '@/hooks/usePbxData';
import { PbxRefreshButton } from '@/components/lemtel/PbxRefreshButton';

export default function LemtelSoftphoneUsers() {
  const { data: users = [], isLoading } = usePbxSoftphoneUsers();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Smartphone className="w-7 h-7" /> Softphone Users</h1>
          <p className="text-muted-foreground">WebRTC / JsSIP-registered SIP credentials</p>
        </div>
        <div className="flex gap-2">
          <PbxRefreshButton kind="config" />
          <Button><Plus className="w-4 h-4 mr-2" /> New SIP User</Button>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>{users.length} registered users</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Extension</TableHead>
                <TableHead>Display Name</TableHead>
                <TableHead>SIP Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Seen</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No softphone users.</TableCell></TableRow>
                ) : (users as any[]).map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono font-bold">{u.extension}</TableCell>
                    <TableCell>{u.display_name || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.sip_domain || '—'}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-sm">
                        <Circle className={`w-2.5 h-2.5 ${u.status === 'online' ? 'fill-green-500 text-green-500' : 'fill-muted text-muted'}`} />
                        {u.status || 'offline'}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.last_seen_at ? new Date(u.last_seen_at).toLocaleString() : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
