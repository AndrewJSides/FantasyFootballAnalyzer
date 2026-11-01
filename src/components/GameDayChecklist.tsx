import { useState } from 'react';
import type { ChecklistItem } from '@/utils/gameDayChecklist';
import styles from './GameDayChecklist.module.css';

interface GameDayChecklistProps {
  /** Checklist items, already built by buildGameDayChecklist. */
  items: ChecklistItem[];
  /** localStorage key the checked state persists under (per week). */
  storageKey: string;
}

function readChecked(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Game-day checklist (backlog item 70): the Sunday-morning "what do I need
// to do before kickoff" list — game-time decisions with their rescue
// status, kickoff lock order, benched Out starters, and no-cover holes with
// waiver fillers. Each item checks off and persists per week in
// localStorage; done items stay visible (struck through) so the manager
// can see what was handled. Hidden entirely when there are no items.
export function GameDayChecklist({ items, storageKey }: GameDayChecklistProps) {
  const [checked, setChecked] = useState<string[]>(() => readChecked(storageKey));

  if (items.length === 0) return null;

  const toggle = (headline: string) => {
    setChecked(prev => {
      const next = prev.includes(headline)
        ? prev.filter(h => h !== headline)
        : [...prev, headline];
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Storage unavailable — the session state still works.
      }
      return next;
    });
  };

  return (
    <section aria-labelledby="game-day-checklist-heading">
      <h2 id="game-day-checklist-heading" className={styles.sectionTitle}>
        Game-day checklist
      </h2>
      <ul className={styles.list} aria-live="polite" aria-label="Game-day checklist">
        {items.map((item, i) => {
          const isChecked = checked.includes(item.headline);
          const id = `gdc-item-${i}`;
          return (
            <li
              key={item.headline}
              className={`${styles.item} ${item.kind === 'action' ? styles.action : item.kind === 'done' ? styles.done : styles.info} ${isChecked ? styles.checked : ''}`}
            >
              <input
                type="checkbox"
                id={id}
                checked={isChecked}
                onChange={() => toggle(item.headline)}
                aria-label={item.headline}
              />
              <label htmlFor={id}>
                <strong className={styles.headline}>{item.headline}.</strong>{' '}
                <span className={styles.detail}>{item.detail}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className={styles.note}>
        Check items off as you handle them — they persist for this week
        only. Injuries, kickoffs, and holes are priced from this page&apos;s
        own data (bundled injury designations, kickoff times, and the
        roster-alert scan), not live inactives.
      </p>
    </section>
  );
}
