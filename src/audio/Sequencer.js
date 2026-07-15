export class Sequencer {
    constructor(synth) {
        this.synth = synth;
        this.ctx = synth.ctx;
        
        this.isPlaying = false;
        this.bpm = 120;
        this.currentStep = 0;
        this.numSteps = 32;
        this.numPatterns = 4;
        this.currentEditPattern = 0;
        this.currentPlayPattern = 0;
        this.chainMode = false;
        
        this.arpNotes = []; // Stores MIDI note numbers held down
        this.arpIndex = 0;
        
        // Expose callback for UI
        this.onStep = null;
        
        // Sequence Data: 4 Patterns of 32 steps each
        this.patterns = Array.from({length: this.numPatterns}, () => 
            Array.from({length: this.numSteps}, () => ({ active: false, note: 60, locks: {} }))
        );
        
        // Timing scheduling
        this.lookahead = 25.0; // ms
        this.scheduleAheadTime = 0.1; // s
        this.nextNoteTime = 0.0;
        this.timerID = null;

        // Callback for UI updates
        this.onStep = null;
    }

    setBpm(bpm) {
        this.bpm = bpm;
    }

    setStep(index, active, note, patternIndex = this.currentEditPattern) {
        if (active !== undefined) this.patterns[patternIndex][index].active = active;
        if (note !== undefined) this.patterns[patternIndex][index].note = note;
    }

    setStepLock(index, group, param, value, patternIndex = this.currentEditPattern) {
        if (value === undefined || value === null) {
            delete this.patterns[patternIndex][index].locks[`${group}.${param}`];
        } else {
            this.patterns[patternIndex][index].locks[`${group}.${param}`] = value;
        }
    }

    setEditPattern(index) {
        this.currentEditPattern = index;
    }

    setChainMode(active) {
        this.chainMode = active;
        if (active) {
            this.currentPlayPattern = this.currentEditPattern;
        }
    }

    nextNote() {
        const secondsPerBeat = 60.0 / this.bpm;
        this.nextNoteTime += 0.25 * secondsPerBeat; // 16th notes
        
        this.currentStep++;
        if (this.currentStep === this.numSteps) {
            this.currentStep = 0;
            if (this.chainMode) {
                this.currentPlayPattern = (this.currentPlayPattern + 1) % this.numPatterns;
            }
        }
    }

    scheduleNote(stepNumber, time) {
        const secondsPerBeat = 60.0 / this.bpm;
        const baseGateDuration = (0.25 * secondsPerBeat) * 0.8;
        
        // Swing logic: delay odd 16th notes
        let swingDelay = 0;
        if (stepNumber % 2 !== 0) {
            const swingAmt = parseFloat(this.synth.params.master.swing || 0);
            swingDelay = swingAmt * (0.25 * secondsPerBeat);
        }
        
        const scheduledTime = time + swingDelay;

        // Arpeggiator Logic
        const arpOn = this.synth.params.master.arpOn;
        if (arpOn && this.arpNotes.length > 0) {
            let notes = [...this.arpNotes];
            const arpMode = this.synth.params.master.arpMode;
            
            if (arpMode === 'up') notes.sort((a,b) => a - b);
            else if (arpMode === 'down') notes.sort((a,b) => b - a);
            else if (arpMode === 'random') notes.sort(() => Math.random() - 0.5);
            else if (arpMode === 'updown') {
                const up = [...notes].sort((a,b) => a - b);
                const down = [...notes].sort((a,b) => b - a).slice(1, -1);
                notes = up.concat(down);
            }
            
            const noteToPlay = notes[this.arpIndex % notes.length];
            this.synth.playNote(noteToPlay, scheduledTime, baseGateDuration);
            this.arpIndex++;
        } 
        // Normal Sequencer Logic
        else if (!arpOn) {
            const playPatternIndex = this.chainMode ? this.currentPlayPattern : this.currentEditPattern;
            const stepData = this.patterns[playPatternIndex][stepNumber];
            
            if (stepData.active) {
                this.synth.playNote(stepData.note, scheduledTime, baseGateDuration, stepData.locks);
            }
        }

        // Notify UI 
        if (this.onStep) {
            const playPatternIndex = this.chainMode ? this.currentPlayPattern : this.currentEditPattern;
            const timeUntilNote = (scheduledTime - this.ctx.currentTime) * 1000;
            setTimeout(() => {
                this.onStep(stepNumber, playPatternIndex);
            }, Math.max(0, timeUntilNote));
        }
    }

    scheduler() {
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
            this.scheduleNote(this.currentStep, this.nextNoteTime);
            this.nextNote();
        }
        this.timerID = setTimeout(() => this.scheduler(), this.lookahead);
    }

    play() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.currentStep = 0;
        this.nextNoteTime = this.ctx.currentTime + 0.05; // start shortly after
        this.scheduler();
    }

    stop() {
        this.isPlaying = false;
        clearTimeout(this.timerID);
        this.currentStep = 0;
        this.currentPlayPattern = this.chainMode ? 0 : this.currentEditPattern;
        if (this.onStep) this.onStep(-1, this.currentPlayPattern);
    }
}
