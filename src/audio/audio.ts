/**
 * All match and menu audio is synthesised with the Web Audio API, so the game
 * ships with no binary assets and nothing to load over the network.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private crowdGain: GainNode | null = null;
  private crowdSource: AudioBufferSourceNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;

  masterVolume = 0.7;
  musicVolume = 0.35;
  sfxVolume = 0.8;
  crowdVolume = 0.5;
  enabled = true;

  /** Must be called from a user gesture, or the context stays suspended. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? this.masterVolume : 0;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.master);

    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0;
    this.crowdGain.connect(this.master);

    // Two seconds of white noise, reused for crowd, cheers and ball strikes.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? this.masterVolume : 0, this.ctx.currentTime, 0.05);
    }
  }

  setVolumes(v: { master?: number; music?: number; sfx?: number; crowd?: number }) {
    if (v.master !== undefined) this.masterVolume = v.master;
    if (v.music !== undefined) this.musicVolume = v.music;
    if (v.sfx !== undefined) this.sfxVolume = v.sfx;
    if (v.crowd !== undefined) this.crowdVolume = v.crowd;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master?.gain.setTargetAtTime(this.enabled ? this.masterVolume : 0, t, 0.05);
    this.musicGain?.gain.setTargetAtTime(this.musicVolume, t, 0.05);
    this.sfxGain?.gain.setTargetAtTime(this.sfxVolume, t, 0.05);
  }

  /* ---------------------------------------------------------------- */
  /* Crowd ambience                                                     */
  /* ---------------------------------------------------------------- */

  startCrowd() {
    if (!this.ctx || !this.noiseBuffer || !this.crowdGain || this.crowdSource) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    // Band-limited noise reads as a distant murmur.
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 780;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 140;

    src.connect(hp);
    hp.connect(lp);
    lp.connect(this.crowdGain);
    src.start();
    this.crowdSource = src;
    this.crowdGain.gain.setTargetAtTime(this.crowdVolume * 0.35, this.ctx.currentTime, 1.2);
  }

  stopCrowd() {
    if (!this.ctx || !this.crowdSource || !this.crowdGain) return;
    this.crowdGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    const src = this.crowdSource;
    this.crowdSource = null;
    setTimeout(() => {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }, 900);
  }

  /** `intensity` 0..1 — swells the ambience with the flow of the match. */
  setCrowdIntensity(intensity: number) {
    if (!this.ctx || !this.crowdGain) return;
    const target = this.crowdVolume * (0.22 + intensity * 0.6);
    this.crowdGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.5);
  }

  /* ---------------------------------------------------------------- */
  /* One-shots                                                          */
  /* ---------------------------------------------------------------- */

  private noiseBurst(duration: number, freq: number, q: number, peak: number, type: BiquadFilterType = 'bandpass') {
    if (!this.ctx || !this.noiseBuffer || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  private tone(freq: number, duration: number, peak: number, type: OscillatorType = 'sine', slideTo?: number) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  kick() {
    this.noiseBurst(0.09, 2400, 1.2, 0.28);
    this.tone(180, 0.1, 0.2, 'triangle', 90);
  }

  whistle(long = false) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const dur = long ? 0.85 : 0.34;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2050, t);
    // Trill: a referee's pea whistle warbles.
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 28;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 130;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
    gain.gain.setValueAtTime(0.3, t + dur * 0.75);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  /** Roar plus a bright stinger. */
  goal() {
    if (!this.ctx || !this.crowdGain) return;
    this.noiseBurst(2.6, 620, 0.6, 0.55, 'lowpass');
    this.crowdGain.gain.setTargetAtTime(this.crowdVolume * 1.15, this.ctx.currentTime, 0.15);
    this.crowdGain.gain.setTargetAtTime(this.crowdVolume * 0.4, this.ctx.currentTime + 3.4, 1.4);
    // Rising fifth stinger.
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.45, 0.16, 'sawtooth'), i * 85));
  }

  /** A groan when a chance goes begging. */
  nearMiss() {
    this.noiseBurst(1.1, 320, 0.7, 0.3, 'lowpass');
  }

  save() {
    this.noiseBurst(0.7, 480, 0.8, 0.25, 'lowpass');
  }

  click() {
    this.tone(880, 0.05, 0.09, 'square');
  }

  hover() {
    this.tone(1320, 0.03, 0.035, 'sine');
  }

  confirm() {
    this.tone(660, 0.09, 0.11, 'triangle');
    setTimeout(() => this.tone(990, 0.12, 0.1, 'triangle'), 70);
  }

  /* ---------------------------------------------------------------- */
  /* Menu music                                                         */
  /* ---------------------------------------------------------------- */

  startMusic() {
    if (!this.ctx || !this.musicGain || this.musicTimer !== null) return;
    // Four-bar loop over a moody i–VI–III–VII progression.
    const roots = [110, 146.83, 130.81, 98];
    const stepMs = 460;
    this.musicStep = 0;
    const play = () => {
      if (!this.ctx || !this.musicGain) return;
      const bar = Math.floor(this.musicStep / 4) % roots.length;
      const beat = this.musicStep % 4;
      const root = roots[bar];
      const t = this.ctx.currentTime;

      const voice = (freq: number, dur: number, peak: number, type: OscillatorType) => {
        const osc = this.ctx!.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        const g = this.ctx!.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const filter = this.ctx!.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1800;
        osc.connect(filter);
        filter.connect(g);
        g.connect(this.musicGain!);
        osc.start(t);
        osc.stop(t + dur + 0.03);
      };

      voice(root / 2, 0.5, 0.16, 'triangle');
      if (beat === 0) voice(root * 2, 0.9, 0.06, 'sawtooth');
      if (beat === 2) voice(root * 3, 0.6, 0.05, 'sawtooth');
      // Hi-hat.
      this.noiseBurstMusic(beat % 2 === 1 ? 0.05 : 0.03);

      this.musicStep++;
    };
    play();
    this.musicTimer = window.setInterval(play, stepMs);
  }

  private noiseBurstMusic(peak: number) {
    if (!this.ctx || !this.noiseBuffer || !this.musicGain) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.musicGain);
    src.start(t);
    src.stop(t + 0.1);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

export const audio = new AudioEngine();
