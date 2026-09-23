import { useEffect, useRef, useState } from 'react';
import { useSpeakerCommand, type SpeakerService } from './useSpeakerCommand';

export function useSpeakerTransport(entityId: string, disabled: boolean) {
  const { send, error } = useSpeakerCommand();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function transport(service: SpeakerService, description: string) {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(true);
    await send(service, [entityId], description);
    inFlight.current = false;
    if (mounted.current) setBusy(false);
  }
  return { transport, busy, error };
}
