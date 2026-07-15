export class Voice {
    constructor(audioContext, params) {
        this.ctx = audioContext;
        this.params = params;

        this.output = this.ctx.createGain();
        this.output.gain.value = 0; 
        
        this.pLocks = {};

        this.oscs = [];
        this.oscGains = [];
        
        this.filter = this.ctx.createBiquadFilter();
        this.filter.connect(this.output);

        this.whiteNoiseBuffer = null;
        this.pinkNoiseBuffer = null;
        this.noiseSource = null;
        this.noiseGain = this.ctx.createGain();
        this.noiseGain.connect(this.filter);
        this.createNoiseBuffers();

        this.pitchTarget = this.ctx.createGain();
        this.pitchTarget.gain.value = 1;
        
        this.filterTarget = this.ctx.createGain();
        this.filterTarget.gain.value = 1;
        
        this.vco1DcOffset = this.ctx.createConstantSource();
        this.vco1DcOffset.start();
        
        this.isActive = false;
        this.noteFrequency = 440;
    }

    createNoiseBuffers() {
        const bufferSize = this.ctx.sampleRate * 2;
        
        // White Noise Buffer
        this.whiteNoiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const whiteData = this.whiteNoiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            whiteData[i] = Math.random() * 2 - 1;
        }

        // Pink Noise Buffer (Paul Kellet's approximation)
        this.pinkNoiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const pinkData = this.pinkNoiseBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
            let white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            pinkData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
            b6 = white * 0.115926;
        }
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

    start(frequency, time, pLocks = {}) {
        this.isActive = true;
        this.noteFrequency = frequency;
        this.pLocks = pLocks || {};
        
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
    }

    stop(time) {
        if (!this.isActive || this.isStopping) return;
        this.isStopping = true;
        
        const a = Math.max(0.001, parseFloat(this.getParam('aEnv', 'a')));
        const d = Math.max(0.001, parseFloat(this.getParam('aEnv', 'd')));
        const s = Math.max(0, parseFloat(this.getParam('aEnv', 's')));
        const r = parseFloat(this.getParam('aEnv', 'r'));
        
        // Manually calculate the envelope value at 'time' to bypass browser bugs
        let envValue = 0;
        if (this.ampEnvStartTime !== undefined) {
            if (time <= this.ampEnvStartTime) {
                envValue = 0;
            } else if (time <= this.ampEnvStartTime + a) {
                envValue = (time - this.ampEnvStartTime) / a;
            } else {
                envValue = s + (1 - s) * Math.exp(-(time - (this.ampEnvStartTime + a)) / (d / 3));
            }
        }
        
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

    forceStop(time) {
        if (!this.isActive) return;
        this.isStopping = true;
        this.output.gain.cancelScheduledValues(time);
        this.output.gain.setValueAtTime(this.output.gain.value, time);
        this.output.gain.setTargetAtTime(0, time, 0.015); // Fast 50ms fade
        
        const stopTime = time + 0.05;
        this.oscs.forEach(osc => osc.stop(stopTime));
        if (this.noiseSource) {
            this.noiseSource.stop(stopTime);
        }
        setTimeout(() => {
            this.disconnect();
            this.isActive = false;
        }, (stopTime - this.ctx.currentTime) * 1000);
    }

    updateParams() {
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
                        // Normal mode
                        this.vco1Osc.type = wave;
                        this.vco1Osc.disconnect();
                        this.vco1Osc.connect(this.vco1Gain);
                    }
                } else {
                    this.oscs[i].type = wave;
                }
                
                const octaveMult = Math.pow(2, parseInt(this.getParam(group, 'oct')));
                this.oscs[i].frequency.value = this.noteFrequency * octaveMult;
                this.oscs[i].detune.value = parseInt(this.getParam(group, 'tune'));
                if (this.getParam(group, 'on') === false) {
                    this.oscGains[i].gain.value = 0;
                } else {
                    this.oscGains[i].gain.value = parseFloat(this.getParam(group, 'level'));
                }
            }
        }

        this.noiseGain.gain.value = parseFloat(this.getParam('noise', 'level'));
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
        this.filter.Q.value = parseFloat(this.getParam('filter', 'res'));
        this.filterTarget.connect(this.filter.frequency);
    }

    triggerAmpEnvelope(time) {
        this.ampEnvStartTime = time;
        const a = Math.max(0.001, parseFloat(this.getParam('aEnv', 'a')));
        const d = Math.max(0.001, parseFloat(this.getParam('aEnv', 'd')));
        const s = Math.max(0, parseFloat(this.getParam('aEnv', 's')));
        
        const gain = this.output.gain;
        gain.cancelScheduledValues(time);
        gain.setValueAtTime(0, time);
        gain.linearRampToValueAtTime(1, time + a);
        gain.setTargetAtTime(s, time + a, d / 3);
    }

    triggerFilterEnvelope(time) {
        const cutoff = parseFloat(this.getParam('filter', 'cutoff'));
        const amt = parseFloat(this.getParam('fEnv', 'amt'));
        const a = Math.max(0.001, parseFloat(this.getParam('fEnv', 'a')));
        const d = Math.max(0.001, parseFloat(this.getParam('fEnv', 'd')));
        const s = Math.max(0, parseFloat(this.getParam('fEnv', 's')));
        
        const freq = this.filter.frequency;
        freq.cancelScheduledValues(time);
        
        const targetFreq = Math.max(20, Math.min(20000, cutoff + amt));
        const sustainFreq = Math.max(20, Math.min(20000, cutoff + (amt * s)));
        
        freq.setValueAtTime(cutoff, time);
        freq.linearRampToValueAtTime(targetFreq, time + a);
        freq.setTargetAtTime(sustainFreq, time + a, d / 3);
    }
}
