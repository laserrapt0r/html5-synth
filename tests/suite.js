// Neon Synth headless test suite.
// Injected into a copy of index.html by tests/run-tests.sh and executed in
// headless Chromium. Output format: "TEST PASS: ..." / "TEST FAIL: ..." lines
// plus a final "TEST DONE ..." summary the runner script parses.
//
// Timing rules learned the hard way: under --virtual-time-budget, timers are
// fast-forwarded while the audio clock and performance.now() run in real
// time. Never assert on *rendered* audio values after a sleep — spy on the
// scheduled automation calls or simulate timestamps instead.
import { Synth } from '../src/audio/Synth.js?v=2';
import { Sequencer } from '../src/audio/Sequencer.js?v=2';
import { MidiInput } from '../src/MidiInput.js';
import { Persistence } from '../src/Persistence.js';
import { Presets } from '../src/audio/Presets.js';
import { flattenPatchToLocks } from '../src/main.js';

const errors = [];
let passed = 0;
let failed = 0;
window.addEventListener('error', e => errors.push('onerror: ' + e.message));
window.addEventListener('unhandledrejection', e => errors.push('rejection: ' + e.reason));

const log = m => console.log('TEST ' + m);
const assert = (cond, name) => {
    if (cond) { passed++; log('PASS: ' + name); }
    else { failed++; log('FAIL: ' + name); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    try {
        // ---------------- App boot & UI ----------------
        document.getElementById('power-btn').click();
        await sleep(300);

        // The initial default-pattern setup must not be undoable
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
        assert(document.getElementById('step-btn-t0-22').classList.contains('active'),
            'boot setup is not part of the undo history');

        // Preset dropdown: grouped, complete, mapped
        const presetSel = document.getElementById('preset-select');
        assert(presetSel.querySelectorAll('optgroup').length >= 5, 'preset select is grouped by category');
        assert(presetSel.options.length === Object.keys(Presets).length, 'preset select covers all factory presets');

        // Load every preset through the real UI
        for (const id of Object.keys(Presets)) {
            presetSel.value = id;
            presetSel.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(20);
        }
        assert(true, 'all presets load through the UI without errors');
        presetSel.value = 'cyber-bass';
        presetSel.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(30);
        assert(document.getElementById('dist-on').checked === true, 'preset FX state reaches the checkboxes');

        // Transport
        const playBtn = document.getElementById('seq-play');
        const w1 = playBtn.offsetWidth;
        playBtn.click();
        await sleep(150);
        assert(playBtn.textContent === 'PAUSE' && playBtn.offsetWidth === w1, 'PLAY toggles to PAUSE without shifting');
        playBtn.click();
        document.getElementById('seq-stop').click();
        assert(playBtn.textContent === 'PLAY', 'STOP resets the transport');

        // 4 track rows complete
        let rowsOk = true;
        for (let t = 0; t < 4; t++) {
            rowsOk = rowsOk && !!(document.getElementById(`sequencer-steps-${t}`) &&
                document.getElementById(`track-sound-${t}`) &&
                document.getElementById(`track-bank-${t}`) &&
                document.getElementById(`pat-len-${t}`) &&
                document.getElementById(`track-level-${t}`) &&
                document.getElementById(`pattern-mute-${t}`));
        }
        assert(rowsOk, 'all 4 track rows complete (grid, sound, bank, len, level, mute)');
        assert(document.getElementById('track-sound-1').querySelectorAll('optgroup').length >= 5,
            'track sound selects are grouped');

        // Undo/redo
        const stepBtn = document.getElementById('step-btn-t0-9');
        const wasActive = stepBtn.classList.contains('active');
        stepBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
        assert(stepBtn.classList.contains('active') === wasActive, 'Ctrl+Z undoes a step edit');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }));
        assert(stepBtn.classList.contains('active') !== wasActive, 'Ctrl+Y redoes it');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));

        // Wheel gestures on steps
        const wheelBtn = document.getElementById('step-btn-t0-4');
        const fireWheel = (opts) => wheelBtn.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ...opts }));
        fireWheel({ deltaY: 100 });
        assert(wheelBtn.querySelector('.step-info').textContent === '75%', 'wheel sets probability');
        fireWheel({ deltaY: -100, shiftKey: true });
        assert(wheelBtn.querySelector('.step-info').textContent.includes('×2'), 'shift+wheel sets ratchet');
        fireWheel({ deltaY: -100, ctrlKey: true });
        assert(wheelBtn.querySelector('.step-info').textContent.includes('1:2'), 'ctrl+wheel sets trig condition');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));

        // Shared bank: the info line updates on every track showing that bank
        const bankSel1 = document.getElementById('track-bank-1');
        bankSel1.value = '0'; // same bank as track 1
        bankSel1.dispatchEvent(new Event('change', { bubbles: true }));
        const sharedBtn = document.getElementById('step-btn-t0-6');
        sharedBtn.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
        assert(document.querySelector('#step-btn-t1-6 .step-info').textContent === '75%',
            'wheel edits update the info line on all tracks sharing the bank');
        sharedBtn.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })); // back to 100%
        bankSel1.value = '1';
        bankSel1.dispatchEvent(new Event('change', { bubbles: true }));

        // Slider wheel acceleration
        const tune = document.getElementById('vco1-tune');
        tune.value = 0;
        tune._lastWheelTime = performance.now() - 300;
        tune.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
        assert(parseFloat(tune.value) === 1, 'slow slider wheel = single step');
        tune.value = 0;
        tune._lastWheelTime = 0;
        for (let i = 0; i < 5; i++) tune.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
        assert(parseFloat(tune.value) > 20, 'fast slider wheel accelerates');

        // Octave shift
        document.getElementById('kb-oct-up').click();
        assert(document.getElementById('kb-oct-display').textContent === '+1' &&
               document.querySelector('.key[data-note="60"] .key-label').textContent === 'C5',
            'octave shift relabels the keys');
        document.getElementById('kb-oct-down').click();

        // Help overlay
        document.getElementById('help-btn').click();
        assert(document.getElementById('help-modal').style.display === 'flex', 'help overlay opens');
        document.getElementById('btn-close-help').click();
        assert(document.getElementById('help-modal').style.display === 'none', 'help overlay closes');

        // Metronome + audio recorder buttons
        document.getElementById('seq-click').click();
        assert(document.getElementById('seq-click').classList.contains('playing'), 'metronome toggles');
        document.getElementById('seq-click').click();
        const arBtn = document.getElementById('audio-rec');
        arBtn.click();
        await sleep(150);
        const recStarted = arBtn.classList.contains('recording');
        arBtn.click();
        await sleep(300);
        assert(recStarted && !arBtn.classList.contains('recording'), 'audio recorder starts and stops');

        // Song chips (4-track labels)
        document.getElementById('song-add').click();
        const chip = document.querySelector('.song-chip');
        assert(chip && /^[A-H]{4}×\d$/.test(chip.textContent), 'song chip names all four banks');
        document.getElementById('song-clear').click();

        // ---------------- Preset data integrity ----------------
        const groups = ['master', 'vco1', 'vco2', 'vco3', 'noise', 'filter', 'fEnv', 'pEnv', 'aEnv', 'lfo1', 'lfo2', 'effects'];
        const incomplete = Object.entries(Presets)
            .filter(([, p]) => !p.cat || groups.some(g => !p.params[g]))
            .map(([id]) => id);
        assert(incomplete.length === 0, 'every preset has a category and all param groups');
        assert(Object.keys(Presets).length >= 28, 'factory preset count');
        assert(Object.values(Presets).filter(p => p.cat === 'DRUMS').length >= 7, 'drum kit presets present');
        assert(Presets['acid-pluck'].params.filter.slope === 24 &&
               parseFloat(Presets['wobble-bass'].params.lfo1.sync) > 0 &&
               Presets['solina-strings'].params.effects['chorus-on'] === true,
            'sound-pass applied to existing presets');

        // ---------------- Engine ----------------
        const ctx = new AudioContext();
        await ctx.resume();
        const synth = new Synth(ctx);

        assert(synth.limiter && synth.limiter.threshold.value === -3 && !!synth.recorderDest,
            'master limiter and recorder tap in the chain');
        assert(Math.abs(synth.lfo1.frequency.value - 5) < 0.001 && synth.lfo1PwmGain.gain.value === 0,
            'LFO1 initialised from params');
        assert(synth.maxVoices === 16, 'voice limit is 16');

        // Velocity
        synth.playNote(61, ctx.currentTime, 0, {}, 0.5);
        assert(synth.activeVoices[61] && synth.activeVoices[61].velocity === 0.5, 'velocity reaches the voice');
        synth.stopNote(61, ctx.currentTime);

        // Unison
        synth.updateParams('master', 'unison', '2');
        synth.updateParams('master', 'uniDetune', '20');
        synth.updateParams('master', 'spread', '0.6');
        synth.playNote(70, ctx.currentTime);
        const u = synth.activeVoices[70];
        assert(u.unisonSiblings.length === 1 && u.unisonDetune === -20 &&
               Math.abs(u.panner.pan.value + 0.6) < 0.001,
            'unison spawns detuned, panned siblings');
        synth.stopNote(70, ctx.currentTime);
        assert(u.isStopping && u.unisonSiblings[0].isStopping, 'note-off stops the whole unison group');
        synth.updateParams('master', 'unison', '1');

        // Mono note memory + click-free retrigger
        synth.params.master.polyphony = 'mono';
        synth.playNote(60, ctx.currentTime);
        const mv = synth.monoVoice;
        const gainSets = [];
        const origSet = mv.output.gain.setValueAtTime.bind(mv.output.gain);
        mv.output.gain.setValueAtTime = (v, t) => { gainSets.push(v); return origSet(v, t); };
        synth.playNote(64, ctx.currentTime + 0.3);
        assert(gainSets.some(v => v > 0.3), 'mono retrigger starts from the current envelope level');
        synth.stopNote(64, ctx.currentTime + 0.4);
        assert(synth.currentMonoNote === 60, 'mono note memory falls back to the held key');
        synth.stopNote(60, ctx.currentTime + 0.5);
        synth.params.master.polyphony = 'poly';

        // Sustain pedal
        synth.playNote(62, ctx.currentTime);
        synth.setSustain(true);
        synth.stopNote(62, ctx.currentTime);
        assert(synth._sustained.length === 1 && !synth._sustained[0].isStopping, 'sustain pedal holds released notes');
        synth.setSustain(false);
        assert(synth._sustained.length === 0, 'pedal release stops them');

        // Pitch bend
        const bendVals = [];
        const origBend = synth.bendSource.offset.setTargetAtTime.bind(synth.bendSource.offset);
        synth.bendSource.offset.setTargetAtTime = (v, t, tc) => { bendVals.push(v); return origBend(v, t, tc); };
        synth.setPitchBend(2);
        assert(bendVals[bendVals.length - 1] === 200, 'pitch bend +2 st = +200 cents');

        // LFO tempo sync
        synth.updateParams('lfo1', 'sync', '1');
        assert(Math.abs(synth.lfo1.frequency.value - 2) < 0.001, 'LFO sync: 1 beat at 120 BPM = 2 Hz');
        synth.updateParams('lfo1', 'sync', '0');

        // Chorus
        synth.updateParams('effects', 'chorus-rate', '1.2');
        assert(Math.abs(synth.effects.chorusLfoA.frequency.value - 1.2) < 0.001, 'chorus rate applied');

        // Delay sync + BPM re-sync
        const delayTimes = [];
        const origSetDelay = synth.effects.setDelay.bind(synth.effects);
        synth.effects.setDelay = (on, t, fb, mix) => { delayTimes.push(parseFloat(t)); return origSetDelay(on, t, fb, mix); };
        synth.updateParams('effects', 'delay-sync', '0.5');
        assert(Math.abs(delayTimes[delayTimes.length - 1] - 0.25) < 0.001, 'delay sync 1/8 at 120 BPM = 0.25 s');
        const seqBpm = new Sequencer(synth);
        seqBpm.setBpm(60);
        assert(Math.abs(delayTimes[delayTimes.length - 1] - 0.5) < 0.001, 'BPM change re-syncs the delay');
        synth.updateParams('effects', 'delay-sync', '0');
        seqBpm.setBpm(120);

        // Keytracking + 24 dB slope
        synth.params.filter.keytrack = 1;
        synth.params.filter.slope = 24;
        synth.playNote(72, ctx.currentTime);
        const kv = synth.activeVoices[72];
        assert(Math.abs(kv._keytrackMult() - 2) < 0.01 && kv._slope24 === true,
            'keytracking and 24 dB slope active on the voice');
        synth.stopNote(72, ctx.currentTime);
        synth.params.filter.keytrack = 0;
        synth.params.filter.slope = 12;

        // Live cutoff
        synth.playNote(60, ctx.currentTime);
        const lv = synth.activeVoices[60];
        const freqTargets = [];
        const origFT = lv.filter.frequency.setTargetAtTime.bind(lv.filter.frequency);
        lv.filter.frequency.setTargetAtTime = (v, t, tc) => { freqTargets.push(v); return origFT(v, t, tc); };
        synth.updateParams('filter', 'cutoff', '5000');
        await sleep(30);
        assert(freqTargets.some(v => v > 5000), 'live cutoff re-targets sounding voices');
        synth.stopNote(60, ctx.currentTime);

        // Pitch envelope scheduling
        synth.updateParams('pEnv', 'amt', '36');
        synth.playNote(64, ctx.currentTime);
        const pv = synth.activeVoices[64];
        const penvSets = [];
        const origPSet = pv.pitchEnvSource.offset.setValueAtTime.bind(pv.pitchEnvSource.offset);
        pv.pitchEnvSource.offset.setValueAtTime = (v, t) => { penvSets.push(v); return origPSet(v, t); };
        pv.triggerPitchEnvelope(ctx.currentTime);
        assert(penvSets.includes(3600), 'pitch envelope schedules +3600 cents');
        synth.stopNote(64, ctx.currentTime);
        synth.updateParams('pEnv', 'amt', '0');

        // Voice cleanup severs external connections
        synth.playNote(66, ctx.currentTime, 0, {}, 0.8);
        const cv = synth.activeVoices[66];
        synth.stopNote(66, ctx.currentTime);
        await sleep(1600);
        assert(cv.isActive === false && cv.externalConnections.length === 0, 'voice cleanup severs LFO connections');

        // ---------------- Sequencer ----------------
        const seq = new Sequencer(synth);
        const played = [];
        const realPlay = synth.playNote.bind(synth);
        const realSlide = synth.slideNote.bind(synth);
        synth.playNote = (...a) => played.push({ note: a[0], time: a[1], dur: a[2], locks: a[3], vel: a[4], abs: seq.absStep });
        const slid = [];
        synth.slideNote = (...a) => slid.push(a);

        // Slides
        seq.setStep(0, true, 60, 0);
        seq.setStepTie(1, true, 0);
        seq.setStep(1, undefined, 63, 0);
        seq.trackBanks = [0, 4, 5, 6];
        seq.absStep = 0;
        seq.scheduleNote(0, ctx.currentTime);
        seq.absStep = 1;
        seq.scheduleNote(1, ctx.currentTime + 0.1);
        assert(played.length === 1 && slid.length === 1 && slid[0][1] === 63,
            'tie with different pitch slides instead of retriggering');
        seq.setStepTie(1, false, 0);

        // Probability / ratchet / condition (positions derive from absStep)
        played.length = 0;
        seq.absStep = 0;
        seq.patterns[0][0].prob = 0;
        for (let k = 0; k < 10; k++) seq.scheduleNote(0, ctx.currentTime);
        assert(played.length === 0, 'probability 0 never triggers');
        seq.patterns[0][0].prob = 1;
        seq.patterns[0][0].ratchet = 3;
        seq.absStep = 0;
        seq.scheduleNote(0, ctx.currentTime);
        assert(played.length === 3 && played[1].time > played[0].time, 'ratchet 3 spawns three spaced hits');
        seq.patterns[0][0].ratchet = 1;
        played.length = 0;
        seq.patterns[0][0].cond = '1:2';
        seq.absStep = 0;
        seq.scheduleNote(0, ctx.currentTime);
        seq.absStep = 32;
        seq.scheduleNote(0, ctx.currentTime);
        assert(played.length === 1, 'condition 1:2 plays every other loop');
        seq.patterns[0][0].cond = null;

        // Polymetric loop across the 32-step wrap
        played.length = 0;
        seq.setPatternLength(0, 24);
        seq.absStep = 0;
        seq.currentStep = 0;
        seq.nextNoteTime = ctx.currentTime;
        for (let i = 0; i < 72; i++) {
            seq.scheduleNote(seq.currentStep, seq.nextNoteTime);
            seq.nextNote();
        }
        assert(played.map(p => p.abs).join(',') === '0,24,48', '24-step pattern loops at 24/48, not at 32');
        seq.setPatternLength(0, 32);

        // Track sounds: merge, override, layering, level
        played.length = 0;
        seq.setTrackSound(0, 'kick-drum', { 'vco1.wave': 'sine', 'filter.cutoff': 900 });
        seq.setStepLock(0, 'filter', 'cutoff', '333', 0);
        seq.absStep = 0;
        seq.scheduleNote(0, ctx.currentTime);
        assert(played[0].locks['vco1.wave'] === 'sine' && played[0].locks['filter.cutoff'] === '333',
            'track sound merges under step P-Locks');
        played.length = 0;
        seq.trackBanks = [0, 0, 0, 6];
        seq.setTrackSound(1, 'noise-perc', { 'noise.level': 1 });
        seq.setTrackSound(2, null, null);
        seq.scheduleNote(0, ctx.currentTime);
        assert(played.length === 3, 'same bank layers with different sounds');
        played.length = 0;
        seq.setTrackLevel(2, 0.5);
        seq.scheduleNote(0, ctx.currentTime);
        const liveHit = played.find(p => p.vel === 0.5);
        assert(!!liveHit, 'track level scales the velocity');
        seq.setTrackLevel(2, 1);
        seq.setStepLock(0, 'filter', 'cutoff', undefined, 0);

        // Pattern tools
        seq.patterns[0][5].active = true;
        seq.patterns[0][5].note = 65;
        const clip = seq.copyPattern(0);
        seq.clearPattern(0);
        assert(!seq.patterns[0][5].active, 'clearPattern empties the bank');
        seq.pastePattern(0, clip);
        seq.shiftPattern(0, 1);
        assert(seq.patterns[0][6].active && seq.patterns[0][6].note === 65, 'paste + rotate work');

        // Quantized bank switch + song scenes
        seq.isPlaying = true;
        assert(seq.setTrackBank(0, 2) === 'queued', 'bank switch queues while playing');
        seq.scheduleNote(0, ctx.currentTime);
        assert(seq.trackBanks[0] === 2, 'queued bank applies at the loop start');

        // STOP applies (not drops) a still-pending switch and notifies the UI
        seq.setTrackBank(1, 5);
        const applied = [];
        seq.onBankApplied = (t, b) => applied.push([t, b]);
        seq.stop();
        assert(seq.trackBanks[1] === 5 && applied.some(([t, b]) => t === 1 && b === 5),
            'STOP applies pending bank switches and fires the UI callback');
        seq.onBankApplied = null;
        seq.isPlaying = false;
        seq.songChain = [{ banks: [2, 3, 4, 5], repeats: 1 }, { banks: [0, 1, 2, 3], repeats: 1 }];
        seq.setSongMode(true);
        seq.scheduleNote(0, ctx.currentTime);
        const scene1 = seq.trackBanks.join(',');
        seq.scheduleNote(0, ctx.currentTime);
        assert(scene1 === '2,3,4,5' && seq.trackBanks.join(',') === '0,1,2,3', 'song scenes apply and advance');
        seq.setSongMode(false);

        // Recording target + count-in (count-in requires the metronome)
        const seqR = new Sequencer(synth);
        seqR.setRecording(true);
        seqR.recTarget = 2;
        seqR.recordNote(66);
        assert(seqR.patterns[seqR.trackBanks[2]][0].note === 66, 'recording writes into the target track');
        let t0 = ctx.currentTime;
        seqR.play();
        assert(seqR.nextNoteTime < t0 + 0.5, 'REC without metronome starts immediately (no silent count-in)');
        seqR.pause();
        seqR.currentStep = 0;
        seqR.metronomeOn = true;
        t0 = ctx.currentTime;
        seqR.play();
        assert(seqR.nextNoteTime > t0 + 1.5, 'REC + metronome prepends a one-bar count-in');

        // Notes played during the count-in land on step 1, not at the loop end
        seqR.recordNote(59);
        assert(seqR.patterns[seqR.trackBanks[2]][0].note === 59 && seqR.patterns[seqR.trackBanks[2]][0].active,
            'recording during the count-in lands on the first step');
        seqR.metronomeOn = false;
        seqR.stop();

        // Legacy project migration
        const seqM = new Sequencer(synth);
        seqM.loadState({
            trackBanks: [2, 3], patternLengths: [8, 8],
            songChain: [{ banks: [1, 0], repeats: 2 }]
        });
        assert(seqM.trackBanks[0] === 2 && seqM.trackBanks[2] === 2 &&
               seqM.patternLengths[0] === 8 && seqM.patternLengths[7] === 32 &&
               seqM.songChain[0].banks.length === 4,
            'legacy 2-track project merges cleanly');

        synth.playNote = realPlay;
        synth.slideNote = realSlide;

        // Track-sound isolation from the global preset
        const flat = flattenPatchToLocks(Presets['snare-drum'].params);
        assert(flat['master.polyphony'] === 'poly' && flat['lfo1.pitch'] === 0 && flat['lfo1.cutoff'] === 0,
            'flattened track sounds force poly and carry their own LFO depths');
        synth.params.master.polyphony = 'mono';
        synth.updateParams('lfo1', 'pitch', '200'); // wobbly global preset
        synth.playNote(80, ctx.currentTime, 0, flat);
        const iso = synth.activeVoices[80];
        assert(!!iso, 'track sound plays poly even while the panel is mono');
        assert(iso.ownedNodes.length >= 2 && iso.ownedNodes.every(g => g.gain.value === 0),
            'per-voice LFO depths shield the track from global modulation');
        synth.stopNote(80, ctx.currentTime);
        synth.params.master.polyphony = 'poly';
        synth.updateParams('lfo1', 'pitch', '0');
        const uniLocks = { 'master.unison': 3, 'master.uniDetune': 20, 'master.spread': 0.5 };
        synth.playNote(81, ctx.currentTime, 0, uniLocks);
        assert(synth.activeVoices[81].unisonSiblings.length === 2, 'per-note unison override from track sound');
        synth.stopNote(81, ctx.currentTime);

        // Slide reaches forced-poly voices even while the panel is mono
        synth.params.master.polyphony = 'mono';
        synth.playNote(90, ctx.currentTime, 0, { 'master.polyphony': 'poly' });
        synth.slideNote(90, 93, ctx.currentTime);
        assert(Math.abs(synth.activeVoices[90].noteFrequency - synth.noteToFreq(93)) < 0.01,
            'slide finds the poly voice under a mono panel');
        synth.stopNote(90, ctx.currentTime);
        synth.params.master.polyphony = 'poly';

        // Switching to mono while a poly key is held must not leave it hanging
        synth.playNote(91, ctx.currentTime);
        const heldPoly = synth.activeVoices[91];
        synth.params.master.polyphony = 'mono';
        synth.stopNote(91, ctx.currentTime);
        assert(heldPoly.isStopping && !synth.activeVoices[91],
            'note released after a poly->mono switch mid-hold');
        synth.params.master.polyphony = 'poly';

        // Pedal-sustained voices count against the voice budget
        synth.setSustain(true);
        for (let n = 30; n < 55; n++) {
            synth.playNote(n, ctx.currentTime);
            synth.stopNote(n, ctx.currentTime);
        }
        assert(synth._totalActiveVoices() <= synth.maxVoices,
            'voice budget includes pedal-sustained voices');
        synth.setSustain(false);

        // Unison groups count as real voices against the budget
        synth.updateParams('master', 'unison', '3');
        for (let n = 84, k = 0; k < 8; k++, n++) synth.playNote(n, ctx.currentTime);
        assert(synth._totalActiveVoices() <= synth.maxVoices,
            'voice budget respects unison group sizes');
        synth.stopAllNotes();
        synth.updateParams('master', 'unison', '1');

        // ---------------- Persistence ----------------
        const pers = new Persistence(synth, seq);
        synth.params.filter.cutoff = '4321';
        seq.patterns[0][7].active = true;
        seq.setTrackLevel(1, 0.8);
        pers.saveProject();
        const synth2 = new Synth(ctx);
        const seq2 = new Sequencer(synth2);
        const pers2 = new Persistence(synth2, seq2);
        const data = pers2.loadProject();
        seq2.loadState(data.seq);
        assert(data.params.filter.cutoff === '4321' && seq2.patterns[0][7].active &&
               Math.abs(seq2.trackLevels[1] - 0.8) < 0.001,
            'project round-trip keeps params, patterns and track levels');
        const patchId = pers2.saveUserPatch('Suite Patch');
        assert(pers2.getUserPatches()[patchId].name === 'SUITE PATCH', 'user patch saved');
        pers2.deleteUserPatch(patchId);
        assert(!pers2.getUserPatches()[patchId], 'user patch deleted');

        // ---------------- MIDI mapping ----------------
        const midi = new MidiInput(synth2, seq2);
        midi.handleMessage({ data: new Uint8Array([0x90, 64, 100]) });
        const expectedVel = (100 / 127) * (100 / 127);
        assert(synth2.activeVoices[64] && Math.abs(synth2.activeVoices[64].velocity - expectedVel) < 0.001,
            'MIDI note-on applies squared velocity');
        midi.handleMessage({ data: new Uint8Array([0x80, 64, 0]) });
        assert(!synth2.activeVoices[64], 'MIDI note-off releases');
        const bends = [];
        synth2.setPitchBend = (v) => bends.push(v);
        midi.handleMessage({ data: new Uint8Array([0xe0, 0, 96]) }); // 96<<7 = 12288 -> +1 st
        assert(bends.length === 1 && Math.abs(bends[0] - 1) < 0.01, 'MIDI pitch bend maps to semitones');
        const sus = [];
        synth2.setSustain = (v) => sus.push(v);
        midi.handleMessage({ data: new Uint8Array([0xb0, 64, 127]) });
        midi.handleMessage({ data: new Uint8Array([0xb0, 64, 0]) });
        assert(sus.join(',') === 'true,false', 'MIDI sustain pedal maps to on/off');
    } catch (e) {
        errors.push('driver: ' + (e && e.stack || e));
    }

    errors.forEach(e => log('ERROR: ' + e));
    log(`DONE passed=${passed} failed=${failed} errors=${errors.length}`);
})();
