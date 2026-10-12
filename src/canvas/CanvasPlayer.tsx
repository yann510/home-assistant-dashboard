import { useEffect, useLayoutEffect, useRef, useState, type FC } from 'react';
import { useStore } from '@hakit/core';
import { useMusicNavigation } from './useMusicNavigation';
import { CanvasFavourites } from './CanvasFavourites';
import { CanvasMusic } from './CanvasMusic';
import { CanvasSpeakers } from './CanvasSpeakers';
import { MusicArtwork } from './MusicArtwork';
import { useCanvasMusic } from './CanvasMusicProvider';
import { useSpotifyBrowser, type MusicItem } from './useSpotifyBrowser';
import { CanvasQueue, ListeningControls, MusicItemActions } from './CanvasListening';
import './canvas-player.css';

// Keep the former close callback prop compatible with callers. Music now stays
// open after confirmed playback; its surrounding dialog owns the close action.
export const CanvasPlayer: FC<{ onClose(): void }> = () => {
  const { setLibraryOpen, session, disabled, rooms, favouritePlayback: playback } = useCanvasMusic();
  const connection = useStore(state => state.connection);
  const navigation = useMusicNavigation({ entityId: session.entityId, connection, connected: session.connected });
  const { current: location } = navigation;
  const { query, folders, speakers, queue } = location;
  const [filter, setFilter] = useState({ folder: '', query: '' });
  const restoreScroll = useRef<number | null>(0);
  const content = useRef<HTMLDivElement>(null);
  const searching = !!query.trim();
  const folder = folders[folders.length - 1];
  const home = !searching && !folder && !speakers && !queue;
  const available = session.connected && !!session.coordinator && !['unknown', 'unavailable'].includes(session.coordinator.state);
  const browser = useSpotifyBrowser(session.entityId, available && !speakers && !queue, searching ? 'search' : 'home', query, folder);
  useEffect(() => { setLibraryOpen(true); return () => setLibraryOpen(false); }, [setLibraryOpen]);
  useLayoutEffect(() => {
    restoreScroll.current = location.scroll;
    if (content.current) content.current.scrollTop = 0;
  }, [location]);
  useLayoutEffect(() => {
    if (!browser.loading && content.current && restoreScroll.current !== null) {
      content.current.scrollTop = restoreScroll.current;
      restoreScroll.current = null;
    }
  }, [browser.loading, browser.key, location]);
  function scroll() { return content.current?.scrollTop ?? 0; }
  function openFolder(item: MusicItem) { if (available) navigation.openFolder(item, scroll()); }
  function activate(item: MusicItem) {
    if (item.can_play) {
      if (available && !disabled && !playback.pending) void playback.play(item);
    } else if (item.can_expand) openFolder(item);
  }
  function goHome() { if (!home || query) navigation.goHome(scroll()); }
  function cards(items: MusicItem[]) {
    return <div className='canvas-player__cards'>{items.map(item => <article key={item.media_content_type + ':' + item.media_content_id} className='canvas-player__card'>
      <button className='canvas-player__item' aria-label={`${item.can_play ? 'Play' : 'Open'} ${item.title}`} disabled={!available || (item.can_play ? disabled || !!playback.pending : !item.can_expand)} onClick={() => activate(item)}><span className='canvas-player__artwork'><MusicArtwork item={item} />{(item.can_play || item.can_expand) && <span className={`canvas-player__open-hint${item.can_play ? ' canvas-player__play-hint' : ''}`} aria-hidden='true'>{item.can_play ? '▶ Play' : 'Explore ↗'}</span>}</span><strong>{item.title}</strong>{item.subtitle && <small>{item.subtitle}</small>}</button>
      <MusicItemActions item={item} />
      {item.can_play && item.can_expand && <button className='canvas-player__view-tracks' disabled={!available} aria-label={`View tracks ${item.title}`} onClick={() => openFolder(item)}>View tracks <span aria-hidden='true'>↗</span></button>}
    </article>)}</div>;
  }
  function songs(items: MusicItem[]) {
    return <div className='canvas-player__songs'>{items.map(item => <article className='canvas-player__song' key={item.media_content_type + ':' + item.media_content_id}>
      <button className='canvas-player__song-play' aria-label={`${item.can_play ? 'Play' : 'Open'} ${item.title}`} disabled={!available || (item.can_play ? disabled || !!playback.pending : !item.can_expand)} onClick={() => activate(item)}>
        <span className='canvas-player__artwork'><MusicArtwork item={item} /></span>
        <span className='canvas-player__song-title'><strong>{item.title}</strong>{item.subtitle && <small>{item.subtitle}</small>}</span>
        <span className='canvas-player__song-action' aria-hidden='true'>{item.can_play ? '▶' : '↗'}</span>
      </button>
      <MusicItemActions item={item} />
    </article>)}</div>;
  }
  const songItems = (items: MusicItem[]) => items.length > 0 && items.every(item => item.media_content_type === 'music' || item.media_content_type === 'track' || /spotify:track:/.test(item.media_content_id));
  function musicItems(items: MusicItem[]) { return songItems(items) ? songs(items) : cards(items); }
  const localQuery = filter.folder === folder?.media_content_id ? filter.query : '';
  const visibleItems = localQuery.trim() ? browser.items.filter(item => `${item.title} ${item.subtitle ?? ''}`.toLocaleLowerCase().includes(localQuery.trim().toLocaleLowerCase())) : browser.items;
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
      {section.error ? <p role='alert'>{section.error} <button onClick={browser.retry}>Retry {section.title}</button></p> : section.items.length ? musicItems(section.items) : <p>No music here yet.</p>}
    </section>;
  }
  const collections = browser.categories.filter(item => !/\/(current_user_playlists|current_user_top_tracks|current_user_recently_played|current_user_saved_tracks)$/.test(item.media_content_id));
  return <div className='canvas-player'>
    <div className='canvas-player__search'><nav className='canvas-player__navigation' aria-label='Music navigation'>
      <button aria-label='Back' disabled={!navigation.canBack} onClick={() => navigation.back(scroll())}>←</button>
      <button aria-label='Forward' disabled={!navigation.canForward} onClick={() => navigation.forward(scroll())}>→</button>
      <button aria-label='Music home' aria-current={home ? 'page' : undefined} disabled={home && !query} onClick={goHome}><span aria-hidden='true'>⌂</span></button>
    </nav><label className='canvas-player__global-query'><span>Search Spotify songs</span><span className='canvas-player__query-input'><input type='search' aria-label='Search Spotify songs' placeholder='Find a song' value={query} onChange={event => navigation.search(event.target.value, scroll())} autoComplete='off' />{searching && <button aria-label='Clear search' onClick={goHome}>×</button>}</span></label></div>
    <div className='canvas-player__content' ref={content}>
      {queue ? <CanvasQueue /> : speakers ? <><button onClick={() => navigation.back(scroll())}>Back to music</button><CanvasSpeakers /></> : <>
        {folder ? <>{folders.length > 1 && <nav className='canvas-player__breadcrumbs' aria-label='Music breadcrumbs'><button onClick={goHome}>Home</button>{folders.slice(0, -1).map((item, index) => <button key={item.media_content_id} onClick={() => navigation.breadcrumb(index, scroll())}>{item.title}</button>)}<span aria-current='page'>{folder.title}</span></nav>}<section className='canvas-player__collection' aria-label={`${folder.title} collection`}><span className='canvas-player__artwork'><MusicArtwork item={folder} /></span><div><h2>{folder.title}</h2>{folder.subtitle && <p>{folder.subtitle}</p>}{!browser.loading && !browser.error && songItems(browser.items) && <p>{browser.items.length} {browser.items.length === 1 ? 'song' : 'songs'}</p>}{folder.can_play && <button disabled={!available || disabled || !!playback.pending} aria-label={`Play collection ${folder.title}`} onClick={() => activate(folder)}>▶ Play collection</button>}</div></section></> : searching ? <div className='canvas-player__heading'><h2>Search results</h2></div> : null}
        {!available && <p role='status'>{session.connected ? 'Wait for an available speaker to browse Spotify.' : 'Reconnecting to Home Assistant. Music will load when connected.'}</p>}
        {browser.loading && <p role='status'>{searching ? 'Searching Spotify…' : 'Loading your music…'}</p>}
        {browser.error && <p role='alert'>{browser.error} <button onClick={browser.retry}>Retry Spotify</button></p>}
        {folder && songItems(browser.items) && <label className='canvas-player__filter'><span>Find in loaded songs</span><input type='search' aria-label='Find in loaded songs' placeholder='Filter these songs' value={localQuery} onChange={event => setFilter({ folder: folder.media_content_id, query: event.target.value })} /></label>}
        {!!visibleItems.length && musicItems(visibleItems)}
        {localQuery.trim() && !visibleItems.length && <p>No loaded songs match your filter.</p>}
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
    <section className='canvas-player__now-playing' aria-label='Music playback'><CanvasMusic footerControls={<ListeningControls onOpenQueue={() => navigation.openQueue(scroll())} />} libraryEntrance={false} showPlaybackStatus={false} onOpenPlayer={goHome} onOpenSpeakers={() => { if (rooms && !rooms.busy) rooms.begin(); navigation.openSpeakers(scroll()); }} />
    {playback.playStatus && <p role='status'>{playback.playStatus}</p>}
    {playback.pending && <p role='status'>Starting {playback.pending.title}…</p>}
    {(playback.playError || playback.commandError) && <p role='alert'>{playback.playError || playback.commandError}</p>}
    </section>
  </div>;
};
