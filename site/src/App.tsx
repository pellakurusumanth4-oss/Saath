import { useEffect, useMemo, useState } from 'react';
import MapView from './MapView';
import FriendsList from './FriendsList';
import { useMe, useTags } from './hooks';
import { NEARBY_M } from './constants';
import { FRIENDS, type Friend } from '../../src/friends';
import { distanceM, formatDistance } from '../../src/geo';
import type { LatLng } from '../../src/geo';

export default function App() {
  const { me, locating, error, whereAmI, setMySpot } = useMe();
  const { tagged, tag } = useTags();
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ spot: LatLng; key: string } | null>(null);
  const [settingSpot, setSettingSpot] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const ranked: Array<{ friend: Friend; distance: number | null }> = useMemo(() => {
    const rows = FRIENDS.map((friend) => ({ friend, distance: me ? distanceM(me, friend) : null }));
    rows.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    return rows;
  }, [me]);

  const focusOn = (spot: LatLng) =>
    setFocus({ spot, key: `${spot.lat},${spot.lng},${Date.now()}` });

  const pickFriend = (id: string) => {
    setSelected(id);
    const friend = FRIENDS.find((f) => f.id === id);
    if (friend) focusOn(friend);
  };

  const onWhereAmI = () => {
    setSettingSpot(false);
    whereAmI();
    if (me) focusOn(me);
  };

  const onSetSpot = (spot: LatLng) => {
    setMySpot(spot);
    setSettingSpot(false);
    focusOn(spot);
  };

  // When a fresh fix arrives, fly to it.
  const meKey = me ? `${me.lat},${me.lng}` : '';
  useEffect(() => {
    if (me) setFocus({ spot: me, key: `me:${meKey}:${Date.now()}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey]);

  const nearest = ranked.find((row) => row.distance !== null);
  const nearestLine =
    nearest && nearest.distance !== null
      ? nearest.distance <= NEARBY_M
        ? `${nearest.friend.name} is right here with you!`
        : `${nearest.friend.name} is closest, ${formatDistance(nearest.distance)} away`
      : null;

  return (
    <div className="app">
      <MapView
        me={me}
        tagged={tagged}
        focus={focus?.spot ?? null}
        focusKey={focus?.key ?? ''}
        settingSpot={settingSpot}
        onSetSpot={onSetSpot}
        onPickFriend={pickFriend}
      />

      <header className="topbar">
        <h1 className="logo">Saath</h1>
        <p className="tagline">Four friends, waiting around Pune</p>
      </header>

      <div className="controls">
        <button className="btn btn-yellow" onClick={onWhereAmI} disabled={locating}>
          {locating ? 'Finding you…' : 'Where am I'}
        </button>
        <button
          className={`btn ${settingSpot ? 'btn-active' : 'btn-yellow'}`}
          onClick={() => setSettingSpot((value) => !value)}
        >
          {settingSpot ? 'Tap the map…' : 'Set my spot'}
        </button>
      </div>

      {error && <div className="notice" role="alert">{error}</div>}
      {me && !error && nearestLine && (
        <div className="notice notice-soft">
          You’re at {me.lat.toFixed(4)}, {me.lng.toFixed(4)} · {nearestLine}
        </div>
      )}

      <FriendsList
        friends={FRIENDS}
        me={me}
        tagged={tagged}
        selected={selected}
        expanded={expanded}
        onPick={pickFriend}
        onTag={tag}
        onToggle={() => setExpanded((value) => !value)}
      />
    </div>
  );
}
