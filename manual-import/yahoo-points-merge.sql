-- ═══════════════════════════════════════════════════════════════════
-- TraderApe: merge Yahoo league-scored season points into the snapshot
-- Run in the Supabase SQL editor AFTER yahoo-ingest.sql.
--
-- HOW TO USE:
--   1. Run yahoo-points-snippet.js in your Yahoo tab console (copies a
--      {player_key: points} object to your clipboard).
--   2. Paste it between the $json$ markers below, replacing PASTE_POINTS_HERE.
--   3. Run this script. Each draft pick gets seasonPoints (Yahoo-scored),
--      which flips draft grading from preseason consensus to actual points.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- ── STEP 1: paste the {player_key: points} JSON between the markers ──
  ptext text := $json$
PASTE_POINTS_HERE
$json$;

  pts       jsonb;
  snap      jsonb;
  teams     jsonb := '[]'::jsonb;
  t         jsonb;
  picks     jsonb;
  p         jsonb;
  pk        text;
  n_set     int := 0;
  n_teams   int := 0;
  missing   text := '';
BEGIN
  pts := ptext::jsonb;

  SELECT snapshot INTO snap
  FROM leagues WHERE platform_league_key = 'manual-motha-puka-2026';
  IF snap IS NULL THEN
    RAISE EXCEPTION 'No league row found — run yahoo-ingest.sql first.';
  END IF;

  FOR t IN SELECT jsonb_array_elements(snap->'teams') LOOP
    picks := '[]'::jsonb;
    FOR p IN SELECT jsonb_array_elements(t->'draftPicks') LOOP
      pk := p->'player'->>'platformId';
      IF pts ? pk THEN
        p := p || jsonb_build_object('seasonPoints', (pts->>pk)::float);
        n_set := n_set + 1;
      ELSE
        missing := missing || pk || ' ';
      END IF;
      picks := picks || p;
    END LOOP;
    teams := teams || (t || jsonb_build_object('draftPicks', picks));
    n_teams := n_teams + 1;
  END LOOP;

  UPDATE leagues
  SET snapshot = snap || jsonb_build_object('teams', teams),
      updated_at = now(),
      last_synced_at = now()
  WHERE platform_league_key = 'manual-motha-puka-2026';

  RAISE NOTICE 'Set seasonPoints on % draft picks across % teams.', n_set, n_teams;
  IF missing <> '' THEN
    RAISE NOTICE 'No points for player_keys: %', missing;
  END IF;
END $$;
