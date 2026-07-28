import { Clock, MapPin, CloudRain } from "lucide-react";

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

export function ContextCards({
  day,
  time,
  location,
  weather,
}: {
  day: string;
  time: string;
  location: string;
  weather: string;
}) {
  return (
    <div className="flex gap-3">
      <ContextCard icon={Clock} label={day} value={time} />
      <ContextCard icon={MapPin} label="Location" value={location} />
      <ContextCard icon={CloudRain} label="Weather" value={weather} />
    </div>
  );
}
