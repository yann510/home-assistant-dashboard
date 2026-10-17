export const lightColourPresets = [
  { name: 'Warm', hex: '#f0b478' },
  { name: 'Pink', hex: '#e89bb9' },
  { name: 'Blue', hex: '#8db9ed' },
  { name: 'Purple', hex: '#bca0e3' },
];
export function rgbFromHex(hex: string): [number, number, number] {
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}
export function hexFromRgb(rgb?: readonly number[]): string | undefined {
  return rgb?.length === 3 && rgb.every(value => Number.isFinite(value) && value >= 0 && value <= 255)
    ? `#${rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`
    : undefined;
}
