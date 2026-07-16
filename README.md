# Neon Synth

Neon Synth is a browser-based analog-style synthesizer and 32-step sequencer built with the Web Audio API —
no frameworks, no build step, just ES modules. It features a retro-futuristic neon aesthetic and packs
features typically found on hardware synths.

🎵 **[Play Neon Synth Live Here!](https://laserrapt0r.github.io/html5-synth/)** 🎵

## Features

- **3-Oscillator Engine** with Poly, Mono and Legato voice modes (8-voice polyphony with voice stealing).
  Classic analog waveforms (Saw, Square, Triangle, Sine) plus White/Pink Noise and Glide/Portamento.
  Mono mode has **note memory** (release falls back to still-held keys) and click-free envelope retriggering.
- **Stereo Unison:** Up to 3 detuned voices per note spread across the stereo field, plus per-note
  voice panning (SPREAD) — the whole signal path is stereo.
- **Live Performance Feel:** The filter cutoff (log-scaled knob) acts on *sounding* notes, and all
  parameter changes are smoothed to avoid zipper noise.
- **Velocity Support:** MIDI velocity, mouse position on the on-screen keys, and sequencer accents all
  scale loudness *and* filter envelope depth — just like real hardware.
- **MIDI Input:** Plug in a MIDI keyboard and play with full velocity (Chromium/Firefox, hot-plug supported).
- **Custom Oscillator Drawing:** Draw your own waveform on a canvas — the engine computes the Fourier
  coefficients and synthesizes your drawing in real time.
- **Pulse Width Modulation (PWM)** and a **Pitch Envelope** (±48 semitones, for kicks and zaps).
- **Dual LFOs:** LFO1 modulates Pitch, Filter Cutoff and PWM; LFO2 is a tremolo. Both include a
  Random (Sample & Hold) mode for generative textures.
- **32-Step Sequencer** with two pattern tracks, four banks (A–D) with **individual loop lengths**
  (polymetric patterns!), per-track mute, **ties & 303-style slides** (a tie step with a different
  pitch glides there), **accents**, per-step **Parameter Locks**, quantized bank switching and
  **live/step recording** from any keyboard.
- **Song Mode:** Chain bank scenes with repeat counts into full arrangements.
- **Arpeggiator:** 8 modes, 1–3 octaves, proper latch (a new chord replaces the old one), synced to the clock.
- **Swing, Gate & Time Division** (1/8, 1/16, 1/32); transport with Play/Pause and Stop.
- **Effects Rack:** Distortion, Feedback Delay (free or **BPM-synced**) and Convolution Reverb.
- **Patch & Project Management:** The whole state (sound + patterns + song) autosaves to the browser;
  save your own patches into the preset list, export/import everything as a JSON file.
- **18 Factory Presets:** Basses, pads, leads, organs and drones — plus sound-design showcases like
  "KICK DRUM" (pitch envelope), "SCI-FI COMPUTER" (S&H LFO), "JUNO PWM PAD" (stereo unison PWM),
  "ARP DREAMS" (latched arpeggiator) and "NOISE PERC" (noise percussion for the second track).

## Getting Started

1. Serve the project folder with any static web server (ES modules don't load from `file://`):
   ```bash
   python3 -m http.server      # then open http://localhost:8000
   ```
   Or simply use the [live version](https://laserrapt0r.github.io/html5-synth/).
2. Click **INIT AUDIO** to power on (browsers require a user gesture to start audio).
   This also triggers the MIDI permission prompt if a device is connected.
3. Play the on-screen keyboard with the mouse (click lower on a key = louder), use your computer
   keyboard (A–K row, layout-independent), or connect a MIDI keyboard.
4. Hit **PLAY** on the sequencer and tweak the knobs.

## Sequencer Controls

| Gesture | Action |
|---|---|
| Click on a step | Toggle step on/off |
| **Ctrl+Click** on a step | Toggle **accent** (velocity boost, orange LED) |
| **Right-click** on a step column | Toggle **tie** — extends the previous note; give the tie step a *different pitch* and it **slides** there (303 style) |
| **Shift+Click** on a step | Enter **P-Lock edit mode** — every control you now move is locked to this step only |
| Bank radio buttons (A–D) | Choose the bank per track — while playing, the switch is **quantized** to the loop start (blinking = pending) |
| LEN select | Loop length (1–32) of the track's current bank — different lengths run polymetrically |
| P1/P2 buttons | Mute/unmute a pattern track |
| **PLAY / STOP** | Play toggles play/pause (keeps the position); Stop resets to step 1 and cuts ringing notes |
| **REC** | Record played notes into pattern 1: step entry while stopped, quantized to the beat while playing |
| **SONG** row | Chain scenes: **+ADD** captures the current bank selection, click a chip to raise its repeat count, right-click removes it |

## Patches & Projects

Everything (sound, patterns, song, transport settings) autosaves to your browser's localStorage and
is restored on the next visit. **SAVE** stores the current sound as a user patch in the preset list,
**DEL** removes it, **EXP**/**IMP** export/import the whole project (including user patches) as a JSON file.

## MIDI

Neon Synth listens to Note On/Off (with velocity) on all connected MIDI inputs. The small **MIDI**
display in the header shows the connection status. Requirements: Chromium-based browser or Firefox
(Safari does not support Web MIDI) and a secure context (https or localhost).

## Documentation

See [CODE_REFERENCE.md](CODE_REFERENCE.md) for the architecture, signal flow, module and class reference.

## Technologies Used
- HTML5, CSS3
- Vanilla JavaScript (ES6 Modules)
- Web Audio API (OscillatorNodes, BiquadFilters, PeriodicWave, GainNodes, DelayNodes, ConvolverNodes)
- Web MIDI API

## License
MIT License
