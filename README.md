# Neon Synth

Neon Synth is a browser-based analog-style synthesizer and 32-step sequencer built with the Web Audio API —
no frameworks, no build step, just ES modules. It features a retro-futuristic neon aesthetic and packs
features typically found on hardware synths.

🎵 **[Play Neon Synth Live Here!](https://laserrapt0r.github.io/html5-synth/)** 🎵

## Features

- **3-Oscillator Engine** with Poly, Mono and Legato voice modes (8-voice polyphony with voice stealing).
  Classic analog waveforms (Saw, Square, Triangle, Sine) plus White/Pink Noise and Glide/Portamento.
- **Velocity Support:** MIDI velocity, mouse position on the on-screen keys, and sequencer accents all
  scale loudness *and* filter envelope depth — just like real hardware.
- **MIDI Input:** Plug in a MIDI keyboard and play with full velocity (Chromium/Firefox, hot-plug supported).
- **Custom Oscillator Drawing:** Draw your own waveform on a canvas — the engine computes the Fourier
  coefficients and synthesizes your drawing in real time.
- **Pulse Width Modulation (PWM):** Adjustable pulse width plus LFO-driven PWM for fat, phasing squares.
- **Dual LFOs:** LFO1 modulates Pitch, Filter Cutoff and PWM; LFO2 is a tremolo. Both include a
  Random (Sample & Hold) mode for generative textures.
- **32-Step Sequencer** with two pattern tracks, four pattern banks (A–D), per-track mute,
  **ties** (extend notes across steps), **accents** (303-style velocity boost) and per-step
  **Parameter Locks** (P-Locks) that can override any voice parameter on a single step.
- **Arpeggiator:** 8 modes (Up, Down, Up/Down excl./incl., As Played, Random, Converge, Thumb),
  1–3 octaves, latch mode, synced to the sequencer clock.
- **Swing, Gate & Time Division** (1/8, 1/16, 1/32) for groove control.
- **Effects Rack:** Distortion, Feedback Delay and Convolution Reverb.
- **Presets:** From "CYBER BASS" to "SOLINA STRINGS" — instantly loadable starting points.

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
| **Right-click** on a step column | Toggle **tie** (extends the previous note) |
| **Shift+Click** on a step | Enter **P-Lock edit mode** — every control you now move is locked to this step only |
| Bank radio buttons (A–D) | Choose which pattern bank each track plays |
| P1/P2 buttons | Mute/unmute a pattern track |

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
