import {
  Clock,
  MapPin,
  Sun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
} from "lucide-react";

/** Maps Open-Meteo's WMO weather_code to a representative lucide icon. */
function weatherIcon(code: number) {
  if (code === 0) return Sun;
  if (code <= 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 51 && code <= 57) return CloudDrizzle;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow;
  if (code >= 95) return CloudLightning;
  return Cloud;
}

// Takes the already-resolved icon as a prop (mirrors the old ContextCard's
// `icon` prop shape) rather than calling weatherIcon() and rendering the
// result in the same scope — react-hooks/static-components flags deriving
// a PascalCase component reference and using it as a JSX tag in one render.
function WeatherGlyph({ icon: Icon }: { icon: typeof Clock }) {
  return <Icon size={13} className="text-accent" />;
}

/**
 * Real time (in the visitor's own timezone, from Vercel's edge geolocation),
 * real location (same source), real current weather (Open-Meteo, keyed off
 * that location) — replaces the old hardcoded "New York, NY" / "46°F · Rain"
 * demo values. Location/weather segments are omitted individually whenever
 * that particular signal isn't available (e.g. local dev has no Vercel geo
 * headers) rather than showing a fake fallback.
 *
 * Rendered as one compact muted line rather than three bordered cards —
 * this is ambient context, not the point of the page, so it shouldn't
 * compete for space with the greeting or the actual recommendation below it.
 */
export function ContextCards({
  day,
  time,
  location,
  weather,
}: {
  day: string;
  time: string;
  location: string | null;
  weather: { tempF: number; description: string; code: number } | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
      <span className="inline-flex items-center gap-1">
        <Clock size={13} className="text-accent" />
        {day} &middot; {time}
      </span>
      {location && (
        <span className="inline-flex items-center gap-1">
          <MapPin size={13} className="text-accent" />
          {location}
        </span>
      )}
      {weather && (
        <span className="inline-flex items-center gap-1">
          <WeatherGlyph icon={weatherIcon(weather.code)} />
          {weather.tempF}&deg;F &middot; {weather.description}
        </span>
      )}
    </div>
  );
}
