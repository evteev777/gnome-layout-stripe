// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import {DIRECT_SHORTCUT_KEY, MODIFIER_SHORTCUTS, modifierSelection, withModifierShortcut, shortcutConflict} from './shortcut-options.js';

function normalizeAccelerator(value) {
    const [valid, key, modifiers] = Gtk.accelerator_parse(value);
    return valid ? Gtk.accelerator_name(Gdk.keyval_to_lower(key), modifiers) : value;
}

export function addShortcutPreferences(page, window, settings) {
    const bindings = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.keybindings'});
    const inputs = new Gio.Settings({schema_id: 'org.gnome.desktop.input-sources'});
    const group = new Adw.PreferencesGroup({title: 'Keyboard shortcuts',
        description: 'Standard next/previous shortcuts stay in GNOME Keyboard Settings. Left/right combinations require Layout Stripe to be enabled.'});
    page.add(group);
    const signals = [];
    const modifiers = new Adw.ComboRow({title: 'Additional layout shortcut',
        subtitle: 'Additional switch. None disables it without removing your main shortcuts.',
        model: Gtk.StringList.new(MODIFIER_SHORTCUTS.map(shortcut => shortcut.label)),
        sensitive: inputs.is_writable('xkb-options') && bindings.is_writable('switch-input-source') && settings.is_writable(DIRECT_SHORTCUT_KEY)});
    let updating = false;
    const refresh = () => {
        if (updating)
            return;
        updating = true;
        const selected = modifierSelection(inputs.get_strv('xkb-options'), bindings.get_strv('switch-input-source'),
            settings.get_strv(DIRECT_SHORTCUT_KEY));
        modifiers.selected = selected < 0 ? Gtk.INVALID_LIST_POSITION : selected;
        modifiers.subtitle = selected < 0
            ? 'Existing system configuration is unchanged. Choose an option to replace it.'
            : MODIFIER_SHORTCUTS[selected]?.direct
                ? 'Hold one key and press the other. Requires Layout Stripe to be enabled.'
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
        // Keep only one switching mechanism active and restore all settings on failure.
        updating = true;
        const writes = [
            [settings, DIRECT_SHORTCUT_KEY, []],
            [inputs, 'xkb-options', plan.options],
            [bindings, 'switch-input-source', plan.accelerators],
            [settings, DIRECT_SHORTCUT_KEY, plan.direct],
        ];
        const previous = writes.slice(0, 3).map(([object, key]) => [object, key, object.get_strv(key)]);
        try {
            for (const [object, key, value] of writes) {
                if (!object.set_strv(key, value))
                    throw new Error('Input source shortcuts are not writable.');
            }
        } catch (error) {
            for (const [object, key, value] of previous.reverse())
                object.set_strv(key, value);
            window.add_toast(new Adw.Toast({title: error.message}));
        } finally {
            updating = false;
            refresh();
        }
    };
    modifiers.connect('notify::selected', applySelection);
    signals.push([inputs, inputs.connect('changed::xkb-options', refresh)]);
    signals.push([bindings, bindings.connect('changed::switch-input-source', refresh)]);
    signals.push([settings, settings.connect(`changed::${DIRECT_SHORTCUT_KEY}`, refresh)]);
    group.add(modifiers);
    return () => {
        for (const [object, id] of signals)
            object.disconnect(id);
    };
}
