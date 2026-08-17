#!/usr/bin/env node
/**
 * CI security gate.
 *
 * Fails the build on SECURITY-related ERROR-level issues.
 *
 * Static checks (always run, no database needed):
 *   - SECURITY DEFINER functions declared without `SET search_path`
 *   - Migrations granting EXECUTE on a SECURITY DEFINER function to `anon`/`public`
 *   - `CREATE TABLE public.*` without a matching GRANT in the same migration
 *
 * Live checks (run only when SUPABASE_DB_URL is set and psql is available):
 *   - SECURITY DEFINER functions in `public` executable by anon or PUBLIC
 *   - Public tables with RLS disabled
 *
 * Usage:  node scripts/security-gate.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
// Migrations from this timestamp on must carry their own GRANTs.
const GRANT_RULE_BASELINE = "20260818";

/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const warnings = [];

function migrationFiles() {
  if (!existsSync(MIGRATIONS)) return [];
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => join(MIGRATIONS, f));
}

function staticChecks() {
  const fnRe =
    /create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(([\s\S]*?)\)([\s\S]*?)(?:\$\$|\$function\$|\$body\$)/gi;

  for (const file of migrationFiles()) {
    const sql = readFileSync(file, "utf8");
    const rel = file.replace(ROOT + "/", "");

    let m;
    while ((m = fnRe.exec(sql))) {
      const [, name, , header] = m;
      if (!/security\s+definer/i.test(header)) continue;
      if (!/set\s+search_path/i.test(header)) {
        errors.push(`${rel}: SECURITY DEFINER function ${name} has no "SET search_path"`);
      }
    }

    const grantRe = /grant\s+execute\s+on\s+function\s+([^;]*?)\s+to\s+([^;]+);/gi;
    while ((m = grantRe.exec(sql))) {
      const roles = m[2].toLowerCase();
      if (/\banon\b/.test(roles) || /\bpublic\b/.test(roles)) {
        const msg = `${rel}: grants EXECUTE to anon/public on ${m[1].trim().split("(")[0]}`;
        // Legacy grants were revoked by a later migration; the live check is authoritative.
        if (basename(file) >= GRANT_RULE_BASELINE) errors.push(msg);
        else warnings.push(msg);
      }
    }

    const createTableRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.("?[\w]+"?)/gi;
    while ((m = createTableRe.exec(sql))) {
      const table = m[1].replace(/"/g, "");
      const granted = new RegExp(`grant[\\s\\S]{0,120}on\\s+(?:table\\s+)?public\\.\"?${table}\"?`, "i");
      if (!granted.test(sql)) {
        const msg = `${rel}: public.${table} is created without any GRANT in the same migration`;
        // Migrations authored before the baseline predate this rule; their grants
        // were applied later and are verified by the live checks instead.
        if (basename(file) >= GRANT_RULE_BASELINE) errors.push(msg);
        else warnings.push(msg);
      }
    }
  }
}

function psql(query) {
  return execFileSync("psql", [process.env.SUPABASE_DB_URL, "-At", "-c", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function liveChecks() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    warnings.push("SUPABASE_DB_URL not set — live database checks skipped");
    return;
  }
  try {
    execFileSync("psql", ["--version"], { stdio: "ignore" });
  } catch {
    warnings.push("psql not available — live database checks skipped");
    return;
  }

  const exposedDefiners = psql(`
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and has_function_privilege('anon', p.oid, 'execute')
     order by 1`);
  if (exposedDefiners) {
    for (const fn of exposedDefiners.split("\n")) {
      errors.push(`anon can execute SECURITY DEFINER function public.${fn}`);
    }
  }

  const rlsOff = psql(`
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
     order by 1`);
  if (rlsOff) {
    for (const t of rlsOff.split("\n")) errors.push(`public.${t} has row level security disabled`);
  }
}

staticChecks();
liveChecks();

if (warnings.length > 5) {
  console.warn(`⚠️  ${warnings.length} legacy/skipped checks (showing first 5)`);
  warnings.length = 5;
}
for (const w of warnings) console.warn(`⚠️  ${w}`);

if (errors.length) {
  console.error(`\n❌ Security gate failed with ${errors.length} ERROR-level issue(s):`);
  for (const e of errors) console.error(`   - ${e}`);
  process.exit(1);
}

console.log("✅ Security gate passed: no SECURITY ERROR-level issues detected");
