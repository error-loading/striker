# Striker — The Beautiful Game Redefined

A football simulation built with React, TypeScript and Canvas 2D. Pick a club from five
leagues, drag your XI into shape, choose the opposition and the conditions, then play the
match — with real ball physics, positional AI, offsides, fouls and cards.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## What's in it

**Squad builder** — 24 clubs and 384 players across the Premier League, LaLiga, Serie A,
Bundesliga and Ligue 1. Six formation presets with auto-positioning, drag-and-drop (plus
click-to-place on touch), search and filtering by position and rating, a chemistry score
that rewards players lining up in their natural role alongside compatriots, and squads you
can save and reload.

**Match engine** — a fixed-timestep 60 Hz simulation, independent of frame rate:

- Ball physics with gravity, rolling friction, bounce, air drag and a Magnus curve, so
  finesse shots genuinely bend.
- 22 agents holding a formation shape that slides with the ball, compresses out of
  possession and pushes on in it.
- Passing (ground, through, lofted) with error scaled by the passer, distance, pressure,
  fatigue and weather; the receiver is led by a solved time-of-flight.
- Shooting with a charge meter, directional aim, and both lateral and vertical error.
- Timing-based tackling — close is the green zone, a late lunge at speed is a foul.
- Offside judged at the moment the pass is played, against the second-last defender.
- Fouls, penalties, yellows, second-yellow reds and playing on a man down.
- Keepers with reaction latency who hold, parry, or turn it over the bar and round the post.
- Throw-ins, corners, goal kicks, free kicks, two halves, half-time and full time.

**Presentation** — a hand-rolled perspective camera projecting a real 120 × 80 yard pitch
with Laws-of-the-Game markings, five camera modes, club-coloured stands with a crowd that
swells with momentum, floodlights, LED perimeter boards, rain, snow and fog, and day or
night lighting. All audio — crowd, whistle, ball strikes, menu music — is synthesised at
runtime with the Web Audio API, so there are no binary assets.

**Controls** — Pro (hold to charge shots) or Arcade (tap) schemes, every key rebindable,
gamepad support, and an on-screen stick and action pad on touch devices.

## Difficulty

Each tier rewrites AI speed, reaction latency, pressing intensity and passing error, and
dials down how much your own passes and shots are corrected. Measured over 12 simulated
matches per tier:

| Difficulty | You – AI | Your shots | AI shots | Your possession |
|---|---|---|---|---|
| Amateur | 4.75 – 1.00 | 12.5 | 3.1 | 64% |
| Semi-Pro | 4.00 – 1.50 | 11.0 | 5.8 | 56% |
| Professional | 2.67 – 2.33 | 9.5 | 7.1 | 49% |
| World Class | 1.50 – 3.58 | 8.1 | 10.3 | 49% |
| Legendary | 1.75 – 3.42 | 7.3 | 11.8 | 46% |

## Layout

```
src/
  data/      teams, players, stadiums, formations, flags
  engine/    simulation: physics, AI, rules, input mapping
  render/    camera, pitch, stadium, entities, weather
  screens/   landing, squad builder, setup, pre-match, match, half/full time, settings
  store/     zustand state and persistence
  audio/     Web Audio synthesis
```

The engine has no dependency on React or the DOM — it can be driven headlessly, which is
how the balance figures above were produced.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck and production build |
| `npm run typecheck` | Types only |

Not affiliated with EA Sports or FIFA. Club crests are generated procedurally from each
club's colours and initials; no third-party logo assets are used.
