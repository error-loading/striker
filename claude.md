# FIFA 26 — Project Guide

A football simulation with real physics, positional AI for 22 agents, and a full match flow from squad building through live play to post-match analysis.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173. Build with `npm run build` (0 errors, 103 kB gzipped).

## Architecture

**The engine is separate from React.** `src/engine/engine.ts` is a pure TypeScript class that can be driven headlessly (see `scratchpad/sim.ts` for ~50 full matches). This split lets you:
- Verify balance and physics without running a browser
- Test the UI against stable engine behavior
- Ship the engine to Node later if needed

### Key Files

| Path | Purpose |
|------|---------|
| `src/engine/engine.ts` | 2100-line MatchEngine: physics, AI (22 agents), rules, stats, event log |
| `src/engine/math.ts` | Vec2 ops, xorshift32 PRNG, Bates-distribution gaussian |
| `src/render/camera.ts` | Pinhole perspective camera, 5 modes, look-at matrix, culling |
| `src/render/renderer.ts` | Orchestrates all render passes (pitch, stadium, entities, weather) |
| `src/render/pitch.ts` | Markings, corner flags, goal frame with net mesh |
| `src/render/stadium.ts` | 23 procedural stadiums, crowd with excitement-driven shimmer |
| `src/data/leagues.ts` | 384 players across 24 clubs, deterministic attribute derivation |
| `src/store/gameStore.ts` | Zustand state: squads, formations, settings, localStorage persistence |

## Common Tasks

### Run a Headless Match
Useful for balance testing without a UI:
```bash
npx ts-node scratchpad/sim.ts Professional 8
```
Outputs stats (goals, shots, possession, etc.) averaged over 8 matches.

### Add a New Stadium
Edit `src/data/stadiums.ts`, add a record with `{ id, name, capacity, seatColor, seatColorAlt, roof }`. The `StadiumScene` class procedurally builds stands and a crowd from these values — no assets needed.

### Tune Difficulty
Edit `DIFFICULTY` in `src/engine/constants.ts`. Each tier controls:
- `aiSpeed`: how fast opponents move
- `aiReaction`: decision latency (lower = faster)
- `aiPressing`: how tight the press
- `aiError`: multiplier on pass/shot mistakes
- `userAssist`: auto-correction on your own plays
- `aiKeeper`: keeper reaction speed

### Change Physics
Edit `PHYS` in `src/engine/constants.ts` — gravity, friction, bounce, Magnus, drag, etc. Test with `npm run build && npm run dev`, then a headless match.

### Debug Match State
In `MatchScreen.tsx`, pause the match, open browser console and run:
```js
window.__engine.players.forEach(p => {
  console.log(`${p.side === 0 ? 'MCI' : 'RMA'} #${p.name}`, 
    `pos ${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)}`,
    `stamina ${p.stamina.toFixed(0)}`, 
    `controlled: ${p.id === window.__engine.controlledId}`)
})
```

## Design Notes

**No Binary Assets** — all audio is synthesised (Web Audio API), club crests are procedural SVG, player appearance is a simple silhouette. Stadium textures are computed from pitch theme colours.

**Deterministic PRNG** — every match is seeded. Replaying the same seed + input produces identical physics. This is not wired up yet (no replay UI), but the groundwork is there.

**Fixed Timestep** — the engine runs at exactly 1/60 second steps, decoupled from render frame rate. This lets a slow frame not cascade into a frame skip; the sim just catches up over the next few presents.

**Formation-Relative AI** — agents anchor to their slot in the formation and move that anchor with possession. The anchor slides toward/away from the ball and the own goal, compressing in defense, spreading in attack.

**Offside at Pass Time** — offsideness is judged the moment the ball leaves a player's foot, not when the receiver touches it. This matches the real law and is checked against the second-last defender at that instant.

## Known Issues & Tuning Opportunities

**Scoring Runs High** — ~5 goals per 6-minute match combined. Real football is ~2.7. If tighter matches are wanted, adjust:
- Shot error sigmas in `userShoot` and `aiShoot` (larger = less accurate)
- Keeper save probability in `resolveContests` (higher roll threshold = more saves)
- Pass lead solver tolerance in `leadTarget` (currently iterates 3x)

**Corners Are Rare** — a corner is only awarded on a keeper turning it over the bar or round the post. Defender clearances always go to a chaser, never deflect out. If you want more corner flow, add deflection logic to `deflect()`.

**No Injury or Fatigue Recovery** — stamina drains during play and only recovers at half time. A player at 30% stamina should miss sitters, but there's no "tired player gets a goal kick to recover" logic.

**Half Time and Full Time Not Visually Verified** — they render (see `HalfTime.tsx` and `FullTime.tsx`), and all their data contracts pass (`scratchpad/contract.ts`), but a live browser playthrough doesn't reach them because the preview pane throttles `requestAnimationFrame` to ~1 fps when backgrounded. Hitting 90 minutes takes hours of wall time. You should eyeball them yourself on a `npm run dev` build.

## Testing

**Type Safety**: `npm run typecheck` (strict mode, no implicit any).

**Production Build**: `npm run build`. Validates types and bundles.

**Headless Sim** (no browser): 
```bash
node scratchpad/sim.ts Professional 12
```

**Balance Check** (difficulty scaling):
```bash
node scratchpad/diff.ts
```
Should show monotonic increase in opponent goals as difficulty rises.

## Performance Notes

- **Canvas rendering**: ~60 fps on desktop (single-threaded, no workers).
- **Crowd**: ~500 dots per frame at full zoom (thinned via RNG in `buildCrowd`).
- **Players**: 22 agents, each running steering, stamina, decision latency, AI target evaluation. ~1–2 ms per frame step.
- **Bundle**: 103 kB gzipped. No external libraries except React/Zustand.

## Git Workflow

Commit early and often. The engine and UI are decoupled enough that you can refactor rendering without touching the sim, and vice versa.

- `src/engine/` changes require a headless test (`npm run build`, then `node scratchpad/sim.ts`)
- `src/render/` changes can be visually verified with `npm run dev`
- `src/screens/` changes: full flow test (landing → squad → setup → pre-match → match → full time)

---

Questions? Check the `README.md` for high-level overview, or grep the relevant source file for comments.
