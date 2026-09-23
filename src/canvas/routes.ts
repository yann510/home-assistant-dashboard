export type CanvasRoute =
  | { kind: 'overview' }
  | { kind: 'all-lights' }
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
