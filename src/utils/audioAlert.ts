// Web Audio API chime generator for trade alerts (Zero external audio file dependency)
class AudioAlertService {
  private audioCtx: AudioContext | null = null;

  private initCtx() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
  }

  public playTpHitAlert() {
    try {
      this.initCtx();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      // Celebratory ascending chime: C6 -> E6 -> G6
      const freqs = [1046.5, 1318.51, 1567.98];
      freqs.forEach((freq, idx) => {
        const osc = this.audioCtx!.createOscillator();
        const gain = this.audioCtx!.createGain();
        const startTime = now + idx * 0.09;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.25, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.3);

        osc.connect(gain);
        gain.connect(this.audioCtx!.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.32);
      });
    } catch {
      // Audio context might be restricted before user gesture
    }
  }

  public playSlHitAlert() {
    try {
      this.initCtx();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      // Descending warning tone for SL hit
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now); // A4
      osc.frequency.exponentialRampToValueAtTime(261.63, now + 0.3); // C4

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.36);
    } catch {
      // Audio context might be blocked
    }
  }

  public playApiDisconnectAlert() {
    try {
      this.initCtx();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      // Staccato dual beep for API connectivity alert
      [0, 0.16].forEach((offset) => {
        const osc = this.audioCtx!.createOscillator();
        const gain = this.audioCtx!.createGain();
        const startTime = now + offset;

        osc.type = 'square';
        osc.frequency.setValueAtTime(329.63, startTime); // E4

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.12);

        osc.connect(gain);
        gain.connect(this.audioCtx!.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.13);
      });
    } catch {
      // Ignore
    }
  }

  public playTriggerWarningAlert() {
    this.playApproachingAlert();
  }

  public playApproachingAlert() {
    try {
      this.initCtx();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.36);
    } catch {
      // Audio context might be restricted before user gesture
    }
  }

  public playTriggeredAlert() {
    try {
      this.initCtx();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(1318.5, now + 0.12); // E6
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.25); // A6

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.46);
    } catch {
      // Audio context might be blocked
    }
  }

  public requestNotificationPermission(): Promise<boolean> {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.requestPermission().then((permission) => permission === 'granted');
    }
    return Promise.resolve(false);
  }

  public sendPushNotification(title: string, body: string) {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
        });
      } catch {
        // Ignore notification errors in iframe
      }
    }
  }
}

export const alertService = new AudioAlertService();
