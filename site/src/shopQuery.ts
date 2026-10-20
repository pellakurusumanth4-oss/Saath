// The shop list's columns and its REST query. shops.ts asks with them, and vite.config.ts writes the same query into the
// map page's HTML, so the list starts loading beside the app's script instead of after it (visit/index.html).
export const SHOP_COLUMNS = 'id,slug,name,section,friend,lat,lng,area,story,special,offers,status,status_note,owner,claimable,demo,'
  + 'ad_headline,ad_sub,ad_art,ad_image_url,ad_schedule,usual_order,app_fee,board_lat,board_lng,about,ad_color,published,hours';
export const MENU_COLUMNS = 'id,shop_id,name,price,app_price,available,note,sort,updated_at';
/** Every published shop with its menu, by name: useShops' supabase-js query as a PostgREST query string. */
export const SHOPS_LIST_QUERY = `select=${encodeURIComponent(`${SHOP_COLUMNS},created_at,menu_items(${MENU_COLUMNS})`)}&published=eq.true&order=name.asc`;
