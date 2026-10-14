// SPDX-License-Identifier: GPL-3.0-or-later

import St from 'gi://St';
import Gio from 'gi://Gio';
import {LEGACY_SHORTCUT_KEY} from './shortcut-options.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Keyboard from 'resource:///org/gnome/shell/ui/status/keyboard.js';
import {LayoutIndicator} from './indicator.js';
import {PanelVisibility} from './panel-visibility.js';
import {profileFor, migrateSettings, parseObject, segmentRects, stripeSegments, segmentStyle} from './common.js';

export default class LayoutStripe extends Extension {
    enable() {
        this._signals = [];
        this._stripes = [];
        try {
            if (typeof Keyboard.getInputSourceManager !== 'function' ||
                typeof Main.uiGroup?.add_child !== 'function' ||
                typeof global.display.get_monitor_in_fullscreen !== 'function')
                throw new Error('Layout Stripe: incompatible GNOME Shell API. The extension needs an update.');
            this._settings = this.getSettings();
            const inputSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.input-sources'});
            migrateSettings(this._settings, inputSettings.get_value('sources').deep_unpack());
            this._manager = Keyboard.getInputSourceManager();
            if (this._settings.get_strv(LEGACY_SHORTCUT_KEY).length)
                this._settings.set_strv(LEGACY_SHORTCUT_KEY, []);
            this._indicator = new LayoutIndicator(this._manager, this._settings, () => this.openPreferences());
            this._symbol = this._indicator.symbol;
            this._indicator.attach(this.uuid);
            const keyboard = Main.panel.statusArea.keyboard;
            if (keyboard?.container)
                this._systemVisibility = new PanelVisibility(keyboard.container);
            this._watch(this._manager, 'current-source-changed', () => this._rebuild());
            this._watch(inputSettings, 'changed::xkb-options', () => {
                // GNOME 50.1 reapply() passes a layout object instead of its ID.
                // Reload through the manager so live XKB changes reach the backend.
                this._manager.reload();
            });
            this._watch(this._manager, 'sources-changed', () => {
                this._indicator.refresh(true);
                this._rebuild();
            });
            this._watch(this._settings, 'changed', (_settings, key) => {
                if (![LEGACY_SHORTCUT_KEY, 'user-presets', 'profile-format-version', 'layout-colors', 'opacity', 'reverse'].includes(key))
                    this._rebuild();
            });
            this._watch(Main.layoutManager, 'monitors-changed', () => this._rebuild());
            this._watch(global.display, 'in-fullscreen-changed', () => this._visibility());
            this._watch(Main.sessionMode, 'updated', () => this._visibility());
            this._rebuild();
        } catch (error) {
            this.disable();
            throw error;
        }
    }

    _watch(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _clear() {
        const stripes = this._stripes ?? [];
        this._stripes = [];
        for (const {actor} of stripes) {
            try {
                // Clutter.Actor.destroy() also detaches it from its parent.
                actor.destroy();
            } catch (error) {
                console.error(`Layout Stripe: could not remove segment: ${error}`);
            }
        }
    }

    _rebuild() {
        this._clear();
        const s = this._settings;
        const profile = profileFor(this._manager.currentSource,
            parseObject(s.get_string('layout-profiles')), s.get_strv('fallback-colors'));
        this._symbol.text = profile.symbol;
        this._indicator.visible = s.get_boolean('show-panel-symbol') && Boolean(profile.symbol);
        this._systemVisibility?.setHidden(!s.get_boolean('show-system-label'));
        this._indicator.refresh();
        if (profile.hidden || profile.opacity === 0)
            return;
        const segments = stripeSegments(profile);
        const monitors = s.get_boolean('all-monitors') ? Main.layoutManager.monitors :
            [Main.layoutManager.primaryMonitor].filter(Boolean);
        try {
            for (const monitor of monitors) {
                const rects = segmentRects(monitor, s.get_string('edge'), s.get_int('thickness'), segments.length);
                rects.forEach((rect, i) => {
                    const actor = new St.Widget({name: 'layout-stripe-segment',
                        reactive: false, can_focus: false, visible: false,
                        style: segmentStyle(segments[i], s.get_string('edge'), profile.outlineThickness,
                            ['left', 'right'].includes(s.get_string('edge')) ? rect.width : rect.height),
                        opacity: Math.round(profile.opacity * 255 / 100)});
                    // Register ownership BEFORE any operation that can throw.
                    this._stripes.push({actor, monitorIndex: monitor.index});
                    actor.set_position(rect.x, rect.y);
                    actor.set_size(rect.width, rect.height);
                    // A non-reactive overlay needs no chrome/input-region tracking or struts.
                    Main.uiGroup.add_child(actor);
                });
            }
            this._visibility();
        } catch (error) {
            this._clear();
            throw error;
        }
    }

    _visibility() {
        const unlocked = !Main.sessionMode.isLocked && !Main.sessionMode.isGreeter;
        const fullscreen = this._settings.get_boolean('show-fullscreen');
        for (const {actor, monitorIndex} of this._stripes)
            actor.visible = unlocked && (fullscreen || !global.display.get_monitor_in_fullscreen(monitorIndex));
    }

    disable() {
        const signals = this._signals ?? [];
        this._signals = [];
        for (const [object, id] of signals) {
            try {
                object.disconnect(id);
            } catch (error) {
                console.error(`Layout Stripe: could not disconnect handler: ${error}`);
            }
        }
        this._clear();
        try {
            this._systemVisibility?.destroy();
        } catch (error) {
            console.error(`Layout Stripe: could not restore system indicator: ${error}`);
        }
        this._systemVisibility = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._symbol = null;
        this._manager = null;
        this._settings = null;
    }
}
