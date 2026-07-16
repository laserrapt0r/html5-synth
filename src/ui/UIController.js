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
            { id: 'master-unison', group: 'master', param: 'unison', type: 'range' },
            { id: 'master-unidetune', group: 'master', param: 'uniDetune', type: 'range' },
            { id: 'master-spread', group: 'master', param: 'spread', type: 'range' },
            
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

            { id: 'p-env-amt', group: 'pEnv', param: 'amt', type: 'range' },
            { id: 'p-env-d', group: 'pEnv', param: 'd', type: 'range' },
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
            { id: 'delay-sync', group: 'effects', param: 'delay-sync', type: 'select' },
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

                // Log-scaled sliders (data-log-min/max): position 0..1 maps
                // exponentially — show the mapped value, not the position
                if (slider.dataset.logMin) {
                    const lmin = parseFloat(slider.dataset.logMin);
                    const lmax = parseFloat(slider.dataset.logMax);
                    display.textContent = Math.round(lmin * Math.pow(lmax / lmin, val));
                    slider.style.setProperty('--percent', `${val * 100}%`);
                    return;
                }

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

        // Only voice-level params can be locked per step — Voice.getParam knows
        // nothing about global groups (effects, master, LFOs), so locking those
        // would silently do nothing during playback.
        const lockableGroups = new Set(['vco1', 'vco2', 'vco3', 'noise', 'filter', 'fEnv', 'aEnv', 'pEnv']);

        this.paramBindings.forEach(binding => {
            const handleParamChange = (value, el) => {
                if (this.isUpdatingUI) return;

                if (this.editStepIndex !== null && lockableGroups.has(binding.group)) {
                    const bankIdx = this.sequencer.trackBanks[this.editStepIndex.trackIndex];
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
                    el.addEventListener('input', (e) => {
                        let value = e.target.value;
                        // Log-scaled sliders report the mapped value, not the position
                        if (el.dataset.logMin) {
                            const lmin = parseFloat(el.dataset.logMin);
                            const lmax = parseFloat(el.dataset.logMax);
                            value = String(Math.round(lmin * Math.pow(lmax / lmin, parseFloat(value))));
                        }
                        handleParamChange(value, e.target);
                    });
                }
            }
        });

        // Transport: PLAY toggles play/pause, STOP resets and cuts notes
        const playBtn = document.getElementById('seq-play');
        playBtn.addEventListener('click', () => {
            if (this.sequencer.isPlaying) {
                this.sequencer.pause();
            } else {
                this.sequencer.play();
            }
        });

        const stopBtn = document.getElementById('seq-stop');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.sequencer.stop());
        }

        const recBtn = document.getElementById('seq-rec');
        if (recBtn) {
            recBtn.addEventListener('click', () => {
                const on = !this.sequencer.recArmed;
                this.sequencer.setRecording(on);
                recBtn.classList.toggle('recording', on);
            });
        }

        // Which track receives recorded notes
        const recTargetSel = document.getElementById('rec-target');
        if (recTargetSel) {
            recTargetSel.addEventListener('change', (e) => {
                this.sequencer.recTarget = parseInt(e.target.value) || 0;
                e.target.blur();
            });
        }

        // Grey out the delay TIME slider while the delay is BPM-synced
        const delaySyncSel = document.getElementById('delay-sync');
        if (delaySyncSel) {
            const dimDelayTime = () => {
                const dimmed = parseFloat(delaySyncSel.value) > 0;
                const timeEl = document.getElementById('delay-time');
                if (timeEl) timeEl.classList.toggle('dimmed', dimmed);
            };
            delaySyncSel.addEventListener('change', dimDelayTime);
            dimDelayTime();
        }

        const bpmRange = document.getElementById('seq-bpm-range');
        const bpmDisplay = document.getElementById('bpm-display');
        bpmRange.addEventListener('input', (e) => {
            this.sequencer.setBpm(e.target.value);
            bpmDisplay.textContent = e.target.value;
        });

        const gateRange = document.getElementById('seq-gate');
        if (gateRange) {
            gateRange.addEventListener('input', (e) => {
                this.sequencer.setGate(e.target.value);
            });
        }

        const timeDivSelect = document.getElementById('seq-timediv');
        if (timeDivSelect) {
            timeDivSelect.addEventListener('change', (e) => {
                this.sequencer.setTimeDiv(e.target.value);
                e.target.blur();
            });
        }
    }

    initSequencerGrid() {
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

        // Build the track rows: sidebar (mute, sound, bank, length) + step grid
        const numTracks = this.sequencer.numTracks;
        const tracksEl = document.getElementById('seq-tracks');
        tracksEl.innerHTML = '';

        for (let t = 0; t < numTracks; t++) {
            const row = document.createElement('div');
            row.className = 'seq-track-container';
            row.style.cssText = 'display: flex; gap: 6px; align-items: center;';

            const side = document.createElement('div');
            side.className = 'track-side';

            const muteBtn = document.createElement('button');
            muteBtn.className = 'pattern-mute-btn active';
            muteBtn.id = `pattern-mute-${t}`;
            muteBtn.title = `Mute/Unmute track ${t + 1}`;
            muteBtn.textContent = `P${t + 1}`;
            muteBtn.addEventListener('click', () => {
                const isMuted = muteBtn.classList.contains('active'); // currently playing
                muteBtn.classList.toggle('active');
                this.sequencer.setTrackMuted(t, isMuted); // if active, we are muting
            });

            // Sound per track (multi-timbral): options are populated by main.js
            const soundSel = document.createElement('select');
            soundSel.className = 'track-sound';
            soundSel.id = `track-sound-${t}`;
            soundSel.title = 'Sound of this track (LIVE = the sound currently on the panel)';

            const bankSel = document.createElement('select');
            bankSel.className = 'track-bank';
            bankSel.id = `track-bank-${t}`;
            bankSel.title = 'Pattern bank — switching while playing applies at the loop start';
            for (let b = 0; b < this.sequencer.numPatterns; b++) {
                const opt = document.createElement('option');
                opt.value = b;
                opt.textContent = String.fromCharCode(65 + b);
                bankSel.appendChild(opt);
            }
            bankSel.value = this.sequencer.trackBanks[t];
            bankSel.addEventListener('change', (e) => {
                const result = this.sequencer.setTrackBank(t, parseInt(e.target.value));
                if (result === 'queued') {
                    bankSel.classList.add('bank-pending');
                } else {
                    this.renderTrack(t);
                    this.syncLenSelect(t);
                }
                e.target.blur();
            });

            const lenSel = document.createElement('select');
            lenSel.className = 'track-len';
            lenSel.id = `pat-len-${t}`;
            lenSel.title = "Loop length of this track's bank";
            for (let n = 1; n <= 32; n++) {
                const opt = document.createElement('option');
                opt.value = n;
                opt.textContent = n;
                lenSel.appendChild(opt);
            }
            lenSel.value = this.sequencer.patternLengths[this.sequencer.trackBanks[t]];
            lenSel.addEventListener('change', (e) => {
                this.sequencer.setPatternLength(this.sequencer.trackBanks[t], parseInt(e.target.value));
                this.renderTrack(t);
                e.target.blur();
            });

            side.appendChild(muteBtn);
            side.appendChild(soundSel);
            side.appendChild(bankSel);
            side.appendChild(lenSel);

            const grid = document.createElement('div');
            grid.className = 'seq-grid';
            grid.id = `sequencer-steps-${t}`;
            grid.style.flex = '1';

            row.appendChild(side);
            row.appendChild(grid);
            tracksEl.appendChild(row);
        }

        for (let trackIndex = 0; trackIndex < numTracks; trackIndex++) {
            const grid = document.getElementById(`sequencer-steps-${trackIndex}`);
            if (!grid) continue;

            for (let i = 0; i < 32; i++) {
                const col = document.createElement('div');
                col.className = 'step-col';

                const btn = document.createElement('div');
                btn.className = 'step-btn';
                btn.id = `step-btn-t${trackIndex}-${i}`;
                btn.title = 'Click: on/off · Ctrl+Click: accent · Right-click: tie · Shift+Click: P-Locks';

                btn.addEventListener('click', (e) => {
                    if (e.shiftKey) {
                        this.toggleEditStep(trackIndex, i);
                    } else if (e.ctrlKey || e.altKey || e.metaKey) {
                        // Toggle accent (303-style velocity boost)
                        const bankIdx = this.sequencer.trackBanks[trackIndex];
                        const newAccent = !this.sequencer.patterns[bankIdx][i].accent;
                        this.sequencer.setStepAccent(i, newAccent, bankIdx);
                        btn.classList.toggle('accent', newAccent);
                    } else {
                        btn.classList.toggle('active');
                        const isActive = btn.classList.contains('active');
                        this.sequencer.setStep(i, isActive, undefined, this.sequencer.trackBanks[trackIndex]);
                        // If deactivating, also remove tie
                        if (!isActive) {
                            this.sequencer.setStepTie(i, false, this.sequencer.trackBanks[trackIndex]);
                            btn.classList.remove('tie');
                            btn.parentElement.classList.remove('tie-step');
                        }
                    }
                });

                // Right-click on entire column to toggle tie
                col.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const bankIdx = this.sequencer.trackBanks[trackIndex];
                    const stepData = this.sequencer.patterns[bankIdx][i];
                    // Only allow tie on step index > 0
                    if (i === 0) return;
                    const newTie = !stepData.tie;
                    this.sequencer.setStepTie(i, newTie, bankIdx);
                    btn.classList.toggle('tie', newTie);
                    btn.parentElement.classList.toggle('tie-step', newTie);
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
                    this.sequencer.setStep(i, undefined, parseInt(e.target.value), this.sequencer.trackBanks[trackIndex]);
                    e.target.blur(); // keep focus off the select so typing plays notes again
                });

                col.appendChild(btn);
                col.appendChild(pitchSelect);
                grid.appendChild(col);
            }
        }

        for (let t = 0; t < numTracks; t++) {
            this.renderTrack(t);
        }

        this.sequencer.onBankApplied = (t) => {
            const bankSel = document.getElementById(`track-bank-${t}`);
            if (bankSel) {
                bankSel.classList.remove('bank-pending');
                bankSel.value = this.sequencer.trackBanks[t];
            }
            this.renderTrack(t);
            this.syncLenSelect(t);
        };

        this.initSongRow();

        this.sequencer.onRecord = (trackIndex, pos) => {
            this.renderTrack(trackIndex);
            const btn = document.getElementById(`step-btn-t${trackIndex}-${pos}`);
            if (btn) {
                btn.classList.add('rec-flash');
                setTimeout(() => btn.classList.remove('rec-flash'), 220);
            }
        };

        this.sequencer.onStep = (step) => {
            document.querySelectorAll('.step-btn').forEach(b => b.classList.remove('current'));

            if (step >= 0) {
                for (let trackIndex = 0; trackIndex < numTracks; trackIndex++) {
                    // Each track loops within its own bank length (polymetric)
                    const bank = this.sequencer.trackBanks[trackIndex];
                    const len = this.sequencer.patternLengths[bank];
                    const stepBtn = document.getElementById(`step-btn-t${trackIndex}-${step % len}`);
                    if (stepBtn) stepBtn.classList.add('current');
                }
            }
        };
    }

    syncLenSelect(trackIndex) {
        const lenSel = document.getElementById(`pat-len-${trackIndex}`);
        if (lenSel) lenSel.value = this.sequencer.patternLengths[this.sequencer.trackBanks[trackIndex]];
    }

    initSongRow() {
        const toggle = document.getElementById('song-mode');
        const chainEl = document.getElementById('song-chain');
        const addBtn = document.getElementById('song-add');
        const clearBtn = document.getElementById('song-clear');
        if (!toggle || !chainEl) return;

        const bankName = (i) => (i >= 0 && i < this.sequencer.numPatterns) ? String.fromCharCode(65 + i) : '?';

        const render = () => {
            chainEl.innerHTML = '';
            this.sequencer.songChain.forEach((scene, idx) => {
                const chip = document.createElement('div');
                chip.className = 'song-chip';
                chip.textContent = `${bankName(scene.banks[0])}${bankName(scene.banks[1])}×${scene.repeats}`;
                chip.title = 'Scene: banks for track 1+2 · Click: repeats +1 · Right-click: remove';
                if (this.sequencer.songMode && idx === this.sequencer.songIndex) chip.classList.add('active');
                chip.addEventListener('click', () => {
                    scene.repeats = scene.repeats % 8 + 1;
                    render();
                });
                chip.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.sequencer.songChain.splice(idx, 1);
                    render();
                });
                chainEl.appendChild(chip);
            });
        };
        this.renderSongChain = render;

        toggle.addEventListener('change', (e) => {
            this.sequencer.setSongMode(e.target.checked);
            render();
        });
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.sequencer.songChain.push({ banks: [...this.sequencer.trackBanks], repeats: 1 });
                render();
            });
        }
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.sequencer.songChain = [];
                render();
            });
        }

        // Song advanced to a new scene: sync bank selects and grids
        this.sequencer.onSongStep = () => {
            for (let t = 0; t < this.sequencer.numTracks; t++) {
                const bankSel = document.getElementById(`track-bank-${t}`);
                if (bankSel) bankSel.value = this.sequencer.trackBanks[t];
                this.renderTrack(t);
                this.syncLenSelect(t);
            }
            render();
        };
        render();
    }

    // Re-sync the whole sequencer UI after a project was loaded from storage
    refreshAfterLoad() {
        for (let t = 0; t < this.sequencer.numTracks; t++) {
            const bankSel = document.getElementById(`track-bank-${t}`);
            if (bankSel) bankSel.value = this.sequencer.trackBanks[t];
            const soundSel = document.getElementById(`track-sound-${t}`);
            if (soundSel) soundSel.value = this.sequencer.trackSoundIds[t] || '';
            const muteBtn = document.getElementById(`pattern-mute-${t}`);
            if (muteBtn) muteBtn.classList.toggle('active', !this.sequencer.trackMuted[t]);
            this.renderTrack(t);
            this.syncLenSelect(t);
        }
        const recTargetSel = document.getElementById('rec-target');
        if (recTargetSel) recTargetSel.value = this.sequencer.recTarget;

        const bpmRange = document.getElementById('seq-bpm-range');
        if (bpmRange) {
            bpmRange.value = this.sequencer.bpm;
            bpmRange.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const gateRange = document.getElementById('seq-gate');
        if (gateRange) {
            gateRange.value = this.sequencer.gate;
            gateRange.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const timeDivSelect = document.getElementById('seq-timediv');
        if (timeDivSelect) timeDivSelect.value = this.sequencer.timeDiv;

        const songToggle = document.getElementById('song-mode');
        if (songToggle) songToggle.checked = this.sequencer.songMode;
        if (this.renderSongChain) this.renderSongChain();

        this.updateUIFromParams();
    }

    renderTrack(trackIndex) {
        if (this.editStepIndex && this.editStepIndex.trackIndex === trackIndex) {
            this.editStepIndex = null;
            document.querySelectorAll('.step-btn').forEach(b => b.classList.remove('edit-mode'));
            this.updateUIFromParams();
        }

        const bankIdx = this.sequencer.trackBanks[trackIndex];
        const patternData = this.sequencer.patterns[bankIdx];
        const len = this.sequencer.patternLengths[bankIdx];

        for (let i = 0; i < 32; i++) {
            const btn = document.getElementById(`step-btn-t${trackIndex}-${i}`);
            if (!btn) continue;
            const select = btn.nextElementSibling;

            const stepData = patternData[i];

            btn.classList.toggle('active', stepData.active);
            btn.classList.toggle('tie', stepData.tie);
            btn.classList.toggle('accent', stepData.accent);
            btn.parentElement.classList.toggle('tie-step', stepData.tie);
            btn.parentElement.classList.toggle('beyond-length', i >= len);
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
            const bankIdx = this.sequencer.trackBanks[this.editStepIndex.trackIndex];
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
                    if (el.dataset && el.dataset.logMin) {
                        // Log-scaled slider: convert the value back to a 0..1 position
                        const lmin = parseFloat(el.dataset.logMin);
                        const lmax = parseFloat(el.dataset.logMax);
                        el.value = Math.log(parseFloat(value) / lmin) / Math.log(lmax / lmin);
                    } else {
                        el.value = value;
                    }
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
            
            key.addEventListener('mousedown', (e) => {
                if (this.synth.ctx.state !== 'running') return; // synth not powered on yet

                // Mouse has no pressure — use the vertical click position on the
                // key instead: top edge = 0.5, bottom edge = 1.0. Synthetic events
                // (computer keyboard, tests) are untrusted and play at full velocity.
                let velocity = 1;
                if (e.isTrusted) {
                    const rect = key.getBoundingClientRect();
                    const rel = (e.clientY - rect.top) / rect.height;
                    velocity = 0.5 + 0.5 * Math.min(1, Math.max(0, rel));
                }

                if (this.synth.params.master.arpOn) {
                    this.sequencer.addArpNote(i, velocity);
                } else {
                    this.synth.playNote(i, this.synth.ctx.currentTime, 0, {}, velocity);
                }
                this.sequencer.recordNote(i); // no-op unless REC is armed
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
            this.sequencer.clearArpNotes(); // also stops the sequencer if the arp auto-started it
            this.synth.stopAllNotes();
        });
    }
}
