# Neon Synth

![tests](https://github.com/laserrapt0r/html5-synth/actions/workflows/tests.yml/badge.svg)

Neon Synth is a browser-based analog-style synthesizer and 32-step sequencer built with the Web Audio API —
no frameworks, no build step, just ES modules. It features a retro-futuristic neon aesthetic and packs
features typically found on hardware synths.

🎵 **[Play Neon Synth Live Here!](https://laserrapt0r.github.io/html5-synth/)** 🎵

## Features

- **3-Oscillator Engine** with Poly, Mono and Legato voice modes (16-voice polyphony with voice stealing).
  Classic analog waveforms (Saw, Square, Triangle, Sine) plus White/Pink Noise and Glide/Portamento.
  Mono mode has **note memory** (release falls back to still-held keys) and click-free envelope retriggering.
- **Stereo Unison:** Up to 3 detuned voices per note spread across the stereo field, plus per-note
  voice panning (SPREAD) — the whole signal path is stereo.
- **Live Performance Feel:** The filter cutoff (log-scaled knob) acts on *sounding* notes, and all
  parameter changes are smoothed to avoid zipper noise.
- **Velocity Support:** MIDI velocity, mouse position on the on-screen keys, and sequencer accents all
  scale loudness *and* filter envelope depth — just like real hardware.
- **MIDI Input:** Note velocity, **pitch bend, mod wheel and sustain pedal** (Chromium/Firefox, hot-plug supported).
- **Custom Oscillator Drawing:** Draw your own waveform on a canvas — the engine computes the Fourier
  coefficients and synthesizes your drawing in real time.
- **Pulse Width Modulation (PWM)** and a **Pitch Envelope** (±48 semitones, for kicks and zaps).
- **Dual LFOs:** LFO1 modulates Pitch, Filter Cutoff and PWM; LFO2 is a tremolo. Both include a
  Random (Sample & Hold) mode and can be **BPM-synced** (1/1 … 1/16).
- **Filter:** LP/HP/BP/Notch with log-scaled cutoff, resonance, **key tracking** and a switchable
  **12/24 dB slope**.
- **32-Step Sequencer** with **four tracks — each with its own sound** (multi-timbral: pick any
  factory preset or user patch per track, or LIVE for the current panel sound), eight banks (A–H)
  with **individual loop lengths** (polymetric patterns!), per-track mute, **ties & 303-style
  slides**, **accents**, per-step **probability, ratchets (1–4) and trig conditions** (1:2 … 4:4),
  **Parameter Locks**, quantized bank switching, pattern tools (copy/paste/clear/rotate),
  **undo/redo** (Ctrl+Z/Y), a **metronome with count-in** and **live/step recording** into a
  selectable target track.
- **Song Mode:** Chain bank scenes with repeat counts into full arrangements.
- **Arpeggiator:** 8 modes, 1–3 octaves, proper latch (a new chord replaces the old one), synced to the clock.
- **Swing, Gate & Time Division** (1/8, 1/16, 1/32); transport with Play/Pause and Stop.
- **Effects Rack:** Distortion, stereo **Chorus/Ensemble**, Feedback Delay (free or **BPM-synced**)
  and Convolution Reverb — plus a master **limiter** so four tracks can't clip the output.
- **Patch & Project Management:** The whole state (sound + patterns + song) autosaves to the browser;
  save your own patches into the preset list, export/import everything as a JSON file, and record
  the master output to an **audio file** (● REC AUDIO).
- **28 Factory Presets**, grouped by category (BASS/LEAD/KEYS/PAD/DRUMS/FX) — including a full
  **drum kit** (kick, snare, hats, clap, tom, rimshot) to feed the four tracks, plus showcases like
  "JUNO PWM PAD" (stereo unison PWM), "HOOVER RAVE" and "SCI-FI COMPUTER" (S&H LFO).

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
| **Wheel** on a step | Trigger **probability** (100/75/50/25 %) |
| **Shift+Wheel** on a step | **Ratchet** (1–4 retriggers per step) |
| **Ctrl+Wheel** on a step | **Trig condition** (1:2 … 4:4 for loop passes, `fill`/`!fill` for the FILL button) |
| **Ctrl+Z / Ctrl+Y** | Undo/redo pattern edits |
| TOOLS row | **Euclidean generator** (EUC) plus copy/paste/clear/rotate — on the REC-target track's pattern |
| **FILL** (hold) | Steps with a `fill` condition play, `!fill` steps go silent — instant live fills |
| CLICK | Metronome; with REC armed you get a one-bar count-in |
| +/− next to the keys | Octave shift for on-screen and computer keyboard |
| SOUND select (per track) | The track's sound: **LIVE** = current panel sound, or any preset/user patch (voice params only — effects stay global) |
| Bank select (A–H) | Choose the bank per track — while playing, the switch is **quantized** to the loop start (blinking = pending) |
| LEN select | Loop length (1–32) of the track's current bank — different lengths run polymetrically |
| P1–P4 buttons | Mute/unmute a track |
| SOUND / Level | Each track has its own sound and its own volume (mini mixer) |
| **PLAY / STOP** | Play toggles play/pause (keeps the position); Stop resets to step 1 and cuts ringing notes |
| **REC** + →P select | Record played notes into the target track: step entry while stopped, quantized to the beat while playing |
| **SONG** row | Chain scenes: **+ADD** captures the current bank selection, click a chip to raise its repeat count, right-click removes it |

## Patches & Projects

Everything (sound, patterns, song, transport settings) autosaves to your browser's localStorage and
is restored on the next visit. **SAVE** stores the current sound as a user patch in the preset list,
**DEL** removes it, **PEXP** exports the selected preset/patch as a shareable file, **EXP** exports
the whole project, **SEQ EXP** (TOOLS row) exports just the sequencer (patterns, song, track setup
with the referenced user patches embedded), and **IMP** imports any of these files — the type is
detected automatically. **RST** performs a factory reset (deletes the autosaved project and all
user patches — the factory presets live in code and are never affected by imports).

## MIDI

Neon Synth listens to Note On/Off (with velocity) on all connected MIDI inputs. The small **MIDI**
display in the header shows the connection status. Requirements: Chromium-based browser or Firefox
(Safari does not support Web MIDI) and a secure context (https or localhost).

## Documentation

- **[User Manual (English)](docs/MANUAL.md)** / **[Anleitung (Deutsch)](docs/ANLEITUNG.md)** — illustrated guide to every feature.
- In the app, the **?** button opens a gesture and shortcut overview.
- [CODE_REFERENCE.md](CODE_REFERENCE.md) — architecture, signal flow, module and class reference.

## Development

The headless test suite (runs against the real app in a browser) runs locally with
`bash tests/run-tests.sh` (needs Chromium/Chrome) and on every push via GitHub Actions.

## Technologies Used
- HTML5, CSS3
- Vanilla JavaScript (ES6 Modules)
- Web Audio API (OscillatorNodes, BiquadFilters, PeriodicWave, GainNodes, DelayNodes, ConvolverNodes)
- Web MIDI API

## License
MIT License
