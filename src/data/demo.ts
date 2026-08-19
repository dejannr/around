export type Category = 'food' | 'cafe' | 'nightlife' | 'music' | 'event' | 'sports' | 'nature' | 'art' | 'traffic' | 'alert' | 'meetup' | 'shopping' | 'other';
export type ContentType = 'post' | 'event';
export type ContentItem = { id: string; type: ContentType; category: Category; title: string; description: string; author: string; ownerId?: string; locationName: string; longitude: number; latitude: number; distanceM: number; createdAt: string; startAt?: string; endAt?: string; imageUrl?: string; mediaPath?: string; likes: number; comments: number };
export const CATEGORIES: Record<Category, { label: string; icon: string }> = { food: { label: 'Food', icon: '◒' }, cafe: { label: 'Cafés', icon: '☕' }, nightlife: { label: 'Nightlife', icon: '✦' }, music: { label: 'Music', icon: '♫' }, event: { label: 'Events', icon: '◈' }, sports: { label: 'Sports', icon: '◉' }, nature: { label: 'Nature', icon: '♧' }, art: { label: 'Art', icon: '◐' }, traffic: { label: 'Traffic', icon: '△' }, alert: { label: 'Alert', icon: '!' }, meetup: { label: 'Meetups', icon: '◎' }, shopping: { label: 'Shopping', icon: '◇' }, other: { label: 'Other', icon: '●' } };
// Content is fetched from Supabase in the production data layer. Start with an
// empty app rather than presenting fictional activity to real users.
export const demoContent: ContentItem[] = [];
