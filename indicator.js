// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {parseObject, profileFor} from './common.js';

export const LayoutIndicator = GObject.registerClass({GTypeName: 'LayoutStripeIndicator'},
class LayoutIndicator extends PanelMenu.Button {
    _init(manager, settings, openPreferences) {
        super._init(0.5, 'Keyboard layout', false);
        try {
            // GNOME 50 uses a press gesture; GNOME 46 uses vfunc_event().
            // Route both through our handler so a click never toggles twice.
            this._clickGesture?.set_enabled(false);
            this._manager = manager;
            this._settings = settings;
            this._openPreferences = openPreferences;
            this._mode = 'layouts';
            this._items = [];
            this.symbol = new St.Label({text: '', y_align: Clutter.ActorAlign.CENTER});
            this.add_child(this.symbol);
            this._menuManager = new PopupMenu.PopupMenuManager(this);
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    attach(uuid) {
        Main.panel.addToStatusArea(uuid, this);
        // An independent manager prevents hovering over adjacent panel icons
        // from replacing this menu while moving the pointer toward its items.
        Main.panel.menuManager.removeMenu(this.menu);
        this._menuManager.addMenu(this.menu);
    }

    vfunc_event(event) {
        const type = event.type();
        if (type === Clutter.EventType.BUTTON_PRESS) {
            const button = event.get_button();
            if (button !== 1 && button !== 3)
                return Clutter.EVENT_PROPAGATE;
            this._toggle(button === 3 ? 'settings' : 'layouts');
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.TOUCH_BEGIN) {
            this._toggle('layouts');
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.KEY_PRESS) {
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Menu ||
                (key === Clutter.KEY_F10 && (event.get_state() & Clutter.ModifierType.SHIFT_MASK))) {
                this._toggle('settings');
                return Clutter.EVENT_STOP;
            }
            if ([Clutter.KEY_space, Clutter.KEY_Return, Clutter.KEY_KP_Enter, Clutter.KEY_Down].includes(key)) {
                this._toggle('layouts');
                return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _toggle(mode) {
        if (this.menu.isOpen && this._mode === mode) {
            this.menu.close();
            return;
        }
        this._mode = mode;
        this._populate();
        this.menu.open();
    }

    _populate() {
        this.menu.removeAll();
        this._items = [];
        if (this._mode === 'settings') {
            this.menu.addAction('Layout Stripe Settings', () => this._openPreferences());
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const keyboard = Main.panel.statusArea.keyboard;
            const layout = this.menu.addAction('Show Keyboard Layout', () => keyboard._showLayout());
            layout.sensitive = typeof keyboard?._showLayout === 'function' && Main.sessionMode.allowSettings;
            this.menu.addSettingsAction('Keyboard Settings', 'gnome-keyboard-panel.desktop');
            return;
        }
        const sources = Object.values(this._manager.inputSources).sort((a, b) => a.index - b.index);
        for (const source of sources) {
            const item = new PopupMenu.PopupMenuItem('');
            item.connect('activate', () => source.activate(true));
            this.menu.addMenuItem(item);
            this._items.push({source, item});
        }
        if (!sources.length)
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem('No input sources', {reactive: false}));
        this.refresh();
    }

    refresh(sourcesChanged = false) {
        if (sourcesChanged && this.menu.isOpen && this._mode === 'layouts') {
            this._populate();
            return;
        }
        const profiles = parseObject(this._settings.get_string('layout-profiles'));
        const fallback = this._settings.get_strv('fallback-colors');
        for (const {source, item} of this._items) {
            const symbol = profileFor(source, profiles, fallback).symbol;
            item.label.text = [symbol, source.displayName || source.id].filter(Boolean).join('  ');
            item.setOrnament(source === this._manager.currentSource
                ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        }
    }

    _onDestroy() {
        this.menu?.close();
        this._menuManager?.removeMenu(this.menu);
        this._menuManager = null;
        this._items = [];
        this._manager = null;
        this._settings = null;
        this._openPreferences = null;
        super._onDestroy();
    }
});
