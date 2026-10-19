// The two ways to use Saath, offered on the first visit: exploring (the visitors' map, walks and the door) or owning a
// business (the owner page, /owner/, a page of its own).
import { Icon } from './ui';

export function RoleChoice({ onExplore, onOwner }: { onExplore: () => void; onOwner: () => void }) {
  return (
    <div className="role-choice" role="group" aria-label="How are you using Saath?">
      <button type="button" className="role-card is-explore" onClick={onExplore}>
        <span className="role-icon"><Icon name="map" size={22} /></span>
        <span><b>I’m exploring</b><small>Find shops, compare prices, walk over</small></span>
        <Icon name="arrow" size={20} />
      </button>
      <button type="button" className="role-card is-owner" onClick={onOwner}>
        <span className="role-icon"><Icon name="star" size={22} /></span>
        <span><b>I own a business</b><small>Register it: get a mascot and a billboard</small></span>
        <Icon name="arrow" size={20} />
      </button>
    </div>
  );
}
