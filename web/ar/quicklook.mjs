// iPhone and iPad AR: they have no WebXR, but Apple's AR Quick Look stands a mascot on the floor from a .usdz file
// (/ar/quicklook/<id>.usdz: its own rig stopped on its wave, at true height, feet on the floor). Shared by the website's
// "Meet <name> in AR" and the /ar page's "See <name> in your room".
// The host sends .usdz as application/octet-stream and Safari wants model/vnd.usdz+zip, so the file is fetched ahead (when
// the AR button shows) and handed over as a typed blob; a tap before it is in gets the file itself.
const a = document.createElement('a');
// iPhone/iPad only (MacIntel with touch is an iPad; a Mac's Safari may claim rel=ar, and laptops keep the QR sheet). There,
// Safari says rel=ar works; Chrome, Edge, Firefox and Google's app open Quick Look without saying so; an in-app browser
// (Instagram, Facebook) can't open it, so it keeps the QR sheet (model-viewer's test).
const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canQuickLook = iOS && (!!a.relList?.supports?.('ar') || /CriOS\/|EdgiOS\/|FxiOS\/|GSA\/|DuckDuckGo\//.test(navigator.userAgent));

const blobs = {}, fetching = {};
export function prefetchQuickLook(id) {
  fetching[id] ??= fetch(`/ar/quicklook/${id}.usdz`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((buf) => { blobs[id] = URL.createObjectURL(new Blob([buf], { type: 'model/vnd.usdz+zip' })); }, () => { delete fetching[id]; });   // the next card tries again
}

/** The banner Quick Look shows under the mascot: allowsContentScaling=0 keeps them at true size; the button only with a cta. */
export const quickLookHash = ({ title, subtitle, cta }) => `#allowsContentScaling=0&checkoutTitle=${encodeURIComponent(title)}`
  + (subtitle ? `&checkoutSubtitle=${encodeURIComponent(subtitle)}` : '') + (cta ? `&callToAction=${encodeURIComponent(cta)}` : '');

let onTap = null;
/** Call it inside the tap itself (no await before it), or Safari drops the gesture. onCta: the banner button's tap. */
export function openQuickLook(id, banner, onCta) {
  // One anchor for the page's life: Quick Look posts its button tap back to the anchor that opened it. It needs an <img> child.
  if (!a.isConnected) {
    a.rel = 'ar';
    a.style.display = 'none';
    a.append(document.createElement('img'));
    a.addEventListener('message', (event) => { if (event.data === '_apple_ar_quicklook_button_tapped') onTap?.(); });
    document.body.append(a);
  }
  onTap = onCta ?? null;
  a.href = (blobs[id] ?? `/ar/quicklook/${id}.usdz`) + quickLookHash(banner);
  if (blobs[id]) a.download = `${id}.usdz`; else a.removeAttribute('download');
  a.click();
}
