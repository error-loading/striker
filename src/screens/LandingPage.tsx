import { useEffect, useState } from 'react';
import { audio } from '../audio/audio';
import AttractBackground from '../components/AttractBackground';
import { TeamCrest } from '../components/TeamCrest';
import { ALL_PLAYERS, ALL_TEAMS, LEAGUES } from '../data/leagues';
import { STADIUMS } from '../data/stadiums';
import { useGame, type Screen } from '../store/gameStore';

const NAV: { label: string; screen: Screen }[] = [
  { label: 'Home', screen: 'landing' },
  { label: 'Squad', screen: 'squad' },
  { label: 'Settings', screen: 'settings' },
  { label: 'About', screen: 'about' },
];

const FEATURES = [
  {
    icon: '⚽',
    title: 'True-to-life physics',
    body: 'Spin-aware ball flight with Magnus curve, bounce, and surface friction that shifts with the weather.',
  },
  {
    icon: '🧠',
    title: 'Adaptive opposition',
    body: 'Five difficulty tiers rewrite AI pressing, reaction time and passing accuracy — Legendary punishes every loose touch.',
  },
  {
    icon: '🏟️',
    title: 'Matchday atmosphere',
    body: '23 venues with club-coloured stands, a crowd that swells with momentum, and floodlights for night fixtures.',
  },
  {
    icon: '🎛️',
    title: 'Controls that fit you',
    body: 'Pro or Arcade schemes, every key rebindable, full gamepad support and on-screen controls on touch devices.',
  },
];

const TESTIMONIALS = [
  {
    quote: 'The offside line and the referee actually holding players to account — it feels like a broadcast, not a toy.',
    name: 'Marcus Bell',
    role: 'Football Gaming Weekly',
    rating: 5,
  },
  {
    quote: 'Chemistry scoring in the squad builder makes picking an XI a genuine puzzle. I lost an evening to it.',
    name: 'Priya Raman',
    role: 'The Touchline Podcast',
    rating: 5,
  },
  {
    quote: 'Legendary difficulty is merciless in the best way. The AI presses in numbers and punishes a slack pass.',
    name: 'Toni Okafor',
    role: 'Sim Sports Review',
    rating: 4,
  },
];

export default function LandingPage() {
  const setScreen = useGame((s) => s.setScreen);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    audio.startMusic();
    return () => audio.stopMusic();
  }, []);

  const go = (screen: Screen) => {
    audio.init();
    audio.confirm();
    setScreen(screen);
  };

  return (
    <div
      className="grid-bg relative h-full w-full overflow-y-auto overflow-x-hidden scroll-thin"
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 40)}
    >
      <AttractBackground opacity={0.55} />

      {/* Navigation */}
      <header
        className={`sticky top-0 z-30 transition-all duration-300 ${
          scrolled ? 'border-b border-white/10 bg-navy-950/85 backdrop-blur-xl' : ''
        }`}
      >
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <button onClick={() => go('landing')} className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan to-cyan/50 font-display text-lg font-black text-navy-950 shadow-glow">
              26
            </span>
            <span className="heading text-xl leading-none">
              FIFA<span className="text-cyan"> 26</span>
            </span>
          </button>
          <div className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <button
                key={n.label}
                onMouseEnter={() => audio.hover()}
                onClick={() => go(n.screen)}
                className="rounded-lg px-4 py-2 text-[13px] font-semibold uppercase tracking-widest text-white/60 transition hover:bg-white/5 hover:text-cyan"
              >
                {n.label}
              </button>
            ))}
          </div>
          <button onClick={() => go('squad')} className="btn-primary !px-5 !py-2.5 !text-xs">
            Play Now
          </button>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto flex min-h-[86vh] max-w-7xl flex-col justify-center px-6 py-16">
        <div className="max-w-3xl">
          <div className="animate-fadeUp chip !border-cyan/30 !bg-cyan/10 !text-cyan inline-block">
            Season 2025/26 · 5 Leagues · {ALL_TEAMS.length} Clubs
          </div>
          <h1
            className="heading mt-6 animate-fadeUp text-[clamp(2.75rem,8vw,6.5rem)] leading-[0.88]"
            style={{ animationDelay: '80ms' }}
          >
            The Beautiful
            <br />
            Game <span className="text-glow text-cyan">Redefined</span>
          </h1>
          <p
            className="mt-6 max-w-xl animate-fadeUp text-base leading-relaxed text-white/60 sm:text-lg"
            style={{ animationDelay: '160ms' }}
          >
            Build your XI from {ALL_PLAYERS.length} real players, pick your shape, then take them out
            under the floodlights. Every pass, tackle and finish is simulated — offsides, cards and all.
          </p>

          <div className="mt-10 flex animate-fadeUp flex-wrap gap-3" style={{ animationDelay: '240ms' }}>
            <button onClick={() => go('squad')} className="btn-primary">
              ▶ Start Game
            </button>
            <button onClick={() => go('squad')} className="btn-gold">
              Squad Builder
            </button>
            <button onClick={() => go('settings')} className="btn-ghost">
              Settings
            </button>
          </div>

          <dl
            className="mt-14 grid max-w-2xl animate-fadeUp grid-cols-2 gap-6 sm:grid-cols-4"
            style={{ animationDelay: '320ms' }}
          >
            {[
              ['Leagues', LEAGUES.length],
              ['Clubs', ALL_TEAMS.length],
              ['Players', ALL_PLAYERS.length],
              ['Stadiums', STADIUMS.length],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="label">{label}</dt>
                <dd className="font-display text-3xl font-extrabold text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Featured clubs marquee */}
      <section className="relative z-10 border-y border-white/[0.07] bg-navy-950/60 py-6 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-4 px-6">
          {ALL_TEAMS.filter((t) => t.rating >= 84).slice(0, 12).map((t) => (
            <div key={t.id} className="flex items-center gap-2 opacity-60 transition hover:opacity-100">
              <TeamCrest team={t} size={26} />
              <span className="text-[11px] font-bold uppercase tracking-widest text-white/70">
                {t.shortName}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="label">What's inside</div>
        <h2 className="heading mt-3 text-4xl sm:text-5xl">
          Built like the <span className="text-gold">real thing</span>
        </h2>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <article key={f.title} className="glass card-hover rounded-2xl p-6">
              <div className="text-3xl">{f.icon}</div>
              <h3 className="mt-4 font-display text-lg font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="label">The verdict</div>
        <h2 className="heading mt-3 text-4xl sm:text-5xl">Press reaction</h2>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="glass card-hover flex flex-col rounded-2xl p-7">
              <div className="text-gold" aria-label={`${t.rating} out of 5`}>
                {'★'.repeat(t.rating)}
                <span className="text-white/20">{'★'.repeat(5 - t.rating)}</span>
              </div>
              <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-white/75">
                “{t.quote}”
              </blockquote>
              <figcaption className="mt-6 border-t border-white/10 pt-4">
                <div className="text-sm font-bold">{t.name}</div>
                <div className="text-xs text-white/40">{t.role}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Closing call to action */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="glass-strong relative overflow-hidden rounded-3xl px-8 py-16 text-center">
          <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-cyan/20 blur-[100px]" />
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-gold/15 blur-[100px]" />
          <h2 className="heading relative text-4xl sm:text-5xl">Kick off in under a minute</h2>
          <p className="relative mx-auto mt-4 max-w-lg text-white/55">
            Pick a club, drag your XI into shape, choose the opposition and the conditions. Then play.
          </p>
          <div className="relative mt-9 flex flex-wrap justify-center gap-3">
            <button onClick={() => go('squad')} className="btn-primary">
              ▶ Start Game
            </button>
            <button onClick={() => go('about')} className="btn-ghost">
              How to play
            </button>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.07] py-8 text-center text-xs text-white/30">
        FIFA 26 — a football simulation built with React, TypeScript and Canvas. Not affiliated with EA
        Sports or FIFA.
      </footer>
    </div>
  );
}
