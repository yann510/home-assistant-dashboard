import { useState } from 'react';
import './aurora-controls.css';

const progressDirections = [
  { id: 'comet', title: 'Comet', description: 'A luminous head carries a soft, tapered trail along the song.' },
  { id: 'halo', title: 'Halo', description: 'A little orbit of light surrounds the song’s exact position.' },
] as const;

export function AuroraControls() {
  const requested = new URLSearchParams(location.search).get('progressPrototype');
  const [selected, setSelected] = useState(progressDirections.find(item => item.id === requested)?.id ?? 'comet');
  return (
    <section className='canvas music-prototypes aurora-controls' aria-labelledby='aurora-controls-title'>
      <div className='music-prototypes__heading'>
        <div>
          <span className='canvas__eyebrow'>Local design playground · 2 directions</span>
          <h2 id='aurora-controls-title'>Aurora in the play button</h2>
        </div>
        <p>Warm light in the play button, two ways to follow the song. Try pause, play, and seeking below.</p>
      </div>
      <fieldset className='music-prototypes__choices'>
        <legend>Choose the track progress style</legend>
        {progressDirections.map(item => (
          <label key={item.id} className='music-prototypes__choice'>
            <input type='radio' name='aurora-progress' id={`aurora-progress-${item.id}`} checked={selected === item.id} onChange={() => setSelected(item.id)} />
            <span className='music-prototypes__tile'>
              <span className='aurora-controls__sample' data-progress={item.id} aria-hidden='true'>
                <span className='aurora-controls__button'><span>Ⅱ</span></span>
                <span className='aurora-controls__track'><span /></span>
              </span>
              <strong>{item.title}</strong>
              <span className='music-prototypes__description'>{item.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className='music-prototypes__footnote'>
        The slider follows the track’s real position. Aurora appears while playing; pause settles the light. Reduced motion keeps every sample still.
      </p>
    </section>
  );
}
