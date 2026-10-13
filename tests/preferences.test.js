import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as common from '../common.js';

class Widget {
    suffixes = [];
    handlers = new Map();
    constructor(props) { Object.assign(this, props); }
    add_suffix(child) { this.suffixes.push(child); }
    connect(signal, fn) { this.handlers.set(signal, fn); }
    emit(signal) { this.handlers.get(signal)?.(); }
}
class ActionRow extends Widget {}
class ExpanderRow extends Widget {
    rows = [];
    add_row(row) { this.rows.push(row); }
}
class RGBA {
    parse(hex) {
        [this.red, this.green, this.blue] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    }
}

for (const modern of [true, false]) {
    test(`preferences controls work with ${modern ? 'modern' : 'fallback'} widgets`, () => {
        const Adw = {ActionRow, ExpanderRow};
        const Gtk = {Align: {CENTER: 3}, Switch: Widget, SpinButton: Widget,
            Adjustment: Widget, ColorButton: Widget};
        if (modern) {
            Adw.SwitchRow = class extends Widget {};
            Adw.SpinRow = class extends Widget {};
            Gtk.ColorDialog = Widget;
            Gtk.ColorDialogButton = class extends Widget {};
        }
        const code = fs.readFileSync(new URL('../prefs.js', import.meta.url), 'utf8')
            .replace(/^import [\s\S]*?;\n/gm, '')
            .replace('export default class LayoutStripePreferences', 'class LayoutStripePreferences');
        const Class = vm.runInNewContext(`${code}\nLayoutStripePreferences;`, {
            Adw, Gtk, Gdk: {RGBA}, Gio: {SettingsBindFlags: {DEFAULT: 0, INVERT_BOOLEAN: 16}},
            ExtensionPreferences: class {}, ...common,
        });
        const prefs = new Class();
        const bindings = [];
        const settings = {bind: (...args) => bindings.push(args)};
        const group = {rows: [], add(row) {this.rows.push(row);}};
        prefs._switch(group, settings, 'reverse', 'Reverse', '');
        prefs._spin(group, settings, 'thickness', 'Thickness', '', 1, 100);
        assert.equal(bindings.length, 2);
        assert.equal(bindings[0][2], 'active');
        assert.equal(bindings[1][2], 'value');
        assert.equal(bindings[1][1].adjustment.lower, 1);
        assert.equal(bindings[1][1].adjustment.upper, 100);
        if (modern) {
            assert.ok(group.rows[0] instanceof Adw.SwitchRow);
            assert.ok(group.rows[1] instanceof Adw.SpinRow);
        } else {
            assert.equal(group.rows[0].suffixes[0], bindings[0][1]);
            assert.equal(group.rows[1].suffixes[0], bindings[1][1]);
        }
        prefs._switch(group, settings, 'show-system-label', 'Disable system layout label', '', true);
        assert.equal(bindings[2][3], 16);
        assert.equal(group.rows[2].title, 'Disable system layout label');
        let selected;
        const parent = new ExpanderRow();
        const {row, button} = prefs._colorRow(parent, 'Color', '#123456', hex => {selected = hex;});
        assert.equal(parent.rows[0], row);
        assert.equal(row.subtitle, '#123456');
        button.rgba = prefs._rgba('#ABCDEF');
        button.emit('notify::rgba');
        assert.equal(selected, '#abcdef');
        assert.equal(row.subtitle, '#ABCDEF');
        if (modern) assert.equal(button.dialog.with_alpha, false);
        else assert.equal(button.use_alpha, false);
    });
}

test('metadata permits supported releases while retaining settings identity', () => {
    const metadata = JSON.parse(fs.readFileSync(new URL('../metadata.json', import.meta.url), 'utf8'));
    assert.deepEqual(metadata['shell-version'], Array.from({length: 5}, (_, i) => String(46 + i)));
    assert.equal(metadata.uuid, 'layout-stripe@evteev.ru');
    assert.equal(metadata['settings-schema'], 'org.gnome.shell.extensions.layout-stripe');
    assert.equal(metadata['version-name'], '1.0 beta 2');
    assert.match(metadata['version-name'], /^(?!^[. ]+$)[a-zA-Z0-9 .]{1,16}$/);
});
