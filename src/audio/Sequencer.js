// 303-style accent: boosts the amp envelope peak and widens the filter env sweep
const ACCENT_VELOCITY = 1.25;

export class Sequencer {
    constructor(synth) {
        this.synth = synth;
        this.ctx = synth.ctx;
        
        this.isPlaying = false;
        this.autoStartedByArp = false;
        this.bpm = 120;
        this.currentStep = 0;
        this.numSteps = 32;
        this.numPatterns = 8;
        this.currentEditPattern = 0;
        
        this.arpNotes = []; // Stores MIDI note numbers held down
        this.arpVelocities = {}; // note -> velocity (0..1) of the held key
        this.arpIndex = 0;
        
        // Gate length (0.1 = 10% staccato, 1.0 = 100% legato)
        this.gate = 0.8;
        // Time division: fraction of a beat per step (0.25 = 1/16, 0.5 = 1/8, 0.125 = 1/32)
        this.timeDiv = 0.25;
        
        // Sequence Data: 4 Patterns of 32 steps each
        this.patterns = Array.from({length: this.numPatterns}, () =>
            Array.from({length: this.numSteps}, () => ({ active: false, note: 60, tie: false, accent: false, locks: {} }))
        );
        
        this.trackBanks = [0, 1]; // Pattern 1 plays Bank A(0), Pattern 2 plays Bank B(1)
        this.trackMuted = [false, false]; // Mute state per pattern
        this.patternLengths = Array.from({length: this.numPatterns}, () => this.numSteps); // per-bank loop length (1..32)
        this.pendingTrackBanks = [null, null]; // bank switches queued to the loop start

        // Song mode: a chain of scenes [{banks:[a,b], repeats:n}]
        this.songMode = false;
        this.songChain = [];
        this.songIndex = 0;
        this.songLoopCount = 0;
        this._songFirst = true;

        // Arpeggiator key state (physically held keys, for latch handling)
        this.heldArpKeys = new Set();

        // Recording
        this.recArmed = false;
        this.recCursor = 0;

        // Timing scheduling
        this.lookahead = 25.0; // ms
        this.scheduleAheadTime = 0.1; // s
        this.nextNoteTime = 0.0;
        this.timerID = null;

        // Callbacks for UI updates
        this.onStep = null;
        this.onBankApplied = null; // (trackIndex, bankIdx) after a queued switch applies
        this.onSongStep = null; // (songIndex) when the song advances to a scene
        this.onRecord = null; // (trackIndex, stepPos) after a note was recorded

        // Background tabs throttle timers to >= 1s — schedule further ahead
        // there so playback doesn't stutter when the tab is hidden.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.scheduleAheadTime = 1.5;
                this.lookahead = 400;
            } else {
                this.scheduleAheadTime = 0.1;
                this.lookahead = 25.0;
            }
        });
    }

    setBpm(bpm) {
        this.bpm = bpm;
        this.synth.bpm = parseFloat(bpm) || 120;
        // Re-apply a BPM-synced delay time
        if (parseFloat(this.synth.params.effects['delay-sync']) > 0) {
            this.synth.updateParams('effects', 'delay-time', this.synth.params.effects['delay-time']);
        }
    }

    setPatternLength(bankIndex, length) {
        this.patternLengths[bankIndex] = Math.max(1, Math.min(this.numSteps, parseInt(length) || this.numSteps));
    }

    setSongMode(on) {
        this.songMode = !!on;
        this.songIndex = 0;
        this.songLoopCount = 0;
        this._songFirst = true;
    }

    setRecording(on) {
        this.recArmed = !!on;
        if (!on) this.recCursor = 0;
    }

    // Write a played note into track 1's current bank: quantized to the
    // audible step while playing, step-entry (advancing cursor) while stopped.
    recordNote(note) {
        if (!this.recArmed) return;
        const bankIdx = this.trackBanks[0];
        const len = this.patternLengths[bankIdx];
        let pos;
        if (this.isPlaying) {
            const stepDuration = this.timeDiv * (60.0 / this.bpm);
            // currentStep is the next step to be scheduled; walk back to the audible one
            const ahead = (this.nextNoteTime - this.ctx.currentTime) / stepDuration;
            pos = Math.round(this.currentStep - ahead) % this.numSteps;
            if (pos < 0) pos += this.numSteps;
            pos = pos % len;
        } else {
            pos = this.recCursor % len;
            this.recCursor = (this.recCursor + 1) % len;
        }
        const step = this.patterns[bankIdx][pos];
        step.active = true;
        step.note = note;
        step.tie = false;
        if (this.onRecord) this.onRecord(0, pos);
    }

    setGate(value) {
        this.gate = Math.max(0.1, Math.min(1.0, parseFloat(value)));
    }

    setTimeDiv(value) {
        this.timeDiv = parseFloat(value);
    }

    setStep(index, active, note, patternIndex = this.currentEditPattern) {
        if (active !== undefined) this.patterns[patternIndex][index].active = active;
        if (note !== undefined) this.patterns[patternIndex][index].note = note;
    }

    setStepTie(index, tie, patternIndex = this.currentEditPattern) {
        this.patterns[patternIndex][index].tie = tie;
    }

    setStepAccent(index, accent, patternIndex = this.currentEditPattern) {
        this.patterns[patternIndex][index].accent = accent;
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

    // While playing, bank switches are quantized to the next loop start
    // (like pattern changes on hardware sequencers). Returns 'queued' or 'applied'.
    setTrackBank(trackIndex, bankIndex) {
        if (this.isPlaying) {
            this.pendingTrackBanks[trackIndex] = bankIndex;
            return 'queued';
        }
        this.trackBanks[trackIndex] = bankIndex;
        return 'applied';
    }

    setTrackMuted(trackIndex, muted) {
        this.trackMuted[trackIndex] = muted;
    }

    addArpNote(note, velocity = 1) {
        // Latch: a fresh chord (all previous keys released) replaces the old one
        if (this.synth.params.master.arpLatch && this.heldArpKeys.size === 0 && this.arpNotes.length > 0) {
            this.arpNotes = [];
            this.arpVelocities = {};
        }
        if (this.arpNotes.length === 0) this.arpIndex = 0; // new phrase starts at its first note
        this.heldArpKeys.add(note);
        if (!this.arpNotes.includes(note)) {
            this.arpNotes.push(note);
        }
        this.arpVelocities[note] = velocity;
        if (!this.isPlaying && this.synth.params.master.arpOn) {
            this.autoStartedByArp = true;
            this.play();
        }
    }

    removeArpNote(note) {
        this.heldArpKeys.delete(note);
        if (this.synth.params.master.arpLatch) return;
        this.arpNotes = this.arpNotes.filter(n => n !== note);
        delete this.arpVelocities[note];
        if (this.arpNotes.length === 0 && this.autoStartedByArp) {
            this.stop();
            this.autoStartedByArp = false;
        }
    }

    clearArpNotes() {
        this.arpNotes = [];
        this.arpVelocities = {};
        this.heldArpKeys.clear();
        this.arpIndex = 0;
        if (this.autoStartedByArp) {
            this.stop();
            this.autoStartedByArp = false;
        }
    }

    nextNote() {
        const secondsPerBeat = 60.0 / this.bpm;
        this.nextNoteTime += this.timeDiv * secondsPerBeat;
        
        this.currentStep++;
        if (this.currentStep === this.numSteps) {
            this.currentStep = 0;
        }
    }

    // Count how many consecutive tie steps follow a given step in a pattern
    _countTieChain(bankIdx, stepNumber, len = this.numSteps) {
        let count = 0;
        for (let i = stepNumber + 1; i < len; i++) {
            if (this.patterns[bankIdx][i].tie) {
                count++;
            } else {
                break;
            }
        }
        return count;
    }

    // Song scenes and queued bank switches apply at the loop boundary
    _applyQueuedBanks() {
        if (this.songMode && this.songChain.length > 0) {
            if (this._songFirst) {
                this._songFirst = false;
            } else {
                this.songLoopCount++;
                const current = this.songChain[this.songIndex];
                if (this.songLoopCount >= (current ? current.repeats : 1)) {
                    this.songLoopCount = 0;
                    this.songIndex = (this.songIndex + 1) % this.songChain.length;
                }
            }
            const scene = this.songChain[this.songIndex];
            if (scene) {
                this.trackBanks[0] = scene.banks[0];
                this.trackBanks[1] = scene.banks[1];
                if (this.onSongStep) this.onSongStep(this.songIndex);
            }
        }
        for (let t = 0; t < 2; t++) {
            if (this.pendingTrackBanks[t] !== null) {
                this.trackBanks[t] = this.pendingTrackBanks[t];
                this.pendingTrackBanks[t] = null;
                if (this.onBankApplied) this.onBankApplied(t, this.trackBanks[t]);
            }
        }
    }

    scheduleNote(stepNumber, time) {
        if (stepNumber === 0) {
            this._applyQueuedBanks();
        }

        const secondsPerBeat = 60.0 / this.bpm;
        const stepDuration = this.timeDiv * secondsPerBeat;
        
        // Swing logic: delay odd steps
        let swingDelay = 0;
        if (stepNumber % 2 !== 0) {
            const swingAmt = parseFloat(this.synth.params.master.swing || 0);
            swingDelay = swingAmt * stepDuration;
        }
        
        const scheduledTime = time + swingDelay;

        // Arpeggiator Logic
        const arpOn = this.synth.params.master.arpOn;
        if (arpOn && this.arpNotes.length > 0) {
            const arpGateDuration = stepDuration * this.gate;
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
            // Velocity of the held key this arp note derives from
            // (octave-expanded notes fall back to their base key)
            let velocity = 1;
            for (let n = noteToPlay; n >= noteToPlay - 36; n -= 12) {
                if (this.arpVelocities[n] !== undefined) {
                    velocity = this.arpVelocities[n];
                    break;
                }
            }
            this.synth.playNote(noteToPlay, scheduledTime, arpGateDuration, {}, velocity);
            this.arpIndex++;
        } 
        // Normal Sequencer Logic
        else if (!arpOn) {
            const playedBanks = new Set(); // both tracks on the same bank must not double-trigger
            for (let trackIndex = 0; trackIndex < 2; trackIndex++) {
                if (this.trackMuted[trackIndex]) continue;

                const bankIdx = this.trackBanks[trackIndex];
                if (playedBanks.has(bankIdx)) continue;
                playedBanks.add(bankIdx);
                if (bankIdx < 0 || bankIdx >= this.numPatterns) continue;

                // Each bank loops within its own length (polymetric tracks)
                const len = this.patternLengths[bankIdx];
                const pos = stepNumber % len;
                const stepData = this.patterns[bankIdx][pos];

                if (stepData.tie) {
                    // Tie with a different pitch = 303-style slide on the sounding note
                    if (pos === 0) continue;
                    let headPos = pos - 1;
                    while (headPos > 0 && this.patterns[bankIdx][headPos].tie) headPos--;
                    const head = this.patterns[bankIdx][headPos];
                    const prev = this.patterns[bankIdx][pos - 1];
                    if (head.active && !head.tie && stepData.note !== prev.note) {
                        this.synth.slideNote(head.note, stepData.note, scheduledTime);
                    }
                    continue;
                }

                if (stepData.active) {
                    // Count tie chain to extend gate duration
                    const tieCount = this._countTieChain(bankIdx, pos, len);
                    const totalSteps = 1 + tieCount;
                    const gateDuration = (stepDuration * totalSteps) * this.gate;

                    this.synth.playNote(stepData.note, scheduledTime, gateDuration, stepData.locks,
                        stepData.accent ? ACCENT_VELOCITY : 1);
                }
            }
        }

        // Notify UI 
        if (this.onStep) {
            const timeUntilNote = (scheduledTime - this.ctx.currentTime) * 1000;
            setTimeout(() => {
                this.onStep(stepNumber);
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

    _updateTransportUI() {
        const playBtn = document.getElementById('seq-play');
        if (playBtn) {
            playBtn.textContent = this.isPlaying ? 'PAUSE' : 'PLAY';
            playBtn.classList.toggle('playing', this.isPlaying);
        }
    }

    // PLAY resumes from the current position (after pause) or from the top (after stop)
    play() {
        if (this.isPlaying) return;
        // Don't start while the AudioContext is suspended (before INIT AUDIO) —
        // scheduled steps would pile up and burst out on resume.
        if (this.ctx.state !== 'running') return;
        this.isPlaying = true;
        this.nextNoteTime = this.ctx.currentTime + 0.05; // start shortly after
        this.scheduler();
        this._updateTransportUI();
    }

    // PAUSE keeps the position; PLAY continues where it left off
    pause() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        clearTimeout(this.timerID);
        this._updateTransportUI();
    }

    // STOP resets to the top, cuts ringing notes and clears queued switches
    stop() {
        this.isPlaying = false;
        this.autoStartedByArp = false;
        clearTimeout(this.timerID);
        this.currentStep = 0;
        this.songIndex = 0;
        this.songLoopCount = 0;
        this._songFirst = true;
        this.pendingTrackBanks = [null, null];
        this.synth.stopAllNotes();
        this._updateTransportUI();
        if (this.onStep) this.onStep(-1);
    }

    // --- Persistence ---

    serialize() {
        return {
            patterns: this.patterns,
            patternLengths: [...this.patternLengths],
            trackBanks: [...this.trackBanks],
            trackMuted: [...this.trackMuted],
            bpm: this.bpm,
            gate: this.gate,
            timeDiv: this.timeDiv,
            songMode: this.songMode,
            songChain: this.songChain
        };
    }

    loadState(state) {
        if (!state) return;
        if (Array.isArray(state.patterns)) {
            state.patterns.forEach((pat, b) => {
                if (b >= this.numPatterns || !Array.isArray(pat)) return;
                pat.forEach((step, i) => {
                    if (i >= this.numSteps || !step) return;
                    this.patterns[b][i] = {
                        active: !!step.active,
                        note: typeof step.note === 'number' ? step.note : 60,
                        tie: !!step.tie,
                        accent: !!step.accent,
                        locks: step.locks || {}
                    };
                });
            });
        }
        if (Array.isArray(state.patternLengths)) {
            // Merge per index — older projects may have fewer banks than we do now
            state.patternLengths.forEach((l, i) => {
                if (i < this.numPatterns) {
                    this.patternLengths[i] = Math.max(1, Math.min(this.numSteps, parseInt(l) || this.numSteps));
                }
            });
        }
        if (Array.isArray(state.trackBanks)) this.trackBanks = [...state.trackBanks];
        if (Array.isArray(state.trackMuted)) this.trackMuted = [...state.trackMuted];
        if (state.bpm) this.setBpm(state.bpm);
        if (state.gate) this.gate = parseFloat(state.gate);
        if (state.timeDiv) this.timeDiv = parseFloat(state.timeDiv);
        this.songMode = !!state.songMode;
        this.songChain = Array.isArray(state.songChain) ? state.songChain : [];
    }
}
