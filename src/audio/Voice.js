// Noise buffers are expensive (2 x 2s per creation) — generate once per AudioContext and share
const noiseBufferCache = new WeakMap();

function getNoiseBuffers(ctx) {
    let buffers = noiseBufferCache.get(ctx);
    if (buffers) return buffers;

    const bufferSize = ctx.sampleRate * 2;

    // White Noise Buffer
    const white = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const whiteData = white.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        whiteData[i] = Math.random() * 2 - 1;
    }

    // Pink Noise Buffer (Paul Kellet's approximation)
    const pink = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const pinkData = pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
        let w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        pinkData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
    }

    buffers = { white, pink };
    noiseBufferCache.set(ctx, buffers);
    return buffers;
}

export class Voice {
    constructor(audioContext, params) {
        this.ctx = audioContext;
        this.params = params;

        this.output = this.ctx.createGain();
        this.output.gain.value = 0;

        // Stereo placement (voice-spread / unison spread); Synth connects
        // panner -> effects, everything inside the voice stays mono until here.
        this.panner = this.ctx.createStereoPanner();
        this.output.connect(this.panner);

        this.pLocks = {};
        this.unisonDetune = 0; // extra cents for unison sibling voices
        this.unisonSiblings = []; // set by Synth on the primary voice

        this.oscs = [];
        this.oscGains = [];

        this.filter = this.ctx.createBiquadFilter();
        this.filter.connect(this.output);

        // Second filter stage for the 24 dB slope option (routed in when
        // filter.slope is 24; carries no extra resonance of its own)
        this.filter2 = this.ctx.createBiquadFilter();
        this.filter2.Q.value = 0;
        this._slope24 = false;

        const noiseBuffers = getNoiseBuffers(this.ctx);
        this.whiteNoiseBuffer = noiseBuffers.white;
        this.pinkNoiseBuffer = noiseBuffers.pink;
        this.noiseSource = null;
        this.noiseGain = this.ctx.createGain();
        this.noiseGain.connect(this.filter);

        this.pitchTarget = this.ctx.createGain();
        this.pitchTarget.gain.value = 1;

        // Pitch envelope: a ConstantSource summed into pitchTarget (cents),
        // automated per note-on. Drives all three VCOs' detune.
        this.pitchEnvSource = this.ctx.createConstantSource();
        this.pitchEnvSource.offset.value = 0;
        this.pitchEnvSource.start();
        this.pitchEnvSource.connect(this.pitchTarget);
        
        this.filterTarget = this.ctx.createGain();
        this.filterTarget.gain.value = 1;
        
        this.vco1DcOffset = this.ctx.createConstantSource();
        this.vco1DcOffset.start();
        
        this.isActive = false;
        this.noteFrequency = 440;
        this.velocity = 1; // scales amp envelope peak and filter env amount (accent > 1 possible)

        // Connections made from long-lived nodes (LFOs) into this voice.
        // They must be severed on cleanup, otherwise the voice can never be GC'd.
        this.externalConnections = [];
    }

    setupOscillators() {
        // Create PWM WaveShaper curve for VCO1
        const curve = new Float32Array(1024);
        // We will dynamically update this curve if PW changes, or better:
        // Use a DC offset + WaveShaper for audio-rate PWM.
        for(let i = 0; i < 1024; i++) {
            let x = i * 2 / 1024 - 1;
            curve[i] = x > 0 ? 1 : -1;
        }

        for (let i = 0; i < 3; i++) {
            let osc = this.ctx.createOscillator();
            let gain = this.ctx.createGain();
            
            this.pitchTarget.connect(osc.detune);
            
            if (i === 0) { // VCO1 Special Features
                this.vco1WaveShaper = this.ctx.createWaveShaper();
                this.vco1WaveShaper.curve = curve;
                this.vco1WaveShaper.oversample = '4x';
                
                // Normal routing
                osc.connect(gain);
                
                // Keep references for PWM routing toggle
                this.vco1Osc = osc;
                this.vco1Gain = gain;
            } else {
                osc.connect(gain);
            }
            
            gain.connect(this.filter);
            
            this.oscs.push(osc);
            this.oscGains.push(gain);
        }
    }

    getParam(group, key) {
        if (this.pLocks && this.pLocks[`${group}.${key}`] !== undefined) {
            // pLocks values might be strings from UI inputs, parse if necessary later, but return raw for now
            return this.pLocks[`${group}.${key}`];
        }
        return this.params[group][key];
    }

    start(frequency, time, pLocks = {}, velocity = 1) {
        this.isActive = true;
        this.noteFrequency = frequency;
        this.pLocks = pLocks || {};
        this.velocity = velocity;
        
        this.setupOscillators();
        this.updateParams();

        this.oscs.forEach(osc => osc.start(time));
        
        this.noiseSource = this.ctx.createBufferSource();
        this.noiseSource.buffer = this.getParam('noise', 'type') === 'pink' ? this.pinkNoiseBuffer : this.whiteNoiseBuffer;
        this.noiseSource.loop = true;
        this.noiseSource.connect(this.noiseGain);
        this.noiseSource.start(time);

        this.triggerAmpEnvelope(time);
        this.triggerFilterEnvelope(time);
        this.triggerPitchEnvelope(time);
    }

    stop(time) {
        if (!this.isActive || this.isStopping) return;
        this.isStopping = true;
        
        const r = parseFloat(this.getParam('aEnv', 'r'));

        // Manually calculate the envelope value at 'time' to bypass browser bugs
        const envValue = this._ampEnvValueAt(time);
        
        this.output.gain.cancelScheduledValues(time);
        this.output.gain.setValueAtTime(envValue, time);
        this.output.gain.setTargetAtTime(0, time, Math.max(0.01, r / 3));

        const stopTime = time + r + 0.1;
        this.oscs.forEach(osc => osc.stop(stopTime));
        if (this.noiseSource) {
            this.noiseSource.stop(stopTime);
        }

        setTimeout(() => {
            this.disconnect();
            this.isActive = false;
        }, (stopTime - this.ctx.currentTime) * 1000);
    }

    disconnect() {
        // Sever incoming connections from long-lived nodes (LFO mod gains)
        this.externalConnections.forEach(([source, target]) => {
            try { source.disconnect(target); } catch (e) { /* already disconnected */ }
        });
        this.externalConnections = [];

        this.oscs.forEach(osc => osc.disconnect());
        this.oscGains.forEach(gain => gain.disconnect());
        if (this.vco1WaveShaper) this.vco1WaveShaper.disconnect();
        if (this.noiseSource) this.noiseSource.disconnect();
        this.noiseGain.disconnect();
        this.filter.disconnect();
        this.filter2.disconnect();
        this.pitchTarget.disconnect();
        this.filterTarget.disconnect();
        try { this.vco1DcOffset.stop(); } catch (e) { /* already stopped */ }
        this.vco1DcOffset.disconnect();
        try { this.pitchEnvSource.stop(); } catch (e) { /* already stopped */ }
        this.pitchEnvSource.disconnect();
        this.output.disconnect();
        this.panner.disconnect();
    }

    // Glide the sounding pitch to a new frequency (303-style slide / legato).
    // Anchors on the last targeted frequency so chained slides stay consistent
    // even when scheduled ahead of playback.
    glideTo(frequency, time, glideTime) {
        const fromFreq = this.noteFrequency;
        this.noteFrequency = frequency;
        this.oscs.forEach((osc, i) => {
            const octaveMult = Math.pow(2, parseInt(this.getParam(`vco${i + 1}`, 'oct')));
            osc.frequency.cancelScheduledValues(time);
            osc.frequency.setValueAtTime(fromFreq * octaveMult, time);
            osc.frequency.setTargetAtTime(frequency * octaveMult, time, Math.max(0.005, glideTime / 3));
        });
    }

    // Smoothly approach a value (zipper-noise prevention). Immediate on the
    // first application so note starts are exact.
    _smooth(param, value, tau = 0.02) {
        if (!this._paramsApplied) {
            param.value = value;
            return;
        }
        const now = this.ctx.currentTime;
        param.cancelScheduledValues(now);
        param.setTargetAtTime(value, now, tau);
    }

    updateParams(skipFrequency = false) {
        if (!this.isActive) return;

        for (let i = 0; i < 3; i++) {
            const group = `vco${i+1}`;
            if (this.oscs[i]) {
                const wave = this.getParam(group, 'wave');
                
                if (i === 0) {
                    const pw = parseFloat(this.getParam(group, 'pw'));
                    const pwm = parseFloat(this.getParam(group, 'pwm'));
                    const isCustom = wave === 'custom' && this.params.vco1.customWaveReal;
                    
                    if (isCustom) {
                        // Make sure no PWM leftovers (DC offset -> WaveShaper) stay connected
                        this.vco1DcOffset.disconnect();
                        this.vco1WaveShaper.disconnect();
                        this.vco1Osc.disconnect();
                        this.vco1Osc.connect(this.vco1Gain);

                        const real = new Float32Array(this.params.vco1.customWaveReal);
                        const imag = new Float32Array(this.params.vco1.customWaveImag);
                        const customWave = this.ctx.createPeriodicWave(real, imag);
                        this.vco1Osc.setPeriodicWave(customWave);
                    } else if (wave === 'square' && (pw !== 0.5 || pwm > 0)) {
                        // PWM Mode
                        this.vco1Osc.type = 'sawtooth';
                        this.vco1Osc.disconnect();
                        this.vco1Osc.connect(this.vco1WaveShaper);
                        
                        this.vco1DcOffset.disconnect();
                        this.vco1DcOffset.connect(this.vco1WaveShaper);
                        
                        // DC Offset controls the pulse width threshold. 
                        // PW = 0.5 -> DC = 0
                        // PW = 0.05 -> DC = 0.9
                        // PW = 0.95 -> DC = -0.9
                        this.vco1DcOffset.offset.value = -(pw - 0.5) * 2;
                        
                        this.vco1WaveShaper.disconnect();
                        this.vco1WaveShaper.connect(this.vco1Gain);
                        
                        // Wire LFO1 to PWM depth if needed (implemented in Synth.js updateLFO1)
                    } else {
                        // Normal mode — also sever PWM leftovers, otherwise the
                        // DC offset keeps feeding the WaveShaper -> vco1Gain (constant DC on output)
                        this.vco1DcOffset.disconnect();
                        this.vco1WaveShaper.disconnect();
                        this.vco1Osc.type = wave;
                        this.vco1Osc.disconnect();
                        this.vco1Osc.connect(this.vco1Gain);
                    }
                } else {
                    this.oscs[i].type = wave;
                }

                const octaveMult = Math.pow(2, parseInt(this.getParam(group, 'oct')));
                if (!skipFrequency) {
                    this.oscs[i].frequency.value = this.noteFrequency * octaveMult;
                }
                this._smooth(this.oscs[i].detune, parseInt(this.getParam(group, 'tune')) + this.unisonDetune, 0.01);
                if (this.getParam(group, 'on') === false) {
                    this._smooth(this.oscGains[i].gain, 0);
                } else {
                    this._smooth(this.oscGains[i].gain, parseFloat(this.getParam(group, 'level')));
                }
            }
        }

        this._smooth(this.noiseGain.gain, parseFloat(this.getParam('noise', 'level')));
        const targetNoiseBuffer = this.getParam('noise', 'type') === 'pink' ? this.pinkNoiseBuffer : this.whiteNoiseBuffer;
        if (this.noiseSource && this.noiseSource.buffer !== targetNoiseBuffer) {
            const newSource = this.ctx.createBufferSource();
            newSource.buffer = targetNoiseBuffer;
            newSource.loop = true;
            newSource.connect(this.noiseGain);
            newSource.start();
            this.noiseSource.stop();
            this.noiseSource.disconnect();
            this.noiseSource = newSource;
        }

        this.filter.type = this.getParam('filter', 'type');
        this._smooth(this.filter.Q, parseFloat(this.getParam('filter', 'res')), 0.01);
        this.filterTarget.connect(this.filter.frequency);
        this.filterTarget.connect(this.filter2.frequency);

        // 12/24 dB slope: route the second filter stage in or out
        const slope = parseInt(this.getParam('filter', 'slope')) || 12;
        if (slope === 24 && !this._slope24) {
            this.filter.disconnect();
            this.filter.connect(this.filter2);
            this.filter2.connect(this.output);
            this._slope24 = true;
        } else if (slope !== 24 && this._slope24) {
            this.filter.disconnect();
            this.filter2.disconnect();
            this.filter.connect(this.output);
            this._slope24 = false;
        }
        this.filter2.type = this.filter.type;

        // Live cutoff: when cutoff/res/env settings change while the note is
        // sounding, re-target the filter towards the new sustain frequency —
        // like turning the cutoff knob on a real synth.
        const cutoff = parseFloat(this.getParam('filter', 'cutoff')) * this._keytrackMult();
        const fS = Math.max(0, parseFloat(this.getParam('fEnv', 's')));
        const fAmt = parseFloat(this.getParam('fEnv', 'amt')) * this.velocity;
        const sustainFreq = Math.max(20, Math.min(20000, cutoff + fAmt * fS));
        if (this._lastSustainFreq !== undefined && Math.abs(sustainFreq - this._lastSustainFreq) > 0.5) {
            const now = this.ctx.currentTime;
            [this.filter.frequency, this.filter2.frequency].forEach(p => {
                p.cancelScheduledValues(now);
                p.setTargetAtTime(sustainFreq, now, 0.03);
            });
        }
        this._lastSustainFreq = sustainFreq;

        this._paramsApplied = true;
    }

    // Keyboard tracking: shifts the filter cutoff with the played pitch
    // (0 = off, 1 = full tracking relative to middle C)
    _keytrackMult() {
        const kt = parseFloat(this.getParam('filter', 'keytrack')) || 0;
        if (kt <= 0) return 1;
        return Math.pow(this.noteFrequency / 261.63, kt);
    }

    // Envelope value at 'time', mirroring the automation scheduled by
    // triggerAmpEnvelope (incl. velocity scaling and retrigger start level)
    _ampEnvValueAt(time) {
        if (this.ampEnvStartTime === undefined || time <= this.ampEnvStartTime) return 0;
        const a = Math.max(0.001, parseFloat(this.getParam('aEnv', 'a')));
        const d = Math.max(0.001, parseFloat(this.getParam('aEnv', 'd')));
        const s = Math.max(0, parseFloat(this.getParam('aEnv', 's')));
        const start = this.ampEnvStartValue || 0;
        if (time <= this.ampEnvStartTime + a) {
            return start + (this.velocity - start) * (time - this.ampEnvStartTime) / a;
        }
        return this.velocity * (s + (1 - s) * Math.exp(-(time - (this.ampEnvStartTime + a)) / (d / 3)));
    }

    triggerAmpEnvelope(time, fromValue = null) {
        // Retrigger from the current envelope level instead of hard-resetting
        // to 0 — real envelopes don't click on fast mono runs.
        const startVal = fromValue !== null ? fromValue : this._ampEnvValueAt(time);
        this.ampEnvStartTime = time;
        this.ampEnvStartValue = startVal;
        const a = Math.max(0.001, parseFloat(this.getParam('aEnv', 'a')));
        const d = Math.max(0.001, parseFloat(this.getParam('aEnv', 'd')));
        const s = Math.max(0, parseFloat(this.getParam('aEnv', 's')));

        const peak = this.velocity;
        const gain = this.output.gain;
        gain.cancelScheduledValues(time);
        gain.setValueAtTime(startVal, time);
        gain.linearRampToValueAtTime(peak, time + a);
        gain.setTargetAtTime(s * peak, time + a, d / 3);
    }

    triggerPitchEnvelope(time) {
        const amt = parseFloat(this.getParam('pEnv', 'amt')) * 100; // semitones -> cents
        const d = Math.max(0.005, parseFloat(this.getParam('pEnv', 'd')));

        const offset = this.pitchEnvSource.offset;
        offset.cancelScheduledValues(time);
        if (!amt) {
            offset.setValueAtTime(0, time);
            return;
        }
        offset.setValueAtTime(amt, time);
        offset.setTargetAtTime(0, time, d / 3);
    }

    triggerFilterEnvelope(time) {
        const cutoff = parseFloat(this.getParam('filter', 'cutoff')) * this._keytrackMult();
        const amt = parseFloat(this.getParam('fEnv', 'amt')) * this.velocity;
        const a = Math.max(0.001, parseFloat(this.getParam('fEnv', 'a')));
        const d = Math.max(0.001, parseFloat(this.getParam('fEnv', 'd')));
        const s = Math.max(0, parseFloat(this.getParam('fEnv', 's')));

        const startFreq = Math.max(20, Math.min(20000, cutoff));
        const targetFreq = Math.max(20, Math.min(20000, cutoff + amt));
        const sustainFreq = Math.max(20, Math.min(20000, cutoff + (amt * s)));

        // Both filter stages follow the envelope (stage 2 is only audible in 24 dB mode)
        [this.filter.frequency, this.filter2.frequency].forEach(freq => {
            freq.cancelScheduledValues(time);
            freq.setValueAtTime(startFreq, time);
            freq.linearRampToValueAtTime(targetFreq, time + a);
            freq.setTargetAtTime(sustainFreq, time + a, d / 3);
        });
        this._lastSustainFreq = sustainFreq;
    }
}
