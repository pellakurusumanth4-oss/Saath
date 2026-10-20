// J1b: put Saath on the home screen. Android/desktop Chrome installs in one tap; iPhone gets the three Safari steps.
import { useState } from 'react';
import Sheet from './Sheet';
import { useInstall } from './install';
import { Icon } from './ui';

export default function InstallSheet({ onClose }: { onClose: () => void }) {
  const { canInstall, isIOS, install } = useInstall();
  const [ios, setIos] = useState(isIOS);
  return (
    <Sheet label="Put Footfall on your home screen" onClose={onClose}>
      <h2 className="j-title">Put Footfall on your home screen</h2>
      <p className="j-text">It opens like an app, full screen, straight to the map.</p>
      <div className="j-tabs" role="group" aria-label="Your phone">
        <button type="button" aria-pressed={!ios} onClick={() => setIos(false)}>Android · Chrome</button>
        <button type="button" aria-pressed={ios} onClick={() => setIos(true)}>iPhone · Safari</button>
      </div>
      {ios ? (
        <>
          <p className="j-kicker">ON IPHONE</p>
          <ol className="j-steps">
            {([['share', 'Tap the Share button in Safari'], ['plus', 'Choose “Add to Home Screen”'], ['check', 'Tap Add']] as const).map(([icon, text], i) => (
              <li key={icon}><span className="j-num">{i + 1}</span><span className="j-step-icon"><Icon name={icon} size={18} /></span>{text}</li>
            ))}
          </ol>
        </>
      ) : (
        <div className="j-install-row">
          <span className="brand-tile"><Icon name="walk" size={22} color="#5BE38F" stroke={2.4} /></span>
          <div><b>Install Footfall</b><span>runs from your home screen</span></div>
          {canInstall
            ? <button type="button" className="btn-go small" onClick={() => void install().then(onClose)}>Install</button>
            : <span className="j-install-how">Open Chrome’s ⋮ menu → Install app</span>}
        </div>
      )}
      <div className="j-actions"><button type="button" className="btn-go" onClick={onClose}>Got it</button></div>
    </Sheet>
  );
}
