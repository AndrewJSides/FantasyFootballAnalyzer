import { useEffect } from 'react';
import type { ToolLandingContent } from './toolLandings';
import { SITE_TITLE } from '../utils/siteTitle';
import styles from './ToolLanding.module.css';

// Static, keyword-rich landing pages for high-intent tool queries that the app
// serves but had no dedicated front door (trade analyzer, draft grades). Markup
// stays render-pure (one markup-neutral useEffect for the tab title) so the
// build-time prerender (scripts/prerender.tsx) bakes the same markup the live
// route renders, and crawlers see real HTTP-200 content.
// Plain anchors (not react-router Link) because the prerender renders this
// outside a Router; a full navigation to the in-app target is fine. Content
// lives in toolLandings.ts so this file only exports a component.

export function ToolLanding({ content }: { content: ToolLandingContent }) {
  const base = import.meta.env.BASE_URL;
  // Tab title — prerendered visits already get content.title from the build.
  // Set it here too so in-app (client-side) navigation lands on the right
  // title; renderToStaticMarkup never runs effects, so the prerendered
  // markup is unchanged and the "hook-free" markup guarantee still holds.
  useEffect(() => {
    document.title = content.title;
    // Cleanup restores the site default, not the landing title — matches the
    // other pages' cleanup-restores-parent pattern (see NotFoundPage).
    return () => {
      document.title = SITE_TITLE;
    };
  }, [content.title]);
  return (
    <div className={styles.page}>
      <div className="container">
        <header className={styles.hero}>
          <span className={styles.kicker}>{content.kicker}</span>
          <h1 className={styles.heading}>{content.heading}</h1>
          <p className={styles.intro}>{content.intro}</p>
          <nav className={styles.ctas} aria-label="Get started">
            {content.ctas.map(c => (
              <a
                key={c.to + c.label}
                href={`${base}${c.to}`}
                className={c.primary ? styles.ctaPrimary : styles.ctaSecondary}
              >
                {c.label}
              </a>
            ))}
          </nav>
        </header>

        <ul className={styles.points}>
          {content.points.map(pt => (
            <li key={pt.h} className={styles.point}>
              <h2 className={styles.pointTitle}>{pt.h}</h2>
              <p className={styles.pointBody}>{pt.p}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
