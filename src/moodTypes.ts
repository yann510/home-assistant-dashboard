export type MoodId = 'love' | 'unwind' | 'dinner' | 'party' | 'gym';
export type MoodPhase = 'idle' | 'starting' | 'active' | 'restoring' | 'recovery_required';
export type MoodStatus = {
  phase: MoodPhase;
  activeMood: MoodId | null;
  pendingMood: MoodId | null;
  errors: { target: string; message: string }[];
};
export type HouseMoodCardProps = {
  status: MoodStatus;
  connected: boolean;
  available: boolean;
  onActivate: (mood: MoodId) => void;
  onEnd: () => void;
  onRetry: () => void;
};

