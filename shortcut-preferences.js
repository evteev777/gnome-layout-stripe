// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import {MODIFIER_SHORTCUTS, modifierSelection, withModifierShortcut, shortcutConflict} from './shortcut-options.js';

function normalizeAccelerator(value) {
    const [valid, key, modifiers] = Gtk.accelerator_parse(value);
    return valid ? Gtk.accelerator_name(Gdk.keyval_to_lower(key), modifiers) : value;
}

export function addShortcutPreferences(page, window) {
    const bindings = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.keybindings'});
    const inputs = new Gio.Settings({schema_id: 'org.gnome.desktop.input-sources'});
    const group = new Adw.PreferencesGroup({title: 'Keyboard shortcuts',
        description: 'Standard next/previous shortcuts stay in GNOME Keyboard Settings. This switch remains active when Layout Stripe is disabled.'});
    page.add(group);
    const signals = [];
    const modifiers = new Adw.ComboRow({title: 'Additional layout shortcut',
        subtitle: 'Additional switch. None disables it without removing your main shortcuts.',
        model: Gtk.StringList.new(MODIFIER_SHORTCUTS.map(shortcut => shortcut.label)),
        sensitive: inputs.is_writable('xkb-options') && bindings.is_writable('switch-input-source')});
    let updating = false;
    const refresh = () => {
        if (updating)
            return;
        updating = true;
        const selected = modifierSelection(inputs.get_strv('xkb-options'), bindings.get_strv('switch-input-source'));
        modifiers.selected = selected < 0 ? Gtk.INVALID_LIST_POSITION : selected;
        modifiers.subtitle = selected < 0
            ? 'Existing system configuration is unchanged. Choose an option to replace it.'
            : 'Additional switch. None keeps your standard layout shortcuts.';
        updating = false;
    };
    refresh();
    const applySelection = () => {
        if (updating || modifiers.selected >= MODIFIER_SHORTCUTS.length)
            return;
        const index = modifiers.selected;
        const plan = withModifierShortcut(inputs.get_strv('xkb-options'),
            bindings.get_strv('switch-input-source'), index);
        const existing = Object.fromEntries(bindings.settings_schema.list_keys()
            .map(name => [name, bindings.get_strv(name)]));
        const conflict = MODIFIER_SHORTCUTS[index].accelerators
            .map(value => shortcutConflict(existing, 'switch-input-source', value, normalizeAccelerator))
            .find(Boolean);
        if (conflict) {
            window.add_toast(new Adw.Toast({title: `Shortcut conflicts with “${conflict.replaceAll('-', ' ')}”.`}));
            refresh();
            return;
        }
        // Remove the XKB switch before enabling the GNOME binding to avoid double switching.
        updating = true;
        const previous = inputs.get_strv('xkb-options');
        try {
            if (!inputs.set_strv('xkb-options', plan.options))
                throw new Error('Keyboard options are not writable.');
            if (!bindings.set_strv('switch-input-source', plan.accelerators)) {
                inputs.set_strv('xkb-options', previous);
                throw new Error('Input source shortcuts are not writable.');
            }
        } catch (error) {
            window.add_toast(new Adw.Toast({title: error.message}));
        } finally {
            updating = false;
            refresh();
        }
    };
    modifiers.connect('notify::selected', applySelection);
    signals.push([inputs, inputs.connect('changed::xkb-options', refresh)]);
    signals.push([bindings, bindings.connect('changed::switch-input-source', refresh)]);
    group.add(modifiers);
    return () => {
        for (const [object, id] of signals)
            object.disconnect(id);
    };
}
