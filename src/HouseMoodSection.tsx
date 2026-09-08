import { HouseMoodCard } from './HouseMoodCard';
import { useHouseMood } from './useHouseMood';
export function HouseMoodSection() {
  return <HouseMoodCard {...useHouseMood()} />;
}
