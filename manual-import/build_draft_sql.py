#!/usr/bin/env python3
"""Build a Supabase SQL import from Andrew's draft board spreadsheet.

Source: Google Sheet '2026-2027 DMATBWM FANTASY FOOTBALL DRAFT' (draft day, Sep 7 2026).
All 10 teams x 15 picks with positions, rounds, and auction prices.
This is a DRAFT-DAY snapshot — post-draft waiver moves are NOT applied.

PIN 5M43NA is preserved (same platform_league_key upsert).
"""
import json

PIN = "5M43NA"
PLATFORM_KEY = "manual-motha-puka-2026"
LEAGUE_NAME = "DMATBWM Fantasy Football"

# Draft-board column order (left to right) — used for pick numbering.
SLOT_ORDER = ["t-justin", "t-evan", "t-josh", "t-tyler", "t-mitch",
              "t-sam", "t-tylerm", "t-nick", "t-andrew", "t-damon"]

def P(name, pos, nfl=""):
    pid = name.lower().replace("'", "").replace(".", "").replace(" ", "-") + (f"-{nfl.lower()}" if nfl else "")
    return {"id": pid, "platformId": pid, "name": name, "position": pos, "team": nfl}

def pick_number(round_no, team_id):
    slot = SLOT_ORDER.index(team_id) + 1  # 1-10
    if round_no <= 6:
        # Auction rounds: no real pick order; number by column slot.
        return (round_no - 1) * 10 + slot
    # Snake rounds 7-15: odd rounds run slot 1->10, even rounds 10->1.
    # (Exact snake order reconstructed; round grouping is authoritative.)
    base = (round_no - 1) * 10
    return base + (slot if round_no % 2 == 1 else 11 - slot)

# Per team: list of (round, name, pos, nfl, auction_price or None) in draft order.
# Auction prices from the sheet; None = blank on the board.
# NFL teams best-effort, cross-checked vs Week 5 league data where available.
DRAFT = {
"t-justin": [
    (1, "Ja'Marr Chase", "WR", "CIN", 43), (2, "Justin Jefferson", "WR", "MIN", 38),
    (3, "Bo Nix", "QB", "DEN", 15), (4, "Travis Etienne Jr.", "RB", "JAX", 2),
    (5, "D'Andre Swift", "RB", "CHI", None), (6, "Christian Watson", "WR", "GB", None),
    (7, "Harold Fannin Jr.", "TE", "CLE", None), (8, "Chuba Hubbard", "RB", "CAR", None),
    (9, "DK Metcalf", "WR", "PIT", None), (10, "Kenny Gainwell", "RB", "PIT", None),
    (11, "Josh Downs", "WR", "IND", None), (12, "Jeremy Bernard", "WR", "", None),
    (13, "New England Patriots", "DEF", "NE", None), (14, "Harrison Mevis", "K", "LAR", None),
    (15, "Jared Goff", "QB", "DET", None),
],
"t-evan": [
    (1, "Jonathan Taylor", "RB", "IND", 43), (2, "Jaxon Smith-Njigba", "WR", "SEA", 46),
    (3, "Jaylen Waddle", "WR", "DEN", 6), (4, "Tetairoa McMillan", "WR", "CAR", 5),
    (5, "David Montgomery", "RB", "DET", None), (6, "Stephon Diggs", "WR", "NE", None),
    (7, "Tucker Kraft", "TE", "GB", None), (8, "Josh Jacobs", "RB", "GB", None),
    (9, "Caleb Williams", "QB", "CHI", None), (10, "Blake Corum", "RB", "LAR", None),
    (11, "Jakobi Meyers", "WR", "JAX", None), (12, "Romeo Doubs", "WR", "GB", None),
    (13, "Jordan Addison", "WR", "MIN", None), (14, "Jake Bates", "K", "DET", None),
    (15, "Detroit Lions", "DEF", "DET", None),
],
"t-josh": [
    (1, "CeeDee Lamb", "WR", "DAL", 37), (2, "Saquon Barkley", "RB", "PHI", 33),
    (3, "Jeremiyah Love", "RB", "ARI", 25), (4, "Quinshon Judkins", "RB", "CLE", 2),
    (5, "Davante Adams", "WR", "LAR", None), (6, "Carnel Tate", "WR", "", None),
    (7, "Jayden Daniels", "QB", "WAS", None), (8, "Jonathan Brooks", "RB", "CAR", None),
    (9, "Michael Pittman Jr.", "WR", "IND", None), (10, "Sam LaPorta", "TE", "DET", None),
    (11, "Deshawn Stribbling", "WR", "SF", None), (12, "Makai Lemon", "WR", "", None),
    (13, "Tyjae Spears", "RB", "TEN", None), (14, "Harrison Butker", "K", "KC", None),
    (15, "Los Angeles Chargers", "DEF", "LAC", None),
],
"t-tyler": [
    (1, "Amon-Ra St. Brown", "WR", "DET", 46), (2, "Derrick Henry", "RB", "BAL", 30),
    (3, "DeVonta Smith", "WR", "PHI", 7), (4, "Trey McBride", "TE", "ARI", 12),
    (5, "Chris Olave", "WR", "NO", 5), (6, "Bucky Irving", "RB", "TB", None),
    (7, "Joe Burrow", "QB", "CIN", None), (8, "TreVeyon Henderson", "RB", "NE", None),
    (9, "Brian Thomas Jr.", "WR", "JAX", None), (10, "Michael Wilson", "WR", "ARI", None),
    (11, "Jacory Croskey-Merritt", "RB", "WAS", None), (12, "Los Angeles Rams", "DEF", "LAR", None),
    (13, "Jake Ferguson", "TE", "DAL", None), (14, "Kyle Monangai", "RB", "CHI", None),
    (15, "Cameron Dicker", "K", "LAC", None),
],
"t-mitch": [
    (1, "De'Von Achane", "RB", "MIA", 35), (2, "Josh Allen", "QB", "BUF", 21),
    (3, "Nico Collins", "WR", "HOU", 21), (4, "Drake London", "WR", "ATL", 19),
    (5, "Jadarian Price", "RB", "", None), (6, "Tyler Warren", "TE", "IND", None),
    (7, "Parker Washington", "WR", "JAX", None), (8, "Rico Dowdle", "RB", "", None),
    (9, "Denver Broncos", "DEF", "DEN", None), (10, "Wan'Dale Robinson", "WR", "NYG", None),
    (11, "Marshawn Lloyd", "RB", "GB", None), (12, "Patrick Mahomes", "QB", "KC", None),
    (13, "Ka'imi Fairbairn", "K", "HOU", None), (14, "Dalton Kincaid", "TE", "BUF", None),
    (15, "Jonah Coleman", "RB", "", None),
],
"t-sam": [
    (1, "A.J. Brown", "WR", "PHI", 23), (2, "Ashton Jeanty", "RB", "LV", 25),
    (3, "Malik Nabers", "WR", "NYG", 17), (4, "Kyren Williams", "RB", "LAR", 15),
    (5, "Brock Bowers", "TE", "LV", 10), (6, "Breece Hall", "RB", "NYJ", 6),
    (7, "D.J. Moore", "WR", "BUF", None), (8, "Jalen Hurts", "QB", "PHI", None),
    (9, "Tony Pollard", "RB", "TEN", None), (10, "Courtland Sutton", "WR", "DEN", None),
    (11, "Quentin Johnston", "WR", "LAC", None), (12, "R.J. Harvey", "RB", "DEN", None),
    (13, "Trevor Lawrence", "QB", "JAX", None), (14, "Minnesota Vikings", "DEF", "MIN", None),
    (15, "Cam Little", "K", "JAX", None),
],
# Marlow = Tyler Marlowe (SHOW ME YOUR TDS)
"t-tylerm": [
    (1, "Jahmyr Gibbs", "RB", "DET", 47), (2, "Christian McCaffrey", "RB", "SF", 42),
    (3, "Zay Flowers", "WR", "BAL", 10), (4, "Jameson Williams", "WR", "DET", None),
    (5, "Alec Pierce", "WR", "IND", None), (6, "Hunter Henry", "TE", "NE", None),
    (7, "Dak Prescott", "QB", "DAL", None), (8, "J.K. Dobbins", "RB", "DEN", None),
    (9, "Tyler Allgeier", "RB", "ATL", None), (10, "Seattle Seahawks", "DEF", "SEA", None),
    (11, "Xavier Worthy", "WR", "KC", None), (12, "Rashid Shaheed", "WR", "SEA", None),
    (13, "Justin Herbert", "QB", "LAC", None), (14, "Tyrone Tracy Jr.", "RB", "NYG", None),
    (15, "Spencer Shrader", "K", "IND", None),
],
# Garzon = Nick (SMOKIN' DARTZZZ) — confirmed via 12/15 Week 5 roster overlap
"t-nick": [
    (1, "Bijan Robinson", "RB", "ATL", 44), (2, "Omarion Hampton", "RB", "LAC", 35),
    (3, "Ladd McConkey", "WR", "LAC", 12), (4, "Emeka Egbuka", "WR", "TB", 4),
    (5, "Cam Skattebo", "RB", "NYG", 5), (6, "Luther Burden III", "WR", "CHI", None),
    (7, "Tee Higgins", "WR", "CIN", None), (8, "Marvin Harrison Jr.", "WR", "ARI", None),
    (9, "Jaxson Dart", "QB", "NYG", None), (10, "Matthew Golden", "WR", "GB", None),
    (11, "Mike Washington Jr.", "RB", "", None), (12, "Isaiah Likely", "TE", "NYG", None),
    (13, "Kenyon Sadiq", "WR", "NYJ", None), (14, "Eddie Piñeiro", "K", "CAR", None),
    (15, "Pittsburgh Steelers", "DEF", "PIT", None),
],
"t-andrew": [
    (1, "Puka Nacua", "WR", "LAR", 36), (2, "James Cook III", "RB", "BUF", 37),
    (3, "Javonte Williams", "RB", "", 19), (4, "Garrett Wilson", "WR", "NYJ", 5),
    (5, "Terry McLaurin", "WR", "WAS", None), (6, "Drake Maye", "QB", "NE", None),
    (7, "Kyle Pitts Sr.", "TE", "ATL", None), (8, "Jaylen Warren", "RB", "PIT", None),
    (9, "Brandon Aubrey", "K", "DAL", None), (10, "Houston Texans", "DEF", "HOU", None),
    (11, "Jayden Reed", "WR", "GB", None), (12, "Aaron Jones", "RB", "MIN", None),
    (13, "Travis Kelce", "TE", "KC", None), (14, "Brock Purdy", "QB", "SF", None),
    (15, "Khalil Shakir", "WR", "BUF", None),
],
"t-damon": [
    (1, "Chase Brown", "RB", "CIN", 29), (2, "Kenneth Walker III", "RB", "SEA", 26),
    (3, "Rashee Rice", "WR", "KC", 18), (4, "George Pickens", "WR", "DAL", 13),
    (5, "Lamar Jackson", "QB", "BAL", 7), (6, "Colston Loveland", "TE", "CHI", 7),
    (7, "Bhayshul Tuten", "RB", "JAX", None), (8, "Rome Odunze", "WR", "CHI", None),
    (9, "Rhamondre Stevenson", "RB", "NE", None), (10, "Mike Evans", "WR", "SF", None),
    (11, "Chris Godwin", "WR", "TB", None), (12, "George Kittle", "TE", "SF", None),
    (13, "Matthew Stafford", "QB", "LAR", None), (14, "Philadelphia Eagles", "DEF", "PHI", None),
    (15, "Jason Myers", "K", "SEA", None),
],
}

TEAM_META = {
    "t-justin": ("LOOKIN A LITTLE MAHOLMIE", "Justin", False),
    "t-evan": ("TURKIN SURFEY", "Evan", False),
    "t-josh": ("JOSHUA'S ASTONISHING TEAM", "Josh", False),
    "t-tyler": ("DA SUN GOD", "Tyler", False),
    "t-mitch": ("MITCHTHELEGEND", "Mitch", False),
    "t-sam": ("MCCONKEY DONG", "Sam", False),
    "t-tylerm": ("SHOW ME YOUR TDS", "Tyler Marlowe", False),
    "t-nick": ("SMOKIN' DARTZZZ", "Nick", False),
    "t-andrew": ("Motha Puka", "Andrew", True),
    "t-damon": ("DAMON", "Damon", False),
}

teams = []
for tid in SLOT_ORDER:
    name, owner, is_mine = TEAM_META[tid]
    picks = DRAFT[tid]
    assert len(picks) == 15, f"{name} has {len(picks)} picks"
    assert [p[0] for p in picks] == list(range(1, 16)), f"{name} rounds out of order"
    roster = []
    draft_picks = []
    for rnd, pname, pos, nfl, price in picks:
        player = P(pname, pos, nfl)
        roster.append(player)
        dp = {
            "pickNumber": pick_number(rnd, tid),
            "round": rnd,
            "player": player,
            "teamId": tid,
            "teamName": name,
        }
        if rnd <= 6:
            dp["auctionValue"] = price if price is not None else 0
        draft_picks.append(dp)
    teams.append({
        "id": tid, "name": name, "ownerName": owner, "isMyTeam": is_mine,
        "roster": roster, "draftPicks": draft_picks,
        "wins": 0, "losses": 0, "ties": 0,
    })

league = {
    "id": "manual-motha-puka-2026",
    "platform": "yahoo",
    "name": LEAGUE_NAME,
    "season": 2026,
    "draftType": "snake",
    "teams": teams,
    "scoringType": "ppr",
    "totalTeams": 10,
    "currentWeek": 7,
    "isLoaded": True,
    "rosterSlots": {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "WRT": 1, "K": 1, "DEF": 1, "BN": 6, "IR": 1},
}

snapshot_json = json.dumps(league, ensure_ascii=False)

sql = f"""-- TraderApe manual league import — DRAFT-DAY snapshot (Sep 7, 2026).
-- Source: draft board spreadsheet. Post-draft waiver moves NOT applied.
-- Snake-round pick order reconstructed from board column order.
-- Run in Supabase SQL editor. Re-running updates the snapshot, keeps PIN {PIN}.

-- 1. Upsert the league snapshot
INSERT INTO leagues (platform, platform_league_key, name, season, team_count, snapshot, updated_at, last_synced_at)
VALUES (
  'yahoo',
  '{PLATFORM_KEY}',
  '{LEAGUE_NAME}',
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
FROM leagues WHERE platform_league_key = '{PLATFORM_KEY}'
ON CONFLICT (pin) DO UPDATE SET
  league_id = EXCLUDED.league_id,
  label = EXCLUDED.label;
"""

with open("league-import.sql", "w") as f:
    f.write(sql)
total_picks = sum(len(t["draftPicks"]) for t in teams)
print(f"SQL written. PIN: {PIN}")
print(f"Snapshot: {len(snapshot_json)} chars, {len(teams)} teams, {total_picks} draft picks")
