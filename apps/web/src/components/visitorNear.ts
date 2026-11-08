'use client';

/**
 * «lat,lon» of the visitor, rounded to about 10 km (as the server keeps it), when the browser
 * already has their permission (never asks). An address without a town is
 * then looked up around them (/api/geocode, /api/weather, POST /api/orders);
 * null otherwise — the search covers all of Russia, no town is assumed.
 */
export async function visitorNear(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions) {
    return null;
  }
  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' });
    if (permission.state !== 'granted') return null;
    return await new Promise<string | null>((resolve) =>
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve(`${coords.latitude.toFixed(1)},${coords.longitude.toFixed(1)}`),
        () => resolve(null),
        { maximumAge: 10 * 60_000, timeout: 10_000 },
      ),
    );
  } catch {
    return null;
  }
}
