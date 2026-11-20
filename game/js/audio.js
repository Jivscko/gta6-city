// Every sound in the game is made with the Web Audio API: no audio files, no fetches. Synth engines
// for the car, a two-tone siren, guns, impacts, pickups, the city's ambience and a slow synthwave
// loop that comes in when the player drives. The context only starts after a click or key press.

import { AUDIO } from './config.js';

/** A short noise burst buffer, reused by gunshots, impacts and the sea. */
function makeNoise(ctx, seconds = 1.2) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    const white = Math.random() * 2 - 1;
    last = 0.98 * last + 0.02 * white;
    data[i] = white * 0.7 + last * 2.2;
  }
  return buffer;
}

/** A minor-key bed for the music: A minor pentatonic over an A minor / F major / C major / G loop. */
const BASS_LINE = [55, 55, 43.65, 43.65, 65.41, 65.41, 49, 49];
const ARP_STEPS = [0, 7, 12, 7, 3, 10, 12, 15, 0, 7, 12, 19, 3, 10, 15, 12];

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ready = false;
    this.engine = null;
    this.siren = null;
    this.started = false;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.musicOn = false;
    this.ambience = null;
  }

  /** Called on the first user gesture; browsers refuse audio before one. */
  init() {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
    } catch {
      return;
    }
    this.started = true;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : AUDIO.master;
    this.master.connect(this.ctx.destination);
    this.noise = makeNoise(this.ctx, 1.4);
    this._startAmbience();
    this.ready = true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : AUDIO.master, this.ctx.currentTime, 0.08);
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** A filtered-noise wash and a low drone: the city breathing under everything else. */
  _startAmbience() {
    const ctx = this.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noise;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = AUDIO.ambience;
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start();

    const padGain = ctx.createGain();
    padGain.gain.value = 0.035;
    padGain.connect(this.master);
    for (const freq of [110, 164.81, 220]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + Math.random() * 0.05;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 1.6;
      lfo.connect(lfoGain).connect(osc.frequency);
      osc.connect(padGain);
      osc.start();
      lfo.start();
    }
    this.ambience = gain;
  }

  /** One plucked note for the driving music. */
  _pluck(freq, when, gainValue = 0.05, type = 'triangle') {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(gainValue, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(when);
    osc.stop(when + 0.3);
  }

  /**
   * Advance the music sequencer. `intensity` 1 while driving, 0.5 on foot, 0 in menus; the loop turns
   * itself down instead of stopping so the groove never jumps.
   */
  updateMusic(dt, intensity) {
    if (!this.ready) return;
    this.musicTarget = intensity;
    this.musicOn = intensity > 0.01;
    if (!this.musicOn) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    const step = this.musicStep % 16;
    const when = this.ctx.currentTime + 0.05;
    const root = BASS_LINE[Math.floor(this.musicStep / 2) % BASS_LINE.length];
    if (step % 8 === 0) this._pluck(root, when, 0.06 * intensity, 'sawtooth');
    this._pluck(root * Math.pow(2, ARP_STEPS[step] / 12), when, 0.032 * intensity);
    if (step % 4 === 2) this._pluck(root * 4, when, 0.02 * intensity, 'square');
    this.musicStep += 1;
    this.musicTimer = 0.125;
  }

  /** Engine tone, called each frame with the car's speed in world units/second. */
  updateEngine(speed, active) {
    if (!this.ready) return;
    if (!this.engine) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 70;
      const sub = ctx.createOscillator();
      sub.type = 'square';
      sub.frequency.value = 35;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 520;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain).connect(this.master);
      osc.start();
      sub.start();
      this.engine = { osc, sub, filter, gain };
    }
    const e = this.engine;
    const target = active ? AUDIO.engine : 0;
    e.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    if (active) {
      const rev = 60 + Math.min(220, speed * 0.55);
      e.osc.frequency.setTargetAtTime(rev, this.ctx.currentTime, 0.06);
      e.sub.frequency.setTargetAtTime(rev * 0.5, this.ctx.currentTime, 0.06);
      e.filter.frequency.setTargetAtTime(400 + Math.min(900, speed * 2.2), this.ctx.currentTime, 0.1);
    }
  }

  /** Police siren: two alternating tones, on while a pursuit is active and near. */
  setSiren(active) {
    if (!this.ready) return;
    if (!this.siren) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 700;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 1.6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain).connect(osc.frequency);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(this.master);
      osc.start();
      lfo.start();
      this.siren = { osc, lfo, gain };
    }
    this.siren.gain.gain.setTargetAtTime(active ? AUDIO.siren : 0, this.ctx.currentTime, 0.2);
    this.siren.lfo.frequency.value = 1.6;
  }

  _burst({ duration = 0.12, gain = 0.3, filter = 1800, type = 'lowpass', rate = 1 }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const biquad = ctx.createBiquadFilter();
    biquad.type = type;
    biquad.frequency.value = filter;
    const env = ctx.createGain();
    const t = ctx.currentTime;
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(biquad).connect(env).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration + 0.02);
  }

  _tone(freq, duration = 0.16, gain = 0.12, type = 'sine', slideTo = null) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  gunshot(kind = 'pistol') {
    this._burst({ duration: kind === 'smg' ? 0.08 : 0.16, gain: kind === 'smg' ? 0.24 : 0.34, filter: 2600, rate: 1.4 });
    this._tone(kind === 'smg' ? 190 : 130, 0.12, 0.16, 'square', 55);
  }

  punch() {
    this._burst({ duration: 0.09, gain: 0.22, filter: 700 });
    this._tone(90, 0.09, 0.1, 'sine', 50);
  }

  impact(strength = 1) {
    this._burst({ duration: 0.18 + strength * 0.12, gain: Math.min(0.4, 0.14 + strength * 0.2), filter: 1200, rate: 0.8 });
    this._tone(70, 0.16, 0.1 * strength, 'square', 40);
  }

  explosion() {
    this._burst({ duration: 0.7, gain: 0.5, filter: 900, rate: 0.5 });
    this._tone(60, 0.6, 0.22, 'sawtooth', 24);
  }

  pickup(kind = 'cash') {
    if (kind === 'cash') {
      this._tone(880, 0.07, 0.09, 'triangle');
      setTimeout(() => this._tone(1320, 0.1, 0.08, 'triangle'), 60);
    } else {
      this._tone(620, 0.1, 0.1, 'sine', 940);
    }
  }

  ui() {
    this._tone(520, 0.05, 0.06, 'square', 700);
  }

  horn() {
    this._tone(330, 0.35, 0.09, 'square');
    this._tone(415, 0.35, 0.07, 'square');
  }

  skid() {
    this._burst({ duration: 0.25, gain: 0.09, filter: 3000, type: 'highpass' });
  }

  footstep() {
    this._burst({ duration: 0.05, gain: 0.035, filter: 500 });
  }

  hitMarker() {
    this._tone(1200, 0.04, 0.05, 'square');
  }

  wasted() {
    this._tone(220, 0.8, 0.14, 'sawtooth', 55);
  }

  missionComplete() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => setTimeout(() => this._tone(freq, 0.28, 0.1, 'triangle'), i * 110));
  }

  tick() {
    this._tone(1400, 0.025, 0.045, 'square');
  }
}
