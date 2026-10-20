// The kinds of business a visitor browses (the chips under the search), as on Footfall's Base44 build. Nearby shows
// every business, each with its mascot and billboard; each kind then gets a section of its own. Food is live: the
// walk-in price against delivery apps belongs to food places only. Every other kind is coming soon, with what its own
// section will show (a flat's price list is not a delivery saving) and what a verified visit will be there.
// No imports: site/scripts/kinds.test.mjs runs it in Node.

/** The sections that are food: their walk-in price is compared with delivery apps (web/talk/prompts.mjs and
 * web/ar/index.html keep the same list; the test checks the prompts' one). */
export const FOOD_SECTIONS = new Set(['restaurant', 'cafe', 'juice', 'bakery', 'streetfood', 'grocery']);

/** A food place: the only kind whose visitors see the walk-in price against delivery apps. */
export const isFood = (shop: { section: string }) => FOOD_SECTIONS.has(shop.section);

/** sections null: every business. glyph: the section whose icon and colour the chip shows. soon: what its own section
 * will show (the card's line); teaser and visit: the coming-soon sheet's line and what a verified visit will be. */
export type Kind = { id: string; label: string; sections: string[] | null; live: boolean; glyph?: string; soon?: string; teaser?: string; visit?: string };

export const KINDS: Kind[] = [
  { id: 'nearby', label: 'Nearby', sections: null, live: true },
  { id: 'food', label: 'Food', glyph: 'restaurant', sections: [...FOOD_SECTIONS], live: true, visit: 'the counter code at the till' },
  { id: 'realestate', label: 'Real estate', glyph: 'realestate', sections: ['realestate'], live: false, soon: 'price lists of flats and site visits',
    teaser: 'Walk into open houses, see the price list.', visit: 'an open-house check-in' },
  { id: 'clothing', label: 'Clothing', glyph: 'boutique', sections: ['boutique'], live: false, soon: 'new collections, sizes and offers',
    teaser: 'Today’s sale, sizes in stock.', visit: 'a trial-room code' },
  { id: 'salon', label: 'Beauty & salons', glyph: 'salon', sections: ['salon'], live: false, soon: 'services, prices and free slots',
    teaser: 'Free slots right now.', visit: 'a code at the front desk' },
  { id: 'health', label: 'Pharmacy', glyph: 'pharmacy', sections: ['pharmacy'], live: false, soon: 'medicines in stock and health checks',
    teaser: 'Medicines in stock before you walk over.', visit: 'a code at the counter' },
  { id: 'electronics', label: 'Electronics', glyph: 'electronics', sections: ['electronics'], live: false, soon: 'products, prices and repairs',
    teaser: 'In-store price vs online price.', visit: 'a code at the demo counter' },
  { id: 'shopping', label: 'Shopping', glyph: 'mall', sections: ['mall', 'books'], live: false, soon: 'stores, offers and events',
    teaser: 'Every store’s offer, floor by floor.', visit: 'a code at the help desk' },
  { id: 'stay', label: 'Hotels & gyms', glyph: 'hotel', sections: ['hotel', 'gym'], live: false, soon: 'rooms, plans and classes',
    teaser: 'Rooms tonight, classes today.', visit: 'a check-in at the front desk' },
];

/** The kind a business belongs to (never Nearby; Food for a section no kind names). */
export const kindOf = (shop: { section: string }) => KINDS.find((kind) => kind.sections?.includes(shop.section)) ?? KINDS[1];

/** What a business that isn't food says where a food place shows its saving: its own section is coming. */
export const soonLine = (shop: { section: string }) => {
  const kind = kindOf(shop);
  return kind.live ? '' : `${kind.label} on Footfall: ${kind.soon} are coming soon.`;
};
