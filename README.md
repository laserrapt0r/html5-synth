# Neon Synth

Neon Synth is a powerful, browser-based analog-style synthesizer and 32-step sequencer built with the Web Audio API. 
It features a rich retro-futuristic neon aesthetic and packs a punch with advanced features typically found on hardware synths like the Roland S-1.

🎵 **[Play Neon Synth Live Here!](https://laserrapt0r.github.io/html5-synth/)** 🎵

## Features

- **3-Oscillator Monophonic/Polyphonic Engine:** Classic analog waveforms (Sine, Triangle, Square, Sawtooth) plus Noise.
- **Custom Oscillator Drawing:** Draw your own waveform using the interactive canvas. The engine calculates the Fourier transform to synthesize your drawing in real-time!
- **Pulse Width Modulation (PWM):** Animate the square wave for classic fat, phasing sounds using LFO modulation.
- **Dual LFOs:** Modulate Pitch, Filter Cutoff, Amp, or PWM. Includes a Random (Sample & Hold) waveform for generative sci-fi textures.
- **32-Step Sequencer:** With per-step Parameter Locks (P-Locks) allowing you to change any synth parameter on a per-step basis!
- **Arpeggiator:** Hold down chords and let the arpeggiator (Up, Down, Up/Down, Random) play rhythmic patterns perfectly synced to the BPM.
- **Swing / Shuffle:** Add groove to your straight 16th-note sequences.
- **Studio Effects:** High-quality built-in Delay, Reverb, and Distortion.
- **Preset Management:** Instantly load meticulously crafted patches like "Acid Bass", "Neon Chords", or "Cyber Pluck".

## Getting Started

1. Simply open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari).
2. Click **POWER ON** to initialize the Web Audio API.
3. Use your mouse to play the on-screen keyboard, or hit **PLAY** on the sequencer.
4. Tweak the knobs to sculpt your sound!

## Technologies Used
- HTML5, CSS3
- Vanilla JavaScript (ES6 Modules)
- Web Audio API (OscillatorNodes, BiquadFilters, PeriodicWave, GainNodes, DelayNodes, ConvolverNodes)

## License
MIT License
