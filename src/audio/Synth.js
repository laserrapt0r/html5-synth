import { Voice } from './Voice.js?v=2';
import { Effects } from './Effects.js?v=2';

export class Synth {
    constructor(audioContext) {
        this.ctx = audioContext;
        
        // Master Volume
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.7;

        // Master limiter: 4 tracks x unison can easily exceed 0 dBFS — a
        // brickwall compressor catches that instead of hard digital clipping
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -3;
        this.limiter.knee.value = 0;
        this.limiter.ratio.value = 20;
        this.limiter.attack.value = 0.002;
        this.limiter.release.value = 0.15;

        // Analyser for Oscilloscope
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;

        // Effects Chain
        this.effects = new Effects(this.ctx);

        // Routing: Voices -> Effects -> Master Gain -> Limiter -> Analyser -> Output
        this.effects.output.connect(this.masterGain);
        this.masterGain.connect(this.limiter);
        this.limiter.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        // Tap for audio recording (post-limiter, exactly what you hear)
        this.recorderDest = this.ctx.createMediaStreamDestination();
        this.limiter.connect(this.recorderDest);

        // Global Parameters
        this.params = {
            master: { polyphony: 'poly', glide: 0, swing: 0, arpOn: false, arpMode: 'up', unison: 1, uniDetune: 12, spread: 0 },
            vco1: { on: true, wave: 'sawtooth', oct: 0, tune: 0, level: 0.8, pw: 0.5, pwm: 0, customWaveReal: null, customWaveImag: null },
            vco2: { on: true, wave: 'square', oct: -1, tune: 7, level: 0.6 },
            vco3: { on: true, wave: 'sine', oct: 1, tune: -7, level: 0.4 },
            noise: { type: 'white', level: 0 },
            filter: { type: 'lowpass', cutoff: 1500, res: 2, keytrack: 0, slope: 12 },
            fEnv: { a: 0.1, d: 0.3, s: 0.2, r: 0.5, amt: 2500 },
            aEnv: { a: 0.05, d: 0.5, s: 0.8, r: 1.0 },
            pEnv: { d: 0.1, amt: 0 },
            lfo1: { wave: 'sine', rate: 5, sync: 0, pitch: 0, cutoff: 0 },
            lfo2: { wave: 'sine', rate: 2, sync: 0, amp: 0 },
            effects: {
                'dist-on': false, 'dist-drive': 0,
                'chorus-on': false, 'chorus-rate': 0.6, 'chorus-depth': 0.5, 'chorus-mix': 0.5,
                'delay-on': false, 'delay-sync': 0, 'delay-time': 0.3, 'delay-fb': 0.4, 'delay-mix': 0.3,
                'reverb-on': false, 'reverb-mix': 0.2
            }
        };

        // Tempo mirror (set by the Sequencer) for BPM-synced delay times
        this.bpm = 120;

        // Voice Management
        this.maxVoices = 16; // 4 sequencer tracks + keyboard need headroom
        this.activeVoices = {}; // key: note string, value: primary Voice (unison siblings attached)
        this.monoVoice = null;
        this.heldNotes = []; // mono/legato note memory (physically held keys, in press order)
        this.lastNoteTime = 0;
        this._panFlip = false;

        // MIDI performance state
        this.sustainOn = false;
        this._sustained = []; // voices held only by the pedal
        this._monoSustainPending = false;

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

        // MIDI pitch bend: a constant source (in cents) summed into every
        // voice's pitchTarget — bends all sounding and future notes at once
        this.bendSource = this.ctx.createConstantSource();
        this.bendSource.offset.value = 0;
        this.bendSource.start();

        // MIDI mod wheel: adds LFO1 vibrato on top of the panel depths
        this.modWheelGain = this.ctx.createGain();
        this.modWheelGain.gain.value = 0;
        this.lfo1.connect(this.modWheelGain);

        // Apply initial params to LFO1 (type, rate) and all mod depths.
        // Without this, lfo1 runs at the oscillator default (440 Hz sine) and
        // the mod gains sit at their default of 1 (full depth) instead of 0.
        this.updateLFO1();
        this.updateLFO2();
    }

    // MIDI performance inputs
    setPitchBend(semitones) {
        const now = this.ctx.currentTime;
        this.bendSource.offset.cancelScheduledValues(now);
        this.bendSource.offset.setTargetAtTime(semitones * 100, now, 0.005);
    }

    setModWheel(value) {
        // Up to ~50 cents of extra vibrato at full wheel
        this._smoothSet(this.modWheelGain.gain, Math.max(0, Math.min(1, value)) * 50);
    }

    setSustain(on) {
        this.sustainOn = !!on;
        if (!on) {
            const t = this.ctx.currentTime;
            this._sustained.forEach(v => this._stopVoiceGroup(v, t));
            this._sustained = [];
            if (this._monoSustainPending && this.monoVoice && this.heldNotes.length === 0) {
                this.monoVoice.stop(t);
            }
            this._monoSustainPending = false;
        }
    }

    // Connect the global LFO mod gains into a voice and remember the
    // connections so Voice.disconnect() can sever them again.
    _connectLFOs(voice) {
        this.lfo1PitchGain.connect(voice.pitchTarget);
        this.lfo1CutoffGain.connect(voice.filterTarget);
        this.lfo1PwmGain.connect(voice.vco1DcOffset.offset);
        this.bendSource.connect(voice.pitchTarget);
        this.modWheelGain.connect(voice.pitchTarget);
        voice.externalConnections.push(
            [this.lfo1PitchGain, voice.pitchTarget],
            [this.lfo1CutoffGain, voice.filterTarget],
            [this.lfo1PwmGain, voice.vco1DcOffset.offset],
            [this.bendSource, voice.pitchTarget],
            [this.modWheelGain, voice.pitchTarget]
        );
    }

    // Effective LFO rate in Hz — sync > 0 means the rate is a note length in beats
    _lfoRate(cfg) {
        const sync = parseFloat(cfg.sync);
        if (sync > 0) return 1 / (sync * (60 / this.bpm));
        return parseFloat(cfg.rate);
    }

    noteToFreq(note) {
        // Simple midi note to freq (assuming note is a midi note number)
        const A4 = 440;
        return A4 * Math.pow(2, (note - 69) / 12);
    }

    playNote(note, time, duration = 0, pLocks = {}, velocity = 1) {
        if (this.ctx.state !== 'running') return; // don't queue notes while suspended (pre-init)
        const freq = this.noteToFreq(note);

        if (this.params.master.polyphony === 'poly') {
            // Polyphonic Mode
            const unison = Math.max(1, Math.min(3, parseInt(this.params.master.unison) || 1));
            const uniDetune = parseFloat(this.params.master.uniDetune) || 0;
            const spread = parseFloat(this.params.master.spread) || 0;

            // Enforce the voice limit (unison siblings count) by stealing the oldest note
            const effectiveMax = Math.max(2, Math.floor(this.maxVoices / unison));
            const entries = Object.entries(this.activeVoices);
            if (entries.length >= effectiveMax) {
                let oldestNote = null;
                let oldestVoice = null;
                for (const [n, v] of entries) {
                    if (!oldestVoice || v.startTime < oldestVoice.startTime) {
                        oldestVoice = v;
                        oldestNote = n;
                    }
                }
                this._stopVoiceGroup(oldestVoice, time);
                delete this.activeVoices[oldestNote];
            }

            // Alternate the stereo side per note so the spread fills the field
            this._panFlip = !this._panFlip;
            const noteSide = this._panFlip ? 1 : -1;

            const group = [];
            for (let u = 0; u < unison; u++) {
                const v = new Voice(this.ctx, this.params);
                v.startTime = time;
                if (unison > 1) {
                    const rel = (u / (unison - 1)) * 2 - 1; // -1 .. +1 across the stack
                    v.unisonDetune = rel * uniDetune;
                    v.panner.pan.value = rel * spread;
                } else {
                    v.panner.pan.value = noteSide * spread * 0.7;
                }
                this._connectLFOs(v);
                v.panner.connect(this.effects.input);
                v.start(freq, time, pLocks, velocity);
                group.push(v);
            }
            const voice = group[0];
            voice.unisonSiblings = group.slice(1);

            // Store voice to manage note-off
            if (this.activeVoices[note]) {
                this._stopVoiceGroup(this.activeVoices[note], time); // Stop old voice if same note triggered
            }
            this.activeVoices[note] = voice;

            if (duration > 0) {
                this._stopVoiceGroup(voice, time + duration);
                setTimeout(() => {
                    if (this.activeVoices[note] === voice) {
                        delete this.activeVoices[note];
                    }
                }, (duration + parseFloat(this.params.aEnv.r)) * 1000);
            }
        } else {
            // Mono / Legato Mode — held keys (duration 0) feed the note memory
            if (duration === 0) {
                this.heldNotes = this.heldNotes.filter(n => n !== note);
                this.heldNotes.push(note);
            }
            this.currentMonoNote = note;
            if (!this.monoVoice || !this.monoVoice.isActive || this.monoVoice.isStopping) {
                this.monoVoice = new Voice(this.ctx, this.params);
                this.monoVoice.startTime = time;
                this._connectLFOs(this.monoVoice);
                this.monoVoice.panner.connect(this.effects.input);
                this.monoVoice.start(freq, time, pLocks, velocity);
            } else {
                // Glide / Legato
                const glideTime = parseFloat(this.params.master.glide);

                // Take over the new step's parameter locks first — the envelope
                // triggers below must already see them
                this.monoVoice.pLocks = pLocks || {};

                // Retrigger envelopes if Mono, don't retrigger if Legato
                // (legato keeps the first note's velocity, like real mono synths)
                if (this.params.master.polyphony === 'mono') {
                    const prevLevel = this.monoVoice._ampEnvValueAt(time); // with the old velocity
                    this.monoVoice.velocity = velocity;
                    this.monoVoice.triggerAmpEnvelope(time, prevLevel);
                    this.monoVoice.triggerFilterEnvelope(time);
                    this.monoVoice.triggerPitchEnvelope(time);
                }

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

    // Stop a primary voice together with its unison siblings
    _stopVoiceGroup(voice, time) {
        voice.stop(time);
        voice.unisonSiblings.forEach(s => s.stop(time));
    }

    stopNote(note, time) {
        if (this.params.master.polyphony === 'poly') {
            const voice = this.activeVoices[note];
            if (!voice) return;
            if (this.sustainOn) {
                // Pedal holds the voice; released from activeVoices so a
                // re-pressed key starts a fresh voice on top
                this._sustained.push(voice);
                delete this.activeVoices[note];
                return;
            }
            this._stopVoiceGroup(voice, time);
            delete this.activeVoices[note];
        } else {
            this.heldNotes = this.heldNotes.filter(n => n !== note);
            if (this.monoVoice && this.currentMonoNote === note) {
                if (this.heldNotes.length > 0) {
                    // Note memory: fall back to the most recent still-held key
                    this.playNote(this.heldNotes[this.heldNotes.length - 1], time);
                } else if (this.sustainOn) {
                    this._monoSustainPending = true;
                } else {
                    this.monoVoice.stop(time);
                }
            }
        }
    }

    stopAllNotes() {
        const time = this.ctx.currentTime;
        Object.values(this.activeVoices).forEach(voice => this._stopVoiceGroup(voice, time));
        this.activeVoices = {};
        this.heldNotes = [];
        this._sustained.forEach(v => this._stopVoiceGroup(v, time));
        this._sustained = [];
        this._monoSustainPending = false;
        if (this.monoVoice) {
            this.monoVoice.stop(time);
            this.monoVoice = null;
        }
    }

    // 303-style slide: glide the sounding note (scheduled by tie steps with a
    // different pitch) without retriggering any envelope.
    slideNote(fromNote, toNote, time) {
        const voice = this.params.master.polyphony === 'poly'
            ? this.activeVoices[fromNote]
            : this.monoVoice;
        if (!voice || !voice.isActive) return;

        const freq = this.noteToFreq(toNote);
        const g = parseFloat(this.params.master.glide);
        const glideTime = g > 0 ? g : 0.06; // classic short slide when glide is off
        voice.glideTo(freq, time, glideTime);
        voice.unisonSiblings.forEach(s => s.glideTo(freq, time, glideTime));
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
                    const ms = 1000 / Math.max(0.1, this._lfoRate(this.params.lfo1));
                    this.lfo1RndInterval = setTimeout(updateSAndH, ms);
                };
                updateSAndH();
            }
        } else {
            clearTimeout(this.lfo1RndInterval);
            this.lfo1RndInterval = null;
            this.lfo1RndSource.offset.value = 0; // Reset DC offset
            this.lfo1.type = wave;
            this.lfo1.frequency.value = this._lfoRate(this.params.lfo1);
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
                    const ms = 1000 / Math.max(0.1, this._lfoRate(this.params.lfo2));
                    this.lfo2RndInterval = setTimeout(updateSAndH, ms);
                };
                updateSAndH();
            }
        } else {
            clearTimeout(this.lfo2RndInterval);
            this.lfo2RndInterval = null;
            this.lfo2RndSource.offset.value = 0; // Reset DC offset
            this.lfo2.type = wave;
            this.lfo2.frequency.value = this._lfoRate(this.params.lfo2);
            this.lfo2.connect(this.lfo2AmpGain);
        }
    }

    // Smoothly approach a value on a long-lived AudioParam (zipper prevention)
    _smoothSet(param, value, tau = 0.02) {
        const now = this.ctx.currentTime;
        param.cancelScheduledValues(now);
        param.setTargetAtTime(parseFloat(value), now, tau);
    }

    updateParams(module, key, value) {
        if (module === 'master') {
            if (key === 'volume') this._smoothSet(this.masterGain.gain, value);
            if (key === 'polyphony') this.params.master.polyphony = value;
            if (key === 'glide') this.params.master.glide = value;
            if (key === 'swing') this.params.master.swing = value;
            if (key === 'arpOn') this.params.master.arpOn = value;
            if (key === 'arpMode') this.params.master.arpMode = value;
            if (key === 'arpLatch') this.params.master.arpLatch = value;
            if (key === 'arpOctaves') this.params.master.arpOctaves = value;
            if (key === 'unison') this.params.master.unison = value;
            if (key === 'uniDetune') this.params.master.uniDetune = value;
            if (key === 'spread') this.params.master.spread = value;
        } else if (module === 'effects') {
            // Apply from the params object, NOT from the DOM — during preset
            // loading the DOM still holds the old values at this point.
            this.params.effects[key] = value;
            const fx = this.params.effects;

            if (key === 'dist-on' || key === 'dist-drive') {
                this.effects.setDistortion(fx['dist-on'], fx['dist-drive']);
            }
            if (key === 'chorus-on' || key === 'chorus-rate' || key === 'chorus-depth' || key === 'chorus-mix') {
                this.effects.setChorus(fx['chorus-on'], fx['chorus-rate'], fx['chorus-depth'], fx['chorus-mix']);
            }
            if (key === 'delay-on' || key === 'delay-time' || key === 'delay-fb' || key === 'delay-mix' || key === 'delay-sync') {
                // Sync > 0 means the delay time is a note length in beats
                const sync = parseFloat(fx['delay-sync']);
                const delayTime = sync > 0 ? Math.min(2, sync * (60 / this.bpm)) : fx['delay-time'];
                this.effects.setDelay(fx['delay-on'], delayTime, fx['delay-fb'], fx['delay-mix']);
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
                this._smoothSet(this.lfo1PwmGain.gain, parseFloat(value) || 0);
            }

            // Real-time update active voices (incl. unison siblings)
            if (!this._updateScheduled) {
                this._updateScheduled = true;
                setTimeout(() => {
                    Object.values(this.activeVoices).forEach(voice => {
                        voice.updateParams();
                        voice.unisonSiblings.forEach(s => s.updateParams());
                    });
                    if (this.monoVoice) this.monoVoice.updateParams();
                    this._updateScheduled = false;
                }, 0);
            }
        }
    }
}
