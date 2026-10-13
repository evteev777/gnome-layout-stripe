import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PanelVisibility} from '../panel-visibility.js';
import {DEFAULT_GREEN, PRESETS, profileFor, matchingPreset, resetSettings} from '../common.js';

class Actor {
    handlers = new Map();
    constructor(visible) {this._visible = visible;}
    get visible() {return this._visible;}
    set visible(value) {
        if (this._visible === value) return;
        this._visible = value;
        for (const fn of [...this.handlers.values()]) fn();
    }
    connect(_signal, fn) {this.handlers.set(1, fn); return 1;}
    disconnect(id) {this.handlers.delete(id);}
}

test('system indicator hiding resists Shell visibility changes and restores on disable', () => {
    for (const visible of [true, false]) {
        const actor = new Actor(visible);
        const controller = new PanelVisibility(actor);
        controller.setHidden(true);
        assert.equal(actor.visible, false);
        controller.setHidden(false);
        assert.equal(actor.visible, visible);
        controller.setHidden(true);
        actor.visible = true; // GNOME updates the indicator while it is hidden.
        assert.equal(actor.visible, false);
        controller.destroy();
        assert.equal(actor.visible, true);
        assert.equal(actor.handlers.size, 0);
        actor.visible = false;
        assert.equal(actor.visible, false);
    }
});

test('reset restores standard profiles and display choices without deleting user presets', () => {
    const defaults = {edge: 'bottom', thickness: 6, 'all-monitors': true, 'show-fullscreen': false,
        'fallback-colors': [DEFAULT_GREEN], 'show-panel-symbol': true, 'show-system-label': false,
        'layout-profiles': '{}', 'layout-colors': '{}', opacity: 100, reverse: false};
    const values = {...defaults, edge: 'right', thickness: 88, 'all-monitors': true,
        'show-panel-symbol': false, 'show-system-label': false, 'fallback-colors': ['#123456'],
        'layout-profiles': '{"xkb:ru":{"symbol":"🦊","hidden":true}}',
        'layout-colors': '{"xkb:us":["#FFFFFF"]}',
        'user-presets': '[{"name":"Keep me","colors":["#123456"],"symbol":"🦊"}]',
        'profile-format-version': 2};
    const custom = values['user-presets'];
    resetSettings({reset: k => {values[k] = defaults[k];}, set_int: (k, v) => {values[k] = v;}});
    assert.equal(values['user-presets'], custom);
    assert.equal(values.thickness, 6);
    assert.equal(values.edge, 'bottom');
    assert.equal(values['show-panel-symbol'], true);
    assert.equal(values['show-system-label'], false);
    assert.equal(values['layout-colors'], '{}');
    const english = profileFor({type: 'xkb', id: 'us'}, JSON.parse(values['layout-profiles']), values['fallback-colors']);
    assert.equal(english.hidden, true);
    assert.deepEqual(english.colors, [DEFAULT_GREEN]);
    assert.equal(english.symbol, '🇺🇸');
    assert.equal(matchingPreset(english, PRESETS), 0);
    const russian = profileFor({type: 'xkb', id: 'ru'}, {}, []);
    assert.equal(russian.hidden, false);
    assert.equal(russian.symbol, '🇷🇺');
});

test('schema has the exact screenshot green, 6px and both independent panel controls', () => {
    const xml = fs.readFileSync(new URL('../schemas/org.gnome.shell.extensions.layout-stripe.gschema.xml', import.meta.url), 'utf8');
    assert.match(xml, /name="fallback-colors"[\s\S]*?#57E389/);
    assert.match(xml, /name="thickness"[\s\S]*?<default>6<\/default>/);
    assert.match(xml, /name="show-panel-symbol"/);
    assert.match(xml, /name="show-system-label"[\s\S]*?<default>false<\/default>/);
    assert.match(xml, /name="all-monitors"[\s\S]*?<default>true<\/default>/);
});
