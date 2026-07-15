import { Synth } from './audio/Synth.js?v=2';
import { Sequencer } from './audio/Sequencer.js?v=2';
import { Visualizer } from './ui/Visualizer.js?v=2';
import { UIController } from './ui/UIController.js';
import { Presets } from './audio/Presets.js';
import { OscDraw } from './ui/OscDraw.js';

let audioContext = null;
let synth = null;
let sequencer = null;
let visualizer = null;
let uiController = null;
let oscDraw = null;

audioContext = new (window.AudioContext || window.webkitAudioContext)();
synth = new Synth(audioContext);
sequencer = new Sequencer(synth);
visualizer = new Visualizer(synth);
uiController = new UIController(synth, sequencer);

// Set default pattern: Funky Town
const defaultPattern = [0, 2, 4, 6, 10, 14, 16, 18, 20, 22];
defaultPattern.forEach(i => {
    document.getElementById(`step-btn-${i}`).click();
});

// Preset Handling
document.getElementById('preset-select').addEventListener('change', (e) => {
    const presetId = e.target.value;
    const preset = Presets[presetId];
    if (preset) {
        for (const [group, params] of Object.entries(preset.params)) {
            for (const [key, value] of Object.entries(params)) {
                synth.updateParams(group, key, value);
            }
        }
        uiController.updateUIFromParams();
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

// The browser requires user interaction to resume AudioContext
const initAudio = async () => {
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    
    visualizer.start();

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

// Keyboard synth playing for fun (Optional, just simple mono map)
const keyMap = {
    'a': 60, // C4
    'w': 61,
    's': 62,
    'e': 63,
    'd': 64,
    'f': 65,
    't': 66,
    'g': 67,
    'y': 68,
    'h': 69,
    'u': 70,
    'j': 71,
    'k': 72 // C5
};

window.addEventListener('keydown', (e) => {
    if (e.repeat) return; // Prevent key repeat triggering multiple notes
    if (audioContext && keyMap[e.key.toLowerCase()]) {
        const note = keyMap[e.key.toLowerCase()];
        const keyEl = document.querySelector(`.key[data-note="${note}"]`);
        if (keyEl) {
            keyEl.dispatchEvent(new MouseEvent('mousedown'));
        }
    }
});

window.addEventListener('keyup', (e) => {
    if (audioContext && keyMap[e.key.toLowerCase()]) {
        const note = keyMap[e.key.toLowerCase()];
        const keyEl = document.querySelector(`.key[data-note="${note}"]`);
        if (keyEl) {
            keyEl.dispatchEvent(new MouseEvent('mouseup'));
        }
    }
});

// Dynamic Scaling for perfectly fitting the UI without overlaps
const handleResize = () => {
    const container = document.getElementById('app');
    const targetWidth = 1300;
    const targetHeight = 900;
    
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

