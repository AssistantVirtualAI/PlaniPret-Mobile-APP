import { Fragment, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronUp, Loader2, Search, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { usePbxSync, usePbxSyncJobs, usePbxTestCdrEndpoint } from '@/hooks/usePbxData';

function StatusPill({ s }: { s: string }) {
  if (s === 'completed') return <Badge className="bg-green-500/15 text-green-600 border-green-500/30 border gap-1"><CheckCircle2 className="w-3 h-3" />Done</Badge>;
  if (s === 'completed_with_errors') return <Badge className="bg-orange-500/15 text-orange-600 border-orange-500/30 border gap-1"><CheckCircle2 className="w-3 h-3" />Partial</Badge>;
  if (s === 'failed') return <Badge className="bg-red-500/15 text-red-600 border-red-500/30 border gap-1"><XCircle className="w-3 h-3" />Failed</Badge>;
  if (s === 'running' || s === 'pending') return <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30 border gap-1"><Loader2 className="w-3 h-3 animate-spin" />Running</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function fmtDuration(start: string | null, end: string | null) {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function recordsCount(stats: any) {
  if (!stats || typeof stats !== 'object') return 0;
  return Object.entries(stats)
    .filter(([k]) => k !== 'duration_ms' && k !== 'endpoint' && k !== 'fetched')
    .reduce((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0);
}

export function SyncDiagnosticsPanel() {
  const [open, setOpen] = useState(false);
  const { data: jobs = [] } = usePbxSyncJobs(10);
  const sync = usePbxSync();
  const test = usePbxTestCdrEndpoint();
  const [expandedErr, setExpandedErr] = useState<string | null>(null);

  return (
    <Card>
      <CardContent className="pt-4">
        <Button variant="ghost" className="w-full justify-between" onClick={() => setOpen(o => !o)}>
          <span className="flex items-center gap-2"><Search className="w-4 h-4" /> Sync Diagnostics</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>

        {open && (
          <div className="mt-4 space-y-6">
            {/* Section A — Last 10 Sync Jobs */}
            <div>
              <div className="text-sm font-semibold mb-2">Last 10 sync jobs</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No sync jobs recorded yet</TableCell></TableRow>
                  )}
                  {jobs.map((j: any) => (
                    <Fragment key={j.id}>
                      <TableRow>
                        <TableCell className="font-mono text-xs">{j.job_type}</TableCell>
                        <TableCell><StatusPill s={j.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {j.started_at ? formatDistanceToNow(new Date(j.started_at), { addSuffix: true })
                            : j.created_at ? formatDistanceToNow(new Date(j.created_at), { addSuffix: true }) : '—'}
                        </TableCell>
                        <TableCell className="text-xs">{fmtDuration(j.started_at || j.created_at, j.completed_at)}</TableCell>
                        <TableCell className="text-xs">{recordsCount(j.stats)}</TableCell>
                        <TableCell>
                          {j.error ? (
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-red-600" onClick={() => setExpandedErr(expandedErr === j.id ? null : j.id)}>
                              {expandedErr === j.id ? 'Hide' : 'View'}
                            </Button>
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                      {expandedErr === j.id && j.error && (
                        <TableRow>
                          <TableCell colSpan={6}>
                            <pre className="text-xs text-red-600 bg-red-500/5 p-2 rounded whitespace-pre-wrap break-all">{j.error}</pre>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Section B — CDR Endpoint Detector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold">CDR endpoint detector</div>
                <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
                  {test.isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Search className="w-3 h-3 mr-2" />}
                  Test CDR endpoint
                </Button>
              </div>
              {test.data && (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Endpoint tried</TableHead>
                        <TableHead>HTTP</TableHead>
                        <TableHead>Records</TableHead>
                        <TableHead>Winner</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(test.data.attempts ?? []).map((a: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{a.endpoint}</TableCell>
                          <TableCell>{a.status || '—'}</TableCell>
                          <TableCell>—</TableCell>
                          <TableCell>❌</TableCell>
                        </TableRow>
                      ))}
                      {test.data.endpoint && (
                        <TableRow className="bg-green-500/5">
                          <TableCell className="font-mono text-xs">{test.data.endpoint}</TableCell>
                          <TableCell>200</TableCell>
                          <TableCell>{test.data.record_count}</TableCell>
                          <TableCell>✅ cached</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  {test.data.endpoint && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
                      <Clock className="w-3 h-3" /> Cached endpoint: <span className="font-mono">{test.data.endpoint}</span>
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Individual sync buttons */}
            <div>
              <div className="text-sm font-semibold mb-2">Manual sync</div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={sync.isPending}
                  onClick={() => sync.mutate({ kind: 'all', resources: ['extensions'] })}>
                  {sync.isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : null}
                  Sync Extensions
                </Button>
                <Button size="sm" variant="outline" disabled={sync.isPending}
                  onClick={() => sync.mutate({ kind: 'cdr' })}>
                  {sync.isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : null}
                  Sync CDRs
                </Button>
                <Button size="sm" variant="outline" disabled={sync.isPending}
                  onClick={() => sync.mutate({ kind: 'all', resources: ['ivrs','queues','ring_groups','devices','destinations'] })}>
                  {sync.isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : null}
                  Sync Config
                </Button>
                <Button size="sm" disabled={sync.isPending}
                  onClick={() => sync.mutate({ kind: 'all' })}>
                  {sync.isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : null}
                  Full Sync
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
