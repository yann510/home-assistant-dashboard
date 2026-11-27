import { useEffectEvent, useLayoutEffect } from 'react';

export type MusicNoticeKind = 'playback' | 'seek' | 'volume' | 'follow' | 'liked-songs' | 'playlist';
export type MusicNotice = { kind: MusicNoticeKind; title: string; message: string; source?: string };
export type ReportMusicNotice = (kind: MusicNoticeKind, notice: MusicNotice | null) => void;

export const followCleanupMessage = 'Motion following is off. Return audio to the original speaker.';

export function CanvasMusicNotice({
  kind,
  message,
  source,
  report,
}: {
  kind: MusicNoticeKind;
  message: string;
  source?: string;
  report: ReportMusicNotice;
}) {
  const publish = useEffectEvent(() => {
    const title = kind === 'liked-songs' ? 'Liked Songs needs attention'
      : kind === 'playlist' ? 'Spotify playlist needs attention'
      : message === followCleanupMessage ? 'Finish turning off Follow me'
      : message.split('. ', 1)[0].replace(/\.$/, '');
    report(kind, { kind, title, message, source });
  });
  // Keep a failure associated with its original room even if the card changes source.
  useLayoutEffect(() => {
    publish();
    return () => report(kind, null);
  }, [kind, message, report]);
  return null;
}
