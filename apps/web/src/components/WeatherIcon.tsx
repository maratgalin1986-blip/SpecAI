// Line weather icons in the site's icon style (24×24, stroke), chosen from a
// MET Norway symbol code.

function kindOf(symbol: string) {
  if (symbol.includes('thunder')) return 'thunder';
  if (symbol.includes('snow')) return 'snow';
  if (symbol.includes('sleet')) return 'sleet';
  if (symbol.includes('rain')) return 'rain';
  if (symbol.includes('fog')) return 'fog';
  if (symbol.includes('partlycloudy') || symbol.includes('fair')) return 'partly';
  if (symbol.includes('cloudy')) return 'cloud';
  if (symbol.includes('night')) return 'moon';
  return 'sun';
}

const CLOUD = <path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 11 3.5 3.5 0 0 0 7 18z" />;

const SHAPES: Record<string, JSX.Element> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
  partly: (
    <>
      <path d="M9 4v1.5M4.4 6.4l1 1M3 11h1.5" />
      <path d="M6.6 11.2A3.5 3.5 0 0 1 12.2 7" />
      <path d="M9 19h8a3.5 3.5 0 0 0 .4-6.98A5 5 0 0 0 8.2 13 3 3 0 0 0 9 19z" />
    </>
  ),
  cloud: CLOUD,
  rain: (
    <>
      <path d="M7 15h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 8 3.5 3.5 0 0 0 7 15z" />
      <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" />
    </>
  ),
  sleet: (
    <>
      <path d="M7 15h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 8 3.5 3.5 0 0 0 7 15z" />
      <path d="M8 18l-1 3M16 18l-1 3" />
      <path d="M12 18.5v2M11 19.5h2" />
    </>
  ),
  snow: (
    <>
      <path d="M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 7 3.5 3.5 0 0 0 7 14z" />
      <path d="M8 17.5v3M6.7 19h2.6M12 17.5v3M10.7 19h2.6M16 17.5v3M14.7 19h2.6" />
    </>
  ),
  thunder: (
    <>
      <path d="M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 7 3.5 3.5 0 0 0 7 14z" />
      <path d="M12.5 14l-2 4h3l-2 4" />
    </>
  ),
  fog: (
    <>
      <path d="M7 12h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 5 3.5 3.5 0 0 0 7 12z" />
      <path d="M4 16h16M6 19h12M8 22h8" />
    </>
  ),
};

export function WeatherIcon({
  symbol,
  className = 'h-6 w-6',
}: {
  symbol: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {SHAPES[kindOf(symbol)]}
    </svg>
  );
}

/** A wind arrow pointing where the wind blows to (from `degrees`). */
export function WindArrow({
  degrees,
  className = 'h-4 w-4',
}: {
  degrees: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ transform: `rotate(${degrees + 180}deg)` }}
      aria-hidden
    >
      <path d="M12 20V4M6 10l6-6 6 6" />
    </svg>
  );
}
