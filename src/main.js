import { Synth } from './audio/Synth.js?v=2';
import { Sequencer } from './audio/Sequencer.js?v=2';
import { Visualizer } from './ui/Visualizer.js?v=2';
import { UIController } from './ui/UIController.js';
import { Presets } from './audio/Presets.js';
import { OscDraw } from './ui/OscDraw.js';
import { MidiInput } from './MidiInput.js';
import { Persistence } from './Persistence.js';

let audioContext = null;
let synth = null;
let sequencer = null;
let visualizer = null;
let uiController = null;
let oscDraw = null;
let midiInput = null;
let persistence = null;

audioContext = new (window.AudioContext || window.webkitAudioContext)();
synth = new Synth(audioContext);
sequencer = new Sequencer(synth);
visualizer = new Visualizer(synth);
uiController = new UIController(synth, sequencer);
midiInput = new MidiInput(synth, sequencer);
persistence = new Persistence(synth, sequencer);

// Apply a full parameter snapshot (factory preset, user patch, or import)
const applyPatch = (params) => {
    for (const [group, groupParams] of Object.entries(params)) {
        for (const [key, value] of Object.entries(groupParams)) {
            synth.updateParams(group, key, value);
        }
    }
    uiController.updateUIFromParams();
};

// Factory presets grouped by category (INIT stays a plain top-level option).
// Used by the preset dropdown and all four track-sound dropdowns.
const CATEGORY_ORDER = ['INIT', 'BASS', 'LEAD', 'KEYS', 'PAD', 'DRUMS', 'FX'];
const buildFactoryOptions = (sel) => {
    CATEGORY_ORDER.forEach(cat => {
        const items = Object.entries(Presets).filter(([, p]) => (p.cat || 'FX') === cat);
        if (items.length === 0) return;
        if (cat === 'INIT') {
            items.forEach(([id, p]) => sel.appendChild(new Option(p.name, id)));
            return;
        }
        const group = document.createElement('optgroup');
        group.label = cat;
        items.forEach(([id, p]) => group.appendChild(new Option(p.name, id)));
        sel.appendChild(group);
    });
};

// --- Per-track sounds (multi-timbrality) ---
// A track sound is a patch whose voice-level params are flattened to P-Locks
// and merged under each step's own locks at schedule time. Effects, LFOs and
// the master section stay global (shared FX bus, like real hardware).
const VOICE_LOCK_GROUPS = ['vco1', 'vco2', 'vco3', 'noise', 'filter', 'fEnv', 'aEnv', 'pEnv'];

const flattenPatchToLocks = (params) => {
    const locks = {};
    for (const group of VOICE_LOCK_GROUPS) {
        for (const [key, value] of Object.entries(params[group] || {})) {
            if (key === 'customWaveReal' || key === 'customWaveImag') continue; // drawn wave stays global
            locks[`${group}.${key}`] = value;
        }
    }
    return locks;
};

const resolveSoundParams = (id) => {
    if (!id) return null;
    if (id.startsWith('user:')) {
        const patch = persistence.getUserPatches()[id];
        return patch ? patch.params : null;
    }
    return Presets[id] ? Presets[id].params : null;
};

const applyTrackSound = (t, id) => {
    const params = resolveSoundParams(id);
    sequencer.setTrackSound(t, params ? id : null, params ? flattenPatchToLocks(params) : null);
};

const resolveAllTrackSounds = () => {
    for (let t = 0; t < sequencer.numTracks; t++) {
        applyTrackSound(t, sequencer.trackSoundIds[t]);
    }
};

// Fill the per-track sound dropdowns (LIVE + factory presets grouped by
// category + user patches)
const refreshTrackSoundOptions = () => {
    const patches = persistence.getUserPatches();
    for (let t = 0; t < sequencer.numTracks; t++) {
        const sel = document.getElementById(`track-sound-${t}`);
        if (!sel) continue;
        const current = sequencer.trackSoundIds[t] || '';
        sel.innerHTML = '';
        const live = document.createElement('option');
        live.value = '';
        live.textContent = 'LIVE';
        sel.appendChild(live);
        buildFactoryOptions(sel);
        const userIds = Object.keys(patches);
        if (userIds.length > 0) {
            const grp = document.createElement('optgroup');
            grp.label = 'USER';
            userIds.forEach(pid => {
                const opt = document.createElement('option');
                opt.value = pid;
                opt.textContent = patches[pid].name;
                grp.appendChild(opt);
            });
            sel.appendChild(grp);
        }
        sel.value = current;
        if (sel.value !== current) sel.value = ''; // referenced patch no longer exists
    }
};

for (let t = 0; t < sequencer.numTracks; t++) {
    const sel = document.getElementById(`track-sound-${t}`);
    if (!sel) continue;
    sel.addEventListener('change', (e) => {
        applyTrackSound(t, e.target.value || null);
        e.target.blur();
    });
}
refreshTrackSoundOptions();

// Restore the previous session; fall back to the default pattern (Funky Town)
const savedProject = persistence.loadProject();
if (savedProject) {
    applyPatch(savedProject.params);
    if (savedProject.seq) sequencer.loadState(savedProject.seq);
    resolveAllTrackSounds();
    refreshTrackSoundOptions();
    uiController.refreshAfterLoad();
} else {
    const defaultPattern = [0, 2, 4, 6, 10, 14, 16, 18, 20, 22];
    defaultPattern.forEach(i => {
        document.getElementById(`step-btn-t0-${i}`).click();
    });
}
persistence.startAutosave();

// Preset Handling (factory presets + user patches)
const presetSelect = document.getElementById('preset-select');
buildFactoryOptions(presetSelect);
presetSelect.value = 'init';

const refreshUserPatchOptions = () => {
    const oldGroup = document.getElementById('user-patch-group');
    if (oldGroup) oldGroup.remove();
    const patches = persistence.getUserPatches();
    const ids = Object.keys(patches);
    if (ids.length === 0) return;
    const group = document.createElement('optgroup');
    group.id = 'user-patch-group';
    group.label = 'USER PATCHES';
    ids.forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = patches[id].name;
        group.appendChild(opt);
    });
    presetSelect.appendChild(group);
};
refreshUserPatchOptions();

presetSelect.addEventListener('change', (e) => {
    const id = e.target.value;
    if (id.startsWith('user:')) {
        const patch = persistence.getUserPatches()[id];
        if (patch) applyPatch(patch.params);
    } else {
        const preset = Presets[id];
        if (preset) applyPatch(preset.params);
    }
    e.target.blur(); // Remove focus so typing doesn't accidentally change presets
});

// Patch save/delete and project export/import
document.getElementById('patch-save').addEventListener('click', () => {
    const name = window.prompt('Patch name:');
    if (!name || !name.trim()) return;
    const id = persistence.saveUserPatch(name.trim());
    refreshUserPatchOptions();
    refreshTrackSoundOptions();
    presetSelect.value = id;
});

document.getElementById('patch-delete').addEventListener('click', () => {
    const id = presetSelect.value;
    if (!id.startsWith('user:')) return;
    if (!window.confirm('Delete this user patch?')) return;
    persistence.deleteUserPatch(id);
    refreshUserPatchOptions();
    resolveAllTrackSounds(); // tracks that used the deleted patch fall back to LIVE
    refreshTrackSoundOptions();
    presetSelect.value = 'init';
});

document.getElementById('patch-export').addEventListener('click', () => persistence.exportProject());

const importInput = document.getElementById('patch-file');
document.getElementById('patch-import').addEventListener('click', () => importInput.click());
importInput.addEventListener('change', async () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    const data = persistence.importProjectData(await file.text());
    if (data) {
        applyPatch(data.params);
        if (data.seq) sequencer.loadState(data.seq);
        resolveAllTrackSounds();
        refreshTrackSoundOptions();
        uiController.refreshAfterLoad();
        refreshUserPatchOptions();
        persistence.saveProject();
    }
    importInput.value = '';
});

// Audio export: record the master output (post-limiter) to a file
const audioRecBtn = document.getElementById('audio-rec');
if (audioRecBtn && window.MediaRecorder) {
    let mediaRecorder = null;
    let chunks = [];

    audioRecBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            return;
        }
        chunks = [];
        mediaRecorder = new MediaRecorder(synth.recorderDest.stream);
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
            const type = mediaRecorder.mimeType || 'audio/webm';
            const ext = type.includes('ogg') ? 'ogg' : 'webm';
            const blob = new Blob(chunks, { type });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `neon-synth-recording.${ext}`;
            a.click();
            URL.revokeObjectURL(url);
            audioRecBtn.classList.remove('recording');
            audioRecBtn.textContent = '● REC AUDIO';
        };
        mediaRecorder.start();
        audioRecBtn.classList.add('recording');
        audioRecBtn.textContent = '■ STOP & SAVE';
    });
} else if (audioRecBtn) {
    audioRecBtn.disabled = true;
    audioRecBtn.title = 'MediaRecorder is not supported in this browser';
}

// Help overlay
const helpModal = document.getElementById('help-modal');
document.getElementById('help-btn').addEventListener('click', () => {
    helpModal.style.display = 'flex';
});
document.getElementById('btn-close-help').addEventListener('click', () => {
    helpModal.style.display = 'none';
});
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && helpModal.style.display === 'flex') {
        helpModal.style.display = 'none';
    }
});

// Custom Osc Logic
oscDraw = new OscDraw('osc-canvas', synth);

const modal = document.getElementById('osc-modal');
document.getElementById('btn-custom-osc').addEventListener('click', () => {
    modal.style.display = 'flex';
    synth.updateParams('vco1', 'wave', 'custom');
    uiController.updateUIFromParams(); 
    oscDraw.updateSynth();
});

document.getElementById('btn-close-modal').addEventListener('click', () => {
    modal.style.display = 'none';
});

// Add power off state
document.body.classList.add('power-off');

// Apply random animation offsets to create wobble variance
document.querySelectorAll('.glow-btn, .step-btn, .led-display, h1, h2, h3, input[type="range"], .slider, .wave-btn, .key').forEach(el => {
    el.style.animationDelay = `-${Math.random() * 7}s`;
});

// The browser requires user interaction to resume AudioContext
const initAudio = async () => {
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    visualizer.start();

    // Request MIDI access tied to the power-on gesture (triggers the permission prompt)
    midiInput.init();

    // Visual power on
    document.body.classList.remove('power-off');
    document.body.classList.add('powered-on');

    // Disable power button after init
    const powerBtn = document.getElementById('power-btn');
    powerBtn.textContent = 'SYSTEM ONLINE';
    powerBtn.classList.add('playing');
    powerBtn.disabled = true;
};

document.getElementById('power-btn').addEventListener('click', initAudio);

// Keyboard synth playing — uses e.code (physical key position) for layout independence
const codeMap = {
    'KeyA': 60, // C4
    'KeyW': 61, // C#4
    'KeyS': 62, // D4
    'KeyE': 63, // D#4
    'KeyD': 64, // E4
    'KeyF': 65, // F4
    'KeyT': 66, // F#4
    'KeyG': 67, // G4
    'KeyY': 68, // G#4 (physical position — Z on QWERTZ)
    'KeyH': 69, // A4
    'KeyU': 70, // A#4
    'KeyJ': 71, // B4
    'KeyK': 72  // C5
};

// Default labels based on physical key codes (QWERTY names as universal fallback)
const defaultLabels = {
    'KeyA': 'A', 'KeyW': 'W', 'KeyS': 'S', 'KeyE': 'E', 'KeyD': 'D',
    'KeyF': 'F', 'KeyT': 'T', 'KeyG': 'G', 'KeyY': 'Y', 'KeyH': 'H',
    'KeyU': 'U', 'KeyJ': 'J', 'KeyK': 'K'
};

// Layout heuristic for browsers without the Keyboard Layout Map API (Firefox):
// guess common non-QWERTY layouts from the UI language so the labels are
// right from the very first paint, not only after the first keypress.
const layoutGuess = (() => {
    const lang = ((navigator.languages && navigator.languages[0]) || navigator.language || '').toLowerCase();
    if (lang.startsWith('fr-ca')) return {}; // Canadian French keyboards are QWERTY-based
    if (lang.startsWith('de') || lang.startsWith('fr-ch') || /^(cs|sk|hu|sl|hr|bs|sr)/.test(lang)) {
        return { 'KeyY': 'Z' }; // QWERTZ: physical KeyY carries the Z cap
    }
    if (lang.startsWith('fr')) return { 'KeyA': 'Q', 'KeyW': 'Z' }; // AZERTY
    return {};
})();

// Labels learned in earlier sessions (covers any layout after first use)
const LABELS_KEY = 'neon-synth-key-labels';
let learnedLabels = {};
try { learnedLabels = JSON.parse(localStorage.getItem(LABELS_KEY)) || {}; } catch (e) { /* ignore */ }

const initialLabels = { ...defaultLabels, ...layoutGuess, ...learnedLabels };

// Create shortcut labels on piano keys
Object.entries(codeMap).forEach(([code, note]) => {
    const keyEl = document.querySelector(`.key[data-note="${note}"]`);
    if (keyEl) {
        const shortcutLabel = document.createElement('span');
        shortcutLabel.className = 'key-shortcut';
        shortcutLabel.dataset.note = note;
        shortcutLabel.textContent = initialLabels[code] || '';
        keyEl.appendChild(shortcutLabel);
    }
});

// Override with actual layout knowledge and remember it for the next session
const updateKeyLabel = (note, char) => {
    const label = document.querySelector(`.key-shortcut[data-note="${note}"]`);
    if (label) label.textContent = char.toUpperCase();
};

const rememberLabel = (code, char) => {
    const up = char.toUpperCase();
    if (learnedLabels[code] === up) return;
    learnedLabels[code] = up;
    try { localStorage.setItem(LABELS_KEY, JSON.stringify(learnedLabels)); } catch (e) { /* ignore */ }
};

// Method 1: Keyboard Layout Map API (Chrome/Edge — instant and exact)
if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
    navigator.keyboard.getLayoutMap().then(layoutMap => {
        Object.entries(codeMap).forEach(([code, note]) => {
            const char = layoutMap.get(code);
            if (char) {
                updateKeyLabel(note, char);
                rememberLabel(code, char);
            }
        });
    }).catch(() => {});
}

// Method 2: Detect on keypress (Firefox — corrects and persists any layout)
window.addEventListener('keydown', function labelDetector(e) {
    if (codeMap[e.code] && e.key.length === 1) {
        updateKeyLabel(codeMap[e.code], e.key);
        rememberLabel(e.code, e.key);
    }
}, { passive: true });

// Don't hijack keys while the user is typing/selecting in a form control
// (e.g. picking a note in a step's pitch dropdown)
const isTypingTarget = (el) => {
    if (!el || !el.tagName) return false;
    if (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type)) return true;
    return false;
};

window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return; // shortcuts (undo etc.) must not play notes
    if (isTypingTarget(e.target)) return;
    if (audioContext && codeMap[e.code]) {
        const note = codeMap[e.code];
        const keyEl = document.querySelector(`.key[data-note="${note}"]`);
        if (keyEl) {
            keyEl.dispatchEvent(new MouseEvent('mousedown'));
        }
    }
});

window.addEventListener('keyup', (e) => {
    if (isTypingTarget(e.target)) return;
    if (audioContext && codeMap[e.code]) {
        const note = codeMap[e.code];
        const keyEl = document.querySelector(`.key[data-note="${note}"]`);
        if (keyEl) {
            keyEl.dispatchEvent(new MouseEvent('mouseup'));
        }
    }
});

// Dynamic Scaling: the app is a fixed 1600x920 canvas that gets scaled
// uniformly to fit the window — no internal reflow, so nothing can overlap.
const handleResize = () => {
    const container = document.getElementById('app');
    const targetWidth = 1604; // container incl. border
    const targetHeight = 1074;

    // Small margin so the glow/shadow isn't clipped at the edges
    const availableWidth = window.innerWidth - 20;
    const availableHeight = window.innerHeight - 20;

    const scaleX = availableWidth / targetWidth;
    const scaleY = availableHeight / targetHeight;
    const scale = Math.min(scaleX, scaleY, 1.15); // allow slight upscale, but mainly downscale

    container.style.transform = `scale(${scale})`;
};

window.addEventListener('resize', handleResize);
handleResize(); // Initial call

