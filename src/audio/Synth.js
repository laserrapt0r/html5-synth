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
    }

    noteToFreq(note) {
        // Simple midi note to freq (assuming note is a midi note number)
        const A4 = 440;
        return A4 * Math.pow(2, (note - 69) / 12);
    }

    playNote(note, time, duration = 0, pLocks = {}) {
        const freq = this.noteToFreq(note);
        
        if (this.params.master.polyphony === 'poly') {
            // Polyphonic Mode
            const voice = new Voice(this.ctx, this.params);
            
            // Connect LFOs
            this.lfo1PitchGain.connect(voice.pitchTarget);
            this.lfo1CutoffGain.connect(voice.filterTarget);
            this.lfo1PwmGain.connect(voice.vco1DcOffset.offset);
            
            voice.output.connect(this.effects.input);
            voice.start(freq, time, pLocks);
            
            // Store voice to manage note-off
            if (this.activeVoices[note]) {
                this.activeVoices[note].stop(time); // Stop old voice if same note triggered
            }
            this.activeVoices[note] = voice;
            
            if (duration > 0) {
                voice.stop(time + duration);
                setTimeout(() => delete this.activeVoices[note], (duration + parseFloat(this.params.aEnv.r)) * 1000);
            }
        } else {
            // Mono / Legato Mode
            this.currentMonoNote = note;
            if (!this.monoVoice || !this.monoVoice.isActive) {
                this.monoVoice = new Voice(this.ctx, this.params);
                this.lfo1PitchGain.connect(this.monoVoice.pitchTarget);
                this.lfo1CutoffGain.connect(this.monoVoice.filterTarget);
                this.lfo1PwmGain.connect(this.monoVoice.vco1DcOffset.offset);
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

                // Apply glide to Oscillators
                this.monoVoice.noteFrequency = freq;
                this.monoVoice.oscs.forEach((osc, i) => {
                    const octaveMult = Math.pow(2, parseInt(this.params[`vco${i+1}`].oct));
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
                    this.lfo1RndSource.offset.value = (Math.random() * 2) - 1;
                    if (this.params.lfo1.wave === 'random') {
                        // Rate to ms
                        const ms = 1000 / Math.max(0.1, this.params.lfo1.rate);
                        this.lfo1RndInterval = setTimeout(updateSAndH, ms);
                    } else {
                        this.lfo1RndInterval = null;
                    }
                };
                updateSAndH();
            }
        } else {
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
                    this.lfo2RndSource.offset.value = (Math.random() * 2) - 1;
                    if (this.params.lfo2.wave === 'random') {
                        const ms = 1000 / Math.max(0.1, this.params.lfo2.rate);
                        this.lfo2RndInterval = setTimeout(updateSAndH, ms);
                    } else {
                        this.lfo2RndInterval = null;
                    }
                };
                updateSAndH();
            }
        } else {
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
            this.params.effects[key] = value;
            
            if (key === 'dist-on') this.effects.setDistortion(value, document.getElementById('dist-drive').value);
            if (key === 'dist-drive') this.effects.setDistortion(document.getElementById('dist-on').checked, value);
            
            if (key === 'delay-on' || key === 'delay-time' || key === 'delay-fb' || key === 'delay-mix') {
                this.effects.setDelay(
                    document.getElementById('delay-on').checked,
                    document.getElementById('delay-time').value,
                    document.getElementById('delay-fb').value,
                    document.getElementById('delay-mix').value
                );
            }
            if (key === 'reverb-on' || key === 'reverb-mix') {
                this.effects.setReverb(
                    document.getElementById('reverb-on').checked,
                    document.getElementById('reverb-mix').value
                );
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

            if (module === 'vco1' && (key === 'wave' || key === 'pw' || key === 'pwm')) {
                // To update PW of active voices:
                Object.values(this.activeVoices).forEach(voice => {
                    if (voice.vco1Delay) {
                        voice.vco1Delay.delayTime.value = this.params.vco1.pw * 0.002;
                    }
                });
                if (this.monoVoice && this.monoVoice.vco1Delay) {
                    this.monoVoice.vco1Delay.delayTime.value = this.params.vco1.pw * 0.002;
                }
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
