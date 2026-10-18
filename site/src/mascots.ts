// Saath's own business mascots, one per section, as the user approved them on 19 Oct 2026
// (~/.cache/saath-mascots/approved.json; portraits and pins in public/mascots/). tall: metres, for AR.
export type Mascot = { id: string; name: string; section: string; tall: number };

export const MASCOTS: Mascot[] = [
  { id: "rosa", name: "Chef Rosa", section: "restaurant", tall: 1.7 },
  { id: "kiran", name: "Kiran", section: "cafe", tall: 1.7 },
  { id: "juno", name: "Juno", section: "juice", tall: 1.4 },
  { id: "otto", name: "Grandpa Otto", section: "bakery", tall: 1.7 },
  { id: "sunny", name: "Sunny", section: "streetfood", tall: 1.7 },
  { id: "nia", name: "Auntie Nia", section: "grocery", tall: 1.7 },
  { id: "mika", name: "Mika", section: "boutique", tall: 1.7 },
  { id: "max", name: "Max", section: "mall", tall: 1.4 },
  { id: "omar", name: "Omar", section: "realestate", tall: 1.7 },
  { id: "lina", name: "Lina", section: "salon", tall: 1.7 },
  { id: "sana", name: "Sana", section: "pharmacy", tall: 1.7 },
  { id: "kai", name: "Kai", section: "electronics", tall: 1.4 },
];
