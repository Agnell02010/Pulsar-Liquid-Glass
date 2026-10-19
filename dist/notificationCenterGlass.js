import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { QuickSettingsManager } from './quickSettingsManager.js';
import { ToggleStyles } from './quickSettings/toggleStyles.js';
import { hexToColorArray } from './animation/colors.js';

export class NotificationCenterGlassManager extends QuickSettingsManager {
    constructor(extensionPath, settings, logger) {
        super(extensionPath, settings, logger);
        const menu = Main.panel.statusArea.dateMenu?.menu ?? null;
        this.menu = menu;
        this.targetActor = menu?.actor ?? null;
        this.animActor = menu?.box ?? null;
        this._toggleStyles = new ToggleStyles(logger, () => !!this.menu?.isOpen);
        this._applyTo = 'toggles';
        this._activeMode = 'toggles';
    }

    _togglesDesired() {
        return !!this._settings &&
            this._settings.get_boolean('enable-quick-settings-glass') &&
            this._settings.get_int('quick-settings-apply-to') === 1;
    }

    setup() {
        if (!this._settings)
            return;
        this._bindSettings();
        this._applyTo = 'toggles';
        this._toggleBaseStrength = this._settings.get_double('quick-settings-toggle-tint-strength');
        this._toggleCornerRadius = this._settings.get_double('quick-settings-toggle-corner-radius');
        if (this._togglesDesired())
            this._applyEffect();
    }

    _bindSettings() {
        const connectSetting = (key, callback) => {
            this._settingsSignals.push(this._settings.connect(`changed::${key}`, callback.bind(this)));
        };
        connectSetting('enable-quick-settings-glass', () => this._syncActivation());
        connectSetting('quick-settings-apply-to', () => this._syncActivation());
        connectSetting('quick-settings-tint-color', () => {
            this._tintColorArray = hexToColorArray(this._settings.get_string('quick-settings-tint-color'));
            if (this.glass)
                this.glass.setTintColor(...this._tintColorArray);
        });
        connectSetting('quick-settings-tint-strength', () => {
            if (this.glass)
                this.glass.setTintStrength(this._settings.get_double('quick-settings-tint-strength'));
        });
        connectSetting('quick-settings-blur-radius', () => {
            if (this.glass)
                this.glass.setBlurRadius(this._settings.get_int('quick-settings-blur-radius'));
        });
        connectSetting('quick-settings-toggle-tint-strength', () => {
            this._toggleBaseStrength = this._settings.get_double('quick-settings-toggle-tint-strength');
        });
        connectSetting('quick-settings-toggle-corner-radius', () => {
            this._toggleCornerRadius = this._settings.get_double('quick-settings-toggle-corner-radius');
            if (this.glass && this._activeMode === 'toggles')
                this.glass.setCornerRadius(this._toggleCornerRadius);
        });
        connectSetting('quick-settings-brightness', () => {
            if (this.glass)
                this.glass.setBrightness(this._settings.get_double('quick-settings-brightness'));
        });
        connectSetting('quick-settings-saturation', () => {
            if (this.glass)
                this.glass.setSaturation(this._settings.get_double('quick-settings-saturation'));
        });
        connectSetting('quick-settings-contrast', () => {
            if (this.glass)
                this.glass.setContrast(this._settings.get_double('quick-settings-contrast'));
        });
    }

    _syncActivation() {
        if (this._togglesDesired()) {
            if (!this._isEffectActive)
                this._applyEffect();
        } else if (this._isEffectActive) {
            this._removeEffect();
        }
    }

    _applyEffect() {
        if (this._isEffectActive || !this._togglesDesired() || !this.targetActor)
            return;
        this._isEffectActive = true;
        this._activeMode = 'toggles';
        this._applyTo = 'toggles';
        this._tintColorArray = hexToColorArray(this._settings.get_string('quick-settings-tint-color'));
        this._applyToggleEffect();
    }

    _restoreMenuActors() {
    }

    _applyMenuOffsets() {
    }
}
