import { useCallback, useEffect, useState } from 'react';
import type { LatLng } from '../../src/geo';

/** Where "here" is: real GPS if allowed, or a spot set by hand on the map. */
export const useMe = () => {
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const whereAmI = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setDenied(true);
      setError('This browser can’t share your location. Pick your spot on the map instead.');
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
        setDenied(err.code === err.PERMISSION_DENIED);
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location is blocked for this site. Allow it in the browser’s site settings, or pick your spot.'
            : 'Couldn’t get your location right now. Try again, or pick your spot.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }, []);

  const setMySpot = useCallback((spot: LatLng) => {
    setMe(spot);
    setError(null);
  }, []);

  return { me, locating, error, denied, whereAmI, setMySpot };
};

/** A computer-sized window (1024 px and up), kept current as the window changes. */
export const useDesktop = () => {
  const query = '(min-width: 1024px)';
  const [desktop, setDesktop] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setDesktop(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, []);
  return desktop;
};
