import { useCallback, useState } from 'react';
import type { LatLng } from '../../src/geo';

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
