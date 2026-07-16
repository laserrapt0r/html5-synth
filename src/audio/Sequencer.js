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
        this.numTracks = 4;
        this.currentEditPattern = 0;
        
        this.arpNotes = []; // Stores MIDI note numbers held down
        this.arpVelocities = {}; // note -> velocity (0..1) of the held key
        this.arpIndex = 0;
        
        // Gate length (0.1 = 10% staccato, 1.0 = 100% legato)
        this.gate = 0.8;
        // Time division: fraction of a beat per step (0.25 = 1/16, 0.5 = 1/8, 0.125 = 1/32)
        this.timeDiv = 0.25;
        
        // Sequence Data: 8 banks of 32 steps each
        this.patterns = Array.from({length: this.numPatterns}, () =>
            Array.from({length: this.numSteps}, () => this._emptyStep())
        );
        
        this.trackBanks = Array.from({length: this.numTracks}, (_, i) => i); // track n plays bank n by default
        this.trackMuted = Array.from({length: this.numTracks}, () => false);
        this.patternLengths = Array.from({length: this.numPatterns}, () => this.numSteps); // per-bank loop length (1..32)
        this.pendingTrackBanks = Array.from({length: this.numTracks}, () => null); // bank switches queued to the loop start

        // Per-track sound: a patch id + its voice params flattened to P-Locks,
        // merged under each step's own locks at schedule time. null = the live
        // panel sound. This is what makes the tracks multi-timbral.
        this.trackSoundIds = Array.from({length: this.numTracks}, () => null);
        this.trackSoundLocks = Array.from({length: this.numTracks}, () => null);

        // Per-track level (mini mixer): scales the note velocity 0..1.25
        this.trackLevels = Array.from({length: this.numTracks}, () => 1);

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
        this.recTarget = 0; // which track receives recorded notes

        // Metronome (also provides the count-in when recording)
        this.metronomeOn = false;

        // Absolute step counter since play-from-stop (for trig conditions)
        this.absStep = 0;

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
        // Re-apply BPM-synced delay and LFO rates
        if (parseFloat(this.synth.params.effects['delay-sync']) > 0) {
            this.synth.updateParams('effects', 'delay-time', this.synth.params.effects['delay-time']);
        }
        if (parseFloat(this.synth.params.lfo1.sync) > 0) this.synth.updateLFO1();
        if (parseFloat(this.synth.params.lfo2.sync) > 0) this.synth.updateLFO2();
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

    _emptyStep() {
        return { active: false, note: 60, tie: false, accent: false, prob: 1, ratchet: 1, cond: null, locks: {} };
    }

    // --- Pattern tools ---

    copyPattern(bankIdx) {
        return {
            steps: JSON.parse(JSON.stringify(this.patterns[bankIdx])),
            length: this.patternLengths[bankIdx]
        };
    }

    pastePattern(bankIdx, data) {
        if (!data || !Array.isArray(data.steps)) return;
        data.steps.forEach((step, i) => {
            if (i < this.numSteps) this.patterns[bankIdx][i] = { ...this._emptyStep(), ...JSON.parse(JSON.stringify(step)) };
        });
        if (data.length) this.patternLengths[bankIdx] = data.length;
    }

    clearPattern(bankIdx) {
        for (let i = 0; i < this.numSteps; i++) {
            this.patterns[bankIdx][i] = this._emptyStep();
        }
    }

    // Rotate the pattern by one step within its loop length
    shiftPattern(bankIdx, direction) {
        const len = this.patternLengths[bankIdx];
        const steps = this.patterns[bankIdx];
        const part = steps.slice(0, len);
        if (direction > 0) {
            part.unshift(part.pop());
        } else {
            part.push(part.shift());
        }
        for (let i = 0; i < len; i++) steps[i] = part[i];
    }

    setTrackSound(trackIndex, id, locks) {
        this.trackSoundIds[trackIndex] = id || null;
        this.trackSoundLocks[trackIndex] = locks || null;
    }

    setTrackLevel(trackIndex, level) {
        this.trackLevels[trackIndex] = Math.max(0, Math.min(1.25, parseFloat(level) || 0));
    }

    // Write a played note into the target track's current bank: quantized to
    // the audible step while playing, step-entry (advancing cursor) while stopped.
    recordNote(note) {
        if (!this.recArmed) return;
        const bankIdx = this.trackBanks[this.recTarget];
        const len = this.patternLengths[bankIdx];
        let pos;
        if (this.isPlaying) {
            const stepDuration = this.timeDiv * (60.0 / this.bpm);
            // absStep is the next step to be scheduled; walk back to the audible one
            const ahead = (this.nextNoteTime - this.ctx.currentTime) / stepDuration;
            // During the count-in the transport is still before step 0 —
            // notes played there belong on the first step, not at the loop end
            pos = Math.max(0, Math.round(this.absStep - ahead)) % len;
        } else {
            pos = this.recCursor % len;
            this.recCursor = (this.recCursor + 1) % len;
        }
        const step = this.patterns[bankIdx][pos];
        step.active = true;
        step.note = note;
        step.tie = false;
        if (this.onRecord) this.onRecord(this.recTarget, pos);
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
        this.absStep++;
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
                for (let t = 0; t < this.numTracks; t++) {
                    if (scene.banks[t] !== undefined) this.trackBanks[t] = scene.banks[t];
                }
                if (this.onSongStep) this.onSongStep(this.songIndex);
            }
        }
        for (let t = 0; t < this.numTracks; t++) {
            if (this.pendingTrackBanks[t] !== null) {
                this.trackBanks[t] = this.pendingTrackBanks[t];
                this.pendingTrackBanks[t] = null;
                if (this.onBankApplied) this.onBankApplied(t, this.trackBanks[t]);
            }
        }
    }

    // Short metronome blip straight into the master bus (skips the effects)
    _click(time, accent) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = accent ? 1800 : 1100;
        g.gain.setValueAtTime(0.2, time);
        g.gain.setTargetAtTime(0, time + 0.005, 0.015);
        osc.connect(g);
        g.connect(this.synth.masterGain);
        osc.start(time);
        osc.stop(time + 0.08);
    }

    scheduleNote(stepNumber, time) {
        if (stepNumber === 0) {
            this._applyQueuedBanks();
        }

        const secondsPerBeat = 60.0 / this.bpm;
        const stepDuration = this.timeDiv * secondsPerBeat;

        if (this.metronomeOn) {
            const stepsPerBeat = Math.max(1, Math.round(1 / this.timeDiv));
            if (stepNumber % stepsPerBeat === 0) {
                this._click(time, stepNumber % (stepsPerBeat * 4) === 0);
            }
        }
        
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
            // Tracks on the same bank AND the same sound must not double-trigger;
            // same bank with different sounds is legitimate layering.
            const playedKeys = new Set();
            for (let trackIndex = 0; trackIndex < this.numTracks; trackIndex++) {
                if (this.trackMuted[trackIndex]) continue;

                const bankIdx = this.trackBanks[trackIndex];
                const dedupeKey = bankIdx + ':' + (this.trackSoundIds[trackIndex] || '');
                if (playedKeys.has(dedupeKey)) continue;
                playedKeys.add(dedupeKey);
                if (bankIdx < 0 || bankIdx >= this.numPatterns) continue;

                // Each bank loops within its own length (polymetric tracks).
                // The position derives from the absolute step counter — the
                // global 32-step wrap must NOT restart shorter patterns, or a
                // 24-step pattern would play 24 + 8 steps and then reset.
                const len = this.patternLengths[bankIdx];
                const pos = this.absStep % len;
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
                    // Trig condition: play only on matching loop iterations (e.g. '1:2')
                    if (stepData.cond) {
                        const [n, m] = String(stepData.cond).split(':').map(Number);
                        if (m > 1 && (Math.floor(this.absStep / len) % m) !== (n - 1)) continue;
                    }

                    // Probability: chance that this step triggers at all
                    const prob = stepData.prob !== undefined ? parseFloat(stepData.prob) : 1;
                    if (prob < 1 && Math.random() > prob) continue;

                    // Track sound (multi-timbrality) merged under the step's own locks
                    const soundLocks = this.trackSoundLocks[trackIndex];
                    const locks = soundLocks ? { ...soundLocks, ...stepData.locks } : stepData.locks;
                    const velocity = (stepData.accent ? ACCENT_VELOCITY : 1) * this.trackLevels[trackIndex];

                    const ratchet = Math.max(1, parseInt(stepData.ratchet) || 1);
                    if (ratchet > 1) {
                        // Ratchet: n evenly spaced retriggers within the step
                        const hitDuration = (stepDuration / ratchet) * this.gate;
                        for (let r = 0; r < ratchet; r++) {
                            this.synth.playNote(stepData.note, scheduledTime + r * (stepDuration / ratchet),
                                hitDuration, locks, velocity);
                        }
                    } else {
                        // Count tie chain to extend gate duration
                        const tieCount = this._countTieChain(bankIdx, pos, len);
                        const totalSteps = 1 + tieCount;
                        const gateDuration = (stepDuration * totalSteps) * this.gate;
                        this.synth.playNote(stepData.note, scheduledTime, gateDuration, locks, velocity);
                    }
                }
            }
        }

        // Notify UI — pass the absolute step so per-track positions
        // (absStep % length) stay in sync with the audio
        if (this.onStep) {
            const absAtSchedule = this.absStep;
            const timeUntilNote = (scheduledTime - this.ctx.currentTime) * 1000;
            setTimeout(() => {
                this.onStep(absAtSchedule);
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

        // Count-in: with REC armed AND the metronome on, one bar of clicks
        // before the first step (silent waiting without a click would confuse)
        if (this.recArmed && this.metronomeOn && this.currentStep === 0) {
            const beat = 60.0 / this.bpm;
            for (let b = 0; b < 4; b++) {
                this._click(this.nextNoteTime + b * beat, b === 0);
            }
            this.nextNoteTime += 4 * beat;
        }

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

    // STOP resets to the top and cuts ringing notes. Queued bank switches are
    // APPLIED (the user picked them and the UI already shows them as pending —
    // silently dropping them would leave a blinking, out-of-sync selector).
    stop() {
        this.isPlaying = false;
        this.autoStartedByArp = false;
        clearTimeout(this.timerID);
        this.currentStep = 0;
        this.absStep = 0;
        this.songIndex = 0;
        this.songLoopCount = 0;
        this._songFirst = true;
        for (let t = 0; t < this.numTracks; t++) {
            if (this.pendingTrackBanks[t] !== null) {
                this.trackBanks[t] = this.pendingTrackBanks[t];
                this.pendingTrackBanks[t] = null;
                if (this.onBankApplied) this.onBankApplied(t, this.trackBanks[t]);
            }
        }
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
            trackSoundIds: [...this.trackSoundIds],
            trackLevels: [...this.trackLevels],
            metronomeOn: this.metronomeOn,
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
                        prob: step.prob !== undefined ? Math.max(0, Math.min(1, parseFloat(step.prob))) : 1,
                        ratchet: Math.max(1, Math.min(4, parseInt(step.ratchet) || 1)),
                        cond: step.cond || null,
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
        // Merge per index — older projects may have fewer tracks than we do now
        if (Array.isArray(state.trackBanks)) {
            state.trackBanks.forEach((b, i) => { if (i < this.numTracks) this.trackBanks[i] = b; });
        }
        if (Array.isArray(state.trackMuted)) {
            state.trackMuted.forEach((m, i) => { if (i < this.numTracks) this.trackMuted[i] = !!m; });
        }
        if (Array.isArray(state.trackSoundIds)) {
            state.trackSoundIds.forEach((id, i) => { if (i < this.numTracks) this.trackSoundIds[i] = id || null; });
            // trackSoundLocks are re-resolved from the ids by main.js after loading
        }
        if (Array.isArray(state.trackLevels)) {
            state.trackLevels.forEach((l, i) => { if (i < this.numTracks) this.setTrackLevel(i, l); });
        }
        this.metronomeOn = !!state.metronomeOn;
        if (state.bpm) this.setBpm(state.bpm);
        if (state.gate) this.gate = parseFloat(state.gate);
        if (state.timeDiv) this.timeDiv = parseFloat(state.timeDiv);
        this.songMode = !!state.songMode;
        this.songChain = (Array.isArray(state.songChain) ? state.songChain : []).map(scene => ({
            // Pad scenes from older 2-track projects with the current banks
            banks: Array.from({length: this.numTracks}, (_, t) =>
                (scene.banks && scene.banks[t] !== undefined) ? scene.banks[t] : this.trackBanks[t]),
            repeats: scene.repeats || 1
        }));
    }
}
