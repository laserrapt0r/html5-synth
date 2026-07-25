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
            type: 'project',
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
        try { localStorage.removeItem('neon-synth-follow'); } catch (e) { /* ignore */ }
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

    saveUserPatch(name, params = null) {
        const patches = this.getUserPatches();
        const id = 'user:' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        patches[id] = {
            name: name.toUpperCase(),
            params: JSON.parse(JSON.stringify(params || this.synth.params))
        };
        try { localStorage.setItem(PATCHES_KEY, JSON.stringify(patches)); } catch (e) { /* ignore */ }
        return id;
    }

    deleteUserPatch(id) {
        const patches = this.getUserPatches();
        delete patches[id];
        try { localStorage.setItem(PATCHES_KEY, JSON.stringify(patches)); } catch (e) { /* ignore */ }
    }

    // --- Export / Import (JSON files) ---
    // Three file types share one import path: 'project' (everything),
    // 'patch' (a single sound) and 'sequence' (patterns/song/track setup
    // with the referenced user patches embedded, so grooves are portable).

    _download(filename, data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    exportProject() {
        this._download('neon-synth-project.json', {
            ...this.serializeProject(),
            userPatches: this.getUserPatches()
        });
    }

    buildPatchExport(name, params) {
        return {
            type: 'patch',
            v: 1,
            name,
            params: JSON.parse(JSON.stringify(params))
        };
    }

    exportPatch(name, params) {
        const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'patch';
        this._download(`neon-synth-patch-${slug}.json`, this.buildPatchExport(name, params));
    }

    buildSequenceExport() {
        const seqState = this.sequencer.serialize();
        // Embed the user patches the tracks reference — without them the
        // groove would fall back to LIVE on the receiving side
        const patches = this.getUserPatches();
        const embedded = {};
        (seqState.trackSoundIds || []).forEach(id => {
            if (id && id.startsWith('user:') && patches[id]) embedded[id] = patches[id];
        });
        return { type: 'sequence', v: 1, seq: seqState, userPatches: embedded };
    }

    exportSequence() {
        this._download('neon-synth-sequence.json', this.buildSequenceExport());
    }

    _mergePatches(patchesIn) {
        if (!patchesIn || typeof patchesIn !== 'object') return;
        const patches = this.getUserPatches();
        for (const [id, patch] of Object.entries(patchesIn)) {
            if (patch && patch.params) patches[id] = patch;
        }
        try { localStorage.setItem(PATCHES_KEY, JSON.stringify(patches)); } catch (e) { /* ignore */ }
    }

    // Parses any exported file and detects its type. Embedded user patches
    // (project/sequence files) are merged into localStorage as a side effect.
    // Returns { kind: 'project'|'patch'|'sequence', data } or null.
    importData(json) {
        let data;
        try {
            data = JSON.parse(json);
        } catch (e) {
            return null;
        }
        if (!data || typeof data !== 'object') return null;

        // Legacy project files (pre-1.1) carry no type field
        const type = data.type || (data.params ? 'project' : null);

        if (type === 'patch' && data.params) {
            return { kind: 'patch', data };
        }
        if (type === 'sequence' && data.seq) {
            this._mergePatches(data.userPatches);
            return { kind: 'sequence', data };
        }
        if (type === 'project' && data.params) {
            this._mergePatches(data.userPatches);
            return { kind: 'project', data };
        }
        return null;
    }
}
