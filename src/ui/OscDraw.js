export class OscDraw {
    constructor(canvasId, synth) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.synth = synth;
        
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        // 256 samples for our custom waveform
        this.bufferSize = 256;
        this.waveData = new Float32Array(this.bufferSize);
        
        this.isDrawing = false;
        
        this.initEvents();
        this.clear();
    }
    
    initEvents() {
        const handleDraw = (e) => {
            if (!this.isDrawing) return;
            const rect = this.canvas.getBoundingClientRect();
            const x = Math.max(0, Math.min(e.clientX - rect.left, this.width - 1));
            const y = Math.max(0, Math.min(e.clientY - rect.top, this.height - 1));
            
            // Map X to buffer index, Y to amplitude (-1 to 1)
            const index = Math.floor((x / this.width) * this.bufferSize);
            const value = 1 - (y / this.height) * 2;
            
            // Simple interpolation for fast drawing
            if (this.lastIndex !== null) {
                const startIdx = Math.min(this.lastIndex, index);
                const endIdx = Math.max(this.lastIndex, index);
                const startVal = this.lastIndex < index ? this.lastVal : value;
                const endVal = this.lastIndex < index ? value : this.lastVal;
                
                for (let i = startIdx; i <= endIdx; i++) {
                    const t = (i - startIdx) / (endIdx - startIdx || 1);
                    this.waveData[i] = startVal + t * (endVal - startVal);
                }
            } else {
                this.waveData[index] = value;
            }
            
            this.lastIndex = index;
            this.lastVal = value;
            
            this.render();
            this.updateSynth();
        };

        this.canvas.addEventListener('mousedown', (e) => {
            this.isDrawing = true;
            this.lastIndex = null;
            this.lastVal = null;
            handleDraw(e);
        });
        
        this.canvas.addEventListener('mousemove', handleDraw);
        
        window.addEventListener('mouseup', () => {
            if (this.isDrawing) {
                this.isDrawing = false;
                this.updateSynth();
            }
        });
        
        document.getElementById('btn-clear-canvas').addEventListener('click', () => this.clear());
        document.getElementById('btn-smooth-canvas').addEventListener('click', () => this.smooth());
    }
    
    clear() {
        for (let i = 0; i < this.bufferSize; i++) {
            // Default to a sine wave as starting point
            this.waveData[i] = Math.sin((i / this.bufferSize) * Math.PI * 2);
        }
        this.render();
        this.updateSynth();
    }
    
    smooth() {
        // Simple moving average
        const temp = new Float32Array(this.bufferSize);
        for (let i = 0; i < this.bufferSize; i++) {
            const prev = this.waveData[(i - 1 + this.bufferSize) % this.bufferSize];
            const curr = this.waveData[i];
            const next = this.waveData[(i + 1) % this.bufferSize];
            temp[i] = (prev + curr * 2 + next) / 4;
        }
        this.waveData.set(temp);
        this.render();
        this.updateSynth();
    }
    
    render() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        this.ctx.strokeStyle = '#00f3ff';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        
        for (let i = 0; i < this.bufferSize; i++) {
            const x = (i / this.bufferSize) * this.width;
            const y = (1 - (this.waveData[i] + 1) / 2) * this.height;
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }
        
        this.ctx.stroke();
    }
    
    updateSynth() {
        // Compute Fourier Transform to get periodic wave coefficients
        const N = this.bufferSize;
        const maxHarmonics = 64; // Web Audio API limit usually 4096, but 64 is plenty for custom shapes
        
        const real = new Float32Array(maxHarmonics);
        const imag = new Float32Array(maxHarmonics);
        
        // DC offset
        let sumDC = 0;
        for (let i = 0; i < N; i++) sumDC += this.waveData[i];
        real[0] = sumDC / N;
        imag[0] = 0;
        
        for (let k = 1; k < maxHarmonics; k++) {
            let sumReal = 0;
            let sumImag = 0;
            for (let n = 0; n < N; n++) {
                const angle = (2 * Math.PI * k * n) / N;
                sumReal += this.waveData[n] * Math.cos(angle);
                sumImag += this.waveData[n] * Math.sin(angle);
            }
            real[k] = (2 * sumReal) / N;
            imag[k] = -(2 * sumImag) / N; // Web Audio PeriodicWave expects negative imaginary for standard math
        }
        
        // Convert to array so it can be stored in params and picked up by new voices
        this.synth.updateParams('vco1', 'customWaveReal', Array.from(real));
        this.synth.updateParams('vco1', 'customWaveImag', Array.from(imag));
        
        // If current wave is custom, immediately update active voices
        if (this.synth.params.vco1.wave === 'custom') {
            const customWave = this.synth.ctx.createPeriodicWave(real, imag);
            this.synth.activeVoices.forEach(voice => {
                if (voice.vco1Osc) {
                    voice.vco1Osc.setPeriodicWave(customWave);
                }
            });
        }
    }
}
