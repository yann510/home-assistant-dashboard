import { useEffect, useState } from 'react';
import { useHass } from '@hakit/core';
import { CanvasFavourites } from './CanvasFavourites';
import { CanvasMusic } from './CanvasMusic';
import { CanvasSpeakers } from './CanvasSpeakers';
import { useCanvasMusic } from './CanvasMusicProvider';
import { useSpotifyBrowser, type MusicItem, type MusicView } from './useSpotifyBrowser';
import './canvas-player.css';

function MusicArtwork({ item }: { item: MusicItem }) {
  const { joinHassUrl } = useHass();
  const [failed, setFailed] = useState(false);
  return item.thumbnail && !failed ? <img src={item.thumbnail.startsWith('/') ? joinHassUrl(item.thumbnail) : item.thumbnail} alt='' loading='lazy' onError={() => setFailed(true)} /> : <span aria-hidden='true'>♫</span>;
}
export function CanvasPlayer({ onClose }: { onClose(): void }) {
  const { setLibraryOpen, session, disabled, rooms, favouritePlayback: playback } = useCanvasMusic();
  const [view, setView] = useState<MusicView>('home');
  const [query, setQuery] = useState('');
  const [folders, setFolders] = useState<MusicItem[]>([]);
  const [speakers, setSpeakers] = useState(false);
  const available = session.connected && !!session.coordinator && !['unknown', 'unavailable'].includes(session.coordinator.state);
  const browser = useSpotifyBrowser(session.entityId, available && !speakers, view, query, folders[folders.length - 1]);
  useEffect(() => {
    setLibraryOpen(true);
    return () => setLibraryOpen(false);
  }, [setLibraryOpen]);
  function navigate(next: MusicView) { if (next !== 'search') setQuery(''); setView(next); setFolders([]); setSpeakers(false); }
  function cards(items: MusicItem[]) {
    return <div className='canvas-player__cards'>{items.map(item => <article key={item.media_content_type + ':' + item.media_content_id} className='canvas-player__card'>
      <button className='canvas-player__artwork' aria-label={`${item.can_expand ? 'Open' : 'Play'} ${item.title}`} disabled={item.can_expand ? !available : disabled || !!playback.pending || !item.can_play} onClick={() => item.can_expand ? setFolders(old => [...old, item]) : void playback.play(item)}><MusicArtwork key={item.thumbnail} item={item} /></button>
      <strong>{item.title}</strong>{item.subtitle && <small>{item.subtitle}</small>}
      {item.can_expand && item.can_play && <button disabled={disabled || !!playback.pending} aria-label={`Play ${item.title}`} onClick={() => void playback.play(item)}>Play</button>}
    </article>)}</div>;
  }
  return <div className='canvas-player'>
    <nav className='canvas-player__nav' aria-label='Music navigation'>
      {(['home', 'search', 'library'] as const).map(next => <button key={next} aria-pressed={view === next && !speakers} onClick={() => navigate(next)}>{next === 'home' ? 'Home' : next === 'search' ? 'Search' : 'Your library'}</button>)}
    </nav>
    <div className='canvas-player__content'>
      {speakers ? <><button onClick={() => setSpeakers(false)}>Back to music</button><CanvasSpeakers /></> : <>
        {<label className='canvas-player__search'><span>Search Spotify songs</span><input type='search' aria-label='Search Spotify songs' placeholder='What do you want to play?' value={query} onChange={event => { setQuery(event.target.value); setView('search'); setFolders([]); }} autoComplete='off' /></label>}
        {folders.length ? <div className='canvas-player__heading'><button onClick={() => setFolders(old => old.slice(0, -1))}>Back</button><h2>{folders[folders.length - 1]?.title}</h2></div> : <div className='canvas-player__heading'><div><span className='canvas__eyebrow'>Spotify · On your Sonos</span><h2>{view === 'home' ? 'Made for your moments' : view === 'search' ? 'Find your next song' : 'Your music, together'}</h2></div></div>}
        {!available && <p role='status'>{session.connected ? 'Wait for an available speaker to browse Spotify.' : 'Reconnecting to Home Assistant. Music will load when connected.'}</p>}
        {browser.loading && <p role='status'>{view === 'search' ? 'Searching Spotify…' : 'Loading your music…'}</p>}
        {browser.error && <p role='alert'>{browser.error} <button onClick={browser.retry}>Retry Spotify</button></p>}
        {available && view === 'search' && !query.trim() && <p>Search the Spotify catalog to play a song on your speakers.</p>}
        {!!browser.items.length && cards(browser.items)}
        {!folders.length && view === 'home' && browser.sections.map(section => <section key={section.title}><h3>{section.title}</h3>{section.items.length ? cards(section.items.slice(0, 8)) : <p>No music here yet.</p>}</section>)}
        {!folders.length && view === 'library' && cards(browser.categories)}
        {available && !browser.loading && !browser.error && ((view === 'search' && !!query.trim()) || !!folders.length) && !browser.items.length && <p>No music found.</p>}
        {browser.nextOffset !== null && <button disabled={browser.loading} onClick={browser.more}>Load more songs</button>}
        {view === 'search' && browser.total > 0 && <p className='canvas-player__count'>{browser.items.length} of {browser.total} songs</p>}
        {view === 'home' && !folders.length && <details className='canvas-player__favourites' open><summary>Sonos favourites</summary><CanvasFavourites onPlayed={onClose} /></details>}
      </>}
    </div>
    <div className='canvas-player__now-playing'><CanvasMusic libraryEntrance={false} onOpenPlayer={() => navigate('search')} onOpenSpeakers={() => { if (!rooms.busy) rooms.begin(); setSpeakers(true); }} /></div>
    {(view !== 'home' || !!folders.length || speakers) && playback.pending && <p role='status'>Starting {playback.pending.title}…</p>}
    {(view !== 'home' || !!folders.length || speakers) && (playback.playError || playback.commandError) && <p role='alert'>{playback.playError || playback.commandError}</p>}
  </div>;
}
