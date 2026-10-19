// The two ways to use Saath: exploring (the visitor's map, walks and the door) or running a business (the owner's
// setup and dashboard at #/owner). Picked on the first visit, remembered on this device, switched from a small menu.
import { useState } from 'react';
import Sheet from './Sheet';
import { Icon } from './ui';

export type Role = 'visitor' | 'owner';
const KEY = 'saath:role';

/** The role this device picked, or null before it picks one. Storage may be blocked (private browsing): then null. */
export const savedRole = (): Role | null => {
  try {
    const role = localStorage.getItem(KEY);
    return role === 'owner' || role === 'visitor' ? role : null;
  } catch {
    return null;
  }
};

/** Remember the role and open its home: the map, or the owner's page. */
export function chooseRole(role: Role) {
  try { localStorage.setItem(KEY, role); } catch { /* not kept */ }
  window.location.hash = role === 'owner' ? '#/owner' : '#/';
}

/** The two choices, as two big buttons: on the welcome and in the switch menu. */
export function RoleChoice({ onExplore, onOwner, current = null }: { onExplore: () => void; onOwner: () => void; current?: Role | null }) {
  return (
    <div className="role-choice" role="group" aria-label="How are you using Saath?">
      <button type="button" className="role-card is-explore" aria-pressed={current === 'visitor'} onClick={onExplore}>
        <span className="role-icon"><Icon name="map" size={22} /></span>
        <span><b>I’m exploring</b><small>Find shops, compare prices, walk over</small></span>
        <Icon name={current === 'visitor' ? 'check' : 'arrow'} size={20} />
      </button>
      <button type="button" className="role-card is-owner" aria-pressed={current === 'owner'} onClick={onOwner}>
        <span className="role-icon"><Icon name="star" size={22} /></span>
        <span><b>I own a business</b><small>Get a mascot, a billboard and walk-ins</small></span>
        <Icon name={current === 'owner' ? 'check' : 'arrow'} size={20} />
      </button>
    </div>
  );
}

/** A small button that says how this device uses Saath; it opens the two choices. */
export function RoleMenu({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const role = savedRole() ?? 'visitor';
  const pick = (next: Role) => {
    setOpen(false);
    chooseRole(next);
  };
  return (
    <>
      <button type="button" className={`role-menu ${className}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Icon name={role === 'owner' ? 'star' : 'map'} size={15} stroke={2.4} />
        {role === 'owner' ? 'Business owner' : 'Exploring'}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <Sheet label="How are you using Saath?" onClose={() => setOpen(false)}>
          <h2 className="j-title">How are you using Saath?</h2>
          <p className="j-text">Switch any time. This device remembers your pick.</p>
          <RoleChoice current={role} onExplore={() => pick('visitor')} onOwner={() => pick('owner')} />
          <a className="role-more" href="#/business" onClick={() => setOpen(false)}>How Saath works for businesses ›</a>
        </Sheet>
      )}
    </>
  );
}
