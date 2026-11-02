// src/utils/soundEffects.ts

class SoundEffectsManager {
  private ctx: AudioContext | null = null;
  private ringInterval: number | null = null;

  private ensureContext() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  private playTone(freq1: number, freq2: number, durationMs: number, volume = 0.12) {
    try {
      this.ensureContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.setValueAtTime(freq1, now);
      osc2.frequency.setValueAtTime(freq2, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + durationMs / 1000);
      osc2.stop(now + durationMs / 1000);
    } catch {}
  }

  // WhatsApp-style Outgoing Ringback ("Duuu... Duuu...")
  startOutgoingRing() {
    this.stopRing();
    const pulse = () => this.playTone(425, 450, 900, 0.08);
    pulse();
    this.ringInterval = window.setInterval(pulse, 2600);
  }

  // WhatsApp-style Incoming Marimba-like Double Chime
  startIncomingRing() {
    this.stopRing();
    const chime = () => {
      this.playTone(587.33, 880, 220, 0.14); // D5 + A5
      setTimeout(() => this.playTone(659.25, 987.77, 220, 0.14), 260); // E5 + B5
      setTimeout(() => this.playTone(783.99, 1174.66, 350, 0.14), 520); // G5 + D6
    };
    chime();
    this.ringInterval = window.setInterval(chime, 2000);
  }

  stopRing() {
    if (this.ringInterval !== null) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }

  // Subtle pop when a peer joins the call
  playConnectedBeep() {
    this.stopRing();
    this.playTone(523.25, 659.25, 160, 0.1);
  }

  // Descending tone when call ends
  playCallEndBeep() {
    this.stopRing();
    this.playTone(440, 330, 280, 0.1);
  }
}

export const CallSounds = new SoundEffectsManager();