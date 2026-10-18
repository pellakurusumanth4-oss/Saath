// A shop's data for its mascot, loaded by the slug the page sends: the shape web/talk/prompts.mjs takes as `shop`
// (mascotPrompt, shopData, mascotOf). Pages never send shop data, only the slug. db: a supabase-js client. Returns null
// for a bad or unknown slug. Copied into the ar function by site/scripts/sync-ar-function.mjs.
export async function loadShop(db, slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const { data, error } = await db
    .from('shops')
    .select('slug,name,section,friend,story,special,status,status_note,menu_items(name,price,app_price,available,sort)')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.slug,
    name: data.name,
    section: data.section,
    story: data.story,
    special: data.special,
    status: data.status,
    statusNote: data.status_note,
    currency: 'INR',
    // The prompts reject a blank name, which the database allows (one space), so those items are left out.
    menu: data.menu_items
      .filter((item) => item.name.trim())
      .sort((a, b) => a.sort - b.sort)
      .slice(0, 60)
      .map((item) => ({ name: item.name, price: item.price, appPrice: item.app_price, available: item.available })),
    mascot: { id: data.friend },
  };
}
