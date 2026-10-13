import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as options from '../shortcut-options.js';

class Widget {
    handlers = new Map();
    children = [];
    suffixes = [];
    controllers = [];
    toasts = [];
    constructor(props = {}) {Object.assign(this, props);}
    connect(signal, callback) {this.handlers.set(signal, callback); return signal;}
    disconnect(signal) {this.handlers.delete(signal);}
    emit(signal, ...args) {return this.handlers.get(signal)?.(this, ...args);}
    append(child) {this.children.push(child);}
    add(child) {this.children.push(child);}
    add_suffix(child) {this.suffixes.push(child);}
    add_css_class() {}
    set_child(child) {this.child = child;}
    insert_child_after(child, sibling) {this.children.splice(this.children.indexOf(sibling) + 1, 0, child);}
    add_controller(controller) {this.controllers.push(controller);}
    add_toast(toast) {this.toasts.push(toast);}
    present() {this.presented = true;}
    close() {this.closed = true;}
}
class Settings extends Widget {
    writes = [];
    failWrites = new Set();
    constructor(values) {
        super();
        this.values = JSON.parse(JSON.stringify(values));
        this.defaults = JSON.parse(JSON.stringify(values));
        this.settings_schema = {list_keys: () => Object.keys(values)};
    }
    get_strv(key) {return this.values[key];}
    is_writable() {return true;}
    set_strv(key, value) {
        if (this.failWrites.has(key)) return false;
        this.values[key] = [...value];
        this.writes.push(key);
        this.emit(`changed::${key}`);
        return true;
    }
    get_default_value(key) {return {deep_unpack: () => [...this.defaults[key]]};}
    reset(key) {this.set_strv(key, this.defaults[key]);}
    connect(signal, callback) {
        const id = Symbol(signal);
        this.handlers.set(id, {signal, callback});
        return id;
    }
    emit(signal, ...args) {
        for (const handler of this.handlers.values())
            if (handler.signal === signal) handler.callback(this, ...args);
    }
}
function create(inputOptions = ['compose:ralt', 'grp:alt_shift_toggle'], accelerators = ['<Super>space']) {
    const dialogs = [];
    const bindings = new Settings({'switch-input-source': accelerators,
        'switch-input-source-backward': ['<Super><Shift>space'], close: ['<Alt>F4']});
    const inputs = new Settings({'xkb-options': inputOptions});
    const Gtk = {
        Align: {END: 1, CENTER: 2}, Orientation: {VERTICAL: 1}, PropagationPhase: {CAPTURE: 1},
        Box: Widget, Label: Widget, Button: Widget, DropDown: Widget, EventControllerKey: Widget,
        StringList: {new: list => list},
        Window: class extends Widget {constructor(props) {super(props); dialogs.push(this);}},
        accelerator_parse(value) {
            if (/^\d+:\d+$/.test(value)) {
                const [mods, key] = value.split(':').map(Number);
                return [true, key, mods];
            }
            const symbols = {space: 32, F4: 1003, Shift_L: 2000, Shift_R: 2001,
                Alt_L: 2002, Alt_R: 2003, Control_L: 2004, Control_R: 2005};
            const key = symbols[value.replace(/<[^>]+>/g, '')] ?? 0;
            const mods = (value.includes('<Shift>') ? 1 : 0) | (value.includes('<Control>') ? 4 : 0) |
                (value.includes('<Alt>') ? 8 : 0) | (value.includes('<Super>') ? 64 : 0);
            return [true, key, mods];
        },
        accelerator_get_label: (key, mods) => `${mods}:${key}`,
        accelerator_name: (key, mods) => `${mods}:${key}`,
        accelerator_get_default_mod_mask: () => 77,
        accelerator_valid: key => key !== 2000,
    };
    const Gdk = {keyval_to_lower: key => key, KEY_Escape: 27, KEY_BackSpace: 8, KEY_F1: 1000, KEY_F35: 1034};
    const code = fs.readFileSync(new URL('../shortcut-preferences.js', import.meta.url), 'utf8')
        .replace(/^import [\s\S]*?;\n/gm, '').replace('export function addShortcutPreferences', 'function addShortcutPreferences');
    const add = vm.runInNewContext(`${code}\naddShortcutPreferences;`, {
        Adw: {PreferencesGroup: Widget, ActionRow: Widget, ComboRow: Widget, Toast: Widget}, Gtk, Gdk, ...options,
        Gio: {Settings: class {constructor(props) {
            return props.schema_id.endsWith('keybindings') ? bindings : inputs;
        }}},
    });
    const page = new Widget();
    const window = new Widget();
    const cleanup = add(page, window);
    return {page, bindings, inputs, dialogs, cleanup, window};
}

test('opening shortcut preferences does not change system settings; edits preserve other options', () => {
    const {page, bindings, inputs, cleanup} = create();
    assert.equal(bindings.writes.length, 0);
    assert.equal(inputs.writes.length, 0);
    const group = page.children[0];
    const modifiers = group.children[2];
    assert.equal(modifiers.selected, 4);
    modifiers.selected = 2;
    modifiers.emit('notify::selected');
    assert.deepEqual(inputs.values['xkb-options'], ['compose:ralt']);
    assert.deepEqual(bindings.values['switch-input-source'], ['<Super>space', ...options.MODIFIER_SHORTCUTS[2].accelerators]);
    cleanup();
    assert.equal(inputs.handlers.size, 0);
    assert.equal(bindings.handlers.size, 0);
    assert.deepEqual(inputs.values['xkb-options'], ['compose:ralt']);
    assert.equal(modifiers.selected, 2);
});

test('shortcut recorder rejects conflicts, supports disabling and Escape, and allows focus navigation', () => {
    const {page, bindings, dialogs, cleanup} = create();
    const edit = page.children[0].children[0].suffixes[0];
    edit.emit('clicked');
    const dialog = dialogs[0];
    assert.equal(dialog.destroy_with_parent, true);
    const controller = dialog.controllers[0];
    const buttons = dialog.child.children.at(-1);
    const apply = buttons.children[1];
    assert.equal(apply.sensitive, false);
    assert.equal(controller.emit('key-pressed', 9, 0, 0), false); // Tab can move focus.
    controller.emit('key-pressed', 1003, 0, 8); // Alt+F4 is already assigned.
    assert.equal(apply.sensitive, false);
    controller.emit('key-pressed', 32, 0, 4); // Ctrl+Space.
    assert.equal(apply.sensitive, true);
    apply.emit('clicked');
    assert.deepEqual(bindings.values['switch-input-source'], ['4:32']);
    assert.equal(dialog.closed, true);
    assert.deepEqual(bindings.values.close, ['<Alt>F4']);
    edit.emit('clicked');
    dialogs[1].controllers[0].emit('key-pressed', 8, 0, 0);
    dialogs[1].child.children.at(-1).children[1].emit('clicked');
    assert.equal(bindings.values['switch-input-source'].length, 0);
    edit.emit('clicked');
    const writes = bindings.writes.length;
    dialogs[2].controllers[0].emit('key-pressed', 27, 0, 0);
    assert.equal(dialogs[2].closed, true);
    assert.equal(bindings.writes.length, writes);
    cleanup();
});


test('manual Alt+Shift is recognized and dropdown changes replace it without removing main shortcuts', () => {
    const {page, bindings, inputs, cleanup} = create([], ['<Super>space', ...options.MODIFIER_SHORTCUTS[1].accelerators]);
    const group = page.children[0];
    const modifiers = group.children[2];
    assert.equal(modifiers.selected, 1);
    assert.equal(group.children[0].suffixes[0].label, '64:32');
    modifiers.selected = 2;
    modifiers.emit('notify::selected');
    assert.deepEqual(bindings.values['switch-input-source'], ['<Super>space', ...options.MODIFIER_SHORTCUTS[2].accelerators]);
    modifiers.selected = 3;
    modifiers.emit('notify::selected');
    assert.deepEqual(inputs.values['xkb-options'], ['grp:caps_toggle']);
    assert.deepEqual(bindings.values['switch-input-source'], ['<Super>space']);
    modifiers.selected = 0;
    modifiers.emit('notify::selected');
    assert.deepEqual(inputs.values['xkb-options'], []);
    assert.deepEqual(bindings.values['switch-input-source'], ['<Super>space']);
    cleanup();
});

test('resetting the main shortcut preserves the additional modifier combination', () => {
    const {page, bindings, cleanup} = create([], ['<Super>space']);
    const group = page.children[0];
    bindings.set_strv('switch-input-source', ['<Control>space', ...options.MODIFIER_SHORTCUTS[1].accelerators]);
    group.children[0].suffixes[1].emit('clicked');
    assert.deepEqual(bindings.values['switch-input-source'], ['<Super>space', ...options.MODIFIER_SHORTCUTS[1].accelerators]);
    assert.equal(group.children[2].selected, 1);
    cleanup();
});


test('modifier selection blocks conflicting bindings and rolls back XKB options after a failed write', () => {
    const {page, bindings, inputs, window, cleanup} = create(['compose:ralt', 'grp:caps_toggle']);
    const row = page.children[0].children[2];
    bindings.set_strv('close', ['<Alt>Shift_L']);
    row.selected = 1;
    row.emit('notify::selected');
    assert.equal(row.selected, 3);
    assert.deepEqual(inputs.values['xkb-options'], ['compose:ralt', 'grp:caps_toggle']);
    assert.deepEqual(bindings.values['switch-input-source'], ['<Super>space']);
    assert.ok(window.toasts[0].title.includes('conflicts'));
    bindings.set_strv('close', ['<Alt>F4']);
    bindings.failWrites.add('switch-input-source');
    row.selected = 1;
    row.emit('notify::selected');
    assert.equal(row.selected, 3);
    assert.deepEqual(inputs.values['xkb-options'], ['compose:ralt', 'grp:caps_toggle']);
    assert.deepEqual(bindings.values['switch-input-source'], ['<Super>space']);
    assert.ok(window.toasts[1].title.includes('not writable'));
    cleanup();
});
