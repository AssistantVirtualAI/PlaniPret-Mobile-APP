import { ReactNode, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search } from "lucide-react";

export interface InventoryColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
  sortable?: boolean;
  accessor?: (row: T) => string | number | null | undefined;
}

interface Props<T> {
  rows: T[];
  columns: InventoryColumn<T>[];
  searchPlaceholder?: string;
  searchAccessor?: (row: T) => string;
  emptyTitle?: string;
  emptyHint?: ReactNode;
  rowActions?: (row: T) => ReactNode;
  getRowKey: (row: T) => string;
  loading?: boolean;
}

export function InventoryTable<T>({
  rows, columns, searchPlaceholder = "Search…", searchAccessor,
  emptyTitle = "No records", emptyHint, rowActions, getRowKey, loading,
}: Props<T>) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q || !searchAccessor) return rows;
    const needle = q.toLowerCase();
    return rows.filter(r => searchAccessor(r).toLowerCase().includes(needle));
  }, [rows, q, searchAccessor]);

  return (
    <div className="p-4 space-y-3">
      {searchAccessor && (
        <div className="relative max-w-sm">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder={searchPlaceholder} className="pl-8" />
        </div>
      )}
      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(c => (<TableHead key={c.key} className={c.className}>{c.header}</TableHead>))}
              {rowActions && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={columns.length + (rowActions ? 1 : 0)} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (rowActions ? 1 : 0)} className="text-center py-10">
                  <div className="font-medium">{emptyTitle}</div>
                  {emptyHint && <div className="text-sm text-muted-foreground mt-2">{emptyHint}</div>}
                </TableCell>
              </TableRow>
            ) : filtered.map(row => (
              <TableRow key={getRowKey(row)}>
                {columns.map(c => (
                  <TableCell key={c.key} className={c.className}>
                    {c.render ? c.render(row) : String(c.accessor?.(row) ?? "")}
                  </TableCell>
                ))}
                {rowActions && <TableCell className="text-right">{rowActions(row)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="text-xs text-muted-foreground">{filtered.length} of {rows.length} rows</div>
    </div>
  );
}
