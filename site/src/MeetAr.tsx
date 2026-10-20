// "Meet <name> in AR", always shown (the user, 20 Oct: the mascot in AR is the brand's draw, reveal it): on the shop
// card, the shop page and at the door. Where the phone can (Android Chrome with ARCore) it opens the AR page in a new
// tab; anywhere else a sheet hands the AR link over as a QR code, with what to do on this device.
import { useEffect, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { ArLink, ArQr, arLinkOf } from './ArQr';
import { isIOS } from './install';
import Sheet from './Sheet';
import { hostOf, portraitOf, sectionOf, type Shop } from './shops';
import { Icon } from './ui';

type XR = { isSessionSupported: (mode: 'immersive-ar') => Promise<boolean> };
// Asked once, as the page loads, so the first tap already knows which way to go.
const arCheck = (navigator as Navigator & { xr?: XR }).xr?.isSessionSupported('immersive-ar').catch(() => false);
let arOk = false;
void arCheck?.then((ok) => { arOk = ok; });

const android = /Android/.test(navigator.userAgent);
// Chrome itself: Samsung Internet, Edge, Opera, Brave and in-app browsers are Chromium too, but name their own brand.
const chrome = !!(navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands.some((b) => b.brand === 'Google Chrome');

export default function MeetAr({ shop, className, onTalk }: { shop: Shop; className: string; onTalk: () => void }) {
  const first = hostOf(shop).name.split(' ').pop()!;
  const [ar, setAr] = useState(arOk);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    void arCheck?.then((ok) => { if (live) setAr(ok); });
    return () => { live = false; };
  }, []);
  const label = <><Icon name="ar" size={19} />Meet {first} in AR</>;
  if (ar) return <a className={className} href={arLinkOf(shop)} target="_blank" rel="noopener">{label}</a>;
  return (
    <>
      <button type="button" className={className} aria-haspopup="dialog" onClick={() => setOpen(true)}>{label}</button>
      {open && <ArSheet shop={shop} first={first} onTalk={onTalk} onClose={() => setOpen(false)} />}
    </>
  );
}

function ArSheet({ shop, first, onTalk, onClose }: { shop: Shop; first: string; onTalk: () => void; onClose: () => void }) {
  const link = arLinkOf(shop);
  // This phone can't run AR here (an iPhone, or Android Chrome without ARCore): it can still talk on screen.
  const talk = isIOS || (android && chrome);
  const text = isIOS ? `AR needs an Android phone with Chrome. Scan this with one, or talk to ${first} here.`
    : android && !chrome ? `Open this page in Chrome to meet ${first} in AR.`
    : android ? `This phone can’t run AR. Scan this with another Android phone, or talk to ${first} here.`
    : 'Scan this with your Android phone’s camera or a QR scanner app, and open it in Chrome.';
  return (
    <Sheet label={`Meet ${first} in AR`} onClose={onClose} className="ar-sheet">
      <button type="button" className="icon-btn ar-close" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
      <div className="ar-head">
        <img src={portraitOf(hostOf(shop))} alt="" width={56} height={56} style={{ '--ring': sectionOf(shop).color } as CSSProperties} />
        <h2 className="j-title">Meet {first} in AR</h2>
      </div>
      <p className="j-text">{text}</p>
      <ArQr link={link} />
      <ArLink link={link} />
      {talk && (
        <div className="j-actions">
          {/* The sheet closes first, so its focus goes back to the AR button and the talk returns there when it closes. */}
          <button type="button" className="btn-go" onClick={() => { flushSync(onClose); onTalk(); }}><Icon name="mic" size={19} />Talk to {first}</button>
        </div>
      )}
    </Sheet>
  );
}
