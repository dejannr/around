export function eventStatus(startAt?: string, endAt?: string, now = new Date()): 'upcoming' | 'starting_soon' | 'live' | 'finished' {
  if (!startAt) return 'upcoming'; const start = new Date(startAt); const end = endAt ? new Date(endAt) : new Date(start.getTime() + 3 * 60 * 60 * 1000);
  if (now >= end) return 'finished'; if (now >= start) return 'live'; if (start.getTime() - now.getTime() <= 60 * 60 * 1000) return 'starting_soon'; return 'upcoming';
}
export function relativeTime(value: string, now = Date.now()): string { const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000)); return minutes < 1 ? 'now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`; }
export function formatDistance(meters: number): string { return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`; }
