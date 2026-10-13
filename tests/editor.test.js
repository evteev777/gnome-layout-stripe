import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as common from '../common.js';

class Widget {
    handlers = new Map();
    rows = [];
    children = [];
    prefixes = [];
    suffixes = [];
    constructor(props = {}) {
        Object.assign(this, {selected: 0, active: false, visible: true, text: ''}, props);
        return new Proxy(this, {set(target, key, value) {
            const changed = target[key] !== value;
            target[key] = value;
            if (changed && ['selected', 'active', 'rgba', 'text'].includes(key)) {
                target.emit(`notify::${key}`);
                if (key === 'active') target.emit('toggled');
                if (key === 'text') target.emit('changed');
            }
            return true;
        }});
    }
    connect(signal, fn) {this.handlers.set(signal, fn); return signal;}
    emit(signal, ...args) {this.handlers.get(signal)?.(this, ...args);}
    add_row(child) {this.rows.push(child);}
    add_suffix(child) {this.suffixes.push(child);}
    add_prefix(child) {this.prefixes.push(child);}
    append(child) {this.children.push(child);}
    add_css_class() {}
    set_size_request() {}
    set_draw_value() {}
    set_digits() {}
    set_tooltip_text() {}
    set_value(value) {
        if (this.value !== value) {this.value = value; this.emit('value-changed');}
    }
    get_value() {return this.value;}
    popdown() {this.poppedDown = true;}
    set_draw_func(fn) {this.draw = fn;}
    queue_draw() {}
}
class RGBA {
    parse(hex) {[this.red, this.green, this.blue] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);}
}
function create() {
    const code = fs.readFileSync(new URL('../prefs.js', import.meta.url), 'utf8')
        .replace(/^import [\s\S]*?;\n/gm, '')
        .replace('export default class LayoutStripePreferences', 'class LayoutStripePreferences');
    const Class = vm.runInNewContext(`${code}\nLayoutStripePreferences;`, {
        Adw: {ActionRow: Widget, ExpanderRow: Widget, ComboRow: Widget, Toast: Widget},
        Gtk: {Align: {CENTER: 3}, Orientation: {HORIZONTAL: 0}, StringList: {new: items => Object.assign([...items], {get_n_items: () => items.length, get_string: i => items[i]})},
            DrawingArea: Widget, ColorButton: Widget, Box: Widget, Label: Widget, CheckButton: Widget,
            Switch: Widget, Entry: Widget, Button: Widget, MenuButton: Widget, EmojiChooser: Widget, DropDown: Widget,
            Scale: {new_with_range: () => new Widget()}},
        Gdk: {RGBA}, Gio: {}, ExtensionPreferences: class {}, ...common,
    });
    const values = {'layout-profiles': '{}', 'user-presets': '[]', 'fallback-colors': ['#808080']};
    const settings = {get_string: k => values[k], get_strv: k => values[k],
        set_string: (k, v) => {values[k] = v;}};
    const prefs = new Class();
    const window = {add_toast() {}};
    return {prefs, settings, values, window};
}
function row(editor, title) {return editor.row.rows.find(r => r.title === title);}

test('editor auto-selects system presets and Hide restores opacity after reopening', () => {
    const {prefs, settings, values, window} = create();
    let editor = prefs._layoutEditor(settings, {type: 'xkb', id: 'ru'}, window);
    assert.equal(editor.row.title, 'Russian');
    assert.equal(row(editor, 'Preset').selected, 7);
    assert.equal(row(editor, 'Preset').model[7], 'Russian');
    const [slider, label, hide] = row(editor, 'Opacity').suffixes[0].children;
    slider.set_value(37);
    assert.equal(label.label, '37%');
    hide.active = true;
    assert.equal(slider.value, 0);
    assert.equal(slider.sensitive, false);
    assert.ok(editor.row.subtitle.includes('Hidden'));
    assert.equal(JSON.parse(values['layout-profiles'])['xkb:ru'].restoreOpacity, 37);
    editor = prefs._layoutEditor(settings, {type: 'xkb', id: 'ru'}, window);
    const [reopenedSlider, , reopenedHide] = row(editor, 'Opacity').suffixes[0].children;
    reopenedHide.active = false;
    assert.equal(reopenedSlider.value, 37);
    assert.equal(reopenedSlider.sensitive, true);
    const english = prefs._layoutEditor(settings, {type: 'xkb', id: 'us'}, window);
    assert.equal(row(english, 'Preset').selected, 1);
    assert.equal(row(english, 'Opacity').suffixes[0].children[2].active, true);
    assert.equal(english.row.prefixes.length, 1);
});

test('custom preset saves all controls and is applied to another layout', () => {
    const {prefs, settings, values, window} = create();
    const russian = prefs._layoutEditor(settings, {type: 'xkb', id: 'ru'}, window);
    const [slider, , hide] = row(russian, 'Opacity').suffixes[0].children;
    slider.set_value(45);
    row(russian, 'Reverse color order').suffixes[0].active = true;
    hide.active = true;
    const [name, save] = row(russian, 'Save as my preset').suffixes;
    name.text = 'My flag';
    save.emit('clicked');
    const preset = JSON.parse(values['user-presets'])[0];
    assert.equal(preset.hidden, true);
    assert.equal(preset.restoreOpacity, 45);
    assert.equal(preset.reverse, true);
    const german = prefs._layoutEditor(settings, {type: 'xkb', id: 'de'}, window);
    row(german, 'Preset').selected = 11;
    assert.equal(row(german, 'Opacity').suffixes[0].children[2].active, true);
    assert.equal(row(german, 'Reverse color order').suffixes[0].active, true);
    row(german, 'Opacity').suffixes[0].children[2].active = false;
    assert.equal(row(german, 'Opacity').suffixes[0].children[0].value, 45);
    assert.equal(JSON.parse(values['layout-profiles'])['xkb:ru'].hidden, true);
    row(german, 'Restore layout defaults').suffixes[0].emit('clicked');
    assert.equal(row(german, 'Preset').selected, 3);
    assert.equal(row(german, 'Opacity').suffixes[0].children[0].value, 100);
});

test('Unicode previews follow edits, are saved in presets and restore standard symbols', () => {
    const {prefs, settings, values, window} = create();
    const editor = prefs._layoutEditor(settings, {type: 'xkb', id: 'ru'}, window);
    assert.equal(editor.row.prefixes[0].label, '🇷🇺');
    const [entry, , reset] = row(editor, 'Unicode symbol').suffixes;
    entry.text = '🦊';
    assert.equal(editor.row.prefixes[0].label, '🦊');
    assert.equal(JSON.parse(values['layout-profiles'])['xkb:ru'].symbol, '🦊');
    const [name, save] = row(editor, 'Save as my preset').suffixes;
    name.text = 'Fox';
    save.emit('clicked');
    assert.equal(JSON.parse(values['user-presets'])[0].symbol, '🦊');
    reset.emit('clicked');
    assert.equal(editor.row.prefixes[0].label, '🇷🇺');
    entry.text = '';
    assert.equal(editor.row.prefixes[0].label, '—');
});


test('explicit Custom selection persists even when colors match a built-in preset', () => {
    const {prefs, settings, values, window} = create();
    const source = {type: 'xkb', id: 'ru'};
    const editor = prefs._layoutEditor(settings, source, window);
    row(editor, 'Preset').selected = 0;
    assert.equal(JSON.parse(values['layout-profiles'])['xkb:ru'].presetId, null);
    const reopened = prefs._layoutEditor(settings, source, window);
    assert.equal(row(reopened, 'Preset').selected, 0);
});

test('typing a multi-word Unicode label keeps the entry text intact', () => {
    const {prefs, settings, values, window} = create();
    const editor = prefs._layoutEditor(settings, {type: 'xkb', id: 'ru'}, window);
    const entry = row(editor, 'Unicode symbol').suffixes[0];
    for (const text of ['My', 'My ', 'My flag']) {
        entry.text = text;
        assert.equal(entry.text, text);
        assert.equal(editor.row.prefixes[0].label, text);
        assert.equal(JSON.parse(values['layout-profiles'])['xkb:ru'].symbol, text);
    }
});

test('emoji picker replaces the symbol, persists it and closes without changing colors', () => {
    const {prefs, settings, values, window} = create();
    const source = {type: 'xkb', id: 'us'};
    const editor = prefs._layoutEditor(settings, source, window);
    const [entry, button] = row(editor, 'Unicode symbol').suffixes;
    assert.equal(button.tooltip_text, 'Choose emoji');
    entry.text = 'Old text';
    for (const emoji of ['🦊', '🇬🇧', '👩‍💻']) {
        button.popover.emit('emoji-picked', emoji);
        assert.equal(entry.text, emoji);
        assert.equal(editor.row.prefixes[0].label, emoji);
        const profile = JSON.parse(values['layout-profiles'])['xkb:us'];
        assert.equal(profile.symbol, emoji);
        assert.deepEqual(profile.colors, ['#57E389']);
        assert.equal(profile.hidden, true);
        assert.equal(button.popover.poppedDown, true);
        const reopened = prefs._layoutEditor(settings, source, window);
        assert.equal(row(reopened, 'Unicode symbol').suffixes[0].text, emoji);
    }
});


test('new preset drafts save complete settings without changing layout assignments', () => {
    const {prefs, settings, values, window} = create();
    let saved = 0;
    let cancelled = 0;
    const actions = {saved: () => saved++, cancel: () => cancelled++};
    const editor = prefs._layoutEditor(settings, null, window, actions);
    assert.equal(editor.row.title, 'New preset');
    assert.equal(editor.row.expanded, true);
    row(editor, 'Number of segments').selected = 2;
    row(editor, 'Unicode symbol').suffixes[0].text = '🦊';
    row(editor, 'Opacity').suffixes[0].children[0].set_value(45);
    row(editor, 'Reverse color order').suffixes[0].active = true;
    assert.equal(values['layout-profiles'], '{}');
    assert.equal(values['user-presets'], '[]');
    const [name, save] = row(editor, 'Save as my preset').suffixes;
    name.text = 'Fox';
    save.emit('clicked');
    const preset = JSON.parse(values['user-presets'])[0];
    assert.equal(preset.symbol, '🦊');
    assert.equal(preset.colors.length, 3);
    assert.equal(preset.opacity, 45);
    assert.equal(preset.reverse, true);
    assert.equal(saved, 1);
    assert.equal(values['layout-profiles'], '{}');
    const duplicate = prefs._layoutEditor(settings, null, window, actions);
    row(duplicate, 'Save as my preset').suffixes[0].text = 'Fox';
    row(duplicate, 'Save as my preset').suffixes[1].emit('clicked');
    assert.equal(saved, 2);
    assert.equal(JSON.parse(values['user-presets']).length, 1);
    row(duplicate, 'Discard new preset').suffixes[0].emit('clicked');
    assert.equal(cancelled, 1);
    assert.equal(values['layout-profiles'], '{}');
});


test('saved preset editors update or copy by name without changing layout assignments or built-ins', () => {
    const {prefs, settings, values, window} = create();
    const standard = JSON.stringify(common.PRESETS);
    const original = {name: 'Fox', ...common.normalizeProfile({symbol: '🦊', colors: ['#123456']})};
    values['user-presets'] = JSON.stringify([original]);
    const editor = prefs._layoutEditor(settings, null, window, {preset: original});
    assert.equal(editor.row.title, 'Fox');
    assert.equal(editor.row.expanded, false);
    const [name, save, names] = row(editor, 'Save as my preset').suffixes;
    assert.equal(name.text, 'Fox');
    row(editor, 'Unicode symbol').suffixes[0].text = '🐱';
    assert.equal(JSON.parse(values['user-presets'])[0].symbol, '🦊');
    save.emit('clicked');
    assert.equal(JSON.parse(values['user-presets'])[0].symbol, '🐱');
    name.text = 'Cat';
    save.emit('clicked');
    assert.equal(JSON.parse(values['user-presets']).length, 2);
    names.selected = 1;
    assert.equal(name.text, 'Fox');
    assert.equal(values['layout-profiles'], '{}');
    assert.equal(JSON.stringify(common.PRESETS), standard);
    const source = prefs._layoutEditor(settings, {type: 'xkb', id: 'ru'}, window);
    const [sourceName, sourceSave, sourceNames] = row(source, 'Save as my preset').suffixes;
    sourceNames.selected = 2;
    assert.equal(sourceName.text, 'Cat');
    sourceSave.emit('clicked');
    assert.equal(JSON.parse(values['user-presets']).length, 2);
    assert.equal(JSON.parse(values['user-presets'])[1].symbol, '🇷🇺');
    assert.equal(JSON.stringify(common.PRESETS), standard);
});
