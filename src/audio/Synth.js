import { Voice } from './Voice.js?v=2';
import { Effects } from './Effects.js?v=2';

export class Synth {
    constructor(audioContext) {
        this.ctx = audioContext;
        
        // Master Volume
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.7;
        
        // Analyser for Oscilloscope
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;

        // Effects Chain
        this.effects = new Effects(this.ctx);
        
        // Routing: Voices -> Effects -> Master Gain -> Analyser -> Output
        this.effects.output.connect(this.masterGain);
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        // Global Parameters
        this.params = {
            master: { polyphony: 'poly', glide: 0, swing: 0, arpOn: false, arpMode: 'up' },
            vco1: { on: true, wave: 'sawtooth', oct: 0, tune: 0, level: 0.8, pw: 0.5, pwm: 0, customWaveReal: null, customWaveImag: null },
            vco2: { on: true, wave: 'square', oct: -1, tune: 7, level: 0.6 },
            vco3: { on: true, wave: 'sine', oct: 1, tune: -7, level: 0.4 },
            noise: { type: 'white', level: 0 },
            filter: { type: 'lowpass', cutoff: 1500, res: 2 },
            fEnv: { a: 0.1, d: 0.3, s: 0.2, r: 0.5, amt: 2500 },
            aEnv: { a: 0.05, d: 0.5, s: 0.8, r: 1.0 },
            lfo1: { wave: 'sine', rate: 5, pitch: 0, cutoff: 0 },
            lfo2: { wave: 'sine', rate: 2, amp: 0 },
            effects: { 
                'dist-on': false, 'dist-drive': 0,
                'delay-on': false, 'delay-time': 0.3, 'delay-fb': 0.4, 'delay-mix': 0.3,
                'reverb-on': false, 'reverb-mix': 0.2
            }
        };

        // Voice Management
        this.maxVoices = 8;
        this.activeVoices = {}; // key: note string, value: Voice instance
        this.monoVoice = null;
        this.lastNoteTime = 0;

        // LFO 1
        this.lfo1 = this.ctx.createOscillator();
        this.lfo1PitchGain = this.ctx.createGain();
        this.lfo1CutoffGain = this.ctx.createGain();
        this.lfo1PwmGain = this.ctx.createGain(); // PWM Mod
        
        this.lfo1.connect(this.lfo1PitchGain);
        this.lfo1.connect(this.lfo1CutoffGain);
        this.lfo1.connect(this.lfo1PwmGain);
        this.lfo1.start();
        
        // Random LFO (S&H) Logic
        this.lfo1RndInterval = null;
        this.lfo2RndInterval = null;
        
        this.lfo1RndSource = this.ctx.createConstantSource();
        this.lfo1RndSource.start();
        this.lfo1RndSource.connect(this.lfo1PitchGain);
        this.lfo1RndSource.connect(this.lfo1CutoffGain);
        this.lfo1RndSource.connect(this.lfo1PwmGain);
        
        this.lfo2RndSource = this.ctx.createConstantSource();
        this.lfo2RndSource.start();
        
        // LFO 2 (Tremolo)
        this.lfo2 = this.ctx.createOscillator();
        this.lfo2.type = this.params.lfo2.wave;
        this.lfo2.frequency.value = this.params.lfo2.rate;
        this.lfo2AmpGain = this.ctx.createGain();
        this.lfo2AmpGain.gain.value = 0;
        this.lfo2.connect(this.lfo2AmpGain);
        this.lfo2RndSource.connect(this.lfo2AmpGain);
        this.lfo2AmpGain.connect(this.masterGain.gain);
        this.lfo2.start();

        // Apply initial params to LFO1 (type, rate) and all mod depths.
        // Without this, lfo1 runs at the oscillator default (440 Hz sine) and
        // the mod gains sit at their default of 1 (full depth) instead of 0.
        this.updateLFO1();
        this.updateLFO2();
    }

    // Connect the global LFO mod gains into a voice and remember the
    // connections so Voice.disconnect() can sever them again.
    _connectLFOs(voice) {
        this.lfo1PitchGain.connect(voice.pitchTarget);
        this.lfo1CutoffGain.connect(voice.filterTarget);
        this.lfo1PwmGain.connect(voice.vco1DcOffset.offset);
        voice.externalConnections.push(
            [this.lfo1PitchGain, voice.pitchTarget],
            [this.lfo1CutoffGain, voice.filterTarget],
            [this.lfo1PwmGain, voice.vco1DcOffset.offset]
        );
    }

    noteToFreq(note) {
        // Simple midi note to freq (assuming note is a midi note number)
        const A4 = 440;
        return A4 * Math.pow(2, (note - 69) / 12);
    }

    playNote(note, time, duration = 0, pLocks = {}) {
        if (this.ctx.state !== 'running') return; // don't queue notes while suspended (pre-init)
        const freq = this.noteToFreq(note);

        if (this.params.master.polyphony === 'poly') {
            // Polyphonic Mode — enforce the voice limit by stealing the oldest voice
            const entries = Object.entries(this.activeVoices);
            if (entries.length >= this.maxVoices) {
                let oldestNote = null;
                let oldestVoice = null;
                for (const [n, v] of entries) {
                    if (!oldestVoice || v.startTime < oldestVoice.startTime) {
                        oldestVoice = v;
                        oldestNote = n;
                    }
                }
                oldestVoice.stop(time);
                delete this.activeVoices[oldestNote];
            }

            const voice = new Voice(this.ctx, this.params);
            voice.startTime = time;

            this._connectLFOs(voice);

            voice.output.connect(this.effects.input);
            voice.start(freq, time, pLocks);
            
            // Store voice to manage note-off
            if (this.activeVoices[note]) {
                this.activeVoices[note].stop(time); // Stop old voice if same note triggered
            }
            this.activeVoices[note] = voice;
            
            if (duration > 0) {
                voice.stop(time + duration);
                setTimeout(() => {
                    if (this.activeVoices[note] === voice) {
                        delete this.activeVoices[note];
                    }
                }, (duration + parseFloat(this.params.aEnv.r)) * 1000);
            }
        } else {
            // Mono / Legato Mode
            this.currentMonoNote = note;
            if (!this.monoVoice || !this.monoVoice.isActive || this.monoVoice.isStopping) {
                this.monoVoice = new Voice(this.ctx, this.params);
                this.monoVoice.startTime = time;
                this._connectLFOs(this.monoVoice);
                this.monoVoice.output.connect(this.effects.input);
                this.monoVoice.start(freq, time, pLocks);
            } else {
                // Glide / Legato
                const glideTime = parseFloat(this.params.master.glide);

                // Retrigger envelopes if Mono, don't retrigger if Legato
                if (this.params.master.polyphony === 'mono') {
                    this.monoVoice.triggerAmpEnvelope(time);
                    this.monoVoice.triggerFilterEnvelope(time);
                }

                // Take over the new step's parameter locks (frequency is glided below)
                this.monoVoice.pLocks = pLocks || {};
                this.monoVoice.noteFrequency = freq;
                this.monoVoice.updateParams(true);

                // Apply glide to Oscillators
                this.monoVoice.oscs.forEach((osc, i) => {
                    const octaveMult = Math.pow(2, parseInt(this.monoVoice.getParam(`vco${i+1}`, 'oct')));
                    osc.frequency.cancelScheduledValues(time);
                    if (glideTime > 0) {
                        osc.frequency.setValueAtTime(osc.frequency.value, time);
                        osc.frequency.setTargetAtTime(freq * octaveMult, time, Math.max(0.01, glideTime / 3));
                    } else {
                        osc.frequency.setValueAtTime(freq * octaveMult, time);
                    }
                });
            }
            
            if (duration > 0) {
                this.monoVoice.stop(time + duration);
            }
        }
    }

    stopNote(note, time) {
        if (this.params.master.polyphony === 'poly') {
            if (this.activeVoices[note]) {
                this.activeVoices[note].stop(time);
                delete this.activeVoices[note];
            }
        } else {
            if (this.monoVoice && this.currentMonoNote === note) {
                this.monoVoice.stop(time);
            }
        }
    }

    stopAllNotes() {
        const time = this.ctx.currentTime;
        Object.values(this.activeVoices).forEach(voice => voice.stop(time));
        this.activeVoices = {};
        if (this.monoVoice) {
            this.monoVoice.stop(time);
            this.monoVoice = null;
        }
    }

    updateLFO1() {
        const wave = this.params.lfo1.wave;
        this.lfo1PitchGain.gain.value = this.params.lfo1.pitch;
        this.lfo1CutoffGain.gain.value = this.params.lfo1.cutoff;
        this.lfo1PwmGain.gain.value = this.params.vco1.pwm;

        if (wave === 'random') {
            this.lfo1.disconnect(); // Disable normal LFO
            if (!this.lfo1RndInterval) {
                const updateSAndH = () => {
                    if (this.params.lfo1.wave !== 'random') {
                        this.lfo1RndInterval = null;
                        return;
                    }
                    this.lfo1RndSource.offset.value = (Math.random() * 2) - 1;
                    // Rate to ms
                    const ms = 1000 / Math.max(0.1, this.params.lfo1.rate);
                    this.lfo1RndInterval = setTimeout(updateSAndH, ms);
                };
                updateSAndH();
            }
        } else {
            clearTimeout(this.lfo1RndInterval);
            this.lfo1RndInterval = null;
            this.lfo1RndSource.offset.value = 0; // Reset DC offset
            this.lfo1.type = wave;
            this.lfo1.frequency.value = this.params.lfo1.rate;
            this.lfo1.connect(this.lfo1PitchGain);
            this.lfo1.connect(this.lfo1CutoffGain);
            this.lfo1.connect(this.lfo1PwmGain);
        }
    }

    updateLFO2() {
        const wave = this.params.lfo2.wave;
        this.lfo2AmpGain.gain.value = this.params.lfo2.amp;
        
        if (wave === 'random') {
            this.lfo2.disconnect();
            if (!this.lfo2RndInterval) {
                const updateSAndH = () => {
                    if (this.params.lfo2.wave !== 'random') {
                        this.lfo2RndInterval = null;
                        return;
                    }
                    this.lfo2RndSource.offset.value = (Math.random() * 2) - 1;
                    const ms = 1000 / Math.max(0.1, this.params.lfo2.rate);
                    this.lfo2RndInterval = setTimeout(updateSAndH, ms);
                };
                updateSAndH();
            }
        } else {
            clearTimeout(this.lfo2RndInterval);
            this.lfo2RndInterval = null;
            this.lfo2RndSource.offset.value = 0; // Reset DC offset
            this.lfo2.type = wave;
            this.lfo2.frequency.value = this.params.lfo2.rate;
            this.lfo2.connect(this.lfo2AmpGain);
        }
    }

    updateParams(module, key, value) {
        if (module === 'master') {
            if (key === 'volume') this.masterGain.gain.value = value;
            if (key === 'polyphony') this.params.master.polyphony = value;
            if (key === 'glide') this.params.master.glide = value;
            if (key === 'swing') this.params.master.swing = value;
            if (key === 'arpOn') this.params.master.arpOn = value;
            if (key === 'arpMode') this.params.master.arpMode = value;
            if (key === 'arpLatch') this.params.master.arpLatch = value;
            if (key === 'arpOctaves') this.params.master.arpOctaves = value;
        } else if (module === 'effects') {
            // Apply from the params object, NOT from the DOM — during preset
            // loading the DOM still holds the old values at this point.
            this.params.effects[key] = value;
            const fx = this.params.effects;

            if (key === 'dist-on' || key === 'dist-drive') {
                this.effects.setDistortion(fx['dist-on'], fx['dist-drive']);
            }
            if (key === 'delay-on' || key === 'delay-time' || key === 'delay-fb' || key === 'delay-mix') {
                this.effects.setDelay(fx['delay-on'], fx['delay-time'], fx['delay-fb'], fx['delay-mix']);
            }
            if (key === 'reverb-on' || key === 'reverb-mix') {
                this.effects.setReverb(fx['reverb-on'], fx['reverb-mix']);
            }
        } else if (module === 'lfo1') {
            this.params.lfo1[key] = value;
            this.updateLFO1();
        } else if (module === 'lfo2') {
            this.params.lfo2[key] = value;
            this.updateLFO2();
        } else {
            // Update params object
            if (this.params[module]) {
                this.params[module][key] = value;
            }

            if (module === 'vco1' && key === 'pwm') {
                // Keep the LFO1 -> PWM mod depth in sync with the PWM slider
                this.lfo1PwmGain.gain.value = parseFloat(value) || 0;
            }

            // Real-time update active voices
            if (!this._updateScheduled) {
                this._updateScheduled = true;
                setTimeout(() => {
                    Object.values(this.activeVoices).forEach(voice => voice.updateParams());
                    if (this.monoVoice) this.monoVoice.updateParams();
                    this._updateScheduled = false;
                }, 0);
            }
        }
    }
}
