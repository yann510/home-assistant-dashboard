import { useState } from 'react';
import { useHass } from '@hakit/core';
import type { MusicItem } from './useSpotifyBrowser';

function LibraryCover({ liked }: { liked: boolean }) {
  return <svg className='canvas-player__designed-cover' viewBox='0 0 160 160' aria-hidden='true'>
    <circle className='canvas-player__cover-orbit' cx='138' cy='20' r='80' />
    <circle className='canvas-player__cover-orbit' cx='20' cy='145' r='60' />
    {liked ? <path d='M80 112 44 77a23 23 0 0 1 33-32l3 3 3-3a23 23 0 0 1 33 32Z' /> : <><rect x='36' y='36' width='80' height='88' rx='8' transform='rotate(-10 80 80)' /><circle cx='80' cy='80' r='25' /><circle cx='80' cy='80' r='7' /><path d='M108 40v30m-8-22h16' /></>}
  </svg>;
}
function CoverImage({ src }: { src: string }) {
  const { joinHassUrl } = useHass();
  const [failed, setFailed] = useState(false);
  return failed ? <LibraryCover liked={false} /> : <img src={src.startsWith('/') ? joinHassUrl(src) : src} alt='' loading='lazy' onError={() => setFailed(true)} />;
}
export function MusicArtwork({ item }: { item: MusicItem }) {
  if (item.thumbnail) return <CoverImage key={item.thumbnail} src={item.thumbnail} />;
  if (item.previewArtwork?.length) return <span className='canvas-player__collage' aria-hidden='true' data-count={item.previewArtwork.length}>{item.previewArtwork.map(src => <CoverImage key={src} src={src} />)}</span>;
  return <LibraryCover liked={/saved_tracks|liked/i.test(item.media_content_id + item.title)} />;
}
