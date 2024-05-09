export function capitalize(input: string): string {
  if (!input || input.length === 0) {
    return '';
  }
  return input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
}
