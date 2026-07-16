export interface RingGroupDestination {
  destination: string;
  timeout: number;
  prompt?: string;
}

/**
 * Parse FusionPBX ring_group_destinations CSV.
 * Format examples: "300,30", "300,30|301,20", "300\n301"
 * Returns ordered list of { destination, timeout }.
 */
export function parseRingGroupDestinations(input: unknown): RingGroupDestination[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .map((row) => {
        if (typeof row === 'string') return parseOne(row);
        if (row && typeof row === 'object') {
          return {
            destination: String((row as any).destination ?? (row as any).number ?? '').trim(),
            timeout: Number((row as any).timeout ?? 30) || 30,
            prompt: (row as any).prompt ?? undefined,
          };
        }
        return null;
      })
      .filter((d): d is RingGroupDestination => !!d && !!d.destination);
  }
  const str = String(input);
  return str
    .split(/[\n|;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseOne)
    .filter((d): d is RingGroupDestination => !!d && !!d.destination);
}

function parseOne(raw: string): RingGroupDestination | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  // pattern: destination,timeout[,prompt]
  const [dest, timeoutStr, prompt] = cleaned.split(',').map((x) => x.trim());
  if (!dest) return null;
  const timeout = Number(timeoutStr);
  return {
    destination: dest,
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 30,
    prompt: prompt || undefined,
  };
}

/** Serialize destinations to FusionPBX CSV form: "300,30|301,20" */
export function serializeRingGroupDestinations(items: RingGroupDestination[]): string {
  return items
    .filter((d) => d.destination)
    .map((d) => {
      const parts = [d.destination, String(d.timeout || 30)];
      if (d.prompt) parts.push(d.prompt);
      return parts.join(',');
    })
    .join('|');
}

export const RING_STRATEGIES = [
  { value: 'simultaneous', label: 'Simultaneous', desc: 'Ring all members at once.' },
  { value: 'sequence', label: 'Sequence', desc: 'Ring members one after another in order.' },
  { value: 'enterprise', label: 'Enterprise', desc: 'Ring all aggressively, no early-media restraint.' },
  { value: 'rollover', label: 'Rollover', desc: 'Try first available member, roll to next on busy.' },
  { value: 'random', label: 'Random', desc: 'Ring a random member each call.' },
] as const;
