import { useWindowSize } from '@uidotdev/usehooks';

export function useHasSmallScreen() {
  const windowSize = useWindowSize();

  return (windowSize?.width || 1025) < 1024;
}
