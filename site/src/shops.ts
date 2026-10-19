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
  /** Where, in words ("JM Road, Deccan Gymkhana"). */
  area: string;
  story: string;
  special: string;
  /** The shop's own offers, up to 5. */
  offers: string[];
  status: Status;
  status_note: string;
  owner: string | null;
  claimable: boolean;
  /** Made up for the demo: shown as a demo shop, so nobody walks to it. */
  demo: boolean;
  /** Its billboard ad: a headline, a small line and one of the pictures in public/ads/art, or an uploaded image. */
  ad_headline: string;
  ad_sub: string;
  ad_art: string;
  ad_image_url: string;
  ad_schedule: 'always' | 'week' | 'today';
  /** What the saving is worked out on: menu item ids and how many. */
  usual_order: { item: string; qty: number }[];
  /** Typical delivery + platform + packaging fees on delivery apps, rupees. */
  app_fee: number;
  /** Where its billboard stands; empty: beside the shop. */
  board_lat: number | null;
  board_lng: number | null;
  /** What the business does, in the owner's words; the mascot reads it with the story. */
  about: string;
  /** The billboard ad's colour (#rrggbb); empty: the section's. */
  ad_color: string;
  /** On the map for visitors; a new shop is a draft until its owner publishes it. */
  published: boolean;
};

export type MenuItem = {
  id: string;
  shop_id: string;
  name: string;
  /** Empty when the shop gives none (a mall's floors) or says it in words in the note ("from 150 rupees"). */
  price: number | null;
  /** What the shop says delivery apps charge for it, if it says. */
  app_price: number | null;
  available: boolean;
  /** The shop's words about it: "contains nuts", "from 150 rupees". */
  note: string;
  sort: number;
  updated_at: string;
};

export type ShopWithMenu = Shop & { menu: MenuItem[] };

export const SHOP_COLUMNS = 'id,slug,name,section,friend,lat,lng,area,story,special,offers,status,status_note,owner,claimable,demo,'
  + 'ad_headline,ad_sub,ad_art,ad_image_url,ad_schedule,usual_order,app_fee,board_lat,board_lng,about,ad_color,published';
const MENU_COLUMNS = 'id,shop_id,name,price,app_price,available,note,sort,updated_at';

/** The business sections, by the database's ids: their name and colour (the mascots' own) and an icon. */
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

const sectionMascot = (section: string) => MASCOTS.find((mascot) => mascot.section === section);

/** The mascot at a shop's door: its own, else its section's, else Juno. */
export const hostOf = (shop: Pick<Shop, 'friend' | 'section'>): Mascot =>
  MASCOTS.find((mascot) => mascot.id === shop.friend) ?? sectionMascot(shop.section) ?? MASCOTS.find((mascot) => mascot.id === 'juno')!;

export const portraitOf = (mascot: Mascot) => `/mascots/${mascot.id}.png`;
export const figureOf = (mascot: Mascot, grey = false) => `/mascots/figures/${mascot.id}${grey ? '-grey' : ''}.png`;

/** What the status says, in words: "Busy · about a 10 min wait", "Closed · opens at 11 am". */
export function statusText(shop: Pick<Shop, 'status' | 'status_note'>): string {
  const word = { open: 'Open', busy: 'Busy', closed: 'Closed' }[shop.status];
  return shop.status_note ? `${word} · ${shop.status_note}` : word;
}

/** Minutes on foot at an easy 80 m a minute (straight line, so a little optimistic). */
export const walkMinutes = (me: LatLng, shop: LatLng) => Math.max(1, Math.round(distanceM(me, shop) / 80));

/** "2 min · 150 m" from where the visitor is, or null before we know. */
export function walkText(me: LatLng | null, shop: LatLng): string | null {
  if (!me) return null;
  const m = distanceM(me, shop);
  return `${walkMinutes(me, shop)} min · ${m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`}`;
}

/** Where a shop's billboard stands: its own spot, else about 40 m east of the shop. */
export const boardOf = (shop: Shop): LatLng =>
  shop.board_lat !== null && shop.board_lng !== null
    ? { lat: shop.board_lat, lng: shop.board_lng }
    : { lat: shop.lat, lng: shop.lng + 40 / (111320 * Math.cos((shop.lat * Math.PI) / 180)) };

export type Order = { names: string; here: number; itemsApps: number; fee: number; apps: number; saving: number };

/** The usual order's sum: the shop's own app prices + typical fees against its walk-in price. Null when an item is
 * missing, sold out or has no app price (the saving is then hidden), or when walking in saves nothing. */
export function orderOf(shop: Pick<Shop, 'usual_order' | 'app_fee'>, menu: MenuItem[]): Order | null {
  const lines = shop.usual_order.map(({ item, qty }) => ({ item: menu.find((m) => m.id === item), qty }));
  if (!lines.length) return null;
  let here = 0;
  let itemsApps = 0;
  for (const { item, qty } of lines) {
    if (!item || !item.available || item.price === null || item.app_price === null || !(qty > 0)) return null;
    here += item.price * qty;
    itemsApps += item.app_price * qty;
  }
  const apps = itemsApps + shop.app_fee;
  if (apps <= here) return null;
  const names = lines.map(({ item, qty }) => `${qty > 1 ? `${qty} ` : ''}${item!.name.toLowerCase()}`).join(' + ');
  return { names, here, itemsApps, fee: shop.app_fee, apps, saving: apps - here };
}

/** ₹ as people say it: 1,450 and 48 lakh and 1.15 crore. */
export function rupees(amount: number): string {
  if (amount >= 1e7) return `₹${+(amount / 1e7).toFixed(2)} crore`;
  if (amount >= 1e5) return `₹${+(amount / 1e5).toFixed(2)} lakh`;
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function ago(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h ago`;
  return minutes < 2880 ? 'yesterday' : `${Math.floor(minutes / 1440)} days ago`;
}

/** When the menu last changed: its newest item. */
export const updatedAt = (menu: MenuItem[]) => menu.reduce((newest, item) => (item.updated_at > newest ? item.updated_at : newest), '');

const sortMenu = (items: MenuItem[]) => [...items].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

/** Every published shop with its menu, for the map and the list, kept live (a demo-sized table: any change reloads it all). */
export function useShops(): ShopWithMenu[] {
  const [shops, setShops] = useState<ShopWithMenu[]>([]);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const { data } = await db.from('shops').select(`${SHOP_COLUMNS},menu_items(${MENU_COLUMNS})`).eq('published', true).order('name');
      if (!live) return;
      if (!data) {   // a failed load (offline, a weak signal): try again, so the list doesn't stay empty
        window.setTimeout(() => { if (live) void load(); }, 3000);
        return;
      }
      setShops((data as (Shop & { menu_items: MenuItem[] })[]).map(({ menu_items: items, ...shop }) => ({ ...shop, menu: sortMenu(items) })));
    };
    void load();
    const channel = db
      .channel('shops-map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shops' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => void load())
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
      const { data, error } = await db.from('shops').select(`${SHOP_COLUMNS},menu_items(${MENU_COLUMNS})`).eq('slug', slug).eq('published', true).maybeSingle();
      if (!live || error) return; // on an error keep what's shown; the next change loads again
      if (!data) {
        setState({ shop: null, menu: [], missing: true });
        return;
      }
      const { menu_items: items, ...shop } = data as Shop & { menu_items: MenuItem[] };
      setState({ shop, menu: sortMenu(items), missing: false });
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
