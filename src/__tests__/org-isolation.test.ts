import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Cross-org isolation guard.
 *
 * Regular (non-SuperAdmin, non-single-tenant) admin pages that query
 * multi-tenant tables must always apply an `organization_id` filter.
 *
 * Excluded on purpose:
 *   • src/pages/lemtel/master/**         → SuperAdmin, cross-org by design
 *   • src/pages/lemtel/reseller/**       → Reseller portal, cross-org by design
 *   • src/pages/planipret/**             → Single dedicated org (Planipret)
 */

const ADMIN_DIRS = [
  'src/pages/lemtel',
  'src/pages/admin',
].filter((p) => fs.existsSync(p));

const EXCLUDE_RX = /[\\/](master|reseller|planipret)[\\/]/;

/**
 * Files granted a temporary exemption from the org_id filter check.
 * They rely on RLS + hardcoded LEMTEL org context via `currentOrg` selectors
 * rather than an explicit `.eq('organization_id', ...)`. Every new file MUST
 * apply an explicit filter — do NOT extend this list without review.
 */
const LEGACY_EXEMPTIONS = new Set<string>([
  'src/pages/lemtel/CustomerSettings.tsx',
  'src/pages/lemtel/LemtelCustomers.tsx',
  'src/pages/lemtel/LemtelSettings.tsx',
]);

// Tables that MUST be scoped by organization_id in tenant-facing admin pages.
const ORG_SCOPED_TABLES = new Set<string>([
  'organizations',
  'org_members',
  'organization_members',
  'org_contacts',
  'org_chat_channels',
  'org_chat_messages',
  'org_notifications',
  'org_exports',
  'lemtel_customers',
  'lemtel_softphone_users',
  'lemtel_sms_threads',
  'lemtel_dids',
  'lemtel_config',
  'lemtel_cdrs_cache',
]);

const ORG_FILTER_RX = /\borganization_id\b|\borg_id\b/;

function* walk(dir: string): Generator<string> {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(f.name)) yield p;
  }
}

function collectFiles(): string[] {
  const out: string[] = [];
  for (const d of ADMIN_DIRS) {
    for (const p of walk(d)) {
      if (!EXCLUDE_RX.test(p)) out.push(p);
    }
  }
  return out;
}

describe('multi-tenant isolation: admin queries scope by organization_id', () => {
  const files = collectFiles();

  it('discovers tenant admin source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('every .from(<org-scoped>) query has an organization_id filter nearby', () => {
    const offenders: string[] = [];
    const rx = /\.from\(\s*['"`]([a-z0-9_]+)['"`]\s*\)/g;
    for (const file of files) {
      const rel = path.relative(process.cwd(), file);
      if (LEGACY_EXEMPTIONS.has(rel)) continue;
      const src = fs.readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = rx.exec(src))) {
        const table = m[1];
        if (!ORG_SCOPED_TABLES.has(table)) continue;
        const windowText = src.slice(Math.max(0, m.index - 300), m.index + 900);
        if (!ORG_FILTER_RX.test(windowText)) {
          offenders.push(`${rel} → .from('${table}')`);
        }
      }
    }
    expect(offenders, `Missing organization_id filter:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no wildcard .select("*") on org-scoped tables without a filter', () => {
    const suspicious: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      const rx = /\.from\(\s*['"`]([a-z0-9_]+)['"`]\s*\)\s*\.select\(\s*['"`]\*['"`]\s*\)(?![^;]*\.(eq|in|match|filter|neq|is|contains))/g;
      let m: RegExpExecArray | null;
      while ((m = rx.exec(src))) {
        if (ORG_SCOPED_TABLES.has(m[1])) {
          suspicious.push(`${path.relative(process.cwd(), file)}: from('${m[1]}').select('*') without filter`);
        }
      }
    }
    expect(suspicious, suspicious.join('\n')).toEqual([]);
  });
});
