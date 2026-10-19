// A shop's data for its mascot, loaded by the slug the page sends: the shape web/talk/prompts.mjs takes as `shop`
// (mascotPrompt, shopData, mascotOf). Pages never send shop data, only the slug. db: a supabase-js client. Returns null
// for a bad or unknown slug. Copied into the ar function by site/scripts/sync-ar-function.mjs.
// The usual order the shop's card shows a saving for, the way the site's orderOf works it out (site/src/shops.ts):
// undefined when an item is missing, sold out or has no app price, or when walking in saves nothing.
function usualOrder({ usual_order: lines, app_fee: fee, menu_items: menu }) {
  if (!Array.isArray(lines) || !lines.length || typeof fee !== 'number') return undefined;
  let here = 0, apps = fee;
  const names = [];
  for (const { item: id, qty } of lines) {
    const item = menu.find((m) => m.id === id);
    if (!item || !item.available || typeof item.price !== 'number' || typeof item.app_price !== 'number' || !(qty > 0)) return undefined;
    here += item.price * qty;
    apps += item.app_price * qty;
    names.push(`${qty > 1 ? `${qty} ` : ''}${item.name.toLowerCase()}`);
  }
  const cents = (n) => Math.round(n * 100) / 100;
  return apps > here ? { items: names.join(' + ').slice(0, 200), here: cents(here), apps: cents(apps), fee } : undefined;
}

export async function loadShop(db, slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const { data, error } = await db
    .from('shops')
    .select('slug,name,section,friend,area,hours,about,story,special,offers,status,status_note,usual_order,app_fee,menu_items(id,name,price,app_price,available,note,sort)')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.slug,
    name: data.name,
    section: data.section,
    area: data.area,
    hours: data.hours ?? '',   // the owner's timings ("Mon–Sat, 8 am – 9 pm"): the mascot answers "when are you open?"
    // What the business does (the owner's line or two) opens its story: the prompts take both from the shop's block.
    story: [data.about, data.story].map((text) => (text ?? '').trim()).filter(Boolean).join(' '),
    special: data.special,
    // The prompts take at most 5, each up to 200 characters (an owner could write more through the API).
    offers: data.offers.filter((offer) => offer.trim() && offer.length <= 200).slice(0, 5),
    status: data.status,
    statusNote: data.status_note,
    currency: 'USD',   // the website's prices are US dollars (migration 20261019160000)
    usualOrder: usualOrder(data),
    // The prompts reject a blank name, which the database allows (one space), so those items are left out.
    menu: data.menu_items
      .filter((item) => item.name.trim())
      .sort((a, b) => a.sort - b.sort)
      .slice(0, 60)
      .map((item) => ({ name: item.name, price: item.price, appPrice: item.app_price, available: item.available, note: item.note })),
    mascot: { id: data.friend },
  };
}
