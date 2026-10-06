import { createContext, useContext, useState } from 'react';

export type CanvasOverlay = { owner: string; entityId?: string; room?: string };
export const CanvasOverlayNavigation = createContext<{
  overlay: CanvasOverlay | null;
  openOverlay(overlay: CanvasOverlay, trigger: HTMLElement): void;
  closeOverlay(): void;
} | null>(null);

// Explicit owners survive route unmounts, so Forward restores the right surface.
// Standalone cards retain local behavior when rendered outside the dashboard.
export function useCanvasOverlay(owner: string) {
  const navigation = useContext(CanvasOverlayNavigation);
  const [local, setLocal] = useState<CanvasOverlay | null>(null);
  return {
    active: navigation ? (navigation.overlay?.owner === owner ? navigation.overlay : null) : local,
    open(data: Omit<CanvasOverlay, 'owner'>, trigger: HTMLElement) {
      const overlay = { ...data, owner };
      if (navigation) navigation.openOverlay(overlay, trigger);
      else setLocal(overlay);
    },
    close() {
      if (navigation) navigation.closeOverlay();
      else setLocal(null);
    },
  };
}
