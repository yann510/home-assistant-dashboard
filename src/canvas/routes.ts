import type { AttentionItem } from '../attention';
import type { BlindAction, BlindRoom } from './useCanvasBlinds';
import type { MusicNoticeKind } from './CanvasMusicNotice';

export type CanvasRoute =
  | { kind: 'overview' }
  | { kind: 'all-lights' }
  | { kind: 'blinds'; room?: BlindRoom; noticeAction?: BlindAction }
  | { kind: 'light'; entityId: string }
  | { kind: 'player' }
  | { kind: 'music-alert'; notice: MusicNoticeKind }
  | { kind: 'mood-alert' }
  | { kind: 'mode-alert'; mode: 'day' | 'night' }
  | { kind: 'speakers'; entityId?: string }
  | { kind: 'weather' }
  | { kind: 'thermostats'; entityId?: string }
  | { kind: 'appliances'; entityId?: string }
  | { kind: 'vacuum' }
  | { kind: 'all-devices' };

export function canvasRouteTitle(route: CanvasRoute): string {
  switch (route.kind) {
    case 'overview':
      return 'Home';
    case 'all-lights':
      return 'All lights';
    case 'blinds':
      return route.room ? `${route.room[0].toUpperCase()}${route.room.slice(1)} blinds` : 'Blinds';
    case 'light':
      return 'Light';
    case 'player':
      return 'Your Spotify playlists';
    case 'music-alert':
      return 'Music alert';
    case 'mood-alert':
      return 'House Mood alert';
    case 'mode-alert':
      return route.mode === 'day' ? 'Day mode alert' : 'Night mode alert';
    case 'speakers':
      return 'Speakers';
    case 'weather':
      return 'Weather';
    case 'thermostats':
      return 'Thermostats';
    case 'appliances':
      return 'Appliances';
    case 'vacuum':
      return 'Roomba';
    case 'all-devices':
      return 'All devices';
  }
}

export function routeForAttention(item: AttentionItem): CanvasRoute {
  if (item.target === 'appliances') return { kind: 'appliances' };
  if (item.target === 'vacuum') return { kind: 'vacuum' };
  if (item.target === 'temperature') return { kind: 'thermostats' };
  if (item.target === 'mood') return { kind: 'overview' };
  if (item.target === 'speaker') return { kind: 'speakers' };
  return { kind: 'all-devices' };
}
