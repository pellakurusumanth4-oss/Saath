import { useEffect, useState } from 'react';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { FRIENDS, type Friend } from '../../src/friends';
import { distanceM, type LatLng } from '../../src/geo';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './talk';

/** Shops, live menus and owner sign-in. Anyone may read; owners write only their own shop (row level security). */
export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export type Status = 'open' | 'busy' | 'closed';

export type Shop = LatLng & {
  id: string;
  slug: string;
  name: string;
  section: string;
  /** The host at the door: a website friend's id for now. */
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

/** The business sections, by the database's ids: what a pin shows and its colour. */
export const SECTIONS: Record<string, { label: string; icon: string; color: string }> = {
  restaurant: { label: 'Restaurant', icon: '🍛', color: '#E96633' },
  cafe: { label: 'Café', icon: '☕', color: '#A0663B' },
  juice: { label: 'Juice bar', icon: '🧃', color: '#5FAD32' },
  bakery: { label: 'Bakery', icon: '🥐', color: '#E8A33D' },
  grocery: { label: 'Grocery', icon: '🛒', color: '#2F9E58' },
  streetfood: { label: 'Street food', icon: '🌯', color: '#E5484D' },
  boutique: { label: 'Boutique', icon: '👗', color: '#D25FA8' },
  mall: { label: 'Mall', icon: '🏬', color: '#6C5CE7' },
  realestate: { label: 'Real estate', icon: '🏠', color: '#2E7CF6' },
  salon: { label: 'Salon', icon: '💇', color: '#E86A92' },
  pharmacy: { label: 'Pharmacy', icon: '💊', color: '#1FA59A' },
  bookstore: { label: 'Bookshop', icon: '📚', color: '#8E6B3E' },
  electronics: { label: 'Electronics', icon: '📱', color: '#3F4A5A' },
  gym: { label: 'Gym', icon: '🏋️', color: '#D9480F' },
  hotel: { label: 'Hotel', icon: '🏨', color: '#0B7285' },
};
export const sectionOf = (shop: Pick<Shop, 'section'>) => SECTIONS[shop.section] ?? SECTIONS.restaurant;

export const STATUS_LABEL: Record<Status, string> = { open: 'Open now', busy: 'Busy right now', closed: 'Closed now' };

/** The host at a shop's door: its face, name, voice and AR rig are the website friend's (Nobita if unknown). */
export const hostOf = (shop: Pick<Shop, 'friend'>): Friend =>
  FRIENDS.find((friend) => friend.id === shop.friend) ?? FRIENDS.find((friend) => friend.id === 'nobita')!;

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
