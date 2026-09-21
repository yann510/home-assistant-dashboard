import lovePhoto from './assets/moods/love.jpg';
import unwindPhoto from './assets/moods/unwind.jpg';
import dinnerPhoto from './assets/moods/dinner.jpg';
import partyPhoto from './assets/moods/party.jpg';
import gymPhoto from './assets/moods/gym.jpg';
export const moodPresets = [
  { id: 'love', name: 'Love', photo: lovePhoto },
  { id: 'unwind', name: 'Unwind', photo: unwindPhoto },
  { id: 'dinner', name: 'Dinner', photo: dinnerPhoto },
  { id: 'party', name: 'Party', photo: partyPhoto },
  { id: 'gym', name: 'Gym', photo: gymPhoto },
] as const;
