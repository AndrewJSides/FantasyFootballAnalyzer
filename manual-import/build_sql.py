#!/usr/bin/env python3
"""Build a Supabase SQL import for Andrew's league (manual rosters, no Yahoo)."""
import json, secrets

ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
PIN = ''.join(secrets.choice(ALPHABET) for _ in range(6))

def P(name, pos, nfl=""):
    pid = name.lower().replace("'", "").replace(".", "").replace(" ", "-") + (f"-{nfl.lower()}" if nfl else "")
    return {"id": pid, "platformId": pid, "name": name, "position": pos, "team": nfl}

def T(tid, name, owner, wins, losses, players, is_mine=False):
    return {"id": tid, "name": name, "ownerName": owner, "isMyTeam": is_mine,
            "roster": players, "wins": wins, "losses": losses, "ties": 0}

teams = [
T("t-josh", "JOSHUA'S ASTONISHING TEAM", "Josh", 2, 2, [
    P("Jayden Daniels", "QB", "WAS"), P("Jeremiyah Love", "RB", "ARI"),
    P("Quinshon Judkins", "RB"), P("CeeDee Lamb", "WR", "DAL"),
    P("Davante Adams", "WR", "LAR"), P("Sam LaPorta", "TE", "DET"),
    P("David Boston", "WR"), P("Jake Bates", "K", "DET"),
    P("Tennessee Titans", "DEF", "TEN"),
    P("Carnell Tate", "WR"), P("Jordan Love", "QB", "GB"),
    P("Saquon Barkley", "RB", "PHI"), P("Travis Kelce", "TE", "KC"),
    P("Devaughn Vele", "WR"), P("Alvin Kamara", "RB", "NO"),
    P("D. Stribling", "WR", "SF"),
]),
T("t-justin", "LOOKIN A LITTLE MAHOLMIE", "Justin", 2, 2, [
    P("Jared Goff", "QB", "DET"), P("D'Andre Swift", "RB", "CHI"),
    P("Kenneth Gainwell", "RB"), P("Ja'Marr Chase", "WR", "CIN"),
    P("Justin Jefferson", "WR", "MIN"), P("Harold Fannin Jr.", "TE", "CLE"),
    P("Christian Watson", "WR", "GB"), P("Harry Mevis", "K", "LAR"),
    P("New England Patriots", "DEF", "NE"),
    P("DK Metcalf", "WR", "PIT"), P("Josh Downs", "WR", "IND"),
    P("Bo Nix", "QB", "DEN"), P("Chuba Hubbard", "RB", "CAR"),
    P("Travis Etienne Jr.", "RB", "JAX"), P("G. Bernard", "RB"),
]),
T("t-nick", "SMOKIN' DARTZZZ", "Nick", 2, 2, [
    P("C.J. Stroud", "QB", "HOU"), P("Bijan Robinson", "RB", "ATL"),
    P("Omarion Hampton", "RB", "LAC"), P("Tee Higgins", "WR", "CIN"),
    P("Matthew Golden", "WR", "GB"), P("Isaiah Likely", "TE", "BAL"),
    P("Luther Burden III", "WR", "CHI"), P("Chad Ryland", "K", "ARI"),
    P("Pittsburgh Steelers", "DEF", "PIT"),
    P("Cam Skattebo", "RB", "NYG"), P("Emeka Egbuka", "WR", "TB"),
    P("Ladd McConkey", "WR", "LAC"), P("Marvin Harrison Jr.", "WR", "ARI"),
    P("M. Washington Jr.", "WR"), P("Tyreek Hill", "WR", "MIA"),
]),
T("t-ty", "DAMON", "Damon", 1, 3, [
    P("Matthew Stafford", "QB", "LAR"), P("Chase Brown", "RB", "CIN"),
    P("Bhayshul Tuten", "RB", "JAX"), P("George Pickens", "WR", "DAL"),
    P("Mike Evans", "WR", "SF"), P("George Kittle", "TE", "SF"),
    P("Rhamondre Stevenson", "RB", "NE"), P("Will Reichard", "K"),
    P("Cleveland Browns", "DEF", "CLE"),
    P("Keon Coleman", "WR", "BUF"), P("Kyren Williams", "RB", "KC"),
    P("Rashee Rice", "WR", "KC"), P("Colston Loveland", "TE", "CHI"),
    P("Rome Odunze", "WR", "CHI"), P("Chris Godwin Jr.", "WR", "TB"),
    P("Lamar Jackson", "QB", "BAL"),
]),
T("t-tyler", "DA SUN GOD", "Tyler", 3, 1, [
    P("Joe Burrow", "QB", "CIN"), P("Derrick Henry", "RB", "BAL"),
    P("Bucky Irving", "RB", "TB"), P("Amon-Ra St. Brown", "WR", "DET"),
    P("Chris Olave", "WR", "NO"), P("Trey McBride", "TE", "ARI"),
    P("Michael Wilson", "WR", "ARI"), P("Jason Myers", "K", "SEA"),
    P("Jacksonville Jaguars", "DEF", "JAX"),
    P("TreVeyon Henderson", "RB", "NE"), P("Jacory Croskey-Merritt", "RB", "WAS"),
    P("J.K. Dobbins", "RB", "DEN"), P("Courtland Sutton", "WR", "DEN"),
    P("DeVonta Smith", "WR", "PHI"), P("Zach Charbonnet", "RB", "SEA"),
    P("Los Angeles Rams", "DEF", "LAR"),
]),
T("t-sam", "MCCONKEY DONG", "Sam", 3, 1, [
    P("Jalen Hurts", "QB", "PHI"), P("Ashton Jeanty", "RB", "LV"),
    P("Kyren Williams", "RB", "LAR"), P("Malik Nabers", "WR", "NYG"),
    P("Romeo Doubs", "WR", "GB"), P("Brock Bowers", "TE", "LV"),
    P("R.J. Harvey", "RB", "DEN"), P("Cam Little", "K"),
    P("Minnesota Vikings", "DEF", "MIN"),
    P("Jordan Addison", "WR", "MIN"), P("D.J. Moore", "WR", "BUF"),
    P("Breece Hall", "RB", "NYJ"), P("Tony Pollard", "RB", "TEN"),
    P("Trevor Lawrence", "QB", "JAX"), P("Will Shipley", "RB", "PHI"),
    P("A.J. Brown", "WR", "PHI"),
]),
T("t-tylerm", "SHOW ME YOUR TDS", "Tyler Marlowe", 2, 2, [
    P("Dak Prescott", "QB", "DAL"), P("Jahmyr Gibbs", "RB", "DET"),
    P("Christian McCaffrey", "RB", "SF"), P("Zay Flowers", "WR", "BAL"),
    P("Jameson Williams", "WR", "DET"), P("T.J. Hockenson", "TE", "MIN"),
    P("T. Harris", "WR", "LAC"), P("Matt Gay", "K"),
    P("Las Vegas Raiders", "DEF", "LV"),
    P("J. Johnson", "WR"), P("Bryce Young", "QB", "CAR"),
    P("Xavier Worthy", "WR", "KC"), P("K. Black", "RB", "SF"),
    P("Jalen Coker", "WR", "CAR"), P("B. Robinson", "RB", "ATL"),
    P("Kyle Monangai", "RB", "CHI"),
]),
T("t-mitch", "MITCHTHELEGEND", "Mitch", 1, 3, [
    P("Josh Allen", "QB", "BUF"), P("Blake Corum", "RB", "LAR"),
    P("Braelon Allen", "RB", "NYJ"), P("Drake London", "WR", "ATL"),
    P("Nico Collins", "WR", "HOU"), P("Tyler Warren", "TE", "IND"),
    P("Parker Washington", "WR", "JAX"), P("Ka'imi Fairbairn", "K", "HOU"),
    P("Denver Broncos", "DEF", "DEN"),
    P("Dalton Kincaid", "TE", "BUF"), P("Rico Dowdle", "RB"),
    P("Wan'Dale Robinson", "WR", "NYG"), P("Patrick Mahomes", "QB", "KC"),
    P("J. Coleman", "RB", "DEN"), P("Rachaad White", "RB"),
]),
T("t-evan", "TURKIN SURFEY", "Evan", 2, 2, [
    P("Tyler Shough", "QB", "NO"), P("Jonathan Taylor", "RB", "IND"),
    P("Ollie Gordon II", "RB"), P("Jaxon Smith-Njigba", "WR", "SEA"),
    P("Jaylen Waddle", "WR", "DEN"), P("Tucker Kraft", "TE", "GB"),
    P("Emmanuel Wilson", "RB", "SEA"), P("Spencer Shrader", "K"),
    P("Dallas Cowboys", "DEF", "DAL"),
    P("Deebo Samuel Sr.", "WR", "SF"), P("David Montgomery", "RB", "DET"),
    P("Tetairoa McMillan", "WR", "CAR"), P("C. Williams", "WR"),
    P("Stefon Diggs", "WR", "NE"), P("Josh Jacobs", "RB", "GB"),
]),
# Andrew's team — partial (known from draft + Sep 30 transaction). He'll send the rest.
T("t-andrew", "Motha Puka", "Andrew", 0, 0, [
    P("Puka Nacua", "WR", "LAR"), P("James Cook III", "RB", "BUF"),
    P("Javonte Williams", "RB"), P("Garrett Wilson", "WR", "NYJ"),
    P("Terry McLaurin", "WR", "WAS"), P("Drake Maye", "QB", "NE"),
    P("Kyle Pitts Sr.", "TE", "ATL"), P("Jaylen Warren", "RB", "PIT"),
    P("Brandon Aubrey", "K", "DAL"), P("Houston Texans", "DEF", "HOU"),
    P("Dalton Schultz", "TE", "HOU"),
], is_mine=True),
]

league = {
    "id": "manual-motha-puka-2026",
    "platform": "yahoo",
    "name": "%%LEAGUE_NAME%%",
    "season": 2026,
    "draftType": "snake",
    "teams": teams,
    "scoringType": "ppr",
    "totalTeams": 10,
    "currentWeek": 6,
    "isLoaded": True,
    "rosterSlots": {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "WRT": 1, "K": 1, "DEF": 1, "BN": 6, "IR": 1},
}

snapshot_json = json.dumps(league, ensure_ascii=False)
assert "$snapshot$" not in snapshot_json

sql = f"""-- TraderApe manual league import — run in Supabase SQL editor.
-- League: %%LEAGUE_NAME%% (10-team full PPR, 2026)
-- PIN for the league: {PIN}
-- Re-running this file updates the snapshot and keeps the same PIN.

-- 1. Upsert the league snapshot
INSERT INTO leagues (platform, platform_league_key, name, season, team_count, snapshot, updated_at, last_synced_at)
VALUES (
  'yahoo',
  'manual-motha-puka-2026',
  '%%LEAGUE_NAME%%',
  2026,
  10,
  $snapshot${snapshot_json}$snapshot$::jsonb,
  now(),
  now()
)
ON CONFLICT (platform_league_key) DO UPDATE SET
  name = EXCLUDED.name,
  season = EXCLUDED.season,
  team_count = EXCLUDED.team_count,
  snapshot = EXCLUDED.snapshot,
  updated_at = now(),
  last_synced_at = now();

-- 2. Create (or keep) the share PIN
INSERT INTO league_pins (pin, league_id, label)
SELECT '{PIN}', id, 'Manual import — Motha Puka league'
FROM leagues WHERE platform_league_key = 'manual-motha-puka-2026'
ON CONFLICT (pin) DO UPDATE SET
  league_id = EXCLUDED.league_id,
  label = EXCLUDED.label;
"""

with open("league-import.sql", "w") as f:
    f.write(sql)
print(f"SQL written. PIN: {PIN}")
print(f"Snapshot size: {len(snapshot_json)} chars, {len(teams)} teams")
