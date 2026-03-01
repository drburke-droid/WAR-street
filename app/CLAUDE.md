# WAR STREET — Fantasy Baseball Stock Market

## What This Is

A season-long fantasy baseball game with stock market mechanics. Players are stocks. You buy and sell them with a budget. Their prices fluctuate based on real WAR performance, momentum, and hidden league demand. Highest cumulative WAR at season end wins.

## Current State

Single-file React component (`war-street.jsx`, ~824 lines) with **responsive dual UI**:

- **Desktop (≥768px):** Bloomberg Terminal / CRT aesthetic
- **Mobile (<768px):** Palm Pilot PDA motif with LCD green screen

166 MLB players (118 hitters, 48 pitchers), full pricing engine, buy/sell UI, portfolio management, and standings. No backend — all state is in-memory.

### Previous Versions

|File               |Description                                                           |
|-------------------|----------------------------------------------------------------------|
|`war-street-v8.jsx`|Desktop-only Bloomberg terminal version, 377 players, ~787 lines      |
|`war-street.jsx`   |Current responsive version, dual UI, 166 players (trimmed), ~824 lines|
|`players-db.js`    |Full 384-entry player database (compact array format)                 |

## Running It

React component (JSX). Uses only React core (`useState`, `useMemo`, `useCallback`, `useEffect`, `useRef`). No external dependencies. Render in any React environment or as a Claude.ai Artifact.

## Core Game Rules

|Rule        |Detail                                                                                                              |
|------------|--------------------------------------------------------------------------------------------------------------------|
|Budget      |$300M per owner                                                                                                     |
|Roster      |13 slots: C, 1B, 2B, 3B, SS, OF, OF, OF, SP, SP, SP, SP, RP                                                         |
|Transactions|6 per week (Mon–Sun), buy or sell = 1 tx                                                                            |
|Owners      |12 max to start (designed to scale quickly)                                                                         |
|Ownership   |Shared — multiple owners can hold the same player                                                                   |
|Scoring     |Cumulative WAR. Highest total at season end wins                                                                    |
|Visibility  |Rosters are private. Standings show only team name, WAR, portfolio value                                            |
|Positions   |Displayed as OF (not LF/CF/RF) and SP (not SP1-4). Internal slots use OF1/OF2/OF3 and SP1/SP2/SP3/SP4 for uniqueness|

## Pricing Engine v2

Prices are deterministic — zero randomness. All movement traces to real baseball events.

### Formula

1. **Effective WAR** = sigmoid_blend(projected_war, annualized_ytd_war, games_played)
- Game 1-25: ~85% projection / 15% actual
- Game 81: ~40/60
- Game 140+: ~8/92
1. **Momentum** = recent_3_game_performance / season_average - 1.0 (capped ±8%)
- Hitters: OPS ratio
- Pitchers: inverse ERA ratio
1. **Popularity premium** = ownership_percentage × 0.10 (**HIDDEN** — never displayed)
1. **Final price** = 0.80 × (eWAR × $8M × (1 + popularity)) + 0.20 × (prev_price × (1 + momentum))
- Floor: $500K
- Cap: $80M

### Key Design Decision

Ownership is silently baked into pricing but never shown to users. A rising price could mean strong performance, hot momentum, OR heavy league demand — you can’t tell which. This is the core information asymmetry that makes the game interesting.

## Responsive UI Architecture

### Detection

`useIsMobile()` custom hook watches `window.innerWidth` at 768px breakpoint, re-checks on resize. Both UIs share identical game state, pricing engine, player database, and transaction logic.

### Desktop — Bloomberg Terminal / CRT

- **Font:** VT323 (Google Fonts) — modeled on DEC VT320 terminal
- **Title:** JetBrains Mono 800 weight, 32px, 2px letter-spacing
- **Colors:** Green (#33ff33) on black (#0a0a0a). Amber (#ff9900) for accents. Red (#ff3333) for negative/sell. White (#ccc) for primary data. Gray (#555) for labels
- **CRT effects:** CSS scanline overlay (repeating-linear-gradient), vignette (radial-gradient)
- **Crawling ticker:** requestAnimationFrame at 0.6px/frame, top 30 players by price
- **Navigation:** Tab bar in status row: MKT / PORT / RANK / HELP
- **Hamburger menu (☰):** Profile Info, Settings, Switch Team

### Mobile — Palm Pilot PDA

- **Device frame:** CSS-recreated Palm Pilot body with gradient grey housing, “Palm∎Pilot” and “US Robotics” branding, recessed screen bezel, physical button row, Graffiti input area
- **Screen:** LCD green (#b8c8a0) with pixel grid overlay
- **Font:** Silkscreen (Google Fonts) — pixel/bitmap style at 7-9px
- **Colors:** Dark green text (#2d4a2d) on LCD green. Muted green (#5a6a42) for accents
- **Navigation:** Compact tab bar: MKT / PORT / RNK / ?
- **No ticker** (screen space constraint)
- **Palm frame image:** A transparent PNG (`palm-frame-alpha.png`) is available if you want to overlay the real image instead of the CSS recreation

### Layout Differences

|Feature             |Desktop                                   |Mobile                       |
|--------------------|------------------------------------------|-----------------------------|
|Market table columns|PLAYER, TM, POS, PRICE, CHG, WAR, BUY/SELL|NAME, TM, PS, $, Δ, W, action|
|Column widths       |120/40/65/70/65/45/50 px                  |65/22/24/36/28/20/22 px      |
|Font sizes          |16-20px                                   |7-9px                        |
|Ticker              |Yes, crawling animation                   |No                           |
|CRT scanlines       |Yes                                       |No (LCD pixel grid instead)  |
|Device frame        |None (fullscreen)                         |Palm Pilot housing           |
|Search input        |180px                                     |40px                         |

## Data Architecture (For Backend Build)

### Layer 1: WAR Data — pybaseball → FanGraphs

```python
from pybaseball import batting_stats, pitching_stats
hitters = batting_stats(2026, qual=0)
pitchers = pitching_stats(2026, qual=0)
```

- FanGraphs updates WAR daily during season
- Free, no API key
- DO NOT calculate WAR yourself — requires proprietary defensive metrics, park factors, replacement level constants

### Layer 2: Live Game Data — MLB Stats API

- Base: `https://statsapi.mlb.com/api/v1`
- Free, no auth
- Use for box scores, schedules, daily stat lines
- Powers momentum calculations

### Layer 3: Database — Supabase/PostgreSQL

```sql
CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  mlb_id INTEGER UNIQUE,
  fangraphs_id INTEGER UNIQUE,
  name TEXT,
  position TEXT,
  eligible_positions TEXT[],
  war_prior_year NUMERIC(4,1),
  war_ytd NUMERIC(4,1),
  projected_war NUMERIC(4,1),
  current_price INTEGER,
  price_history JSONB
);

CREATE TABLE owners (
  id SERIAL PRIMARY KEY,
  name TEXT,
  budget_remaining INTEGER DEFAULT 160000000,
  transactions_this_week INTEGER DEFAULT 0
);

CREATE TABLE roster_entries (
  owner_id INTEGER REFERENCES owners(id),
  player_id INTEGER REFERENCES players(id),
  slot TEXT NOT NULL,
  purchase_price INTEGER,
  UNIQUE(owner_id, slot)
);
```

### Daily Cron Schedule

- 6:00 AM ET — Pull updated WAR from FanGraphs (pybaseball)
- 6:15 AM ET — Pull yesterday’s box scores (MLB API)
- 6:30 AM ET — Recalculate all player prices
- 6:45 AM ET — Update leaderboard
- Monday 12:00 AM — Reset weekly transaction counters

### Player ID Mapping

Use `pybaseball.playerid_lookup` for MLB ↔ FanGraphs cross-reference.

## What Needs Building Next

### Immediate

- Restore full 377-player database from `players-db.js` into the responsive version
- Backend API (Python/FastAPI or Node) for roster management, price updates, auth
- Supabase/PostgreSQL schema deployment
- Real data pipeline: pybaseball cron → price recalculation
- User authentication (each owner logs in to their team)

### Soon

- Transaction history log
- Price history charts (sparklines or detail view per player)
- Push notifications for price movements
- Draft/auction mode for season start
- Use actual `palm-frame-alpha.png` as mobile device frame overlay (currently CSS-only)

### Design Decisions Still Open

- Profile Info and Settings pages (hamburger menu items are wired but empty)
- Whether to add any demand signal to the market (currently fully blind)
- Trade deadline mechanics (if any)
- Injured list / roster management for IL stints

## Conventions

- **Player names:** “Last F” format (e.g., “Judge A”, “Ohtani S”)
- **Prices:** Rounded to nearest $10K, displayed as “$52.3M” / “$800K”
- **WAR:** 1 decimal place
- **Eligible positions:** Internal slot names (OF1/OF2/OF3, SP1-4, RP, C, 1B, 2B, 3B, SS)
- **`dSlot(s)`:** Strips numbers for display: OF1→OF, SP3→SP
- **Team abbreviations:** Standard MLB 2-3 letter codes (NYY, LAD, etc.)

## Known Gotchas

- **Ternary vs optional chaining:** Never write `condition?.25` — JavaScript parses it as optional chaining. Always use `condition ? 0.25 : fallback` with the leading zero and spaces.
- **Font loading:** Both Silkscreen and VT323 load from Google Fonts via `@import` in a `<style>` tag. If fonts don’t load, the UI falls back to monospace.
- **Responsive breakpoint:** 768px. Resize browser window to test both UIs on desktop.

## File Structure

```
war-street.jsx      # Current responsive React prototype (single file, ~824 lines)
war-street-v8.jsx   # Previous desktop-only version (~787 lines)
players-db.js       # Full player database (384 entries, compact array format)
palm-frame-alpha.png # Palm Pilot device frame image (transparent screen area)
CLAUDE.md           # This file