import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as options from '../shortcut-options.js';

class Widget {
    handlers = new Map();
    children = [];
    toasts = [];
    constructor(props = {}) {Object.assign(this, props);}
    connect(signal, callback) {this.handlers.set(signal, callback); return signal;}
    disconnect(signal) {this.handlers.delete(signal);}
    emit(signal, ...args) {return this.handlers.get(signal)?.(this, ...args);}
    add(child) {this.children.push(child);}
    add_toast(toast) {this.toasts.push(toast);}
}
class Settings extends Widget {
    writes = [];
    failWrites = new Set();
    constructor(values) {
        super();
        this.values = JSON.parse(JSON.stringify(values));
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
    const bindings = new Settings({'switch-input-source': accelerators,
        'switch-input-source-backward': ['<Super><Shift>space'], close: ['<Alt>F4']});
    const inputs = new Settings({'xkb-options': inputOptions});
    const settings = new Settings({[options.DIRECT_SHORTCUT_KEY]: []});
    const Gtk = {
        StringList: {new: list => list}, INVALID_LIST_POSITION: 4294967295,
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
        accelerator_name: (key, mods) => `${mods}:${key}`,
    };
    const Gdk = {keyval_to_lower: key => key};
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
    const cleanup = add(page, window, settings);
    return {page, bindings, inputs, settings, cleanup, window};
}

test('opening shortcut preferences does not change system settings; edits preserve other options', () => {
    const {page, bindings, inputs, cleanup} = create();
    assert.equal(bindings.writes.length, 0);
    assert.equal(inputs.writes.length, 0);
    const group = page.children[0];
    const modifiers = group.children[0];
    assert.equal(modifiers.selected, 4294967295);
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

test('manual Alt+Shift is recognized and dropdown changes replace it without removing main shortcuts', () => {
    const {page, bindings, inputs, cleanup} = create([], ['<Super>space', ...options.MODIFIER_SHORTCUTS[1].accelerators]);
    const group = page.children[0];
    const modifiers = group.children[0];
    assert.equal(modifiers.selected, 1);
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

test('modifier selection blocks conflicting bindings and rolls back XKB options after a failed write', () => {
    const {page, bindings, inputs, window, cleanup} = create(['compose:ralt', 'grp:caps_toggle']);
    const row = page.children[0].children[0];
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


test('preferences expose only the additional combinations, without a selectable Custom item', () => {
    const {page, inputs, bindings, cleanup} = create(['grp:win_space_toggle']);
    const group = page.children[0];
    assert.equal(group.children.length, 1);
    const row = group.children[0];
    assert.deepEqual([...row.model], options.MODIFIER_SHORTCUTS.map(shortcut => shortcut.label));
    assert.equal(row.selected, 4294967295);
    assert.equal(inputs.writes.length, 0);
    assert.equal(bindings.writes.length, 0);
    cleanup();
});


test('left/right choices use the extension binding, restore on reopen, and None clears it', () => {
    const {page, bindings, inputs, settings, cleanup} = create([], ['<Super>space', ...options.MODIFIER_SHORTCUTS[4].accelerators]);
    const row = page.children[0].children[0];
    row.selected = 4;
    row.emit('notify::selected');
    assert.deepEqual(bindings.values['switch-input-source'], ['<Super>space']);
    assert.deepEqual(settings.values[options.DIRECT_SHORTCUT_KEY], options.MODIFIER_SHORTCUTS[4].accelerators);
    assert.equal(row.selected, 4);
    row.selected = 5;
    row.emit('notify::selected');
    assert.deepEqual(settings.values[options.DIRECT_SHORTCUT_KEY], options.MODIFIER_SHORTCUTS[5].accelerators);
    assert.equal(row.selected, 5);
    bindings.failWrites.add('switch-input-source');
    row.selected = 3;
    row.emit('notify::selected');
    assert.equal(row.selected, 5);
    assert.deepEqual(inputs.values['xkb-options'], []);
    assert.deepEqual(settings.values[options.DIRECT_SHORTCUT_KEY], options.MODIFIER_SHORTCUTS[5].accelerators);
    bindings.failWrites.clear();
    row.selected = 0;
    row.emit('notify::selected');
    assert.deepEqual(settings.values[options.DIRECT_SHORTCUT_KEY], []);
    assert.deepEqual(bindings.values['switch-input-source'], ['<Super>space']);
    cleanup();
    assert.equal(settings.handlers.size, 0);
});
