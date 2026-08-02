import { useEffect, useMemo, useState } from 'react';
import { audio } from '../audio/audio';
import { TeamCrest } from '../components/TeamCrest';
import { ALL_PLAYERS, ALL_TEAMS, LEAGUES } from '../data/leagues';
import { STADIUMS } from '../data/stadiums';
import { useGame, type Screen } from '../store/gameStore';

const NAV: { label: string; screen: Screen }[] = [
  { label: 'Pitch', screen: 'landing' },
  { label: 'Squad', screen: 'squad' },
  { label: 'Match', screen: 'setup' },
  { label: 'Settings', screen: 'settings' },
];

/** The three phases of a session. Numbering is meaningful — this IS the flow. */
const PHASES = [
  {
    n: '01',
    title: 'The Pitch',
    lede: '23 grounds, 12 groundskeepers.',
    body:
      'Stands, roofs and floodlights are drawn from the club shell — not painted on. Grass reads short, rain slows the surface, night fixtures light differently to Saturday three.',
    figure: `${STADIUMS.length} grounds`,
  },
  {
    n: '02',
    title: 'The Squad',
    lede: 'Pick eleven, not a starting nod.',
    body: `Drag ${ALL_PLAYERS.length} players from ${ALL_TEAMS.length} clubs into a shape you believe in. Chemistry scores the choice; the bench remembers what you left out.`,
    figure: `${ALL_PLAYERS.length} players`,
  },
  {
    n: '03',
    title: 'The Match',
    lede: 'Offside at the moment the ball leaves the foot.',
    body:
      'Spin-aware ball, keeper reflex, five difficulties. Every touch is simulated: yellow cards for the shirt-pull, and the linesman flags the tight one because the sim actually watched.',
    figure: '60 fps · fixed step',
  },
];

/**
 * Manufactured match events for the ticker. These read as if the headless
 * simulator has just spat them out — because that is exactly the kind of feed
 * scratchpad/sim.ts produces. Fixed content is fine: this is a marquee, not
 * a live feed. If you wire the real engine into it, drop the array in.
 */
const TICKER: { min: string; kind: 'goal' | 'yellow' | 'sub' | 'save' | 'ht' | 'shot'; text: string }[] = [
  { min: "07'", kind: 'shot', text: 'Foden — long-range effort — over the bar' },
  { min: "14'", kind: 'goal', text: "Haaland — headed in from Kevin's cross · MCI 1–0 RMA" },
  { min: "22'", kind: 'yellow', text: 'Rodri — tactical foul on Vinícius' },
  { min: "31'", kind: 'save', text: 'Ederson — palmed round the post from Bellingham' },
  { min: "38'", kind: 'goal', text: 'Vinícius — cut inside, curled far corner · MCI 1–1 RMA' },
  { min: "45+2'", kind: 'ht', text: 'HALF TIME · Etihad · attendance 53,142' },
  { min: "51'", kind: 'sub', text: 'Modrić on for Camavinga' },
  { min: "63'", kind: 'goal', text: 'De Bruyne — free-kick over the wall · MCI 2–1 RMA' },
  { min: "77'", kind: 'shot', text: 'Bellingham — hit the post' },
  { min: "89'", kind: 'goal', text: 'Doku — counter, slotted low · MCI 3–1 RMA' },
];

/** 4-3-3, attack going up. Coordinates in the tactics-board viewBox (300×400). */
const XI: { n: number; x: number; y: number; label: string }[] = [
  { n: 1, x: 150, y: 358, label: 'GK' },
  { n: 2, x: 72, y: 278, label: 'RB' },
  { n: 4, x: 112, y: 302, label: 'CB' },
  { n: 5, x: 188, y: 302, label: 'CB' },
  { n: 3, x: 228, y: 278, label: 'LB' },
  { n: 6, x: 96, y: 208, label: 'CM' },
  { n: 8, x: 150, y: 222, label: 'CM' },
  { n: 10, x: 204, y: 208, label: 'CM' },
  { n: 7, x: 66, y: 102, label: 'RW' },
  { n: 9, x: 150, y: 78, label: 'ST' },
  { n: 11, x: 234, y: 102, label: 'LW' },
];

/** Passing sequence to animate: CB → CM → RW → ST. Chalk arrow indices into XI. */
const SEQUENCE: [number, number][] = [
  [2, 6], // CB #4 → CM #8
  [6, 8], // CM #8 → RW #7
  [8, 9], // RW #7 → ST #9
];

function chalkArrowPath(x1: number, y1: number, x2: number, y2: number): string {
  // A slight arc so passes feel like passes, not laser beams.
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bend = Math.min(len * 0.15, 22);
  const cx = mx + nx * bend;
  const cy = my + ny * bend;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

function TacticsBoard() {
  return (
    <svg
      viewBox="0 0 300 400"
      className="h-full w-full"
      role="img"
      aria-label="A 4-3-3 formation drawn on a chalk tactics board"
    >
      <defs>
        {/* Soft chalk edge — no perfect vector lines. */}
        <filter id="chalk" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence baseFrequency="0.9" numOctaves="2" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="0.6" />
        </filter>
        <marker
          id="arrowhead"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#F2EFE4" opacity="0.85" />
        </marker>
      </defs>

      {/* Pitch: painted, then chalked over. */}
      <rect x="0" y="0" width="300" height="400" fill="#0F2015" />

      {/* Subtle mow stripes running vertically. */}
      <g opacity="0.35">
        {Array.from({ length: 8 }).map((_, i) => (
          <rect
            key={i}
            x={i * 37.5}
            y="0"
            width="37.5"
            height="400"
            fill={i % 2 === 0 ? '#14291B' : '#0F2015'}
          />
        ))}
      </g>

      {/* Chalk lines. Grouped so we can apply the chalk filter once. */}
      <g
        stroke="#F2EFE4"
        strokeWidth="0.9"
        fill="none"
        opacity="0.55"
        strokeLinecap="round"
        filter="url(#chalk)"
      >
        {/* Touchlines + halfway (bottom edge). */}
        <rect x="8" y="8" width="284" height="384" />
        {/* 18-yard box (attacking end, top). */}
        <rect x="60" y="8" width="180" height="66" />
        {/* 6-yard box. */}
        <rect x="108" y="8" width="84" height="22" />
        {/* Penalty arc — top of the D. */}
        <path d="M 118 74 A 32 32 0 0 0 182 74" />
        {/* Penalty spot. */}
        <circle cx="150" cy="52" r="1.2" fill="#F2EFE4" stroke="none" />
        {/* Center circle (only top half visible since this is a half pitch). */}
        <path d="M 118 392 A 32 32 0 0 1 182 392" />
        <circle cx="150" cy="392" r="1.2" fill="#F2EFE4" stroke="none" />
        {/* Corner arcs. */}
        <path d="M 8 12 A 4 4 0 0 0 12 8" />
        <path d="M 288 8 A 4 4 0 0 0 292 12" />
        {/* Goal frame — thin bar at top. */}
        <line x1="130" y1="8" x2="170" y2="8" strokeWidth="1.6" />
      </g>

      {/* Passing sequence — three chalk arrows drawing in order. */}
      <g stroke="#F2EFE4" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.85">
        {SEQUENCE.map(([from, to], i) => {
          const a = XI[from];
          const b = XI[to];
          const d = chalkArrowPath(a.x, a.y, b.x, b.y);
          const dash = Math.hypot(b.x - a.x, b.y - a.y) * 1.15;
          return (
            <path
              key={i}
              d={d}
              markerEnd="url(#arrowhead)"
              className="chalk-draw"
              style={
                {
                  ['--dash' as string]: dash,
                  ['--delay' as string]: `${900 + i * 850}ms`,
                } as React.CSSProperties
              }
            />
          );
        })}
      </g>

      {/* Player dots — chalk circles with shirt numbers. */}
      <g>
        {XI.map((p, i) => (
          <g
            key={p.n}
            className="chalk-pop"
            style={{ ['--delay' as string]: `${120 + i * 55}ms` } as React.CSSProperties}
          >
            <circle
              cx={p.x}
              cy={p.y}
              r="9.5"
              fill="#0B1810"
              stroke="#F2EFE4"
              strokeWidth="1.2"
              opacity="0.95"
            />
            <text
              x={p.x}
              y={p.y + 3.4}
              textAnchor="middle"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="9"
              fontWeight="700"
              fill="#F2EFE4"
            >
              {p.n}
            </text>
          </g>
        ))}
      </g>

      {/* Formation label bottom-left, tactics-notebook style. */}
      <g fontFamily="'JetBrains Mono', monospace" fill="#F2EFE4" opacity="0.6">
        <text x="14" y="384" fontSize="8" letterSpacing="2">
          4 — 3 — 3
        </text>
        <text x="286" y="384" fontSize="8" letterSpacing="1" textAnchor="end">
          HOME · KICK-OFF 15:00
        </text>
      </g>
    </svg>
  );
}

function TickerRow() {
  const items = useMemo(() => [...TICKER, ...TICKER], []);
  return (
    <div className="overflow-hidden py-3">
      <div className="ticker-track">
        {items.map((e, i) => (
          <div key={i} className="flex shrink-0 items-center gap-3 font-mono text-[12px]">
            <span className="text-chalk-dim">{e.min}</span>
            <span
              className={
                e.kind === 'goal'
                  ? 'text-chalk'
                  : e.kind === 'ht'
                  ? 'text-corner'
                  : 'text-chalk-dim'
              }
            >
              {e.kind === 'goal' && '● GOAL'}
              {e.kind === 'yellow' && '▮ YEL'}
              {e.kind === 'sub' && '⇄ SUB'}
              {e.kind === 'save' && '✕ SAVE'}
              {e.kind === 'shot' && '↗ SHOT'}
              {e.kind === 'ht' && '▮ HT'}
            </span>
            <span className="text-chalk/90">{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const setScreen = useGame((s) => s.setScreen);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    audio.startMusic();
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      audio.stopMusic();
      clearInterval(t);
    };
  }, []);

  const go = (screen: Screen) => {
    audio.init();
    audio.confirm();
    setScreen(screen);
  };

  const topClubs = useMemo(
    () => ALL_TEAMS.slice().sort((a, b) => b.rating - a.rating).slice(0, 10),
    [],
  );

  const kickoff = useMemo(() => {
    const d = new Date();
    d.setHours(15, 0, 0, 0);
    return d;
  }, []);
  const untilKickoff = Math.max(0, kickoff.getTime() - now.getTime());
  const hh = String(Math.floor(untilKickoff / 3_600_000)).padStart(2, '0');
  const mm = String(Math.floor((untilKickoff % 3_600_000) / 60_000)).padStart(2, '0');

  return (
    <div className="pitch-bg relative h-full w-full overflow-y-auto overflow-x-hidden scroll-thin font-editorial text-chalk">
      {/* ─────────────────────── Match-card header ─────────────────────── */}
      <header className="relative z-30 border-b border-chalk/15">
        <div className="mx-auto flex max-w-[1360px] items-stretch">
          {/* Mark */}
          <button
            onClick={() => go('landing')}
            className="flex items-center gap-3 border-r border-chalk/15 px-6 py-4"
          >
            <span className="stencil-num flex h-11 w-11 items-center justify-center bg-chalk text-[24px] leading-none text-pitch-950">
              26
            </span>
            <div className="text-left leading-none">
              <div className="font-stencil text-[22px] font-extrabold tracking-tight text-chalk">
                STRIKER<span className="text-corner"></span>
              </div>
              <div className="eyebrow mt-1">The Simulated Season</div>
            </div>
          </button>

          {/* Nav */}
          <nav className="hidden flex-1 items-stretch md:flex">
            {NAV.map((n) => (
              <button
                key={n.label}
                onMouseEnter={() => audio.hover()}
                onClick={() => go(n.screen)}
                className="group relative flex items-center gap-2 border-r border-chalk/15 px-6 text-[13px] font-semibold uppercase tracking-[0.16em] text-chalk-dim transition hover:text-chalk"
              >
                <span className="font-mono text-[10px] text-chalk-dim/60">
                  {String(NAV.indexOf(n) + 1).padStart(2, '0')}
                </span>
                {n.label}
                <span className="absolute inset-x-6 bottom-0 h-[2px] scale-x-0 bg-corner transition-transform duration-200 group-hover:scale-x-100" />
              </button>
            ))}
          </nav>

          {/* Kickoff clock */}
          <div className="ml-auto hidden items-center gap-3 border-l border-chalk/15 px-6 md:flex">
            <div className="text-right">
              <div className="eyebrow">Next kick-off</div>
              <div className="stencil-num text-[22px] text-chalk">
                {hh}:{mm}
              </div>
            </div>
            <button onClick={() => go('setup')} className="kick-btn">
              <span className="whistle">▶</span> Kick off
            </button>
          </div>
        </div>
      </header>

      {/* ─────────────────────── Hero ─────────────────────── */}
      <section className="relative">
        <div className="mx-auto grid max-w-[1360px] grid-cols-1 gap-0 lg:grid-cols-[1.15fr_1fr]">
          {/* Left column */}
          <div className="relative border-b border-chalk/15 px-6 py-14 lg:border-b-0 lg:border-r lg:px-10 lg:py-20">
            <div className="flex items-center gap-3">
              <span className="eyebrow">Season 25/26</span>
              <span className="chalk-rule flex-1 max-w-[80px]" />
              <span className="eyebrow">Matchday 01</span>
            </div>

            <h1 className="mt-6 font-stencil text-[clamp(3.4rem,9vw,7.4rem)] font-extrabold uppercase leading-[0.86] tracking-[-0.01em] text-chalk">
              Play the
              <br />
              game as
              <br />
              <span className="text-corner">it's played.</span>
            </h1>

            <p className="mt-8 max-w-[48ch] font-editorial text-[17px] leading-[1.55] text-chalk-dim">
              Not a menu of moments. A full ninety, with{' '}
              <span className="text-chalk">offside judged at the moment the ball leaves the foot</span>,
              a keeper that dives with something to lose, and a bench that watches. Every match, all
              22 agents, real physics — headless if you want, on the pitch when you don't.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <button onClick={() => go('squad')} className="kick-btn">
                <span className="whistle">▶</span> Kick off
              </button>
              <button onClick={() => go('squad')} className="ghost-btn">
                Assemble XI
              </button>
              <button onClick={() => go('about')} className="ghost-btn">
                How it plays
              </button>
            </div>

            {/* Broadcast fact strip — monospaced, tabular, not glowing cards. */}
            <div className="mt-14 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-chalk/15 pt-6 sm:grid-cols-4">
              {[
                ['Leagues', LEAGUES.length, 'across Europe'],
                ['Clubs', ALL_TEAMS.length, 'with real kits'],
                ['Players', ALL_PLAYERS.length, 'named, rated'],
                ['Grounds', STADIUMS.length, 'procedurally built'],
              ].map(([label, value, sub]) => (
                <div key={label as string}>
                  <div className="eyebrow">{label}</div>
                  <div className="stencil-num mt-1 text-[38px] leading-none text-chalk">
                    {value}
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-chalk-dim/70">
                    {sub}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column — tactics board */}
          <div className="relative flex flex-col">
            <div className="flex items-center justify-between border-b border-chalk/15 px-6 py-3">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-corner" />
                <span className="eyebrow">Home team · today's shape</span>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-chalk-dim/70">
                4-3-3 · high line
              </span>
            </div>
            <div className="relative flex-1 p-6 lg:p-8">
              <div className="mx-auto h-full max-h-[640px] w-full max-w-[440px]">
                <TacticsBoard />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-chalk/15 px-6 py-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-chalk-dim/70">
                Sequence: CB · CM · RW · ST
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-chalk-dim/70">
                pass · pass · finish
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────── Team sheet strip ─────────────────────── */}
      <section className="relative border-y border-chalk/15 bg-pitch-900/50">
        <div className="mx-auto flex max-w-[1360px] items-center gap-4 px-6 py-5">
          <span className="eyebrow shrink-0">Featured XI selectors</span>
          <span className="chalk-rule hidden flex-1 sm:block" />
          <div className="scroll-thin flex flex-1 items-stretch gap-0 overflow-x-auto sm:flex-none">
            {topClubs.map((t) => (
              <button
                key={t.id}
                onClick={() => go('squad')}
                className="group flex shrink-0 items-center gap-3 border-l border-chalk/10 px-4 py-1 first:border-l-0"
                title={t.name}
              >
                {/* Kit color bar — the club's identity, not a glow. */}
                <span
                  className="h-9 w-1"
                  style={{ background: t.primaryColor }}
                  aria-hidden
                />
                <TeamCrest team={t} size={22} />
                <div className="text-left leading-tight">
                  <div className="font-stencil text-[13px] font-bold uppercase text-chalk transition group-hover:text-corner">
                    {t.shortName}
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-chalk-dim/70">
                    OVR {t.rating}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────── Numbered phases (team-sheet style) ─────────────────────── */}
      <section className="mx-auto max-w-[1360px] px-6 py-20 lg:py-28">
        <div className="flex items-baseline gap-4">
          <span className="eyebrow">The flow of a session</span>
          <span className="chalk-rule flex-1 max-w-[280px]" />
        </div>
        <h2 className="mt-4 max-w-[22ch] font-stencil text-[clamp(2.4rem,5vw,4rem)] font-extrabold uppercase leading-[0.92] text-chalk">
          Three phases. Then whistle.
        </h2>

        <ol className="mt-14 divide-y divide-chalk/15 border-y border-chalk/15">
          {PHASES.map((p) => (
            <li
              key={p.n}
              className="group grid grid-cols-[auto_1fr] items-start gap-6 py-10 sm:grid-cols-[110px_1fr_1.4fr_auto] sm:gap-10"
            >
              <span className="stencil-num text-[64px] leading-none text-chalk-dim/70 transition group-hover:text-corner sm:text-[88px]">
                {p.n}
              </span>
              <div className="col-span-1 sm:col-span-1">
                <div className="font-stencil text-[26px] font-extrabold uppercase text-chalk sm:text-[32px]">
                  {p.title}
                </div>
                <div className="mt-1 font-editorial text-[15px] italic text-chalk-dim">
                  {p.lede}
                </div>
              </div>
              <p className="col-span-2 font-editorial text-[15px] leading-[1.6] text-chalk-dim sm:col-span-1">
                {p.body}
              </p>
              <div className="col-span-2 self-center sm:col-span-1 sm:justify-self-end">
                <span className="font-mono text-[11px] uppercase tracking-widest text-chalk-dim/70">
                  {p.figure}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ─────────────────────── Live-style ticker ─────────────────────── */}
      <section className="relative border-y border-chalk/15 bg-pitch-950">
        <div className="mx-auto flex max-w-[1360px] items-center gap-4 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-corner opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-corner" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-corner">
              Live · headless sim
            </span>
          </div>
          <span className="chalk-rule-v h-6" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-chalk-dim/80">
            MCI vs RMA · Etihad
          </span>
          <div className="ml-auto font-mono text-[11px] text-chalk-dim">
            89:14
          </div>
        </div>
        <div className="border-t border-chalk/10">
          <TickerRow />
        </div>
      </section>

      {/* ─────────────────────── Closing — kick-off ─────────────────────── */}
      <section className="mx-auto max-w-[1360px] px-6 py-20 lg:py-28">
        <div className="relative overflow-hidden border border-chalk/20 bg-pitch-900/40">
          {/* Center-circle chalk mark. */}
          <svg
            className="pointer-events-none absolute -right-16 -top-16 h-[360px] w-[360px] opacity-30"
            viewBox="0 0 200 200"
          >
            <circle
              cx="100"
              cy="100"
              r="88"
              fill="none"
              stroke="#F2EFE4"
              strokeWidth="0.6"
              strokeDasharray="4 6"
            />
            <circle cx="100" cy="100" r="2" fill="#F2EFE4" />
            <line x1="100" y1="12" x2="100" y2="188" stroke="#F2EFE4" strokeWidth="0.6" />
          </svg>

          <div className="relative grid gap-12 p-10 lg:grid-cols-[1.4fr_1fr] lg:p-16">
            <div>
              <span className="eyebrow">89:59 · added time</span>
              <h2 className="mt-3 font-stencil text-[clamp(2.4rem,5.5vw,4.6rem)] font-extrabold uppercase leading-[0.92] text-chalk">
                One whistle
                <br />
                and you're <span className="text-corner">in.</span>
              </h2>
              <p className="mt-6 max-w-[48ch] font-editorial text-[16px] leading-[1.6] text-chalk-dim">
                Pick a club. Drag your eleven. Choose the opposition, the weather, the difficulty.
                Kick off. The rest is on you and the sim.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <button onClick={() => go('squad')} className="kick-btn">
                  <span className="whistle">▶</span> Kick off
                </button>
                <button onClick={() => go('about')} className="ghost-btn">
                  Read the rules
                </button>
              </div>
            </div>

            {/* Team sheet block — right-side. */}
            <div className="border-l border-chalk/15 pl-10">
              <div className="eyebrow">Today's team sheet</div>
              <ul className="mt-4 divide-y divide-chalk/10 font-mono text-[12px]">
                {XI.slice(0, 8).map((p) => (
                  <li key={p.n} className="flex items-center justify-between py-2">
                    <span className="flex items-center gap-3">
                      <span className="stencil-num w-6 text-right text-chalk">{p.n}</span>
                      <span className="text-chalk-dim">{p.label}</span>
                    </span>
                    <span className="text-chalk-dim/70">
                      {p.label === 'GK' ? 'starting' : p.n < 6 ? 'back four' : 'midfield / attack'}
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between py-2">
                  <span className="flex items-center gap-3">
                    <span className="stencil-num w-6 text-right text-corner">+3</span>
                    <span className="text-chalk-dim">FWD · bench</span>
                  </span>
                  <span className="text-chalk-dim/70">on the whistle</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────── Footer ─────────────────────── */}
      <footer className="border-t border-chalk/15">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 px-6 py-6 font-mono text-[10px] uppercase tracking-[0.2em] text-chalk-dim/60">
          <span>STRIKER · React + TypeScript + Canvas</span>
          <span>A football simulation</span>
          <span>v0.1</span>
        </div>
      </footer>
    </div>
  );
}
