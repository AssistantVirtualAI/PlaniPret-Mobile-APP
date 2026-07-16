import { useEffect, useState } from 'react';

export type ActiveDomain = {
  uuid: string;
  name: string;
  org_id: string;
};

const KEY = 'lemtel.activeDomain';

function read(): ActiveDomain | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.uuid && parsed?.name && parsed?.org_id) return parsed;
  } catch {}
  return null;
}

export function setActiveDomain(d: ActiveDomain | null) {
  if (d) sessionStorage.setItem(KEY, JSON.stringify(d));
  else sessionStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent('lemtel:active-domain-changed'));
}

export function useActiveDomain(): ActiveDomain | null {
  const [d, setD] = useState<ActiveDomain | null>(() => read());
  useEffect(() => {
    const onChange = () => setD(read());
    window.addEventListener('lemtel:active-domain-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('lemtel:active-domain-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  return d;
}
