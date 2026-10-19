// J1a: the first visit. The live 3D city shows through the top; the story and two buttons sit on a white panel.
import { useEffect, useRef } from 'react';
import { Icon } from './ui';

export default function Welcome({ onOpen, onInstall }: { onOpen: () => void; onInstall: (() => void) | null }) {
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => box.current?.focus(), []);
  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-label="Welcome to Saath">
      <div className="welcome-panel" tabIndex={-1} ref={box}>
        <div className="welcome-brand"><span className="brand-tile"><Icon name="walk" size={20} color="#5BE38F" stroke={2.4} /></span><b>saath</b></div>
        <h1 className="welcome-title">Walk there,<br />save money.</h1>
        <p className="j-text">Shops near you, each with its own mascot and billboard. See the counter price next to delivery apps, then walk over.</p>
        <div className="welcome-chips">
          {([['tag', 'Save on every order'], ['star', 'Meet the shop’s mascot'], ['clock', 'Live menus']] as const).map(([icon, text]) => (
            <span key={icon}><Icon name={icon} size={15} stroke={2.2} />{text}</span>
          ))}
        </div>
        <div className="welcome-actions">
          <button type="button" className="btn-go" onClick={onOpen}><Icon name="map" size={20} />Open the map</button>
          {onInstall && <button type="button" className="btn-ghost" onClick={onInstall}><Icon name="plus" size={19} />Add to home screen</button>}
          <p>Works in your browser. No app to install.</p>
        </div>
      </div>
    </div>
  );
}
