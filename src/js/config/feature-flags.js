const FLAGS = {
    serialPort: { default: false, label: 'Serial Port' },
};

class FeatureFlags {
    constructor() {
        this.storageKey = 'a2e-feature-flags';
        this.overrides = this._load();
    }

    isEnabled(flag) {
        if (flag in this.overrides) return this.overrides[flag];
        return FLAGS[flag]?.default ?? false;
    }

    setEnabled(flag, enabled) {
        this.overrides[flag] = enabled;
        this._save();
    }

    getAll() {
        return { ...FLAGS };
    }

    _load() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey)) || {};
        } catch {
            return {};
        }
    }

    _save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.overrides));
        } catch {}
    }
}

export const featureFlags = new FeatureFlags();
