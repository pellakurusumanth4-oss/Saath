import { useEffect, useState } from 'react';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { distanceM, type LatLng } from '../../src/geo';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './talk';
import { MASCOTS, type Mascot } from './mascots';

/** Shops, live menus and owner sign-in. Anyone may read; owners write only their own shop (row level security). */
export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export type Status = 'open' | 'busy' | 'closed';

export type Shop = LatLng & {
  id: string;
  slug: string;
  name: string;
  section: string;
  /** The mascot at the door (a MASCOTS id). */
  friend: string;
  story: string;
  special: string;
  status: Status;
  status_note: string;
  owner: string | null;
  claimable: boolean;
};

export type MenuItem = {
  id: string;
  shop_id: string;
  name: string;
  price: number;
  /** What the shop says delivery apps charge for it, if it says. */
  app_price: number | null;
  available: boolean;
  sort: number;
  updated_at: string;
};

export const SHOP_COLUMNS = 'id,slug,name,section,friend,lat,lng,story,special,status,status_note,owner,claimable';

/** The business sections, by the database's ids: their name and colour (the mascots' own) and an icon for those
 * without a mascot's pin yet. */
export const SECTIONS: Record<string, { label: string; icon: string; color: string }> = {
  restaurant: { label: 'Restaurant', icon: '🍛', color: '#E5533D' },
  cafe: { label: 'Café & Chai', icon: '☕', color: '#14897C' },
  juice: { label: 'Juice & Smoothies', icon: '🧃', color: '#7CB82F' },
  bakery: { label: 'Bakery & Sweets', icon: '🥐', color: '#8C5A3C' },
  grocery: { label: 'Grocery & Kirana', icon: '🛒', color: '#2E8B57' },
  streetfood: { label: 'Street Food', icon: '🌯', color: '#E8A317' },
  boutique: { label: 'Fashion Boutique', icon: '👗', color: '#7B4BA8' },
  mall: { label: 'Shopping Mall', icon: '🏬', color: '#F28C28' },
  realestate: { label: 'Real Estate', icon: '🏠', color: '#23395B' },
  salon: { label: 'Salon & Spa', icon: '💇', color: '#E35D9A' },
  pharmacy: { label: 'Pharmacy', icon: '💊', color: '#1AA3C2' },
  books: { label: 'Bookshop', icon: '📚', color: '#8E6B3E' },
  electronics: { label: 'Electronics & Mobile', icon: '📱', color: '#3D5AFE' },
  gym: { label: 'Gym', icon: '🏋️', color: '#D9480F' },
  hotel: { label: 'Hotel', icon: '🏨', color: '#0B7285' },
};
export const sectionOf = (shop: Pick<Shop, 'section'>) => SECTIONS[shop.section] ?? SECTIONS.restaurant;

export const STATUS_LABEL: Record<Status, string> = { open: 'Open now', busy: 'Busy right now', closed: 'Closed now' };

const sectionMascot = (section: string) => MASCOTS.find((mascot) => mascot.section === section);

/** The mascot at a shop's door: its own, else its section's, else Juno. */
export const hostOf = (shop: Pick<Shop, 'friend' | 'section'>): Mascot =>
  MASCOTS.find((mascot) => mascot.id === shop.friend) ?? sectionMascot(shop.section) ?? MASCOTS.find((mascot) => mascot.id === 'juno')!;

export const portraitOf = (mascot: Mascot) => `/mascots/${mascot.id}.png`;

/** Mascots whose AR rig is in the site's /ar/rigs/ (the AR page's), so "Meet in AR" shows. */
export const AR_READY = new Set<string>([]);

// shortcut: Talk stays hidden until the talk function answers as the mascots (the persona session's prompts).
export const TALK_READY = false;

/** The section's map pin, drawn with its mascot; null for the sections without a mascot yet. */
export const pinOf = (shop: Pick<Shop, 'section'>) => {
  const mascot = sectionMascot(shop.section);
  return mascot ? `/mascots/pins/${mascot.id}.svg` : null;
};

/** Minutes on foot at an easy 80 m a minute (straight line, so a little optimistic). */
export const walkMinutes = (me: LatLng, shop: LatLng) => Math.max(1, Math.round(distanceM(me, shop) / 80));

/** The biggest saving on one item on today: the shop's own price against what it says delivery apps charge. */
export function bestSaving(menu: MenuItem[]): { item: MenuItem; saving: number } | null {
  let best: { item: MenuItem; saving: number } | null = null;
  for (const item of menu) {
    const saving = item.available && item.app_price !== null ? item.app_price - item.price : 0;
    if (saving > 0 && (!best || saving > best.saving)) best = { item, saving };
  }
  return best;
}

export const rupees = (amount: number) => `₹${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;

export function ago(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h ago`;
  return `${Math.floor(minutes / 1440)} days ago`;
}

/** Every shop, for the map and the list, kept live. */
export function useShops(): Shop[] {
  const [shops, setShops] = useState<Shop[]>([]);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const { data } = await db.from('shops').select(SHOP_COLUMNS).order('name');
      if (live && data) setShops(data as Shop[]);
    };
    void load();
    const channel = db
      .channel('shops-map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shops' }, () => void load())
      .subscribe();
    return () => {
      live = false;
      void db.removeChannel(channel);
    };
  }, []);
  return shops;
}

/** One shop and its menu, live: a price, status or special the owner changes shows here within a second. */
export function useShop(slug: string): { shop: Shop | null; menu: MenuItem[]; missing: boolean } {
  const [state, setState] = useState<{ shop: Shop | null; menu: MenuItem[]; missing: boolean }>({ shop: null, menu: [], missing: false });
  useEffect(() => {
    let live = true;
    let channel: RealtimeChannel | null = null;
    const load = async () => {
      const { data, error } = await db.from('shops').select(`${SHOP_COLUMNS},menu_items(*)`).eq('slug', slug).maybeSingle();
      if (!live || error) return; // on an error keep what's shown; the next change loads again
      if (!data) {
        setState({ shop: null, menu: [], missing: true });
        return;
      }
      const { menu_items: items, ...shop } = data as Shop & { menu_items: MenuItem[] };
      const menu = [...items].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
      setState({ shop, menu, missing: false });
      // Deletes can't be filtered by shop, so any menu delete reloads; it's a small table.
      channel ??= db
        .channel(`shop-${shop.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items', filter: `shop_id=eq.${shop.id}` }, () => void load())
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'menu_items' }, () => void load())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shops', filter: `id=eq.${shop.id}` }, () => void load())
        .subscribe();
    };
    void load();
    return () => {
      live = false;
      if (channel) void db.removeChannel(channel);
    };
  }, [slug]);
  return state;
}
