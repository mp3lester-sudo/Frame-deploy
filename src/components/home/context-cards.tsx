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

function ContextCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-3 text-center">
      <Icon size={16} className="text-accent" />
      <span className="text-[10px] uppercase tracking-wider text-foreground-muted">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

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

/**
 * Real time (in the visitor's own timezone, from Vercel's edge geolocation),
 * real location (same source), real current weather (Open-Meteo, keyed off
 * that location) — replaces the old hardcoded "New York, NY" / "46°F · Rain"
 * demo values. Location/weather cards are omitted individually whenever
 * that particular signal isn't available (e.g. local dev has no Vercel geo
 * headers) rather than showing a fake fallback.
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
    <div className="flex gap-3">
      <ContextCard icon={Clock} label={day} value={time} />
      {location && <ContextCard icon={MapPin} label="Location" value={location} />}
      {weather && (
        <ContextCard
          icon={weatherIcon(weather.code)}
          label="Weather"
          value={`${weather.tempF}°F · ${weather.description}`}
        />
      )}
    </div>
  );
}
