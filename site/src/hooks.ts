import { useCallback, useEffect, useState } from 'react';
import { distanceM, type LatLng } from '../../src/geo';

// The demo shops are all in one city (Pune); a fix farther than this from its centre would show walks of thousands of minutes.
const PUNE: LatLng = { lat: 18.5195, lng: 73.8452 };
const PUNE_RANGE_M = 50000;

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
        const spot = { lat: position.coords.latitude, lng: position.coords.longitude };
        setLocating(false);
        if (distanceM(spot, PUNE) > PUNE_RANGE_M) {
          setError('There are no Saath shops near you yet. Try the demo city: browse the list, or pick a spot on the map.');
          return;
        }
        setMe(spot);
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

/** A computer-sized window, kept current as the window changes: 1280 px and up leaves room for the map between the
 * visitor's two side panels; the owner page, with one panel, passes its own 1024 px query. */
export const useDesktop = (query = '(min-width: 1280px)') => {
  const [desktop, setDesktop] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setDesktop(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return desktop;
};
