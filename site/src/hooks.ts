import { useCallback, useEffect, useState } from 'react';
import type { LatLng } from '../../src/geo';

const TAGS_KEY = 'saath:tags';

const readTags = (): string[] => {
  try {
    const raw = localStorage.getItem(TAGS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
};

/** Friends tagged with a handshake, remembered on this device. */
export const useTags = () => {
  const [tagged, setTagged] = useState<string[]>(readTags);

  useEffect(() => {
    try {
      localStorage.setItem(TAGS_KEY, JSON.stringify(tagged));
    } catch {
      // Private browsing or full storage: tags just won't survive a reload.
    }
  }, [tagged]);

  const tag = useCallback((id: string) => {
    setTagged((current) => (current.includes(id) ? current : [...current, id]));
  }, []);

  return { tagged, tag };
};

/** Where "here" is: real GPS if allowed, or a spot set by hand on the map. */
export const useMe = () => {
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const whereAmI = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('This browser can’t share your location. Use “Set my spot” instead.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setMe({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location is off for this page. Allow it, or tap “Set my spot” and point at where you are.'
            : 'Couldn’t get your location right now. Try again, or use “Set my spot”.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }, []);

  const setMySpot = useCallback((spot: LatLng) => {
    setMe(spot);
    setError(null);
  }, []);

  return { me, locating, error, whereAmI, setMySpot };
};
