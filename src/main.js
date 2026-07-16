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

// Restore the previous session; fall back to the default pattern (Funky Town)
const savedProject = persistence.loadProject();
if (savedProject) {
    applyPatch(savedProject.params);
    if (savedProject.seq) sequencer.loadState(savedProject.seq);
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
    presetSelect.value = id;
});

document.getElementById('patch-delete').addEventListener('click', () => {
    const id = presetSelect.value;
    if (!id.startsWith('user:')) return;
    if (!window.confirm('Delete this user patch?')) return;
    persistence.deleteUserPatch(id);
    refreshUserPatchOptions();
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
        uiController.refreshAfterLoad();
        refreshUserPatchOptions();
        persistence.saveProject();
    }
    importInput.value = '';
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

// Create shortcut labels on piano keys with default labels
Object.entries(codeMap).forEach(([code, note]) => {
    const keyEl = document.querySelector(`.key[data-note="${note}"]`);
    if (keyEl) {
        const shortcutLabel = document.createElement('span');
        shortcutLabel.className = 'key-shortcut';
        shortcutLabel.dataset.note = note;
        shortcutLabel.textContent = defaultLabels[code] || '';
        keyEl.appendChild(shortcutLabel);
    }
});

// Override with actual layout if available
const updateKeyLabel = (note, char) => {
    const label = document.querySelector(`.key-shortcut[data-note="${note}"]`);
    if (label) label.textContent = char.toUpperCase();
};

// Method 1: Keyboard Layout Map API (Chrome/Edge — instant)
if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
    navigator.keyboard.getLayoutMap().then(layoutMap => {
        Object.entries(codeMap).forEach(([code, note]) => {
            const char = layoutMap.get(code);
            if (char) updateKeyLabel(note, char);
        });
    }).catch(() => {});
}

// Method 2: Detect on keypress (Firefox — corrects labels for non-QWERTY layouts)
window.addEventListener('keydown', function labelDetector(e) {
    if (codeMap[e.code] && e.key.length === 1) {
        updateKeyLabel(codeMap[e.code], e.key);
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

// Dynamic Scaling for perfectly fitting the UI without overlaps
const handleResize = () => {
    const container = document.getElementById('app');
    const targetWidth = 1600;
    const targetHeight = 950;
    
    // Add small margin padding to screen dimensions
    const availableWidth = window.innerWidth - 20;
    const availableHeight = window.innerHeight - 20;
    
    const scaleX = availableWidth / targetWidth;
    const scaleY = availableHeight / targetHeight;
    const scale = Math.min(scaleX, scaleY, 1.2); // allow slight upscale up to 1.2x, but mainly downscale
    
    container.style.transform = `scale(${scale})`;
};

window.addEventListener('resize', handleResize);
handleResize(); // Initial call

