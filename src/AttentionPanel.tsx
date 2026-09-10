import { useEffect } from 'react';
import { AttentionStrip } from './AttentionStrip';
import { useAttention } from './useAttention';
import type { AttentionItem } from './attention';
export function AttentionPanel({
  selected,
  onView,
  onClose,
}: {
  selected: AttentionItem | null;
  onView: (item: AttentionItem) => void;
  onClose: () => void;
}) {
  const model = useAttention();
  useEffect(() => {
    if (
      selected &&
      model.ready &&
      !model.items.some(
        i => i.id === selected.id && i.episode === selected.episode && (!i.snoozed_until || Date.parse(i.snoozed_until) <= model.now)
      )
    )
      onClose();
  }, [selected, model.ready, model.items, model.now, onClose]);
  return <AttentionStrip {...model} selected={selected} onView={onView} onClose={onClose} />;
}
