# FIFA 26 — Project Guide

A football simulation with real physics, positional AI for 22 agents, and a full match flow from squad building through live play to post-match analysis.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173. Build with `npm run build` (0 errors, 121 kB gzipped).

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
| `src/render/camera.ts` | Pinhole perspective camera, 5 modes, near-plane clipping, culling |
| `src/render/atmosphere.ts` | Depth haze, key light direction, shading and shadow offsets |
| `src/render/entities.ts` | Articulated player figure, gait cycle, ball, name plates |
| `src/render/appearance.ts` | Per-player skin, hair, facial hair and boots, derived from id |
| `src/render/spectators.ts` | Articulated spectator figure, look pools, crowd LOD and reactions |
| `src/render/renderer.ts` | Orchestrates all render passes (pitch, stadium, entities, weather) |
| `src/render/pitch.ts` | Grass, wear, markings, corner flags, 3D goal net, lighting grade |
| `src/render/stadium.ts` | 23 procedural stadiums: rounded bowl, tiered crowd, roof, floodlights |
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

### Iterate on the Renderer
`preview.html` is a dev-only harness that renders a live match full-screen, so you can eyeball the stadium without playing through the menus. Vite only builds `index.html`, so it never ships.

```
http://localhost:5173/preview.html?camera=Broadcast&time=Night&weather=Foggy&stadium=anfield
```

`&pause=1` freezes the sim for reproducible screenshots, `&warmup=N` fast-forwards N seconds first. `window.__bench()` in the console times `renderer.draw()` synchronously — real frame timing is useless in a backgrounded pane because `requestAnimationFrame` throttles to ~1 fps.

### Work on the Player Figure
`?rig=1` swaps the match for a model sheet: rows are gait states (idle → walk → run → sprint → celebrating and exhausted), columns turn the player 45° at a time so you can check every heading at once.

```
http://localhost:5173/preview.html?rig=1&cols=4&rows=2&mag=4
```

`mag` scales the canvas transform rather than moving the camera, so stroke widths blow up with the figure and what you inspect is exactly what a match camera draws. Note the players are ~28 css pixels tall in play, so anything that only reads at `mag=4` is not worth the instructions to draw it.

### Work on the Crowd
`?crowd=1` draws the bowl from a real match camera and magnifies it about a point in the stands, so spectators can be judged at a size no camera gives you.

```
http://localhost:5173/preview.html?crowd=1&camera=Sideline&mag=7&drive=0.95&focus=52,76,10
```

`focus` is a world-space `x,y,z` in metres; the notional ball is parked level with it so the match camera actually looks that way. `drive` fakes the mood — above 0.75 it is treated as a goal for the home end, which is how you check that one end erupts while the other sits down without waiting for a goal.

Same caveat as the player rig, and it bites harder here: **magnification does not change the level of detail**. LOD is chosen from the real projected scale, so what you see blown up is the figure the game actually draws. `spectators.ts` documents where each tier cuts in, and no shipped camera reaches better than about 10 px/m — the gantry looks *over* its own stand, so the nearest crowd in any frame is the far touchline.

### Change the Camera Framing
`MODES` in `src/render/camera.ts`. The two touchline modes are built by `gantry(elevation, distance, track)`:
- `elevation` — degrees above the pitch. Beyond about 25° the near touchline falls out of the bottom of frame, because the bottom-of-frame ray no longer reaches the ground in front of the camera.
- `distance` — slant range to the aim point. Drives how big players read; everything else follows from it.
- `track` — how much of the ball's lateral position the aim point inherits. 0 stares at the middle of the pitch, 1 follows the ball across and makes the pitch appear to slide.

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

**Players Are Posed in World Space** — `buildPose` places hips, knees, ankles, shoulders, elbows, hands, neck and head in metres around the player's own facing, and every joint is projected through the same camera as the pitch. That is what makes a figure turn, foreshorten and sit correctly at any camera angle for free. The surfaces are then drawn as screen-space capsules between the projected joints, which at 28 pixels tall is indistinguishable from shaded geometry and costs a fraction as much.

**The Chest Needs Depth** — the torso is a capsule *and* a shoulder-to-hip quad. The quad alone gives a broad chest face-on but collapses to a line in profile, because two shoulder points are all it has; the capsule supplies the front-to-back thickness that keeps a silhouette in every heading. Same reason the head is an ellipse rather than a polygon.

**Rim Light by Double-Draw** — each body part is drawn twice, once offset toward the key light in a brighter tint and once in its own colour on top, so the bright copy survives only along one edge. Stroking an outline instead puts a halo around the whole figure, which reads as a helmet.

**Appearance Is Derived, Not Authored** — skin tone, hair, facial hair and boot colour all come from a hash of the player id, so a squad reads as people without a byte of per-player data. Skin tone is deliberately *not* keyed off nationality: inferring appearance from the country on a passport would be wrong about a great many real footballers.

**The Crowd Is Made of People** — every seat holds a figure posed the same way a player is, not a coloured rectangle. It is built on three compromises, all of them load-bearing. A spectator projects *four* points — the seat, and a metre up, left and forward of it — and derives every joint as an affine combination of those, because across a body 0.9 m tall and 100 m away the perspective divide is constant to well under a pixel; a player projects all fourteen joints, which is worth it at 28 pixels tall and twenty-two of them, and ruinous at twenty-five thousand. Looks are pooled per block rather than per seat, with the block's lighting already baked into every colour string, so the draw loop does no colour arithmetic at all. And aerial perspective is resolved per block at a quantised depth and cached, not per spectator.

**A Stand Is Painted Back to Front** — `fillCrowd` walks tiers and rows in reverse, so the back row is seated first and the row in front overlaps it. Every camera in the game is inside the bowl, so the back row of any visible stand is the far one. With flat dots the order never mattered; with bodies it is the difference between a terrace and a spreadsheet. The same reasoning is why spectators have no legs — the camera always looks down into the stand, so a seated fan's thighs are behind the row in front of them.

**Most of a Crowd Is Batching, Not Geometry** — a distant spectator is two rectangles, and drawing it cost far more than that: assigning `fillStyle` re-parses a colour string and every `fill()` is a draw call. Because looks are pooled, a block only holds 96 distinct colours, so the two cheap tiers bucket by look and emit one path and one draw call each. That alone took the crowd from 9.6 ms a frame to 7.3. Two traps worth knowing: `rect()` starts a new subpath but `ellipse()` and `arc()` do **not**, so a batch of heads needs an explicit `moveTo` before each one or it fills as a fan of huge triangles; and bucketing reorders figures within a block, which is only safe because these tiers are marks a few pixels across.

**The Crowd Budget Is Measured, Not Estimated** — `draw` times the crowd pass and thins until it fits `CROWD_MS_BUDGET`. An earlier version counted units of work against a constant, which is really a guess about hardware and is wrong on any machine but the one it was tuned on. When the budget binds it thins ranks of seats first and drops a detail tier second: losing seats is smooth, losing a tier is a step change across the whole stand.

**One Continuous Bowl** — the stadium is a rounded-rectangle ring, not four separate stands. Every seat, wall, roof panel and advertising board is placed by walking that ring, which is what closes the corners. The ring also carries a height profile: the stand opposite the camera steps down to two tiers, so a band of sky and the floodlight rigs sit above the roofline instead of the frame being wall-to-wall seating.

**Aerial Perspective** — `atmosphere.ts` blends every stadium surface toward a haze colour by camera depth. Without it the far stand reads as a flat sticker at the top of the frame; with it the bowl has depth. It also owns the key light, so stand shading, player shadows and the ball's shadow all agree on where the light is.

**Painter's Algorithm, Per Block** — the ring is diced into blocks that are depth-sorted and drawn far-to-near. Blocks are culled on their eight corners, not their centre: a stand block is tens of metres wide, and testing only the middle drops blocks whose near edge is still in frame, punching a hole in the bowl.

**Polygons Clip, They Don't Drop** — `fillWorldPoly` clips against the near plane in view space. The camera stands inside the bowl, so faces routinely have one vertex behind the lens; rejecting those faces outright pops holes in the stadium. Note this only works for convex faces — the ground surround is drawn as a triangle fan from the centre spot for exactly this reason, since a single polygon enclosing the camera folds inside out when clipped.

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
- **Crowd**: ~5,000 figures a frame on the broadcast camera, across four levels of detail. Held to `CROWD_MS_BUDGET` (5 ms) by timing the pass and thinning until it fits, so it costs the same share of a frame on any machine. Roughly 5 ms of a 7.3 ms frame on the reference desktop.
- **Players**: 22 agents, each running steering, stamina, decision latency, AI target evaluation. ~1–2 ms per frame step.
- **Bundle**: 121 kB gzipped. No external libraries except React/Zustand.

## Git Workflow

Commit early and often. The engine and UI are decoupled enough that you can refactor rendering without touching the sim, and vice versa.

- `src/engine/` changes require a headless test (`npm run build`, then `node scratchpad/sim.ts`)
- `src/render/` changes can be visually verified with `npm run dev`
- `src/screens/` changes: full flow test (landing → squad → setup → pre-match → match → full time)

---

Questions? Check the `README.md` for high-level overview, or grep the relevant source file for comments.
