import { useEffect, useRef, useState, type FC } from 'react';
import { CanvasFavourites } from './CanvasFavourites';
import { CanvasMusic } from './CanvasMusic';
import { CanvasSpeakers } from './CanvasSpeakers';
import { MusicArtwork } from './MusicArtwork';
import { useCanvasMusic } from './CanvasMusicProvider';
import { useSpotifyBrowser, type MusicItem } from './useSpotifyBrowser';
import './canvas-player.css';

// Keep the former close callback prop compatible with callers. Music now stays
// open after confirmed playback; its surrounding dialog owns the close action.
export const CanvasPlayer: FC<{ onClose(): void }> = () => {
  const { setLibraryOpen, session, disabled, rooms, favouritePlayback: playback } = useCanvasMusic();
  const [query, setQuery] = useState('');
  const [folders, setFolders] = useState<MusicItem[]>([]);
  const [speakers, setSpeakers] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const searching = !!query.trim();
  const folder = folders[folders.length - 1];
  const home = !searching && !folder && !speakers;
  const available = session.connected && !!session.coordinator && !['unknown', 'unavailable'].includes(session.coordinator.state);
  const browser = useSpotifyBrowser(session.entityId, available && !speakers, searching ? 'search' : 'home', query, folder);
  useEffect(() => { setLibraryOpen(true); return () => setLibraryOpen(false); }, [setLibraryOpen]);
  useEffect(() => { if (content.current) content.current.scrollTop = 0; }, [query, folder, speakers]);
  function openFolder(item: MusicItem) { if (available) setFolders(old => [...old, item]); }
  function activate(item: MusicItem) {
    if (item.can_play) {
      if (available && !disabled && !playback.pending) void playback.play(item);
    } else if (item.can_expand) openFolder(item);
  }
  function goHome() { setQuery(''); setFolders([]); setSpeakers(false); }
  function cards(items: MusicItem[]) {
    return <div className='canvas-player__cards'>{items.map(item => <article key={item.media_content_type + ':' + item.media_content_id} className='canvas-player__card'>
      <button className='canvas-player__item' aria-label={`${item.can_play ? 'Play' : 'Open'} ${item.title}`} disabled={!available || (item.can_play ? disabled || !!playback.pending : !item.can_expand)} onClick={() => activate(item)}><span className='canvas-player__artwork'><MusicArtwork item={item} />{(item.can_play || item.can_expand) && <span className={`canvas-player__open-hint${item.can_play ? ' canvas-player__play-hint' : ''}`} aria-hidden='true'>{item.can_play ? '▶ Play' : 'Explore ↗'}</span>}</span><strong>{item.title}</strong>{item.subtitle && <small>{item.subtitle}</small>}</button>
    </article>)}</div>;
  }
  const likedSongs = browser.categories.find(item => item.media_content_id.endsWith('/current_user_saved_tracks'));
  function likedShortcut() {
    return likedSongs && <button className='canvas-player__liked-shortcut' aria-label={`Open ${likedSongs.title}`} disabled={!available} onClick={() => openFolder(likedSongs)}><span className='canvas-player__artwork'><MusicArtwork item={likedSongs} /></span><span><strong>{likedSongs.title}</strong><small>Your saved songs</small></span><span className='canvas-player__liked-arrow' aria-hidden='true'>↗</span></button>;
  }
  function section(categoryId: string) {
    const section = browser.sections.find(item => item.category.media_content_id.endsWith('/' + categoryId));
    if (!section) return null;
    return <section className='canvas-player__section' key={categoryId} aria-label={section.title}>
      <div className='canvas-player__section-heading'><h3>{section.title}</h3><button disabled={!available} onClick={() => openFolder(section.category)} aria-label={`See all ${section.title}`}>See all <span aria-hidden='true'>↗</span></button></div>
      {categoryId === 'current_user_playlists' && likedShortcut()}
      {section.error ? <p role='alert'>{section.error} <button onClick={browser.retry}>Retry {section.title}</button></p> : section.items.length ? cards(section.items) : <p>No music here yet.</p>}
    </section>;
  }
  const collections = browser.categories.filter(item => !/\/(current_user_playlists|current_user_top_tracks|current_user_recently_played|current_user_saved_tracks)$/.test(item.media_content_id));
  return <div className='canvas-player'>
    <div className='canvas-player__search'><label><span>Search Spotify songs</span><input type='search' aria-label='Search Spotify songs' placeholder='Find a song you love' value={query} onChange={event => { setQuery(event.target.value); setFolders([]); setSpeakers(false); }} autoComplete='off' /></label>{searching && <button onClick={goHome}>Clear search</button>}</div>
    <div className='canvas-player__content' ref={content}>
      {speakers ? <><button onClick={() => setSpeakers(false)}>Back to music</button><CanvasSpeakers /></> : <>
        {folder ? <><nav className='canvas-player__breadcrumbs' aria-label='Music breadcrumbs'><button onClick={goHome}>Music home</button>{folders.slice(0, -1).map((item, index) => <button key={item.media_content_id} onClick={() => setFolders(old => old.slice(0, index + 1))}>{item.title}</button>)}<span aria-current='page'>{folder.title}</span></nav><div className='canvas-player__heading'><button onClick={() => setFolders(old => old.slice(0, -1))}>Back</button><h2>{folder.title}</h2>{folder.can_play && <button disabled={disabled || !!playback.pending} aria-label={`Play ${folder.title}`} onClick={() => void playback.play(folder)}>▶ Play</button>}</div></> : searching ? <div className='canvas-player__heading'><h2>Search results</h2></div> : null}
        {!available && <p role='status'>{session.connected ? 'Wait for an available speaker to browse Spotify.' : 'Reconnecting to Home Assistant. Music will load when connected.'}</p>}
        {browser.loading && <p role='status'>{searching ? 'Searching Spotify…' : 'Loading your music…'}</p>}
        {browser.error && <p role='alert'>{browser.error} <button onClick={browser.retry}>Retry Spotify</button></p>}
        {!!browser.items.length && cards(browser.items)}
        {home && <>
          {section('current_user_playlists')}
          {!browser.sections.some(item => item.category.media_content_id.endsWith('/current_user_playlists')) && likedShortcut()}
          <section className='canvas-player__section' aria-label='Sonos favourites'><div className='canvas-player__section-heading'><h3>Sonos favourites</h3></div><CanvasFavourites withTitles showFeedback={false} onPlayed={() => {}} /></section>
          {section('current_user_top_tracks')}
          {section('current_user_recently_played')}
          {!!collections.length && <section className='canvas-player__section' aria-label='Your library'><div className='canvas-player__section-heading'><h3>Your library</h3></div>{cards(collections)}</section>}
        </>}
        {available && !browser.loading && !browser.error && (searching || !!folder) && !browser.items.length && <p>No music found.</p>}
        {browser.nextOffset !== null && <button disabled={browser.loading} onClick={browser.more}>Load more songs</button>}
        {searching && browser.total > 0 && <p className='canvas-player__count'>{browser.items.length} of {browser.total} songs</p>}
      </>}
    </div>
    <section className='canvas-player__now-playing' aria-label='Music playback'><CanvasMusic libraryEntrance={false} showPlaybackStatus={false} onOpenPlayer={goHome} onOpenSpeakers={() => { if (!rooms.busy) rooms.begin(); setSpeakers(true); }} />
    {playback.playStatus && <p role='status'>{playback.playStatus}</p>}
    {playback.pending && <p role='status'>Starting {playback.pending.title}…</p>}
    {(playback.playError || playback.commandError) && <p role='alert'>{playback.playError || playback.commandError}</p>}
    </section>
  </div>;
};
