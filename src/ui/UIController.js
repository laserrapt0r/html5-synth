export class UIController {
    constructor(synth, sequencer) {
        this.synth = synth;
        this.sequencer = sequencer;
        this.editStepIndex = null;
        this.isUpdatingUI = false;
        this.paramBindings = this.getParamBindings();
        
        this.initControls();
        this.initSequencerGrid();
        this.initKeyboard();
    }

    getParamBindings() {
        return [
            { name: 'polyphony', group: 'master', param: 'polyphony', type: 'radio' },
            { id: 'glide-time', group: 'master', param: 'glide', type: 'range' },
            
            { id: 'vco1-on', group: 'vco1', param: 'on', type: 'checkbox' },
            { name: 'vco1-wave', group: 'vco1', param: 'wave', type: 'radio' },
            { id: 'vco1-oct', group: 'vco1', param: 'oct', type: 'range' },
            { id: 'vco1-tune', group: 'vco1', param: 'tune', type: 'range' },
            { id: 'vco1-level', group: 'vco1', param: 'level', type: 'range' },
            { id: 'vco1-pw', group: 'vco1', param: 'pw', type: 'range' },
            { id: 'vco1-pwm', group: 'vco1', param: 'pwm', type: 'range' },
            
            // VCO 2
            { id: 'vco2-on', group: 'vco2', param: 'on', type: 'checkbox' },
            { name: 'vco2-wave', group: 'vco2', param: 'wave', type: 'radio' },
            { id: 'vco2-oct', group: 'vco2', param: 'oct', type: 'range' },
            { id: 'vco2-tune', group: 'vco2', param: 'tune', type: 'range' },
            { id: 'vco2-level', group: 'vco2', param: 'level', type: 'range' },
            
            { id: 'vco3-on', group: 'vco3', param: 'on', type: 'checkbox' },
            { name: 'vco3-wave', group: 'vco3', param: 'wave', type: 'radio' },
            { id: 'vco3-oct', group: 'vco3', param: 'oct', type: 'range' },
            { id: 'vco3-tune', group: 'vco3', param: 'tune', type: 'range' },
            { id: 'vco3-level', group: 'vco3', param: 'level', type: 'range' },
            
            { name: 'noise-type', group: 'noise', param: 'type', type: 'radio' },
            { id: 'noise-level', group: 'noise', param: 'level', type: 'range' },
            
            { name: 'filter-type', group: 'filter', param: 'type', type: 'radio' },
            { id: 'filter-cutoff', group: 'filter', param: 'cutoff', type: 'range' },
            { id: 'filter-res', group: 'filter', param: 'res', type: 'range' },
            
            { id: 'f-env-a', group: 'fEnv', param: 'a', type: 'range' },
            { id: 'f-env-d', group: 'fEnv', param: 'd', type: 'range' },
            { id: 'f-env-s', group: 'fEnv', param: 's', type: 'range' },
            { id: 'f-env-r', group: 'fEnv', param: 'r', type: 'range' },
            { id: 'f-env-amt', group: 'fEnv', param: 'amt', type: 'range' },
            
            { id: 'a-env-a', group: 'aEnv', param: 'a', type: 'range' },
            { id: 'a-env-d', group: 'aEnv', param: 'd', type: 'range' },
            { id: 'a-env-s', group: 'aEnv', param: 's', type: 'range' },
            { id: 'a-env-r', group: 'aEnv', param: 'r', type: 'range' },
            { id: 'glide-time', group: 'master', param: 'glide', type: 'range' },
            { id: 'seq-swing', group: 'master', param: 'swing', type: 'range' },
            { id: 'arp-on', group: 'master', param: 'arpOn', type: 'checkbox' },
            { id: 'arp-mode', group: 'master', param: 'arpMode', type: 'select' },
            { id: 'arp-latch', group: 'master', param: 'arpLatch', type: 'checkbox' },
            { id: 'arp-octaves', group: 'master', param: 'arpOctaves', type: 'range' },
            
            // LFOs
            { name: 'lfo1-wave', group: 'lfo1', param: 'wave', type: 'radio' },
            { id: 'lfo1-rate', group: 'lfo1', param: 'rate', type: 'range' },
            { id: 'lfo1-pitch', group: 'lfo1', param: 'pitch', type: 'range' },
            { id: 'lfo1-cutoff', group: 'lfo1', param: 'cutoff', type: 'range' },
            
            { name: 'lfo2-wave', group: 'lfo2', param: 'wave', type: 'radio' },
            { id: 'lfo2-rate', group: 'lfo2', param: 'rate', type: 'range' },
            { id: 'lfo2-amp', group: 'lfo2', param: 'amp', type: 'range' },
            
            { id: 'dist-on', group: 'effects', param: 'dist-on', type: 'checkbox' },
            { id: 'dist-drive', group: 'effects', param: 'dist-drive', type: 'range' },
            
            { id: 'delay-on', group: 'effects', param: 'delay-on', type: 'checkbox' },
            { id: 'delay-time', group: 'effects', param: 'delay-time', type: 'range' },
            { id: 'delay-fb', group: 'effects', param: 'delay-fb', type: 'range' },
            { id: 'delay-mix', group: 'effects', param: 'delay-mix', type: 'range' },
            
            { id: 'reverb-on', group: 'effects', param: 'reverb-on', type: 'checkbox' },
            { id: 'reverb-mix', group: 'effects', param: 'reverb-mix', type: 'range' },
        ];
    }

    initControls() {
        document.querySelectorAll('input[type="range"]').forEach(slider => {
            const display = document.createElement('div');
            display.className = 'slider-value';
            
            const updateDisplay = () => {
                let val = parseFloat(slider.value);
                const max = parseFloat(slider.max);
                const min = parseFloat(slider.min) || 0;
                
                if (max > 100) display.textContent = Math.round(val);
                else if (max <= 2) display.textContent = val.toFixed(2);
                else display.textContent = val.toFixed(1);

                const percent = ((val - min) / (max - min)) * 100;
                slider.style.setProperty('--percent', `${percent}%`);
            };

            const parent = slider.parentNode;
            if (parent.classList.contains('vertical')) {
                parent.insertBefore(display, slider);
            } else {
                parent.appendChild(display);
            }
            
            slider.addEventListener('input', updateDisplay);
            
            slider.addEventListener('wheel', (e) => {
                e.preventDefault();
                const step = parseFloat(slider.step) || 1;
                const min = parseFloat(slider.min) || 0;
                const max = parseFloat(slider.max) || 100;
                let val = parseFloat(slider.value);
                
                if (e.deltaY > 0) {
                    val = Math.max(min, val - step);
                } else if (e.deltaY < 0) {
                    val = Math.min(max, val + step);
                }
                
                if (val !== parseFloat(slider.value)) {
                    slider.value = val;
                    updateDisplay();
                    slider.dispatchEvent(new Event('input', { bubbles: true }));
                    slider.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, { passive: false });

            updateDisplay();
        });

        document.getElementById('master-vol').addEventListener('input', (e) => this.synth.updateParams('master', 'volume', e.target.value));

        this.paramBindings.forEach(binding => {
            const handleParamChange = (value, el) => {
                if (this.isUpdatingUI) return;
                
                if (this.editStepIndex !== null) {
                    const bankIdx = this.trackBanks[this.editStepIndex.trackIndex];
                    this.sequencer.setStepLock(this.editStepIndex.stepIndex, binding.group, binding.param, value, bankIdx);
                    el.classList.add('locked');
                    if (binding.type === 'range') {
                        const parent = el.parentNode;
                        const label = parent.querySelector('label');
                        if (label) label.classList.add('locked-label');
                    }
                } else {
                    this.synth.updateParams(binding.group, binding.param, value);
                    if (binding.param === 'arpLatch' && value === false) {
                        this.sequencer.clearArpNotes();
                        // Turn off active visual keys
                        document.querySelectorAll('.key.active').forEach(k => k.classList.remove('active'));
                    }
                }
            };

            if (binding.type === 'radio') {
                document.querySelectorAll(`input[name="${binding.name}"]`).forEach(r => {
                    r.addEventListener('change', (e) => {
                        handleParamChange(e.target.value, e.target);
                        e.target.blur();
                    });
                });
            } else if (binding.type === 'checkbox') {
                const el = document.getElementById(binding.id);
                if (el) {
                    el.addEventListener('change', (e) => {
                        handleParamChange(e.target.checked, e.target);
                        e.target.blur();
                    });
                }
            } else if (binding.type === 'select') {
                const el = document.getElementById(binding.id);
                if (el) {
                    el.addEventListener('change', (e) => {
                        handleParamChange(e.target.value, e.target);
                        e.target.blur();
                    });
                }
            } else if (binding.type === 'range') {
                const el = document.getElementById(binding.id);
                if (el) {
                    el.addEventListener('input', (e) => handleParamChange(e.target.value, e.target));
                }
            }
        });

        const playBtn = document.getElementById('seq-play');
        playBtn.addEventListener('click', () => {
            if (this.sequencer.isPlaying) {
                this.sequencer.stop();
                playBtn.textContent = 'PLAY';
                playBtn.classList.remove('playing');
            } else {
                this.sequencer.play();
                playBtn.textContent = 'STOP';
                playBtn.classList.add('playing');
            }
        });

        const bpmRange = document.getElementById('seq-bpm-range');
        const bpmDisplay = document.getElementById('bpm-display');
        bpmRange.addEventListener('input', (e) => {
            this.sequencer.setBpm(e.target.value);
            bpmDisplay.textContent = e.target.value;
        });
    }

    initSequencerGrid() {
        this.trackBanks = [0, 1]; // Track 1 plays Bank A(0), Track 2 plays Bank B(1)
        const notes = ["C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3", "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4", "C5"];
        const noteToMidi = (note) => {
            const notesArr = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const octave = parseInt(note.slice(-1));
            const noteName = note.slice(0, -1);
            return octave * 12 + notesArr.indexOf(noteName) + 12;
        };

        const defaultNotes = new Array(32).fill(60); 
        const funkyTown = [
            {step: 0, note: 60}, {step: 2, note: 60}, {step: 4, note: 58}, {step: 6, note: 60},
            {step: 10, note: 55}, {step: 14, note: 55}, {step: 16, note: 60}, {step: 18, note: 65},
            {step: 20, note: 64}, {step: 22, note: 60}
        ];
        funkyTown.forEach(n => {
            defaultNotes[n.step] = n.note;
        });

        // Init pattern 0 in sequencer with funky town
        for (let i = 0; i < 32; i++) {
            this.sequencer.setStep(i, undefined, defaultNotes[i], 0);
        }

        for (let trackIndex = 0; trackIndex < 2; trackIndex++) {
            const grid = document.getElementById(`sequencer-steps-${trackIndex}`);
            if (!grid) continue;
            grid.innerHTML = '';
            
            for (let i = 0; i < 32; i++) {
                const col = document.createElement('div');
                col.className = 'step-col';

                const btn = document.createElement('div');
                btn.className = 'step-btn';
                btn.id = `step-btn-t${trackIndex}-${i}`;
                
                btn.addEventListener('click', (e) => {
                    if (e.shiftKey) {
                        this.toggleEditStep(trackIndex, i);
                    } else {
                        btn.classList.toggle('active');
                        const isActive = btn.classList.contains('active');
                        this.sequencer.setStep(i, isActive, undefined, this.trackBanks[trackIndex]);
                    }
                });

                const pitchSelect = document.createElement('select');
                pitchSelect.className = 'step-pitch';
                
                notes.forEach(note => {
                    const opt = document.createElement('option');
                    opt.value = noteToMidi(note);
                    opt.textContent = note;
                    if (note === 'C3') opt.selected = true;
                    pitchSelect.appendChild(opt);
                });

                pitchSelect.addEventListener('change', (e) => {
                    this.sequencer.setStep(i, undefined, parseInt(e.target.value), this.trackBanks[trackIndex]);
                });

                col.appendChild(btn);
                col.appendChild(pitchSelect);
                grid.appendChild(col);
            }
        }

        this.renderTrack(0);
        this.renderTrack(1);

        document.querySelectorAll('input[name="track1-bank"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const bankIdx = parseInt(e.target.value);
                this.trackBanks[0] = bankIdx;
                this.sequencer.setTrackBank(0, bankIdx);
                this.renderTrack(0);
            });
        });

        document.querySelectorAll('input[name="track2-bank"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const bankIdx = parseInt(e.target.value);
                this.trackBanks[1] = bankIdx;
                this.sequencer.setTrackBank(1, bankIdx);
                this.renderTrack(1);
            });
        });

        this.sequencer.onStep = (step) => {
            document.querySelectorAll('.step-btn').forEach(b => b.classList.remove('current'));
            
            if (step >= 0) {
                for (let trackIndex = 0; trackIndex < 2; trackIndex++) {
                    const stepBtn = document.getElementById(`step-btn-t${trackIndex}-${step}`);
                    if (stepBtn) stepBtn.classList.add('current');
                }
            }
        };
    }

    renderTrack(trackIndex) {
        if (this.editStepIndex && this.editStepIndex.trackIndex === trackIndex) {
            this.editStepIndex = null;
            document.querySelectorAll('.step-btn').forEach(b => b.classList.remove('edit-mode'));
            this.updateUIFromParams();
        }

        const bankIdx = this.trackBanks[trackIndex];
        const patternData = this.sequencer.patterns[bankIdx];
        
        for (let i = 0; i < 32; i++) {
            const btn = document.getElementById(`step-btn-t${trackIndex}-${i}`);
            if (!btn) continue;
            const select = btn.nextElementSibling;
            
            const stepData = patternData[i];
            
            if (stepData.active) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
            select.value = stepData.note;
            btn.classList.remove('edit-mode');
        }
    }

    toggleEditStep(trackIndex, index) {
        if (this.editStepIndex && this.editStepIndex.trackIndex === trackIndex && this.editStepIndex.stepIndex === index) {
            this.editStepIndex = null;
            document.querySelectorAll('.step-btn').forEach(b => b.classList.remove('edit-mode'));
            this.updateUIFromParams();
        } else {
            this.editStepIndex = { trackIndex, stepIndex: index };
            document.querySelectorAll('.step-btn').forEach(b => b.classList.remove('edit-mode'));
            document.getElementById(`step-btn-t${trackIndex}-${index}`).classList.add('edit-mode');
            this.updateUIFromParams();
        }
    }

    updateUIFromParams() {
        this.isUpdatingUI = true;
        
        let pLocks = null;
        if (this.editStepIndex !== null) {
            const bankIdx = this.trackBanks[this.editStepIndex.trackIndex];
            pLocks = this.sequencer.patterns[bankIdx][this.editStepIndex.stepIndex].locks;
        }

        document.querySelectorAll('.locked').forEach(el => el.classList.remove('locked'));
        document.querySelectorAll('.locked-label').forEach(el => el.classList.remove('locked-label'));

        this.paramBindings.forEach(binding => {
            const isLocked = pLocks && pLocks[`${binding.group}.${binding.param}`] !== undefined;
            const value = isLocked ? pLocks[`${binding.group}.${binding.param}`] : this.synth.params[binding.group][binding.param];

            if (binding.type === 'radio') {
                const radio = document.querySelector(`input[name="${binding.name}"][value="${value}"]`);
                if (radio) {
                    radio.checked = true;
                    if (isLocked) radio.classList.add('locked');
                }
            } else if (binding.type === 'checkbox') {
                const el = document.getElementById(binding.id);
                if (el) {
                    el.checked = value;
                    if (isLocked) el.classList.add('locked');
                }
            } else if (binding.type === 'range' || binding.type === 'select') {
                const el = document.getElementById(binding.id);
                if (el) {
                    el.value = value;
                    el.dispatchEvent(new Event(binding.type === 'range' ? 'input' : 'change'));
                    if (isLocked) {
                        el.classList.add('locked');
                        const parent = el.parentNode;
                        const label = parent.querySelector('label');
                        if (label) label.classList.add('locked-label');
                    }
                }
            }
        });
        
        this.isUpdatingUI = false;
    }

    initKeyboard() {
        const keyboard = document.getElementById('piano-keyboard');
        const startNote = 48;
        const endNote = 72;
        
        const isBlackKey = (note) => {
            const n = note % 12;
            return [1, 3, 6, 8, 10].includes(n);
        };

        let activeNotes = {};
        
        let whiteKeyCount = 0;
        for (let i = startNote; i <= endNote; i++) {
            if (!isBlackKey(i)) whiteKeyCount++;
        }

        let currentWhiteKey = 0;

        for (let i = startNote; i <= endNote; i++) {
            const key = document.createElement('div');
            const black = isBlackKey(i);
            key.className = `key ${black ? 'black' : 'white'}`;
            key.dataset.note = i;
            
            if (black) {
                key.style.left = `calc(${(currentWhiteKey / whiteKeyCount) * 100}% - 1.75%)`;
            } else {
                currentWhiteKey++;
            }
            
            key.addEventListener('mousedown', () => {
                if (this.synth.params.master.arpOn) {
                    this.sequencer.addArpNote(i);
                } else {
                    this.synth.playNote(i, this.synth.ctx.currentTime);
                }
                key.classList.add('active');
                activeNotes[i] = true;
            });
            
            const release = () => {
                if (activeNotes[i]) {
                    this.sequencer.removeArpNote(i);
                    this.synth.stopNote(i, this.synth.ctx.currentTime);
                    key.classList.remove('active');
                    activeNotes[i] = false;
                }
            };

            key.addEventListener('mouseup', release);
            key.addEventListener('mouseleave', release);
            
            const midiToNote = (midi) => {
                const notesArr = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                const octave = Math.floor(midi / 12) - 1;
                const noteName = notesArr[midi % 12];
                return `${noteName}${octave}`;
            };
            
            const label = document.createElement('span');
            label.className = 'key-label';
            label.textContent = midiToNote(i);
            key.appendChild(label);
            
            keyboard.appendChild(key);
        }

        // Global blur handler to prevent stuck notes
        window.addEventListener('blur', () => {
            activeNotes = {};
            document.querySelectorAll('.key.active').forEach(k => k.classList.remove('active'));
            this.sequencer.heldNotes = []; // Clear arp notes
            this.synth.stopAllNotes();
        });
    }
}
