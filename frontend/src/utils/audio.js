/**
 * The Bindery — Craftsman Audio Synthesizer (Web Audio API)
 * 
 * Features:
 * - Very short, soft physical paper "thunk" and "snap" sounds
 * - OFF by default, persisted in localStorage ('bindery_audio_enabled')
 * - AudioContext created lazily after first user gesture only; NEVER autoplays
 */

import { motionBus } from './motion.js';

const STORAGE_KEY = 'bindery_audio_enabled';

class BinderyAudioController {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.hasUserInteracted = false;

    if (typeof window !== 'undefined') {
      try {
        this.enabled = localStorage.getItem(STORAGE_KEY) === 'true';
      } catch (e) {
        this.enabled = false;
      }

      // Preload lazily after first user gesture only
      const onFirstGesture = () => {
        this.hasUserInteracted = true;
        window.removeEventListener('pointerdown', onFirstGesture);
        window.removeEventListener('keydown', onFirstGesture);
      };
      window.addEventListener('pointerdown', onFirstGesture, { passive: true });
      window.addEventListener('keydown', onFirstGesture, { passive: true });

      // Listen to audio events on the bus
      motionBus.on('audio:play', (type) => {
        if (type === 'thunk') this.playThunk();
        else if (type === 'snap') this.playSnap();
      });
    }
  }

  ensureContext() {
    if (!this.ctx && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  isEnabled() {
    return this.enabled;
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  setEnabled(val) {
    this.enabled = !!val;
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? 'true' : 'false');
    } catch (e) {}

    if (this.enabled) {
      this.ensureContext();
      this.playSnap(); // Confirmation snap
    }
    motionBus.emit('audio:state', this.enabled);
  }

  /**
   * Soft paper "thunk" (stamp thump, folio drop onto workbench)
   * Pitch: 120Hz -> 45Hz exponential drop with lowpass filter at 260Hz, 70ms decay
   */
  playThunk() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(260, now);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(115, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.07);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.085);
    } catch (e) {
      console.warn('[Audio] Failed to play thunk:', e);
    }
  }

  /**
   * Crisp paper "snap" (creasing a sheet, cutting, toggling)
   * Resonant bandpass filter burst over 35ms
   */
  playSnap() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // White noise buffer
      const bufferSize = Math.floor(ctx.sampleRate * 0.035);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1600, now);
      filter.Q.setValueAtTime(2.2, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.04);
    } catch (e) {
      console.warn('[Audio] Failed to play snap:', e);
    }
  }
}

export const binderyAudio = new BinderyAudioController();
export default binderyAudio;
