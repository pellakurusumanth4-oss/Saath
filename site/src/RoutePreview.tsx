// J3a: the walk before it starts: the green route on the 3D map, the time, the steps, and "Start walking".
import { useEffect } from 'react';
import { distanceText, ICON, type Route } from './route';
import { orderOf, type ShopWithMenu } from './shops';
import { Icon, SaveChip } from './ui';

export default function RoutePreview({ shop, route, onBack, onStart }: {
  shop: ShopWithMenu; route: Route | null; onBack: () => void; onStart: () => void;
}) {
  const order = orderOf(shop, shop.menu);
  const steps = route?.steps ?? [];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);
  return (
    <>
      <div className="trip-top">
        <button type="button" autoFocus className="icon-btn glass round" onClick={onBack} aria-label="Back to the shop"><Icon name="back" size={21} stroke={2.4} /></button>
        <div className="trip-title glass">Walk to {shop.name}</div>
      </div>
      <section className="trip-sheet" aria-label={`Walking route to ${shop.name}`}>
        <div className="grabber" />
        {route ? (
          <div className="trip-sum">
            <b>{Math.max(1, Math.round(route.seconds / 60))} min</b>
            <span className="trip-dist">{distanceText(route.metres)}</span>
            {order && <SaveChip amount={order.saving} />}
          </div>
        ) : <div className="trip-sum"><span className="trip-dist">Finding the walking route…</span></div>}
        {route?.straight && <p className="j-note"><Icon name="info" size={15} />Street directions aren’t available here. Follow the green line.</p>}
        {steps.length > 0 && (
          <ol className="trip-steps">
            {steps.slice(0, 4).map((step) => (
              <li key={step.start + step.text}>
                <span className="trip-step-icon"><Icon name={ICON[step.turn]} size={17} stroke={2.4} /></span>
                <span className="trip-step-text">{step.text}</span>
                <span className="trip-step-m">{step.turn === 'arrive' ? '' : distanceText(step.metres)}</span>
              </li>
            ))}
            {steps.length > 4 && <li className="trip-more">+ {steps.length - 4} more {steps.length === 5 ? 'step' : 'steps'}</li>}
          </ol>
        )}
        <button type="button" className="btn-go trip-start" disabled={!route} onClick={onStart}><Icon name="walk" size={20} />Start walking</button>
        <p className="j-note"><Icon name="sun" size={15} />Keep this tab open while you walk. Footfall keeps your screen on.</p>
      </section>
    </>
  );
}
