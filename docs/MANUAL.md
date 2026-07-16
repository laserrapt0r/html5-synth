# Neon Synth — User Manual

*Deutsche Version: [ANLEITUNG.md](ANLEITUNG.md)*

Neon Synth is a browser-based analog-style synthesizer with a four-track,
multi-timbral 32-step sequencer — a complete groovebox that runs entirely
in your browser.

![Overview](img/overview.png)

## 1. Getting Started

1. Open the [live version](https://laserrapt0r.github.io/html5-synth/) — or serve
   the project folder locally (`python3 -m http.server`), since ES modules don't
   load from `file://`.
2. Click **INIT AUDIO**. Browsers require a user gesture before they allow sound;
   this also asks for MIDI permission if a keyboard is connected.
3. Press **PLAY** on the sequencer or play the on-screen keyboard.

Everything you do — sound, patterns, song — **autosaves in your browser** and is
restored on your next visit.

## 2. The Header

![Header](img/header.png)

- **PRESET** — 28 factory presets grouped by category (BASS, LEAD, KEYS, PAD,
  DRUMS, FX) plus your own patches.
  **SAVE** stores the current sound as a user patch, **DEL** removes it,
  **EXP/IMP** export/import the entire project as a JSON file.
- **MASTER** — output volume (a limiter behind it prevents digital clipping).
- **VOICES** — POLY (16 voices), MONO (retriggering, with note memory) or
  LEGATO (no retrigger, glide between notes).
- **MIDI** — connection status of MIDI inputs (`1 IN`, `NO DEV`, `N/A` on Safari).
- **?** — opens the built-in gesture and shortcut overview.

## 3. Oscillators & LFOs

![Oscillators](img/oscillators.png)

- **VCO 1–3** — three oscillators with SAW/SQR/TRI/SIN, octave (±3), fine tune
  (±1200 cents) and level. VCO 1 additionally offers **pulse width (PW)**,
  **PWM** (LFO 1 modulates the width) and **DRAW OSC**: draw your own waveform —
  it is synthesized via Fourier analysis in real time.
- **NOISE** — white or pink noise, the backbone of the drum presets.
- **GLIDE** — portamento time for MONO/LEGATO (also the slide time for
  sequencer ties).
- **PITCH ENV** — a pitch envelope (±48 semitones, decay): kicks, toms, zaps.
- **LFO 1** — modulates pitch, filter cutoff and PWM. **LFO 2** is a tremolo.
  Both offer a **Random (S&H)** mode and can be **SYNC**ed to the tempo
  (1/1 … 1/16) instead of running free.

## 4. Filter & Envelopes

![Filter](img/filter.png)

- **VCF** — low-pass, high-pass, band-pass or notch. The **CUTOFF** knob is
  log-scaled (musically even across its whole travel) and acts on *sounding*
  notes. **KEY TRK** makes the filter follow the played pitch, **SLOPE**
  switches between 12 and 24 dB/octave.
- **VCF ENV** — ADSR plus **AMT** (±5000 Hz, negative values invert the sweep).
  The amount scales with velocity — accented steps open the filter wider.
- **VCA (AMP ENV)** — the volume envelope. Envelopes retrigger click-free.

## 5. Effects & Stereo

![Effects](img/effects.png)

The chain is Distortion → **Chorus/Ensemble** (stereo, the Solina secret) →
Delay (free or **BPM-synced**: 1/4, 1/8., 1/8, 1/8T, 1/16) → Reverb.
**STEREO/UNISON** stacks up to 3 detuned voices per note (VOICES/DETUNE) and
spreads them across the stereo field (SPREAD). Effects are global — all four
sequencer tracks share them like a hardware FX bus.

## 6. The Keyboard

![Keyboard](img/keyboard.png)

- **Mouse** — click position sets the velocity: lower on the key = louder.
- **Computer keyboard** — the A–K row plays notes; the labels adapt to your
  keyboard layout (QWERTZ/AZERTY are detected). **+/−** on the left shifts
  the octave (±2).
- **MIDI keyboard** — full velocity, **pitch bend**, **mod wheel** (adds
  vibrato) and **sustain pedal**.

## 7. The Sequencer

![Sequencer](img/sequencer.png)

### Tracks

![Track controls](img/track-row.png)

Each of the four tracks has, left of its step grid:

- **P1–P4** — mute/unmute.
- **Sound select** — the track's own sound: any factory preset or user patch,
  or **LIVE** (the sound currently on the synth panel). This is what makes the
  tracks multi-timbral: kick, snare, hats and bass as genuinely different sounds.
  Assigned sounds are isolated from whatever preset you load on the panel —
  they keep their own voice parameters, LFO depths and unison settings. Only
  the effects section and the LFO waveform/rate remain global (a shared FX bus,
  like on hardware grooveboxes).
- **Bank A–H** — which of the 8 pattern banks the track plays. While the
  sequencer runs, switches are **quantized** to the loop start (pending = blinking).
- **LEN** — loop length (1–32) of that bank. Different lengths run
  **polymetrically** against each other.
- **Level slider** — track volume (mini mixer).

### Steps

| Gesture | Action |
|---|---|
| Click | Step on/off |
| **Ctrl+Click** | Accent — louder, wider filter (orange LED) |
| **Right-click** | Tie — extends the previous note. A tie with a *different pitch* **slides** there (303 style) |
| **Shift+Click** | P-Lock edit mode: every control you now move is stored for this step only |
| **Wheel** | Trigger probability (100/75/50/25 %) |
| **Shift+Wheel** | Ratchet — 1–4 retriggers within the step |
| **Ctrl+Wheel** | Trig condition (1:2 … 4:4): plays only on matching loop passes |
| **Ctrl+Z / Ctrl+Y** | Undo/redo any pattern edit |

Probability, ratchet and condition are shown as a small yellow info line on
the step (e.g. `75% ×2 1:2`).

### Transport, Recording & Song

![Song row and tools](img/song-tools.png)

- **PLAY** toggles play/pause (keeps the position), **STOP** resets to step 1
  and cuts ringing notes.
- **REC** records what you play into the **→P** target track — step-by-step
  while stopped, beat-quantized while playing. **CLICK** adds a metronome and,
  with REC armed, a one-bar count-in.
- **TOOLS** — copy/paste/clear and rotate (◀ ▶) the target track's pattern.
- **SONG** — chain scenes: **+ADD** captures the current bank selection of all
  four tracks as a scene, clicking a chip raises its repeat count, right-click
  removes it. With SONG enabled the chain drives the banks automatically.
- **● REC AUDIO** — records the master output and downloads it as an audio file.

### A 60-second groove

1. Track P1: sound **KICK DRUM**, steps 1, 9, 17, 25.
2. Track P2: sound **SNARE DRUM**, steps 9 and 25.
3. Track P3: sound **CLOSED HAT**, all off-beats — give two of them 50 %
   probability (wheel) and one a ×2 ratchet (Shift+wheel).
4. Track P4: sound **CYBER BASS**, a few notes — set a tie with a different
   pitch for a slide.
5. PLAY. Tweak the LIVE panel (filter!) — it only affects tracks set to LIVE.
6. **● REC AUDIO**, jam, stop — the file downloads automatically.

## 8. Tips

- The **arpeggiator** (ARP switch) plays held chords in 8 patterns, synced to
  the clock; LATCH keeps them running after release.
- **Swing** delays the off-steps for groove; **GATE** sets note lengths;
  **TIME DIV** switches between 1/8, 1/16 and 1/32.
- Sliders react to the **mouse wheel** — spin fast for coarse jumps, slow for
  fine steps.
- Safari does not support Web MIDI; use Chrome/Edge/Firefox for MIDI input.
