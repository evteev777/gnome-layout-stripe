// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import {MODIFIER_SHORTCUTS, modifierSelection, withModifierShortcut, shortcutConflict,
    primaryAccelerators, withPrimaryShortcut} from './shortcut-options.js';

function acceleratorLabel(value) {
    const [valid, key, modifiers] = Gtk.accelerator_parse(value);
    return valid ? Gtk.accelerator_get_label(key, modifiers) : value;
}

function normalizeAccelerator(value) {
    const [valid, key, modifiers] = Gtk.accelerator_parse(value);
    return valid ? Gtk.accelerator_name(Gdk.keyval_to_lower(key), modifiers) : value;
}

function editShortcut(parent, settings, key, title) {
    const dialog = new Gtk.Window({title, transient_for: parent, modal: true, destroy_with_parent: true,
        resizable: false, default_width: 460});
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 16,
        margin_top: 24, margin_bottom: 24, margin_start: 24, margin_end: 24});
    const help = new Gtk.Label({label: 'Press a shortcut. Escape cancels; Backspace disables.', wrap: true});
    const value = new Gtk.Label({label: '', margin_top: 12, margin_bottom: 12});
    value.add_css_class('title-2');
    const message = new Gtk.Label({label: '', wrap: true});
    const buttons = new Gtk.Box({spacing: 12, halign: Gtk.Align.END});
    const cancel = new Gtk.Button({label: 'Cancel'});
    const apply = new Gtk.Button({label: 'Apply', sensitive: false});
    apply.add_css_class('suggested-action');
    buttons.append(cancel);
    buttons.append(apply);
    for (const child of [help, value, message, buttons])
        box.append(child);
    dialog.set_child(box);
    let accelerator = '';
    const select = candidate => {
        accelerator = candidate;
        const bindings = Object.fromEntries(settings.settings_schema.list_keys()
            .map(name => [name, settings.get_strv(name)]));
        const conflict = shortcutConflict(bindings, key, candidate, normalizeAccelerator);
        value.label = candidate ? acceleratorLabel(candidate) : 'Disabled';
        message.label = conflict ? `Already assigned to “${conflict.replaceAll('-', ' ')}”. Choose another shortcut.` : '';
        apply.sensitive = !conflict;
    };
    const presets = new Gtk.DropDown({model: Gtk.StringList.new([
        'Choose a common shortcut…', 'Super+Space', 'Ctrl+Space', 'Ctrl+Alt+Space', 'Super+Shift+Space',
    ])});
    presets.connect('notify::selected', () => {
        const common = ['', '<Super>space', '<Control>space', '<Control><Alt>space', '<Super><Shift>space'];
        if (presets.selected > 0)
            select(common[presets.selected]);
    });
    box.insert_child_after(presets, help);
    const controller = new Gtk.EventControllerKey({propagation_phase: Gtk.PropagationPhase.CAPTURE});
    controller.connect('key-pressed', (_controller, keyval, _keycode, state) => {
        if (keyval === Gdk.KEY_Escape) {
            dialog.close();
            return true;
        }
        const modifiers = state & Gtk.accelerator_get_default_mod_mask();
        if (keyval === Gdk.KEY_BackSpace && modifiers === 0) {
            select('');
            return true;
        }
        const key = Gdk.keyval_to_lower(keyval);
        const standalone = key >= Gdk.KEY_F1 && key <= Gdk.KEY_F35 || key >= 0x10000000;
        if (Gtk.accelerator_valid(key, modifiers) && (modifiers !== 0 || standalone)) {
            select(Gtk.accelerator_name(key, modifiers));
            return true;
        }
        return false;
    });
    dialog.add_controller(controller);
    cancel.connect('clicked', () => dialog.close());
    apply.connect('clicked', () => {
        // Recheck conflicts in case another settings window changed the bindings.
        select(accelerator);
        if (!apply.sensitive)
            return;
        // System settings, not an extension-owned keybinding: no duplicate grabs.
        const primary = accelerator ? [accelerator] : [];
        const values = key === 'switch-input-source'
            ? withPrimaryShortcut(settings.get_strv(key), primary) : primary;
        if (settings.set_strv(key, values))
            dialog.close();
        else
            message.label = 'This shortcut is not writable.';
    });
    dialog.present();
}

export function addShortcutPreferences(page, window) {
    const bindings = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.keybindings'});
    const inputs = new Gio.Settings({schema_id: 'org.gnome.desktop.input-sources'});
    const group = new Adw.PreferencesGroup({title: 'Keyboard shortcuts',
        description: 'Changes GNOME system shortcuts. They remain active when Layout Stripe is disabled.'});
    page.add(group);
    const signals = [];
    for (const [key, title] of [
        ['switch-input-source', 'Next input source'],
        ['switch-input-source-backward', 'Previous input source'],
    ]) {
        const row = new Adw.ActionRow({title});
        const edit = new Gtk.Button({valign: Gtk.Align.CENTER,
            tooltip_text: 'Change shortcut', sensitive: bindings.is_writable(key)});
        const reset = new Gtk.Button({icon_name: 'edit-undo-symbolic', valign: Gtk.Align.CENTER,
            tooltip_text: 'Restore system default', sensitive: bindings.is_writable(key)});
        const refresh = () => {
            const values = bindings.get_strv(key);
            const primary = key === 'switch-input-source' ? primaryAccelerators(values) : values;
            edit.label = primary.map(acceleratorLabel).join(' / ') || 'Disabled';
            edit.tooltip_text = values.map(acceleratorLabel).join(' / ') || 'Disabled';
        };
        refresh();
        edit.connect('clicked', () => editShortcut(window, bindings, key, title));
        reset.connect('clicked', () => {
            if (key === 'switch-input-source') {
                const defaults = bindings.get_default_value(key).deep_unpack();
                bindings.set_strv(key, withPrimaryShortcut(bindings.get_strv(key), defaults));
            } else {
                bindings.reset(key);
            }
        });
        signals.push([bindings, bindings.connect(`changed::${key}`, refresh)]);
        row.add_suffix(edit);
        row.add_suffix(reset);
        group.add(row);
    }
    const modifiers = new Adw.ComboRow({title: 'Modifier-only shortcut',
        subtitle: 'Additional switch. None disables it without removing your main shortcuts.',
        model: Gtk.StringList.new([...MODIFIER_SHORTCUTS.map(shortcut => shortcut.label), 'Custom (system)']),
        sensitive: inputs.is_writable('xkb-options') && bindings.is_writable('switch-input-source')});
    let updating = false;
    const refresh = () => {
        if (updating)
            return;
        updating = true;
        modifiers.selected = modifierSelection(inputs.get_strv('xkb-options'), bindings.get_strv('switch-input-source'));
        updating = false;
    };
    refresh();
    modifiers.connect('notify::selected', () => {
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
    });
    signals.push([inputs, inputs.connect('changed::xkb-options', refresh)]);
    signals.push([bindings, bindings.connect('changed::switch-input-source', refresh)]);
    group.add(modifiers);
    return () => {
        for (const [object, id] of signals)
            object.disconnect(id);
    };
}
