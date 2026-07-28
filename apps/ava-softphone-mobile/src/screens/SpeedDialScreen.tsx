import React, { useEffect, useState } from 'react';
import { Phone, Star, Plus } from 'lucide-react';
import { colors, font, radius } from '../lib/theme';
import { EmptyState, SectionTitle, Skeleton } from '../components/ui/Primitives';
import { loadCachedContacts } from '../lib/contacts';
import { dialNumber } from '../lib/dialNumber';
import { useT } from '../lib/i18n';

type Favorite = { id: string; name: string; number: string };

const FAV_KEY = 'ava.speeddial.favorites';

function loadFavorites(): Favorite[] {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; }
}
function saveFavorites(list: Favorite[]) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch {}
}

export default function SpeedDialScreen({ sp, preferClickToCall }: { sp: any; preferClickToCall?: boolean }) {
  const { lang } = useT();
  const fr = lang === 'fr';
  const [favs, setFavs] = useState<Favorite[] | null>(null);
  const [suggestions, setSuggestions] = useState<{ name: string; number: string }[]>([]);

  useEffect(() => {
    setFavs(loadFavorites());
    try {
      const rows: any[] = loadCachedContacts() || [];
      const list = rows.slice(0, 12).map((c: any) => ({
        name: c.display_name || c.name || c.phone || c.extension || '',
        number: c.phone || c.extension || '',
      })).filter((c) => c.number);
      setSuggestions(list);
    } catch { setSuggestions([]); }
  }, []);

  const addFav = (name: string, number: string) => {
    const next = [...(favs || []), { id: crypto.randomUUID(), name, number }];
    setFavs(next); saveFavorites(next);
  };
  const removeFav = (id: string) => {
    const next = (favs || []).filter((f) => f.id !== id);
    setFavs(next); saveFavorites(next);
  };
  const call = (number: string) => {
    try { dialNumber(sp, number); }
    catch { sp?.call?.(number); }
  };

  if (favs === null) {
    return (
      <div style={{ padding: 14 }}>
        <Skeleton h={100} style={{ marginBottom: 10 }} />
        <Skeleton h={100} style={{ marginBottom: 10 }} />
        <Skeleton h={100} />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 14px 96px' }}>
      <SectionTitle eyebrow={fr ? 'Composition rapide' : 'Speed dial'} title={fr ? 'Favoris' : 'Favorites'} />

      {favs.length === 0 ? (
        <EmptyState
          icon={<Star size={28} />}
          title={fr ? 'Aucun favori' : 'No favorites yet'}
          hint={fr ? 'Épinglez vos contacts les plus appelés pour les composer en un toucher.' : 'Pin your most-called contacts to dial them in one tap.'}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {favs.map((f) => (
            <div key={f.id} style={{
              padding: 12, borderRadius: radius.lg,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}>
              <button onClick={() => call(f.number)} style={{
                width: 56, height: 56, borderRadius: '50%', border: 'none',
                background: `linear-gradient(135deg, ${colors.lemtelBlue}, ${colors.avaCyan})`,
                color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer',
                boxShadow: '0 8px 20px -10px rgba(0,35,230,0.7)',
              }} aria-label={`Call ${f.name}`}>
                <Phone size={22} />
              </button>
              <div style={{ fontSize: font.xs, fontWeight: 700, color: colors.textIce, textAlign: 'center' }}>{f.name}</div>
              <div style={{ fontSize: 10, color: colors.mutedSilver, fontFamily: 'JetBrains Mono, monospace' }}>{f.number}</div>
              <button onClick={() => removeFav(f.id)} style={{
                background: 'transparent', border: 'none', color: colors.mutedSilver, fontSize: 10, cursor: 'pointer',
              }}>{fr ? 'Retirer' : 'Remove'}</button>
            </div>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <>
          <div style={{ height: 18 }} />
          <SectionTitle eyebrow={fr ? 'Suggestions' : 'Suggestions'} title={fr ? 'Ajouter aux favoris' : 'Add to favorites'} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => addFav(s.name, s.number)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                borderRadius: radius.md, background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)', color: colors.textIce,
                cursor: 'pointer', textAlign: 'left',
              }}>
                <Plus size={16} color={colors.avaCyan} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: font.sm, fontWeight: 700 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: colors.mutedSilver }}>{s.number}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
