export const C = {
  paper: '#FAFAF7',
  ink: '#111318',
  cobalt: '#2B59FF',
  cobaltDark: '#1D3FCC',
  tint: '#E3EAFF',
  yellow: '#FFCF1A',
  muted: '#5B6170',
  mutedDark: '#4A5060',
  line: '#C3C8D3',
  white: '#FFFFFF',
};

/** The comic "hard" shadow used across the Wander screens. */
export const hardShadow = (offset = 4) => ({ boxShadow: `${offset}px ${offset}px 0 ${C.ink}` });

/** The "Golden hour" map screen (Figma frames 02, 08–10): frosted cards, azure and gold accents. */
export const G = {
  text: '#1D2433',
  muted: '#5A6375',
  azure: '#2F8DF6',
  gold: '#C98A1E',
  goldBar: '#F49E3A',
  goldText: '#3B2606',
  glass: 'rgba(255,251,245,0.94)',
  edge: 'rgba(255,255,255,0.8)',
};
export const softShadow = { boxShadow: '0 12px 32px rgba(52,64,106,0.2), 0 1px 3px rgba(52,64,106,0.12)' };
