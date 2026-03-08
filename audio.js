export class AudioFx {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Master gain
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.ctx.destination);

        // BGM gain (slightly lower than SFX to balance)
        this.bgmGain = this.ctx.createGain();
        this.bgmGain.gain.value = 0.3;
        this.bgmGain.connect(this.masterGain);

        // SFX gain (slightly higher to punch through)
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.6;
        this.sfxGain.connect(this.masterGain);

        this.isPlayingBGM = false;
        this.bgmTimerId = null;
        this.beatIndex = 0;

        // Tempo in BPM, convert to interval in MS
        this.bpm = 150;
        this.stepTimeMs = (60 / this.bpm) * 1000 / 4; // 16th notes

        // Korobeiniki (Tetris Theme A) 
        // 16th note resolution. 0 = rest.
        // E5 B4 C5 D5 C5 B4 A4 A4 C5 E5 D5 C5 B4 B4 C5 D5 E5 C5 A4 A4 
        // Note frequencies: E5: 659.25, B4: 493.88, C5: 523.25, D5: 587.33, A4: 440.00
        const E5 = 659.25;
        const B4 = 493.88;
        const C5 = 523.25;
        const D5 = 587.33;
        const A4 = 440.00;
        const G4 = 391.99;
        const F5 = 698.46;

        this.melodySeq = [
            // E5 B4 C5 D5 C5 B4
            E5, 0, 0, 0, B4, 0, C5, 0, D5, 0, 0, 0, C5, 0, B4, 0,
            // A4 A4 C5 E5 D5 C5
            A4, 0, 0, 0, A4, 0, C5, 0, E5, 0, 0, 0, D5, 0, C5, 0,
            // B4 B4 C5 D5 E5 C5 A4 A4
            B4, 0, 0, 0, B4, 0, C5, 0, D5, 0, 0, 0, E5, 0, 0, 0,
            C5, 0, 0, 0, A4, 0, 0, 0, A4, 0, 0, 0, 0, 0, 0, 0,

            // D5 F5 A5 G5 F5
            D5, 0, 0, 0, F5, 0, 0, 0, A4 * 2, 0, 0, 0, G4 * 2, 0, F5, 0,
            // E5 C5 E5 D5 C5
            E5, 0, 0, 0, C5, 0, 0, 0, E5, 0, 0, 0, D5, 0, C5, 0,
            // B4 B4 C5 D5 E5 C5 A4 A4
            B4, 0, 0, 0, B4, 0, C5, 0, D5, 0, 0, 0, E5, 0, 0, 0,
            C5, 0, 0, 0, A4, 0, 0, 0, A4, 0, 0, 0, 0, 0, 0, 0
        ];
    }

    // Resume playing if context was suspended (requires user interaction)
    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    startBGM() {
        if (this.isPlayingBGM) return;
        this.isPlayingBGM = true;
        this.beatIndex = 0;
        this.scheduleNextBGMBeat();
    }

    pauseBGM() {
        this.isPlayingBGM = false;
        if (this.bgmTimerId) clearTimeout(this.bgmTimerId);
    }

    stopBGM() {
        this.isPlayingBGM = false;
        this.beatIndex = 0;
        if (this.bgmTimerId) clearTimeout(this.bgmTimerId);
    }

    resumeBGM() {
        if (!this.isPlayingBGM && this.ctx.state !== 'suspended') {
            this.isPlayingBGM = true;
            this.scheduleNextBGMBeat();
        }
    }

    scheduleNextBGMBeat() {
        if (!this.isPlayingBGM) return;

        const freq = this.melodySeq[this.beatIndex];

        // Play melody note
        if (freq > 0) {
            this.playSynthNote('square', freq, 0.15, 0.4, this.bgmGain);
        }

        // Play Percussion (Kick on downbeats, High-hat on upbeats)
        if (this.beatIndex % 8 === 0) {
            // Kick - tight low pitch drop
            this.playSynthNote('sine', 150, 0.1, 0.6, this.bgmGain, -100);
        } else if (this.beatIndex % 4 === 0) {
            // Snare - noise burst
            this.playNoiseBuffer(0.1, 0.4, this.bgmGain);
        } else if (this.beatIndex % 2 === 0) {
            // Hi-hat - short noise burst
            this.playNoiseBuffer(0.05, 0.1, this.bgmGain);
        }

        this.beatIndex = (this.beatIndex + 1) % this.melodySeq.length;

        this.bgmTimerId = setTimeout(() => {
            this.scheduleNextBGMBeat();
        }, this.stepTimeMs);
    }

    playSynthNote(type, freq, duration, vol = 1, destGain, slide = 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        if (slide !== 0) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(10, freq + slide), this.ctx.currentTime + duration);
        }

        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(destGain);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playNoiseBuffer(duration, vol = 1, destGain) {
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(5000, this.ctx.currentTime);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(destGain);

        noise.start();
    }

    playOscillator(type, freq, duration, slide = 0, vol = 1, filterSweep = false) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        let filter;

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        if (slide !== 0) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(10, freq + slide), this.ctx.currentTime + duration);
        }

        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        if (filterSweep) {
            filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.Q.value = 5;
            filter.frequency.setValueAtTime(2000, this.ctx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + duration);
            osc.connect(filter);
            filter.connect(gain);
        } else {
            osc.connect(gain);
        }

        gain.connect(this.sfxGain);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playNoise(duration, vol = 1) {
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        noise.start();
    }

    move() {
        this.playOscillator('square', 220, 0.05, 0, 0.2);
    }

    rotate() {
        this.playOscillator('square', 330, 0.08, 0, 0.3);
    }

    softDrop() {
        this.playOscillator('sine', 150, 0.05, -50, 0.1);
    }

    hardDrop() {
        this.playOscillator('sawtooth', 400, 0.2, -350, 0.4, true);
        this.playNoise(0.15, 0.3);
    }

    lock() {
        this.playOscillator('square', 100, 0.15, -50, 0.5, true);
    }

    clear() {
        // Simple fast arpeggio for classic 8-bit clear sound
        const notes = [440, 554, 659, 880];
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playOscillator('square', freq, 0.1, 0, 0.3);
            }, idx * 50);
        });
    }

    tetrisClear() {
        const notes = [440, 554, 659, 880, 1108, 1318];
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playOscillator('square', freq, 0.15, 0, 0.4);
            }, idx * 40);
        });
    }

    hold() {
        this.playOscillator('triangle', 300, 0.1, 200, 0.3);
    }

    levelUp() {
        const notes = [220, 277, 330, 440, 554, 659];
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playOscillator('sawtooth', freq, 0.2, 0, 0.3, true);
            }, idx * 60);
        });
    }

    gameOver() {
        const notes = [440, 415, 392, 370];
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playOscillator('sawtooth', freq, 0.4, -20, 0.5, true);
            }, idx * 300);
        });
    }
}
