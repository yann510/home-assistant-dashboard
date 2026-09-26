export function roomKind(room: string) {
  const name = room.trim().toLowerCase().replace(/_/g, ' ');
  if (name.includes('living')) return 'living';
  if (name.includes('bed')) return 'bedroom';
  if (name.includes('gym')) return 'gym';
  if (name.includes('office')) return 'office';
  if (name.includes('kitchen')) return 'kitchen';
  if (name.includes('entry') || name.includes('laundry')) return 'entry';
  if (name.includes('toilet') || name.includes('bath')) return 'bathroom';
  return 'other';
}

export function getRoomAccent(room: string): string {
  switch (roomKind(room)) {
    case 'living':
      return 'var(--canvas-coral, #f1aa8e)';
    case 'bedroom':
      return 'var(--canvas-lilac, #cbb5ed)';
    case 'gym':
      return 'var(--canvas-sage, #bdd8b2)';
    case 'office':
      return 'var(--canvas-blue, #aac9e5)';
    case 'kitchen':
      return 'var(--canvas-yellow, #eadfa4)';
    case 'entry':
      return 'var(--canvas-peach, #dfbaa8)';
    case 'bathroom':
      return 'var(--canvas-aqua, #a7ceca)';
    default:
      return 'var(--canvas-muted, #b6b0bb)';
  }
}
