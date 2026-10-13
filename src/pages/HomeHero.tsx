import { POOL_BASELINE, POOL_GENERATED_AT, POOL_SEASON, TOP_OF_BOARD } from '@/data/draftPoolMeta';
import { nflLogoUrl } from '@/data/nflTeams';
import { formatBuildDate } from '@/utils/formatBuildDate';
import styles from './HomePage.module.css';

// Static hero. Kept free of hooks and browser APIs so it can be
// server-rendered into the initial HTML at build time (see
// scripts/prerender.tsx) and crawlers see the real copy. Single source of
// truth: the prerender bakes this into the homepage's first paint, and the
// app swaps it for the live league loader once React hydrates.
//
// Reads draftPoolMeta, not the pool itself: the board card needs five players
// and a build stamp, and pulling the whole ~450KB pool JSON in for that would
// park it in the eager entry chunk that every route pays for. The generator
// pre-slices TOP_OF_BOARD, refreshed daily by the rankings Action.

const UPDATED = formatBuildDate(POOL_GENERATED_AT);

export function HomeHero() {
  // import.meta.env.BASE_URL ('/' on the custom-domain apex) in both the live
  // build and the SSR prerender, so these links resolve either way. Plain
  // anchors (not react-router Link) because HomeHero is rendered outside a
  // Router during prerender; a full navigation to the prerendered target is
  // fine. These are the homepage's only internal links to the public draft-prep
  // pages, so they pass crawl equity and give no-login visitors a way in.
  const base = import.meta.env.BASE_URL;
  return (
    <header className={styles.hero}>
      <div className={styles.heroGrid}>
        <div>
          <h1 className={styles.title}>🦍 TraderApe</h1>
          <p className={styles.subtitle}>
            Grade the trade before you make it. Value over replacement,
            computed for our league's exact shape, with roster-aware takes
            on positional need. Our league loads automatically — no account needed.
          </p>
          <nav className={styles.heroLinks} aria-label="Start here">
            <a href={`${base}trade-analyzer`}>Trade Analyzer</a>
            <a href={`${base}rankings`}>Rankings</a>
            <span className={styles.heroLinksNote}>No login required</span>
          </nav>
        </div>

        <aside
          className={styles.board}
          aria-label={`Top of the ${POOL_SEASON} draft board`}
        >
          <span className={styles.boardKicker}>
            ▌ Top of the {POOL_SEASON} board
          </span>
          <ol className={styles.boardList}>
            {TOP_OF_BOARD.map(p => {
              // Team logo with a text fallback (unknown team, or the img
              // fails to load and the browser shows the alt text).
              const logo = nflLogoUrl(p.team);
              return (
                <li key={p.id} className={styles.boardRow}>
                  <span className={styles.boardRank}>{p.overallRank}</span>
                  <span className={styles.boardName}>{p.name}</span>
                  <span className={styles.boardMeta}>
                    {p.pos}
                    {logo ? (
                      <img
                        className={styles.boardLogo}
                        src={logo}
                        alt={p.team}
                        width={20}
                        height={20}
                      />
                    ) : (
                      <> · {p.team}</>
                    )}
                  </span>
                  <span className={styles.boardValue}>${p.baseValue}</span>
                </li>
              );
            })}
          </ol>
          <div className={styles.boardFoot}>
            <span>
              Updated {UPDATED} · ${POOL_BASELINE.budget} auction
            </span>
            <a href={`${base}rankings`}>Full board →</a>
          </div>
        </aside>
      </div>
    </header>
  );
}
