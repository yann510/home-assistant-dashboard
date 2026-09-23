import type { AttentionItem } from '../attention';
import type { BlindRoom } from './useCanvasBlinds';

export type CanvasRoute =
  | { kind: 'overview' }
  | { kind: 'all-lights' }
  | { kind: 'blinds'; room?: BlindRoom }
  | { kind: 'light'; entityId: string }
  | { kind: 'player' }
  | { kind: 'speakers' }
  | { kind: 'weather' }
  | { kind: 'moods' }
  | { kind: 'thermostats' }
  | { kind: 'appliances' }
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
      return 'Player';
    case 'speakers':
      return 'Speakers';
    case 'weather':
      return 'Weather';
    case 'moods':
      return 'House Mood';
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
  if (item.target === 'mood') return { kind: 'moods' };
  if (item.target === 'speaker') return { kind: 'speakers' };
  return { kind: 'all-devices' };
}
