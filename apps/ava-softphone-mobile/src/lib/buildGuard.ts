/**
 * Build-time guard: production builds MUST NOT bundle mock data behaviour.
 * Imported from `src/index.tsx` so a prod build with VITE_AVA_MOCK=true
 * fails loudly at boot instead of showing fake data to a real user.
 */
const env = (import.meta as any).env || {};
const wantsMock = env.VITE_AVA_MOCK === 'true';
const isProd = !!env.PROD;

if (isProd && wantsMock) {
  const msg =
    '[AVA Mobile] FATAL: production build was compiled with VITE_AVA_MOCK=true. ' +
    'Mock data is forbidden in production. Rebuild with VITE_AVA_MOCK=false.';
  // eslint-disable-next-line no-console
  console.error(msg);
  throw new Error(msg);
}

/** True only in DEV builds where VITE_AVA_MOCK=true was explicitly set. */
export function isMockMode(): boolean {
  return !isProd && wantsMock;
}
