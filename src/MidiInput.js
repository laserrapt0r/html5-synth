// Web MIDI note input: plays the synth (or feeds the arpeggiator) with real
// velocity from a connected MIDI keyboard. Requires a secure context
// (https/localhost) and browser support — Chromium and Firefox have it,
// Safari does not. Degrades silently when unavailable.
export class MidiInput {
    constructor(synth, sequencer) {
        this.synth = synth;
        this.sequencer = sequencer;
        this.access = null;
        this.statusEl = document.getElementById('midi-status');
        this.updateStatus('--');
    }

    async init() {
        if (!navigator.requestMIDIAccess) {
            this.updateStatus('N/A');
            return false;
        }
        try {
            this.access = await navigator.requestMIDIAccess();
        } catch (e) {
            this.updateStatus('DENIED');
            return false;
        }

        const attachInputs = () => {
            let count = 0;
            this.access.inputs.forEach(input => {
                input.onmidimessage = (msg) => this.handleMessage(msg);
                count++;
            });
            this.updateStatus(count > 0 ? `${count} IN` : 'NO DEV');
        };

        attachInputs();
        this.access.onstatechange = attachInputs; // hot-plug support
        return true;
    }

    updateStatus(text) {
        if (this.statusEl) this.statusEl.textContent = text;
    }

    handleMessage(msg) {
        const data = msg.data;
        if (!data || data.length < 2) return;
        const cmd = data[0] & 0xf0;
        const note = data[1];
        const value = data.length > 2 ? data[2] : 0;

        if (cmd === 0x90 && value > 0) {
            this.noteOn(note, value / 127);
        } else if (cmd === 0x80 || (cmd === 0x90 && value === 0)) {
            // Note-on with velocity 0 is the common running-status note-off
            this.noteOff(note);
        } else if (cmd === 0xe0) {
            // Pitch bend: 14-bit centered at 8192 -> ±2 semitones
            const bend = (((value << 7) | note) - 8192) / 8192;
            this.synth.setPitchBend(bend * 2);
        } else if (cmd === 0xb0) {
            if (note === 1) this.synth.setModWheel(value / 127); // mod wheel
            if (note === 64) this.synth.setSustain(value >= 64); // sustain pedal
            if (note === 123 || note === 120) this.synth.stopAllNotes(); // all notes/sound off
        }
    }

    noteOn(note, velocity) {
        if (this.synth.ctx.state !== 'running') return;
        // Squared curve: gain in dB then tracks perceived loudness roughly linearly
        const v = velocity * velocity;
        if (this.synth.params.master.arpOn) {
            this.sequencer.addArpNote(note, v);
        } else {
            this.synth.playNote(note, this.synth.ctx.currentTime, 0, {}, v);
        }
        this.sequencer.recordNote(note); // no-op unless REC is armed
        this.setKeyVisual(note, true);
    }

    noteOff(note) {
        this.sequencer.removeArpNote(note);
        this.synth.stopNote(note, this.synth.ctx.currentTime);
        this.setKeyVisual(note, false);
    }

    // Highlight the on-screen key if the note is within its range
    setKeyVisual(note, on) {
        const keyEl = document.querySelector(`.key[data-note="${note}"]`);
        if (keyEl) keyEl.classList.toggle('active', on);
    }
}
