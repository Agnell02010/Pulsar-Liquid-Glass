import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import { BackdropGlass } from './rendering/backdropGlass.js';
import { hexToColorArray } from './animation/colors.js';

const SHADER_PADDING = 20;

export class DialogManager {
    constructor(extensionPath, settings, logger) {
        this.extensionPath = extensionPath;
        this._settings = settings;
        this._logger = logger;
        this._dialogStates = new Map();
        this._signals = [];
        this._enabled = false;
    }

    setup() {
        if (!this._settings) return;
        this._enabled = true;
        this._bindSignals();
        this._scanExisting();
    }

    _bindSignals() {
        const group = Main.layoutManager.modalDialogGroup;
        if (group) {
            this._signals.push({
                obj: group,
                id: group.connect('child-added', (_g, child) => this._onChildAdded(child)),
            });
            this._signals.push({
                obj: group,
                id: group.connect('child-removed', (_g, child) => this._onChildRemoved(child)),
            });
        }
    }

    _scanExisting() {
        const group = Main.layoutManager.modalDialogGroup;
        if (!group) return;
        for (const child of group.get_children()) {
            this._onChildAdded(child);
        }
    }

    _findDialogBox(actor) {
        if (!actor) return null;
        if (actor.has_style_class_name?.('modal-dialog') || actor.has_style_class_name?.('run-dialog'))
            return actor;
        if (actor.get_children) {
            for (const c of actor.get_children()) {
                const found = this._findDialogBox(c);
                if (found) return found;
            }
        }
        return null;
    }

    _onChildAdded(child) {
        if (!this._enabled || !child) return;
        // Skip our own backdrops: they live in the same modalDialogGroup, so
        // without this the group's child-added signal would try to glass the
        // glass and spawn an endless cascade.
        if (child._pulsarDialogGlass) return;
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (!this._enabled || !child || !child.get_parent()) return GLib.SOURCE_REMOVE;
            this._attachGlass(child);
            return GLib.SOURCE_REMOVE;
        });
    }

    _onChildRemoved(child) {
        this._detachGlass(child);
    }

    _attachGlass(child) {
        if (!child || child._pulsarDialogGlass) return;
        if (this._dialogStates.has(child)) return;
        // Only glass real dialogs. Falling back to `child` used to dress every
        // unrelated actor dropped in the modalDialogGroup (including our own
        // backdrops) with glass, feeding the cascade.
        const targetBox = this._findDialogBox(child);
        if (!targetBox) return;
        if (typeof targetBox.add_style_class_name === 'function')
            targetBox.add_style_class_name('liquid-glass-transparent');

        const glass = new BackdropGlass({
            extensionPath: this.extensionPath,
            settings: this._settings,
            logger: this._logger,
            owner: 'dialog',
        });
        glass.set_size(1.0, 1.0);
        glass.set_pivot_point(0.0, 0.0);

        // Tag the backdrop *before* it enters the group so the child-added
        // handler above can recognise and ignore it.
        glass._pulsarDialogGlass = true;
        const parent = child.get_parent() || Main.layoutManager.modalDialogGroup;
        parent.insert_child_below(glass, child);

        const cornerRadius = 20.0;
        let tintColorStr = '#000000';
        try { tintColorStr = this._settings.get_string('menu-tint-color') || '#000000'; } catch (e) {}
        let tintStrength = 0.12;
        try { tintStrength = this._settings.get_double('menu-tint-strength') || 0.12; } catch (e) {}
        let blurRadius = 16;
        try { blurRadius = this._settings.get_int('menu-blur-radius') || 16; } catch (e) {}

        glass.setPadding(SHADER_PADDING);
        glass.setTintColor(...hexToColorArray(tintColorStr));
        glass.setTintStrength(tintStrength);
        glass.setCornerRadius(cornerRadius);
        glass.setIsDock(false);
        glass.setBlurRadius(blurRadius);

        const syncGeometry = () => {
            if (!child || !targetBox || !glass) return;
            if (!child.visible || targetBox.opacity === 0) {
                glass.hide();
                return;
            }
            try {
                const [x, y] = targetBox.get_transformed_position();
                const [w, h] = targetBox.get_transformed_size();
                if (w > 0 && h > 0) {
                    glass.set_position(x - SHADER_PADDING, y - SHADER_PADDING);
                    glass.set_size(w + SHADER_PADDING * 2, h + SHADER_PADDING * 2);
                    glass.setCornerRadius(cornerRadius);
                    glass.show();
                    glass.opacity = targetBox.get_paint_opacity ? targetBox.get_paint_opacity() : targetBox.opacity;
                }
            } catch (e) {}
        };

        const conns = [
            child.connect('notify::allocation', syncGeometry),
            child.connect('notify::visible', syncGeometry),
            child.connect('notify::opacity', syncGeometry),
            targetBox.connect('notify::allocation', syncGeometry),
            targetBox.connect('notify::visible', syncGeometry),
            targetBox.connect('notify::opacity', syncGeometry),
        ];
        // When the dialog is destroyed the child (and a descendant targetBox)
        // are already disposed: their signal handlers die with them, so undo
        // nothing but our own backdrop here. Touching the disposed actor is
        // what produced the "already disposed" warnings.
        const destroyId = child.connect('destroy', () => {
            this._dialogStates.delete(child);
            try { glass.destroy(); } catch (e) {}
        });

        this._dialogStates.set(child, { targetBox, glass, conns, destroyId });
        syncGeometry();
    }

    _detachGlass(child) {
        const state = this._dialogStates.get(child);
        if (!state) return;
        this._dialogStates.delete(child);

        for (const id of state.conns) {
            try { child.disconnect(id); } catch (e) {}
            try { state.targetBox.disconnect(id); } catch (e) {}
        }
        if (state.destroyId) {
            try { child.disconnect(state.destroyId); } catch (e) {}
        }
        try { state.targetBox.remove_style_class_name('liquid-glass-transparent'); } catch (e) {}
        try { state.glass.destroy(); } catch (e) {}
    }

    destroy() {
        this._enabled = false;
        for (const s of this._signals) {
            try { s.obj.disconnect(s.id); } catch (e) {}
        }
        this._signals = [];
        for (const child of [...this._dialogStates.keys()]) {
            this._detachGlass(child);
        }
    }
}
