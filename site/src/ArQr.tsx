// A shop's AR link as a QR code and a copyable link: the AR page needs Android Chrome, so a laptop, an iPhone or another
// browser hands the link to a phone that has it. The visitors' "Meet in AR" sheet and the owner's door sign share these.
import { useEffect, useRef, useState } from 'react';
import { hostOf, type Shop } from './shops';
import { Icon } from './ui';

/** The link to meet a shop's mascot in AR; absolute, so it still works scanned on another device. */
export const arLinkOf = (shop: Pick<Shop, 'slug' | 'friend' | 'section'>) => {
  const mascot = hostOf(shop);
  const query = new URLSearchParams({ friend: mascot.id, shop: shop.slug, name: mascot.name.split(' ').pop()!, tall: String(mascot.tall) });
  return `${window.location.origin}/ar/?${query}`;
};

/** The QR as an inline SVG, made on the device (no network); the encoder is its own chunk, fetched when a QR shows. */
export function ArQr({ link }: { link: string }) {
  const [qr, setQr] = useState<{ d: string; n: number } | null>(null);
  useEffect(() => {
    let live = true;
    void import('qrcode-generator').then(({ default: qrcode }) => {
      const code = qrcode(0, 'M');
      code.addData(link);
      code.make();
      const n = code.getModuleCount();
      let d = '';
      // One rectangle per run of dark modules in a row: a short path, and no seams between neighbours.
      for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
          if (!code.isDark(row, col)) continue;
          let run = 1;
          while (col + run < n && code.isDark(row, col + run)) run++;
          d += `M${col} ${row}h${run}v1h-${run}z`;
          col += run;
        }
      }
      if (live) setQr({ d, n });
    }, () => {});   // offline and the chunk didn't load: the link below still works
    return () => { live = false; };
  }, [link]);
  // A quiet zone of 4 white modules all round, as scanners need; the white is drawn, so it prints too.
  return (
    <svg className="ar-qr" viewBox={qr ? `-4 -4 ${qr.n + 8} ${qr.n + 8}` : '0 0 1 1'} role="img" aria-label={`QR code of the AR link: ${link}`} shapeRendering="crispEdges">
      {qr && <><rect x={-4} y={-4} width={qr.n + 8} height={qr.n + 8} fill="#fff" /><path d={qr.d} fill="#000" /></>}
    </svg>
  );
}

/** The link in a field anyone can select, and Copy link; where the clipboard says no, the field's text is selected. */
export function ArLink({ link }: { link: string }) {
  const field = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [link]);
  const select = () => {
    field.current?.focus();
    field.current?.select();
  };
  // Inside the tap itself: the clipboard needs the user's gesture.
  const copy = () => (navigator.clipboard ? navigator.clipboard.writeText(link).then(() => setCopied(true), select) : select());
  return (
    <div className="ar-link">
      <input ref={field} readOnly value={link} aria-label="AR link" onFocus={(event) => event.currentTarget.select()} />
      <button type="button" className="btn-ghost small" onClick={() => void copy()} aria-live="polite">
        {copied && <Icon name="check" size={16} />}{copied ? 'Link copied' : 'Copy link'}
      </button>
    </div>
  );
}
