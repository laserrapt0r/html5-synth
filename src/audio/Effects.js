export class Effects {
    constructor(audioContext) {
        this.ctx = audioContext;

        // Master Input -> Distortion -> Delay -> Reverb -> Master Output
        this.input = this.ctx.createGain();
        this.output = this.ctx.createGain();

        // 1. Distortion
        this.distortionNode = this.ctx.createWaveShaper();
        this.distortionNode.curve = this.makeDistortionCurve(0);
        this.distortionNode.oversample = '4x';
        
        this.distBypass = this.ctx.createGain();
        this.distBypass.gain.value = 1;
        this.distMix = this.ctx.createGain();
        this.distMix.gain.value = 0;

        // 2. Delay
        this.delayNode = this.ctx.createDelay(2.0); // max 2 seconds
        this.delayNode.delayTime.value = 0.3;
        this.delayFeedback = this.ctx.createGain();
        this.delayFeedback.gain.value = 0.4;
        
        // Delay loop
        this.delayNode.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delayNode);

        this.delayBypass = this.ctx.createGain();
        this.delayBypass.gain.value = 1;
        this.delayMix = this.ctx.createGain();
        this.delayMix.gain.value = 0.3; // Default mix amount
        this.delayMixNode = this.ctx.createGain();
        this.delayMixNode.gain.value = 0; // On/Off switch

        // 3. Reverb (using Convolver with generated impulse)
        this.reverbNode = this.ctx.createConvolver();
        this.generateImpulseResponse(2.0, 2.0); // duration, decay
        
        this.reverbBypass = this.ctx.createGain();
        this.reverbBypass.gain.value = 1;
        this.reverbMix = this.ctx.createGain();
        this.reverbMix.gain.value = 0.2;
        this.reverbMixNode = this.ctx.createGain();
        this.reverbMixNode.gain.value = 0; // On/Off switch

        // Routing
        // Input splits to Dist and Dist Bypass
        this.input.connect(this.distortionNode);
        this.input.connect(this.distBypass);
        
        this.distortionNode.connect(this.distMix);
        
        // Combine Dist and Dist Bypass into a Dist Out Gain
        this.distOut = this.ctx.createGain();
        this.distBypass.connect(this.distOut);
        this.distMix.connect(this.distOut);

        // Dist Out goes to Delay and Reverb
        this.distOut.connect(this.delayNode);
        this.distOut.connect(this.delayBypass);
        this.delayNode.connect(this.delayMix);

        this.delayOut = this.ctx.createGain();
        this.delayBypass.connect(this.delayOut);
        
        // Delay mix control
        this.delayMix.connect(this.delayMixNode);
        this.delayMixNode.connect(this.delayOut);

        // Delay Out goes to Reverb
        this.delayOut.connect(this.reverbNode);
        this.delayOut.connect(this.reverbBypass);
        this.reverbNode.connect(this.reverbMix);

        this.reverbMix.connect(this.reverbMixNode);
        
        // Final Mix
        this.reverbBypass.connect(this.output);
        this.reverbMixNode.connect(this.output);
    }

    makeDistortionCurve(amount) {
        let k = parseFloat(amount);
        if (isNaN(k)) k = 50;
        let n_samples = 44100;
        let curve = new Float32Array(n_samples);
        let deg = Math.PI / 180;
        let i = 0;
        let x;
        for ( ; i < n_samples; ++i ) {
            x = i * 2 / n_samples - 1;
            curve[i] = ( 3 + k ) * x * 20 * deg / ( Math.PI + k * Math.abs(x) );
        }
        return curve;
    }

    generateImpulseResponse(duration, decay) {
        let sampleRate = this.ctx.sampleRate;
        let length = sampleRate * duration;
        let impulse = this.ctx.createBuffer(2, length, sampleRate);
        let left = impulse.getChannelData(0);
        let right = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            let n = i;
            left[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
            right[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
        }
        this.reverbNode.buffer = impulse;
    }

    // Smoothly approach a new value instead of jumping (avoids zipper noise/clicks)
    _smooth(param, value, tau = 0.02) {
        const now = this.ctx.currentTime;
        param.cancelScheduledValues(now);
        param.setTargetAtTime(value, now, tau);
    }

    setDistortion(isOn, drive) {
        this._smooth(this.distMix.gain, isOn ? 1 : 0);
        this._smooth(this.distBypass.gain, isOn ? 0 : 1);
        this.distortionNode.curve = this.makeDistortionCurve(drive);
    }

    setDelay(isOn, time, feedback, mix) {
        this._smooth(this.delayMixNode.gain, isOn ? 1 : 0);
        this._smooth(this.delayNode.delayTime, parseFloat(time), 0.03);
        this._smooth(this.delayFeedback.gain, parseFloat(feedback));
        this._smooth(this.delayMix.gain, parseFloat(mix));
    }

    setReverb(isOn, mix) {
        this._smooth(this.reverbMixNode.gain, isOn ? 1 : 0);
        this._smooth(this.reverbMix.gain, parseFloat(mix));
    }
}
