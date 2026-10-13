import { useState } from 'react';
import './music-prototypes.css';

const prototypes = [
  { id: 'orbit', title: 'Orbit', description: 'A tiny vinyl planet with a satellite on a slow, endless journey.' },
  { id: 'aurora', title: 'Aurora', description: 'Soft ribbons of light drift like a little northern sky.' },
  { id: 'notes', title: 'Floating notes', description: 'A loose constellation of notes floats above the song.' },
  { id: 'on-air', title: 'On air', description: 'A miniature radio sign glows while the room is playing.' },
  { id: 'cassette', title: 'Mixtape', description: 'Two spinning cassette reels bring a little analog nostalgia.' },
] as const;

export function MusicPrototypes() {
  const requested = new URLSearchParams(location.search).get('musicPrototype');
  const [selected, setSelected] = useState(prototypes.find(item => item.id === requested)?.id ?? 'orbit');
  return (
    <section className='canvas music-prototypes' aria-labelledby='music-prototypes-title'>
      <div className='music-prototypes__heading'>
        <div>
          <span className='canvas__eyebrow'>Local design playground · 5 directions</span>
          <h2 id='music-prototypes-title'>A little life beside the music</h2>
        </div>
        <p>Simulated playback only. Try the card’s pause and play controls below.</p>
      </div>
      <fieldset className='music-prototypes__choices'>
        <legend>Choose the indicator shown on the music card</legend>
        {prototypes.map(item => (
          <label key={item.id} className='music-prototypes__choice'>
            <input
              type='radio'
              name='music-prototype'
              id={`music-prototype-${item.id}`}
              checked={selected === item.id}
              onChange={() => setSelected(item.id)}
            />
            <span className='music-prototypes__tile'>
              <span className='prototype-art' data-prototype={item.id} aria-hidden='true'>
                <span className='canvas-music__equalizer' data-active='true'>
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
              </span>
              <strong>{item.title}</strong>
              <span className='music-prototypes__description'>{item.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className='music-prototypes__footnote'>
        Ambient motion, never audio analysis. Pausing settles the card; reduced motion keeps every design still. Gallery samples show the
        playing state.
      </p>
    </section>
  );
}
