# Neon Synth — Code Reference

Architecture and module reference for contributors. The app is plain ES modules — no build step,
no dependencies. `index.html` loads `src/main.js`, which wires everything together.

## Architecture Overview

```
                       ┌─────────────┐
  MIDI keyboard ──────►│  MidiInput  │───┐
                       └─────────────┘   │  playNote / stopNote
  Mouse / computer     ┌─────────────┐   │  addArpNote / removeArpNote
  keyboard ───────────►│ UIController│───┤
                       └─────────────┘   │
                       ┌─────────────┐   │
  Step patterns ──────►│  Sequencer  │───┘
                       └─────────────┘
                              │ schedules ahead of time
                              ▼
                       ┌─────────────┐  one Voice per note
                       │    Synth    │──────────────┐
                       └─────────────┘              ▼
                              │              ┌─────────────┐
                        global LFOs ────────►│    Voice    │ (osc → filter → amp env)
                                             └─────────────┘
                                                    │
                                             ┌─────────────┐
                                             │   Effects   │ dist → delay → reverb
                                             └─────────────┘
                                                    │
                                     masterGain → analyser → destination
                                                    │
                                             ┌─────────────┐
                                             │ Visualizer  │ (oscilloscope)
                                             └─────────────┘
```

### Audio signal flow (per voice)

```
VCO1 ─┬─► vco1Gain ─┐
      └─► WaveShaper (PWM mode only, driven by DC offset + LFO1)
VCO2 ───► gain ─────┼─► BiquadFilter ─► output gain (amp envelope) ─► Effects.input
VCO3 ───► gain ─────┤
Noise ──► noiseGain ┘
```

### Modulation routing (global, in `Synth`)

- `lfo1 → lfo1PitchGain → voice.pitchTarget → osc.detune` (all three VCOs)
- `voice.pitchEnvSource → voice.pitchTarget → osc.detune` (pitch envelope, per voice)
- `lfo1 → lfo1CutoffGain → voice.filterTarget → filter.frequency`
- `lfo1 → lfo1PwmGain → voice.vco1DcOffset.offset` (PWM depth)
- `lfo2 → lfo2AmpGain → masterGain.gain` (tremolo, post-effects)
- `lfo1RndSource` / `lfo2RndSource` (ConstantSource) provide the Sample & Hold
  values in Random mode, updated by a self-rescheduling `setTimeout` chain.

## File Map

| File | Responsibility |
|---|---|
| `index.html` | Full UI markup; all controls carry `id`s the JS binds to |
| `css/style.css` | Neon styling, power-off state, step/accent/tie/edit-mode visuals |
| `src/main.js` | Bootstrapping, power-on (AudioContext resume), preset loading, computer-keyboard input, UI scaling |
| `src/MidiInput.js` | Web MIDI note input with velocity |
| `src/Persistence.js` | localStorage autosave (project state), user patches, JSON export/import |
| `src/audio/Synth.js` | Voice management, global LFOs, parameter store (`params`), effects wiring |
| `src/audio/Voice.js` | One playing note: oscillators, filter, envelopes, PWM, noise, cleanup |
| `src/audio/Effects.js` | Distortion → Delay → Reverb chain with per-effect bypass |
| `src/audio/Sequencer.js` | Lookahead scheduler, patterns/steps, ties, accents, arpeggiator |
| `src/audio/Presets.js` | Static preset definitions (full `params` snapshots) |
| `src/ui/UIController.js` | Binds every control to `synth.updateParams`, step grid, P-Lock editing, on-screen keyboard |
| `src/ui/Visualizer.js` | Oscilloscope rendering from the shared AnalyserNode |
| `src/ui/OscDraw.js` | Custom waveform drawing canvas + DFT → `PeriodicWave` coefficients |

## Core Data Structures

### `Synth.params` — the single source of truth

All UI controls write here (via `updateParams`), all voices read from here (via `Voice.getParam`).
Values coming from the UI are **strings** — consumers call `parseFloat`/`parseInt` at the point of use.

```js
{
  master:  { polyphony: 'poly'|'mono'|'legato', glide, swing, arpOn, arpMode, arpLatch, arpOctaves,
             unison (1-3), uniDetune (cents), spread (0..1 stereo width) },
  vco1:    { on, wave, oct, tune, level, pw, pwm, customWaveReal, customWaveImag },
  vco2:    { on, wave, oct, tune, level },
  vco3:    { on, wave, oct, tune, level },
  noise:   { type: 'white'|'pink', level },
  filter:  { type, cutoff, res },
  fEnv:    { a, d, s, r, amt },          // filter envelope (amt in Hz, can be negative)
  aEnv:    { a, d, s, r },               // amp envelope
  pEnv:    { d, amt },                   // pitch envelope (amt in semitones ±48, decay-only)
  lfo1:    { wave, rate, pitch, cutoff },// wave 'random' = S&H mode
  lfo2:    { wave, rate, amp },
  effects: { 'dist-on', 'dist-drive', 'delay-on', 'delay-sync' (0=free, else beats), 'delay-time', 'delay-fb', 'delay-mix',
             'reverb-on', 'reverb-mix' }
}
```

### Sequencer step

```js
{ active: false, note: 60, tie: false, accent: false, locks: {} }
```

- `note` — MIDI note number.
- `tie` — this step extends the previous note instead of triggering; chains of ties
  multiply the gate duration of the first (non-tie) step. A tie step whose `note` differs
  from the previous chain element triggers a 303-style **slide** (`Synth.slideNote`).
- `accent` — plays the step with `ACCENT_VELOCITY` (1.25): louder and with a wider filter sweep.
- `locks` — P-Locks: `{ "group.param": value }`, e.g. `{ "filter.cutoff": "400" }`.
  Applied per note via `Voice.getParam`, which prefers a lock over `Synth.params`.
  Only voice-level groups are lockable (`vco1-3`, `noise`, `filter`, `fEnv`, `aEnv`, `pEnv`).

Patterns: `sequencer.patterns[bank][step]` — 8 banks (A–H) × 32 steps. Four *tracks* each play one
bank (`trackBanks`) and can be muted (`trackMuted`). Each track can carry its own **sound**
(`trackSoundIds`/`trackSoundLocks`): a patch flattened to voice-level P-Locks (see `main.js`
`flattenPatchToLocks`) merged *under* the step locks at schedule time — that's what makes the
tracks multi-timbral while effects/LFOs stay global. Tracks on the same bank with the same sound
are triggered only once; with different sounds they layer.

### Velocity

`velocity` flows as a `0..1+` float through `playNote → Voice.start → envelopes`:

- Amp envelope peaks at `velocity`, sustains at `s * velocity`.
- Filter envelope amount is scaled by `velocity`.
- Sources: MIDI (`(vel/127)²` — perceptually even), on-screen keys (vertical click position,
  0.5–1.0), computer keyboard (fixed 1.0), sequencer accents (1.25 — deliberately > 1 as a boost).

## Class Reference

### `Synth` (`src/audio/Synth.js`)

| Member | Description |
|---|---|
| `constructor(audioContext)` | Builds master chain, effects, both LFOs (initialised from `params`) |
| `playNote(note, time, duration=0, pLocks={}, velocity=1)` | Creates/updates a voice group. Poly: spawns `unison` voices (detuned/panned), steals the oldest note above the voice limit (`maxVoices` 16). Mono/Legato: reuses `monoVoice` with glide; Mono retriggers envelopes click-free, Legato doesn't. Held keys (duration 0) feed the mono note memory. No-op while suspended |
| `stopNote(note, time)` | Releases the matching voice group; in mono, falls back legato to the most recent still-held key (note memory) |
| `slideNote(fromNote, toNote, time)` | 303-style slide: glides the sounding voice (incl. unison siblings) without retriggering — used by tie steps with a different pitch |
| `stopAllNotes()` | Panic — releases everything |
| `updateParams(module, key, value)` | Single entry point for all parameter changes; updates the audio graph and live voices (batched via microtask-style `setTimeout`) |
| `updateLFO1()` / `updateLFO2()` | Re-apply LFO wave/rate/depths; manage the S&H timer for `random` mode |
| `_connectLFOs(voice)` | Connects global LFO gains into a voice and records the connections on `voice.externalConnections` for later cleanup |
| `_stopVoiceGroup(voice, time)` | Stops a primary voice together with its unison siblings |
| `bpm` | Tempo mirror (set by the Sequencer) used to compute BPM-synced delay times (`effects['delay-sync']` in beats) |

### `Voice` (`src/audio/Voice.js`)

One instance per sounding note. Noise buffers are generated once per AudioContext and shared
(module-level `WeakMap` cache).

| Member | Description |
|---|---|
| `start(freq, time, pLocks={}, velocity=1)` | Creates oscillators, applies params, starts envelopes |
| `stop(time)` | Computes the current envelope value manually (browser-bug workaround), schedules release, then `disconnect()` |
| `disconnect()` | Severs all node connections **including** the incoming LFO connections (`externalConnections`) — without this, voices leak |
| `updateParams(skipFrequency=false)` | Re-applies all voice params (smoothed after the first application); re-targets the filter towards the new sustain frequency when cutoff/res/env change on a sounding note (live cutoff); `skipFrequency` is used by the mono glide path |
| `glideTo(freq, time, glideTime)` | Slides the sounding pitch (anchored on the last target so scheduled slide chains stay consistent) |
| `panner` | Per-voice `StereoPannerNode` (Synth connects `panner → effects.input`); `unisonDetune`/`unisonSiblings` carry the unison stack |
| `getParam(group, key)` | P-Lock-aware parameter read |
| `triggerAmpEnvelope(time)` / `triggerFilterEnvelope(time)` | ADSR via `linearRamp` (attack) + `setTargetAtTime` (decay/sustain), scaled by `velocity` |
| `triggerPitchEnvelope(time)` | Decay-only pitch sweep: a per-voice `ConstantSource` (`pitchEnvSource`, in cents) summed into `pitchTarget`, so it detunes all three VCOs without touching the glide automation |

**PWM implementation:** when VCO1 is `square` with `pw ≠ 0.5` or `pwm > 0`, the oscillator switches
to sawtooth feeding a comparator (`WaveShaper` with a sign curve). A `ConstantSource` (`vco1DcOffset`)
shifts the threshold — DC offset controls the pulse width, LFO1 modulates it. Switching away from
PWM mode disconnects the DC path (otherwise it would leave constant DC on the output).

### `Sequencer` (`src/audio/Sequencer.js`)

Standard Web Audio lookahead scheduler: a `setTimeout` loop (25 ms) schedules all notes that fall
within the next 100 ms (`scheduleAheadTime`) at sample-accurate AudioContext times.

| Member | Description |
|---|---|
| `play()` / `pause()` / `stop()` | Play resumes from the current position, Pause keeps it, Stop resets to step 1, cuts ringing notes and clears queued switches; refuses to start while suspended |
| `scheduleNote(step, time)` | Applies queued bank switches/song scenes at step 0, swing on odd steps, resolves ties into longer gates and slides, triggers both tracks (each looping within its bank's `patternLengths` — polymetric) or the arpeggiator |
| `setStep / setStepTie / setStepAccent / setStepLock` | Pattern editing API (all take an optional bank index) |
| `addArpNote(note, velocity=1)` / `removeArpNote` / `clearArpNotes` | Arp note pool; auto-starts/stops the transport when the arp is enabled; velocities are kept per held key |
| `setBpm / setGate / setTimeDiv / setTrackMuted` | Transport & routing settings (BPM also re-syncs the delay) |
| `setTrackBank(track, bank)` | Quantized while playing (returns `'queued'`), immediate otherwise |
| `setPatternLength(bank, len)` | Loop length 1–32 per bank |
| `setSongMode / songChain` | Song scenes `{banks:[a,b], repeats}` applied at loop boundaries |
| `setRecording(on)` / `recordNote(note)` | REC: step entry while stopped, beat-quantized while playing — into `recTarget`'s bank |
| `setTrackSound(track, id, locks)` | Assigns a per-track sound (patch id + flattened voice-param locks; null = LIVE) |
| `serialize()` / `loadState(state)` | Project persistence (patterns, lengths, banks, mutes, track sounds, transport, song); merges per index so older projects with fewer tracks/banks load cleanly |
| `onStep(step)` | UI callback (step indicator), `-1` on stop |

Arp modes are computed per step from the held notes (sorted/expanded to `arpOctaves`):
`up`, `down`, `updown` (exclusive), `updown_inc`, `as_played`, `random`, `converge`, `thumb`.

### `Effects` (`src/audio/Effects.js`)

Fixed chain `input → distortion → delay → reverb → output`, each stage as dry/wet pair with a
bypass gain (on/off = crossfade between bypass and mix path). Reverb impulse is generated noise
with exponential decay. `setDistortion(isOn, drive)`, `setDelay(isOn, time, fb, mix)`,
`setReverb(isOn, mix)` are called from `Synth.updateParams` with values from `params` (never from
the DOM — important during preset loading).

### `UIController` (`src/ui/UIController.js`)

- `paramBindings` maps every control (`id` or radio `name`) to `(group, param, type)`.
  One generic handler routes changes to `synth.updateParams` — or, in P-Lock edit mode
  (Shift+Click on a step), to `sequencer.setStepLock`.
- `updateUIFromParams()` pushes `synth.params` (plus active P-Locks) back into the DOM after
  preset loads; `isUpdatingUI` guards against feedback loops.
- Builds the step grid (two tracks × 32 columns: step button + pitch select) and the on-screen
  keyboard (velocity from vertical click position; synthetic events from the computer keyboard
  play at full velocity).
- A window `blur` handler releases all notes and arp latches (stuck-note prevention).

### `MidiInput` (`src/MidiInput.js`)

Attaches to all MIDI inputs (`navigator.requestMIDIAccess`), re-attaches on hot-plug
(`onstatechange`), and forwards Note On/Off to `synth.playNote` / `stopNote` (or the arp pool
when the arp is on). Velocity is squared for a perceptually even response. Updates the
`#midi-status` LED (`--`, `N/A`, `DENIED`, `NO DEV`, `n IN`). Initialised on power-on so the
permission prompt is tied to a user gesture.

### `Visualizer` / `OscDraw` (`src/ui/`)

- `Visualizer`: draws the analyser's time-domain data at display refresh rate; re-measures the
  canvas on window resize (HiDPI-aware via `setTransform`).
- `OscDraw`: freehand waveform on a 256-sample buffer; computes a 64-harmonic DFT and stores the
  coefficients in `params.vco1.customWaveReal/Imag`. New voices pick them up via
  `Voice.updateParams` (`wave === 'custom'`); active voices are updated live.

## Conventions & Gotchas

- **Values are strings.** Everything coming from `<input>` events is a string; `params` stores it
  as-is. Parse at the consumer (`parseFloat`/`parseInt`) — WebAudio `AudioParam.value` coerces
  automatically, arithmetic does not.
- **Never read control values from the DOM inside `Synth`.** During preset loading the DOM lags
  behind `params`; the effects bug this caused is why the rule exists.
- **Voices must be disconnected.** The global LFO gains hold references to every connected voice.
  `Voice.disconnect()` severs them via `externalConnections`; any new per-voice connection from a
  long-lived node must be registered there.
- **`?v=2` import suffixes** (`Synth.js?v=2` etc.) are manual cache busters. If you add
  cross-imports, keep the query string consistent per module or the browser loads two copies.
- **Keyboard input uses `e.code`** (physical position) so note keys work on QWERTZ/AZERTY;
  labels are corrected via the Keyboard Layout Map API or on first keypress.
- **Scheduling:** anything audible must be scheduled with AudioContext time (`scheduledTime`),
  never `setTimeout` — timeouts are only used for UI callbacks and cleanup. Hidden tabs raise
  `scheduleAheadTime` to 1.5 s because browsers throttle timers there.
- **Persistence:** the whole project (params + sequencer state) autosaves to localStorage every
  few seconds and on unload (`src/Persistence.js`); user patches live under a separate key.
  New state that should survive a reload must be included in `Sequencer.serialize()`.
- **Parameter smoothing:** long-lived AudioParams are changed via `cancelScheduledValues` +
  `setTargetAtTime` (see `_smooth`/`_smoothSet` helpers) — don't reintroduce raw `.value` jumps
  on audible paths.
