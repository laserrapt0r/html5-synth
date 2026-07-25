// Project persistence: autosaves the full state (synth params + sequencer)
// to localStorage, manages user patches, and handles JSON export/import.
const PROJECT_KEY = 'neon-synth-project';
const PATCHES_KEY = 'neon-synth-user-patches';

export class Persistence {
    constructor(synth, sequencer) {
        this.synth = synth;
        this.sequencer = sequencer;
        this._lastSaved = null;
    }

    // --- Project state (autosaved) ---

    serializeProject() {
        return {
            v: 1,
            params: this.synth.params,
            seq: this.sequencer.serialize()
        };
    }

    saveProject() {
        if (this._disabled) return; // factory reset in progress — nothing may be re-saved
        try {
            const json = JSON.stringify(this.serializeProject());
            if (json !== this._lastSaved) {
                localStorage.setItem(PROJECT_KEY, json);
                this._lastSaved = json;
            }
        } catch (e) { /* storage full/blocked — non-fatal */ }
    }

    // Factory reset: wipe everything Neon Synth stores in this browser
    // (autosaved project + user patches) and block further autosaves — the
    // beforeunload flush would otherwise write the state right back during
    // the reload. Keyboard-layout labels are kept (harmless, layout-specific).
    clearAllStorage() {
        this._disabled = true;
        this.clearProject();
        try { localStorage.removeItem(PATCHES_KEY); } catch (e) { /* ignore */ }
    }

    loadProject() {
        try {
            const json = localStorage.getItem(PROJECT_KEY);
            if (!json) return null;
            this._lastSaved = json;
            return JSON.parse(json);
        } catch (e) {
            return null;
        }
    }

    clearProject() {
        try { localStorage.removeItem(PROJECT_KEY); } catch (e) { /* ignore */ }
        this._lastSaved = null;
    }

    // Autosave loop: serialize every few seconds, write only on change,
    // and flush on unload.
    startAutosave(intervalMs = 4000) {
        setInterval(() => this.saveProject(), intervalMs);
        window.addEventListener('beforeunload', () => this.saveProject());
    }

    // --- User patches ---

    getUserPatches() {
        try {
            return JSON.parse(localStorage.getItem(PATCHES_KEY)) || {};
        } catch (e) {
            return {};
        }
    }

    saveUserPatch(name) {
        const patches = this.getUserPatches();
        const id = 'user:' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        patches[id] = {
            name: name.toUpperCase(),
            params: JSON.parse(JSON.stringify(this.synth.params))
        };
        try { localStorage.setItem(PATCHES_KEY, JSON.stringify(patches)); } catch (e) { /* ignore */ }
        return id;
    }

    deleteUserPatch(id) {
        const patches = this.getUserPatches();
        delete patches[id];
        try { localStorage.setItem(PATCHES_KEY, JSON.stringify(patches)); } catch (e) { /* ignore */ }
    }

    // --- Export / Import (JSON file) ---

    exportProject() {
        const data = {
            ...this.serializeProject(),
            userPatches: this.getUserPatches()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'neon-synth-project.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    // Parses an exported file; returns the project data or null.
    // Imported user patches are merged into localStorage.
    importProjectData(json) {
        let data;
        try {
            data = JSON.parse(json);
        } catch (e) {
            return null;
        }
        if (!data || typeof data !== 'object' || !data.params) return null;

        if (data.userPatches && typeof data.userPatches === 'object') {
            const patches = this.getUserPatches();
            for (const [id, patch] of Object.entries(data.userPatches)) {
                if (patch && patch.params) patches[id] = patch;
            }
            try { localStorage.setItem(PATCHES_KEY, JSON.stringify(patches)); } catch (e) { /* ignore */ }
        }
        return data;
    }
}
