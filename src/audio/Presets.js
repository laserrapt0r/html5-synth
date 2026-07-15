export const Presets = {
    "init": {
        name: "INIT PATCH",
        params: {
            master: { polyphony: 'poly', glide: 0, swing: 0, arpOn: false, arpMode: 'up', arpOctaves: 1 },
            vco1: { on: true, wave: 'square', oct: 0, tune: 0, level: 0.8, pw: 0.5, pwm: 0 },
            vco2: { on: false, wave: 'square', oct: 0, tune: 0, level: 0.0 },
            vco3: { on: false, wave: 'square', oct: 0, tune: 0, level: 0.0 },
            noise: { type: 'white', level: 0 },
            filter: { type: 'lowpass', cutoff: 20000, res: 0 },
            fEnv: { a: 0.01, d: 0.1, s: 1.0, r: 0.1, amt: 0 },
            aEnv: { a: 0.01, d: 0.1, s: 1.0, r: 0.1 },
            lfo1: { wave: 'sine', rate: 5, pitch: 0, cutoff: 0 },
            lfo2: { wave: 'sine', rate: 5, amp: 0 },
            effects: {
                'dist-on': false, 'dist-drive': 0,
                'delay-on': false, 'delay-time': 0.3, 'delay-fb': 0.4, 'delay-mix': 0,
                'reverb-on': false, 'reverb-mix': 0
            }
        }
    },
    "cyber-bass": {
        name: "CYBER BASS",
        params: {
            master: { polyphony: 'mono', glide: 0.05, swing: 0.3, arpOn: false, arpMode: 'up', arpOctaves: 1 },
            vco1: { on: true, wave: 'sawtooth', oct: -1, tune: 0, level: 1.0, pw: 0.5, pwm: 0.2 },
            vco2: { on: true, wave: 'square', oct: -2, tune: 0, level: 0.8 },
            vco3: { on: false, wave: 'sine', oct: 0, tune: 0, level: 0 },
            noise: { type: 'white', level: 0 },
            filter: { type: 'lowpass', cutoff: 200, res: 5 },
            fEnv: { a: 0.01, d: 0.3, s: 0.1, r: 0.2, amt: 3500 },
            aEnv: { a: 0.01, d: 0.3, s: 0.8, r: 0.1 },
            lfo1: { wave: 'triangle', rate: 2, pitch: 0, cutoff: 0 },
            lfo2: { wave: 'sine', rate: 5, amp: 0 },
            effects: {
                'dist-on': true, 'dist-drive': 60,
                'delay-on': false, 'delay-time': 0.3, 'delay-fb': 0.4, 'delay-mix': 0,
                'reverb-on': false, 'reverb-mix': 0.1
            }
        }
    },
    "neon-pad": {
        name: "NEON PAD",
        params: {
            master: { polyphony: 'poly', glide: 0, swing: 0, arpOn: false, arpMode: 'up', arpOctaves: 1 },
            vco1: { on: true, wave: 'sawtooth', oct: 0, tune: -8, level: 0.6, pw: 0.3, pwm: 0.4 },
            vco2: { on: true, wave: 'sawtooth', oct: 0, tune: 8, level: 0.6 },
            vco3: { on: true, wave: 'square', oct: -1, tune: 0, level: 0.5 },
            noise: { type: 'pink', level: 0.05 },
            filter: { type: 'lowpass', cutoff: 800, res: 2 },
            fEnv: { a: 0.1, d: 2.0, s: 0.6, r: 2.0, amt: 1200 },
            aEnv: { a: 0.1, d: 2.0, s: 0.8, r: 2.5 },
            lfo1: { wave: 'sine', rate: 0.5, pitch: 2, cutoff: 300 },
            lfo2: { wave: 'sine', rate: 2, amp: 0.1 },
            effects: {
                'dist-on': false, 'dist-drive': 0,
                'delay-on': true, 'delay-time': 0.33, 'delay-fb': 0.6, 'delay-mix': 0.4,
                'reverb-on': true, 'reverb-mix': 0.6
            }
        }
    },
    "acid-pluck": {
        name: "ACID PLUCK",
        params: {
            master: { polyphony: 'mono', glide: 0.02, swing: 0, arpOn: true, arpMode: 'random', arpOctaves: 2 },
            vco1: { on: true, wave: 'square', oct: 0, tune: 0, level: 1.0, pw: 0.15, pwm: 0.6 },
            vco2: { on: false, wave: 'square', oct: 0, tune: 0, level: 0 },
            vco3: { on: false, wave: 'sine', oct: 0, tune: 0, level: 0 },
            noise: { type: 'white', level: 0 },
            filter: { type: 'lowpass', cutoff: 100, res: 22 },
            fEnv: { a: 0.01, d: 0.15, s: 0.0, r: 0.1, amt: 4000 },
            aEnv: { a: 0.01, d: 0.2, s: 0.0, r: 0.1 },
            lfo1: { wave: 'sine', rate: 5, pitch: 0, cutoff: 0 },
            lfo2: { wave: 'sine', rate: 5, amp: 0 },
            effects: {
                'dist-on': true, 'dist-drive': 30,
                'delay-on': true, 'delay-time': 0.25, 'delay-fb': 0.3, 'delay-mix': 0.2,
                'reverb-on': false, 'reverb-mix': 0
            }
        }
    },
    "retro-brass": {
        name: "RETRO BRASS",
        params: {
            master: { polyphony: 'poly', glide: 0, swing: 0, arpOn: false, arpMode: 'up', arpOctaves: 1 },
            vco1: { on: true, wave: 'sawtooth', oct: 0, tune: -5, level: 0.7, pw: 0.5, pwm: 0.1 },
            vco2: { on: true, wave: 'sawtooth', oct: 0, tune: 5, level: 0.7 },
            vco3: { on: true, wave: 'square', oct: -1, tune: 0, level: 0.5 },
            noise: { type: 'white', level: 0 },
            filter: { type: 'lowpass', cutoff: 400, res: 4 },
            fEnv: { a: 0.15, d: 0.4, s: 0.3, r: 0.3, amt: 3000 },
            aEnv: { a: 0.05, d: 0.4, s: 0.6, r: 0.4 },
            lfo1: { wave: 'sine', rate: 4, pitch: 1, cutoff: 0 },
            lfo2: { wave: 'sine', rate: 5, amp: 0 },
            effects: {
                'dist-on': false, 'dist-drive': 0,
                'delay-on': true, 'delay-time': 0.4, 'delay-fb': 0.2, 'delay-mix': 0.15,
                'reverb-on': true, 'reverb-mix': 0.3
            }
        }
    }
};
