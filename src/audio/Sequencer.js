export class Sequencer {
    constructor(synth) {
        this.synth = synth;
        this.ctx = synth.ctx;
        
        this.isPlaying = false;
        this.autoStartedByArp = false;
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
        
        this.trackBanks = [0, 1]; // Track 1 plays Bank A(0), Track 2 plays Bank B(1)

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

    setEditPattern(patternIndex) {
        this.currentEditPattern = patternIndex;
    }

    setTrackBank(trackIndex, bankIndex) {
        this.trackBanks[trackIndex] = bankIndex;
    }

    addArpNote(note) {
        if (this.synth.params.master.arpLatch && this.arpNotes.length > 0 && !this.keysHeld) {
             // In a more complex Latch, pressing a new chord clears the old one.
             // For now, we just accumulate. 
        }
        if (!this.arpNotes.includes(note)) {
            this.arpNotes.push(note);
        }
        if (!this.isPlaying && this.synth.params.master.arpOn) {
            this.autoStartedByArp = true;
            this.play();
        }
    }

    removeArpNote(note) {
        if (this.synth.params.master.arpLatch) return;
        this.arpNotes = this.arpNotes.filter(n => n !== note);
        if (this.arpNotes.length === 0 && this.autoStartedByArp) {
            this.stop();
            this.autoStartedByArp = false;
        }
    }

    clearArpNotes() {
        this.arpNotes = [];
        if (this.autoStartedByArp) {
            this.stop();
            this.autoStartedByArp = false;
        }
    }

    nextNote() {
        const secondsPerBeat = 60.0 / this.bpm;
        this.nextNoteTime += 0.25 * secondsPerBeat; // 16th notes
        
        this.currentStep++;
        if (this.currentStep === this.numSteps) {
            this.currentStep = 0;
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
            let baseNotes = [...this.arpNotes];
            const arpOctaves = parseInt(this.synth.params.master.arpOctaves) || 1;
            
            // Expand to octaves
            let expandedNotes = [];
            for (let i = 0; i < arpOctaves; i++) {
                expandedNotes = expandedNotes.concat(baseNotes.map(n => n + (i * 12)));
            }
            
            let notes = [...expandedNotes];
            const arpMode = this.synth.params.master.arpMode;
            
            if (arpMode === 'up') {
                notes.sort((a,b) => a - b);
            } else if (arpMode === 'down') {
                notes.sort((a,b) => b - a);
            } else if (arpMode === 'updown') { // Exclusive
                const up = [...notes].sort((a,b) => a - b);
                const down = [...notes].sort((a,b) => b - a).slice(1, -1);
                notes = up.concat(down);
                if (notes.length === 0) notes = expandedNotes;
            } else if (arpMode === 'updown_inc') { // Inclusive
                const up = [...notes].sort((a,b) => a - b);
                const down = [...notes].sort((a,b) => b - a);
                notes = up.concat(down);
            } else if (arpMode === 'as_played') {
                notes = expandedNotes; 
            } else if (arpMode === 'random') {
                notes = [expandedNotes[Math.floor(Math.random() * expandedNotes.length)]];
            } else if (arpMode === 'converge') {
                const sorted = [...notes].sort((a,b) => a - b);
                let left = 0;
                let right = sorted.length - 1;
                notes = [];
                while (left <= right) {
                    if (left === right) {
                        notes.push(sorted[left]);
                        break;
                    }
                    notes.push(sorted[left]);
                    notes.push(sorted[right]);
                    left++;
                    right--;
                }
            } else if (arpMode === 'thumb') {
                const sorted = [...notes].sort((a,b) => a - b);
                const lowest = sorted[0];
                const rest = sorted.slice(1);
                if (rest.length > 0) {
                    notes = [];
                    for (let i = 0; i < rest.length; i++) {
                        notes.push(lowest);
                        notes.push(rest[i]);
                    }
                } else {
                    notes = [lowest];
                }
            }
            
            const noteToPlay = notes[this.arpIndex % notes.length];
            this.synth.playNote(noteToPlay, scheduledTime, baseGateDuration);
            this.arpIndex++;
        } 
        // Normal Sequencer Logic
        else if (!arpOn) {
            for (let trackIndex = 0; trackIndex < 2; trackIndex++) {
                const bankIdx = this.trackBanks[trackIndex];
                if (bankIdx >= 0 && bankIdx < this.numPatterns) {
                    const stepData = this.patterns[bankIdx][stepNumber];
                    if (stepData.active) {
                        this.synth.playNote(stepData.note, scheduledTime, baseGateDuration, stepData.locks);
                    }
                }
            }
        }

        // Notify UI 
        if (this.onStep) {
            const timeUntilNote = (scheduledTime - this.ctx.currentTime) * 1000;
            setTimeout(() => {
                this.onStep(stepNumber, this.currentEditPattern);
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
        
        const playBtn = document.getElementById('seq-play');
        if (playBtn) {
            playBtn.textContent = 'STOP';
            playBtn.classList.add('playing');
        }
    }

    stop() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        this.autoStartedByArp = false;
        clearTimeout(this.timerID);
        this.currentStep = 0;
        
        const playBtn = document.getElementById('seq-play');
        if (playBtn) {
            playBtn.textContent = 'PLAY';
            playBtn.classList.remove('playing');
        }
        if (this.onStep) this.onStep(-1, this.currentEditPattern);
    }
}
