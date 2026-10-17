import { useMemo, useState } from 'react';
import { FACES } from '../../src/faces';
import type { Friend } from '../../src/friends';
import { distanceM, formatDistance } from '../../src/geo';
import type { LatLng } from '../../src/geo';
import { NEARBY_M } from './constants';
import { currentActivity } from './activities';
import WatchPanel from './WatchPanel';
import TalkPanel from './TalkPanel';

export default function FriendsList({ friends, me, tagged, selected, expanded, onPick, onTag, onToggle }: {
  friends: Friend[];
  me: LatLng | null;
  tagged: string[];
  selected: string | null;
  expanded: boolean;
  onPick: (id: string) => void;
  onTag: (id: string) => void;
  onToggle: () => void;
}) {
  const [watching, setWatching] = useState<string | null>(null);
  const [talking, setTalking] = useState<string | null>(null);
  const [greeted, setGreeted] = useState<Set<string>>(() => new Set());

  const rows = useMemo(() => {
    const withDistance = friends.map((friend) => ({
      friend,
      distance: me ? distanceM(me, friend) : null,
    }));
    if (me) withDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    return withDistance;
  }, [friends, me]);

  const nearbyCount = rows.filter(
    (row) => row.distance !== null && row.distance <= NEARBY_M,
  ).length;

  const watched = watching ? friends.find((friend) => friend.id === watching) ?? null : null;
  const talked = talking ? friends.find((friend) => friend.id === talking) ?? null : null;

  const openWatch = (id: string) => {
    setWatching(id);
  };

  const closeWatch = () => {
    if (watching) setGreeted((prev) => new Set(prev).add(watching));
    setWatching(null);
  };

  return (
    <aside className={`friends ${expanded ? 'is-expanded' : ''}`} aria-label="Friends">
      <header className="friends-head">
        <div>
          <h2>Your friends</h2>
          <p className="friends-sub">
            {me
              ? nearbyCount > 0
                ? `${nearbyCount} within tagging range`
                : 'None nearby — walk closer to tag'
              : 'Say where you are to see who’s close'}
          </p>
        </div>
        <button className="chevron" onClick={onToggle} aria-label={expanded ? 'Hide the list' : 'Show the list'}>
          {expanded ? '▾' : '▴'}
        </button>
      </header>

      <div className="friends-scroll">
        {rows.map(({ friend, distance }) => {
          const isTagged = tagged.includes(friend.id);
          const isNearby = distance !== null && distance <= NEARBY_M;
          const isSelected = selected === friend.id;
          return (
            <article
              key={friend.id}
              className={`card ${isSelected ? 'is-selected' : ''} ${isTagged ? 'is-tagged' : ''}`}
              style={{ ['--friend-color' as string]: friend.color }}
            >
              <button
                className="card-hit"
                onClick={() => onPick(friend.id)}
                aria-label={`Show ${friend.name} on the map`}
              >
                <img
                  className="card-face"
                  src={FACES[friend.character].met}
                  alt=""
                  width={52}
                  height={52}
                />
                <div className="card-text">
                  <h3>{friend.name}</h3>
                  <p>{friend.place}</p>
                  <p className="card-distance">
                    {distance === null
                      ? 'Distance unknown yet'
                      : isNearby
                        ? 'Right here with you!'
                        : `${formatDistance(distance)} away`}
                  </p>
                  <p className="card-now">Right now: {currentActivity(friend.character)}</p>
                </div>
              </button>

              {isTagged ? (
                <div className="card-tag done" aria-label={`${friend.name} tagged`}>
                  <span className="card-tag-mark">✓</span> Tagged
                </div>
              ) : (
                <button
                  className="card-tag"
                  disabled={!isNearby}
                  onClick={() => onTag(friend.id)}
                  title={isNearby ? `Tag ${friend.name}` : 'Walk closer to tag'}
                >
                  Tag
                </button>
              )}
              <button
                className="card-watch"
                onClick={() => openWatch(friend.id)}
                title={`Watch ${friend.name}`}
              >
                Watch
              </button>
              <button
                className="card-watch card-talk"
                disabled={!isNearby && !isTagged}
                onClick={() => setTalking(friend.id)}
                title={!isNearby && !isTagged ? `Get closer to talk with ${friend.name}` : `Talk with ${friend.name}`}
              >
                Talk
              </button>
              {!isTagged && !isNearby && distance !== null && (
                <p className="card-hint">Walk closer to tag · {formatDistance(distance)} away</p>
              )}
            </article>
          );
        })}
      </div>

      {watched && (
        <WatchPanel friend={watched} firstOpen={!greeted.has(watched.id)} onClose={closeWatch} />
      )}

      {talked && <TalkPanel friend={talked} onClose={() => setTalking(null)} />}
    </aside>
  );
}
