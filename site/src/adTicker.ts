// One clock for every running ad: each 3.5 s it moves each ad to its next frame by its data-frame attribute and the CSS
// transitions (.ad-f) do the rest, so nothing re-renders and nothing animates between flips.
const ads = new Set<HTMLElement>();
let clock = 0;
const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)');

function flip() {
  if (document.hidden) return;
  for (const ad of ads) {
    if (ad.closest('[inert]')) continue;   // behind a dialog: nobody sees it
    ad.dataset.frame = calm?.matches ? '0' : String((Number(ad.dataset.frame) + 1) % Number(ad.dataset.n));
  }
}

/** Run this ad's frames (data-n of them) from the first; returns the stop. The clock runs only while an ad does. */
export function runAd(ad: HTMLElement) {
  ad.dataset.frame = '0';
  ads.add(ad);
  clock ||= window.setInterval(flip, 3500);
  return () => {
    ads.delete(ad);
    if (!ads.size) {
      window.clearInterval(clock);
      clock = 0;
    }
  };
}
