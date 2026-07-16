export class Visualizer {
    constructor(synth) {
        this.synth = synth;
        this.canvas = document.getElementById('oscilloscope');
        this.ctx = this.canvas.getContext('2d');

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.bufferLength = this.synth.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);

        this.isDrawing = false;
    }

    resize() {
        // Handle High DPI displays (canvas is CSS-sized to 100% of its container)
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.width = rect.width;
        this.height = rect.height;
    }

    start() {
        if (!this.isDrawing) {
            this.isDrawing = true;
            this.draw();
        }
    }

    draw() {
        if (!this.isDrawing) return;

        requestAnimationFrame(() => this.draw());

        this.synth.analyser.getByteTimeDomainData(this.dataArray);

        // Clear with fade for trailing effect
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Draw center line
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = 'rgba(57, 255, 20, 0.1)';
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.height / 2);
        this.ctx.lineTo(this.width, this.height / 2);
        this.ctx.stroke();

        // Waveform styling (Neon Green)
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#39ff14';
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#39ff14';

        this.ctx.beginPath();

        const sliceWidth = this.width * 1.0 / this.bufferLength;
        let x = 0;

        for (let i = 0; i < this.bufferLength; i++) {
            const v = this.dataArray[i] / 128.0;
            const y = v * this.height / 2;

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        this.ctx.lineTo(this.width, this.height / 2);
        this.ctx.stroke();
        
        // Reset shadow for next clear
        this.ctx.shadowBlur = 0;
    }
}
