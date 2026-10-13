-- ═══════════════════════════════════════════════════════════════════
-- TraderApe Yahoo ingest
-- Run this in the Supabase SQL editor. It builds the league snapshot
-- directly from the pasted Yahoo JSON bundle:
--   • exact Yahoo team names, owners, Yahoo draft grades, current rosters
--   • exact 150 draft picks (pick / round / team from draft_results)
--   • auction prices carried over from the existing snapshot (by name)
-- Re-running updates the snapshot; the PIN 5M43NA is kept.
--
-- HOW TO USE:
--   1. Paste the ENTIRE yahoo-league.json bundle between the $json$ markers
--      below (it has top-level keys: teams, settings, draftresults, rosters).
--   2. Run the whole script. Check the "Messages" output for the summary.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- ── STEP 1: paste the Yahoo JSON bundle between the $json$ markers ──
  ytext text := $json$
PASTE_YAHOO_JSON_HERE
$json$;

  raw             jsonb;
  fc              jsonb;   -- the /teams fantasy_content node
  lg              jsonb;
  teams_obj       jsonb;
  rosroot_all     jsonb;   -- the rosters bundle (or NULL)
  drroot          jsonb;   -- draft_results node (or NULL)
  old_snap        jsonb;

  price_lookup    jsonb := '{}'::jsonb;  -- lower(player name) -> auction price
  player_lookup   jsonb := '{}'::jsonb;  -- yahoo player_key -> {id,name,position,team}
  teamname_lookup jsonb := '{}'::jsonb;  -- 't-N' -> team name
  teampicks       jsonb := '{}'::jsonb;  -- 't-N' -> jsonb array of draft picks

  teams_final     jsonb := '[]'::jsonb;
  tf              jsonb;
  snap            jsonb;

  k1 text; v1 jsonb;
  k2 text; v2 jsonb;
  k3 text; v3 jsonb;
  te jsonb; pe jsonb; mel jsonb;
  arr jsonb; parr jsonb;
  mgr jsonb; ros jsonb; dmeta jsonb; pl jsonb;

  tkey text; tidnum text; tid text; tname text; owner text; ismine boolean;
  dgrade text;
  roster_arr jsonb; one_team jsonb;
  pkey text; pid text; nm text; pos text; nfl text; price int;
  n_teams int := 0; n_picks int := 0; n_unresolved int := 0;
  unresolved_keys text := '';
BEGIN
  raw := ytext::jsonb;

  -- Locate the /teams fantasy_content: either inside the bundle's "teams"
  -- key, or pasted directly as the whole response.
  IF (raw->'teams') ? 'fantasy_content' THEN
    fc := raw->'teams'->'fantasy_content';
    rosroot_all := raw->'rosters';
    drroot := raw->'draftresults'->'fantasy_content'->'league'->1->'draft_results';
  ELSIF raw ? 'fantasy_content' THEN
    fc := raw->'fantasy_content';
    rosroot_all := NULL;
    drroot := NULL;
  ELSE
    IF jsonb_typeof(raw) = 'object' THEN
      RAISE EXCEPTION 'Top-level keys found: %. Expected the Yahoo bundle (teams, settings, draftresults, rosters) or a /teams response.',
        (SELECT string_agg(k, ', ') FROM jsonb_object_keys(raw) AS k);
    ELSE
      RAISE EXCEPTION 'Pasted JSON is a %, not an object.', jsonb_typeof(raw);
    END IF;
  END IF;

  lg := fc->'league'->0;
  teams_obj := fc->'league'->1->'teams';
  IF lg IS NULL OR teams_obj IS NULL THEN
    RAISE EXCEPTION 'Could not find league data inside fantasy_content — wrong response?';
  END IF;

  -- Auction prices carried over from the existing snapshot, matched by player name.
  SELECT snapshot INTO old_snap
  FROM leagues WHERE platform_league_key = 'manual-motha-puka-2026';
  IF old_snap IS NOT NULL THEN
    FOR v1 IN SELECT jsonb_array_elements(old_snap->'teams') LOOP
      FOR v2 IN SELECT jsonb_array_elements(v1->'draftPicks') LOOP
        IF COALESCE((v2->>'auctionValue')::int, 0) > 0 THEN
          price_lookup := price_lookup
            || jsonb_build_object(lower(v2->'player'->>'name'), (v2->>'auctionValue')::int);
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  -- Pass 1: teams + current rosters.
  FOR k1, v1 IN SELECT * FROM jsonb_each(teams_obj) LOOP
    IF k1 = 'count' THEN CONTINUE; END IF;
    -- team node is double-wrapped: {"team": [ [ {...}, ... ] ]}
    IF jsonb_typeof(v1->'team'->0) = 'array' THEN arr := v1->'team'->0;
    ELSE arr := v1->'team';
    END IF;

    tkey := NULL; tidnum := NULL; tname := NULL;
    owner := ''; ismine := false; dgrade := NULL;
    FOR te IN SELECT jsonb_array_elements(arr) LOOP
      IF te ? 'team_key' THEN tkey := te->>'team_key';
      ELSIF te ? 'team_id' THEN tidnum := te->>'team_id';
      ELSIF te ? 'name' THEN tname := te->>'name';
      ELSIF te ? 'draft_grade' THEN dgrade := te->>'draft_grade';
      ELSIF te ? 'managers' THEN
        IF jsonb_typeof(te->'managers') = 'array' THEN mel := te->'managers'->0->'manager';
        ELSE mel := te->'managers'->'0'->'manager';
        END IF;
        IF mel IS NOT NULL THEN
          owner := COALESCE(mel->>'nickname', '');
          ismine := COALESCE(mel->>'is_current_login', '0') = '1';
        END IF;
      END IF;
    END LOOP;
    IF tidnum IS NULL THEN CONTINUE; END IF;
    tid := 't-' || tidnum;
    teamname_lookup := teamname_lookup || jsonb_build_object(tid, tname);

    -- Roster from the per-team roster response in the bundle.
    roster_arr := '[]'::jsonb;
    ros := NULL;
    IF rosroot_all IS NOT NULL AND rosroot_all ? ('t.' || tidnum) THEN
      FOR te IN SELECT jsonb_array_elements(
          rosroot_all->('t.' || tidnum)->'fantasy_content'->'team') LOOP
        IF te ? 'roster' THEN ros := te->'roster'; END IF;
        -- fallback for isMyTeam if the managers node lacked it
        IF NOT ismine AND te ? 'is_owned_by_current_login' THEN
          ismine := (te->>'is_owned_by_current_login') = '1';
        END IF;
      END LOOP;
    END IF;
    IF ros IS NOT NULL THEN
      FOR k2, v2 IN SELECT * FROM jsonb_each(ros->'0'->'players') LOOP
        IF k2 = 'count' THEN CONTINUE; END IF;
        -- player node is double-wrapped: {"player": [ [ {..}, {..} ] ]}
        IF jsonb_typeof(v2->'player'->0) = 'array' THEN parr := v2->'player'->0;
        ELSE parr := v2->'player';
        END IF;
        pkey := NULL; pid := NULL; nm := NULL; pos := ''; nfl := '';
        FOR pe IN SELECT jsonb_array_elements(parr) LOOP
          IF pe ? 'player_key' THEN pkey := pe->>'player_key';
          ELSIF pe ? 'player_id' THEN pid := pe->>'player_id';
          ELSIF pe ? 'name' THEN nm := pe->'name'->>'full';
          ELSIF pe ? 'display_position' THEN pos := pe->>'display_position';
          ELSIF pe ? 'editorial_team_abbr' THEN nfl := pe->>'editorial_team_abbr';
          END IF;
        END LOOP;
        IF pkey IS NULL THEN CONTINUE; END IF;
        player_lookup := player_lookup || jsonb_build_object(pkey,
          jsonb_build_object('id', pid, 'name', nm, 'position', pos, 'team', nfl));
        roster_arr := roster_arr || jsonb_build_object(
          'id', pid,
          'platformId', pkey,
          'name', nm,
          'position', pos,
          'team', nfl);
      END LOOP;
    END IF;

    one_team := jsonb_build_object(
      'id', tid, 'name', tname, 'ownerName', owner, 'isMyTeam', ismine,
      'draftGrade', dgrade,
      'roster', roster_arr,
      'wins', 0, 'losses', 0, 'ties', 0);
    teams_final := teams_final || one_team;
    teampicks := teampicks || jsonb_build_object(tid, '[]'::jsonb);
    n_teams := n_teams + 1;
  END LOOP;

  -- Pass 2: draft picks from league draft_results (exact Yahoo pick/round/team).
  IF drroot IS NULL THEN
    RAISE NOTICE 'No draft_results in this paste — the draft page will be empty.';
  ELSE
    FOR k3, v3 IN SELECT * FROM jsonb_each(drroot) LOOP
      IF k3 = 'count' THEN CONTINUE; END IF;
      dmeta := v3->'draft_result';
      pkey := dmeta->>'player_key';
      tid := 't-' || split_part(dmeta->>'team_key', '.t.', 2);
      IF player_lookup ? pkey THEN
        pl := player_lookup->pkey;
        nm := pl->>'name'; pos := pl->>'position'; nfl := pl->>'team';
      ELSE
        -- Drafted but no longer rostered (dropped): keep the pick, flag the key.
        n_unresolved := n_unresolved + 1;
        unresolved_keys := unresolved_keys || pkey || ' ';
        nm := pkey; pos := ''; nfl := '';
      END IF;
      price := COALESCE((price_lookup->>lower(nm))::int, 0);
      teampicks := jsonb_set(teampicks, ARRAY[tid],
        COALESCE(teampicks->tid, '[]'::jsonb) || jsonb_build_object(
          'pickNumber', (dmeta->>'pick')::int,
          'round', (dmeta->>'round')::int,
          'player', jsonb_build_object('id', pkey, 'platformId', pkey,
                                      'name', nm, 'position', pos, 'team', nfl),
          'teamId', tid,
          'teamName', COALESCE(teamname_lookup->>tid, tid),
          'auctionValue', price));
      n_picks := n_picks + 1;
    END LOOP;
  END IF;

  -- Attach each team's draft picks, sorted by pick number.
  tf := '[]'::jsonb;
  FOR v1 IN SELECT jsonb_array_elements(teams_final) LOOP
    tf := tf || (v1 || jsonb_build_object('draftPicks',
      (SELECT COALESCE(jsonb_agg(p ORDER BY (p->>'pickNumber')::int), '[]'::jsonb)
       FROM jsonb_array_elements(COALESCE(teampicks->(v1->>'id'), '[]'::jsonb)) AS p)));
  END LOOP;
  teams_final := tf;

  -- Build the snapshot in the exact shape the app expects.
  snap := jsonb_build_object(
    'id', 'manual-motha-puka-2026',
    'platform', 'yahoo',
    'name', 'DMATBWM Fantasy Football',
    'season', COALESCE((lg->>'season')::int, 2026),
    'draftType', 'snake',
    'teams', teams_final,
    'scoringType', 'ppr',
    'totalTeams', n_teams,
    'currentWeek', COALESCE((lg->>'current_week')::int, 6),
    'isLoaded', true,
    'rosterSlots', '{"QB":1,"RB":2,"WR":2,"TE":1,"WRT":1,"K":1,"DEF":1,"BN":6,"IR":1}'::jsonb
  );

  INSERT INTO leagues (platform, platform_league_key, name, season, team_count,
                       snapshot, updated_at, last_synced_at)
  VALUES ('yahoo', 'manual-motha-puka-2026', 'DMATBWM Fantasy Football',
          COALESCE((lg->>'season')::int, 2026), n_teams, snap, now(), now())
  ON CONFLICT (platform_league_key) DO UPDATE SET
    name = EXCLUDED.name,
    season = EXCLUDED.season,
    team_count = EXCLUDED.team_count,
    snapshot = EXCLUDED.snapshot,
    updated_at = now(),
    last_synced_at = now();

  INSERT INTO league_pins (pin, league_id, label)
  SELECT '5M43NA', id, 'Manual import — Motha Puka league'
  FROM leagues WHERE platform_league_key = 'manual-motha-puka-2026'
  ON CONFLICT (pin) DO UPDATE SET
    league_id = EXCLUDED.league_id,
    label = EXCLUDED.label;

  RAISE NOTICE 'Imported % teams, % draft picks (% with unresolved player names).',
    n_teams, n_picks, n_unresolved;
  IF n_unresolved > 0 THEN
    RAISE NOTICE 'Unresolved player_keys (drafted, since dropped): %', unresolved_keys;
  END IF;
END $$;
