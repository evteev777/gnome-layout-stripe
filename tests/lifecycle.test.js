import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as common from '../common.js';
import {DIRECT_SHORTCUT_KEY} from '../shortcut-options.js';
import {PanelVisibility} from '../panel-visibility.js';

class Signals {
    handlers = new Map();
    connect(signal, fn) {
        const id = this.handlers.size + 1;
        this.handlers.set(id, {signal, fn});
        return id;
    }
    disconnect(id) { this.handlers.delete(id); }
    emit(signal, ...args) {
        for (const handler of [...this.handlers.values()])
            if (handler.signal === signal) handler.fn(...args);
    }
}

test('extension reacts to layouts/settings/fullscreen/monitors and cleans up on disable', () => {
    const values = {edge: 'bottom', thickness: 4, opacity: 100, reverse: false,
        'all-monitors': true, 'show-fullscreen': false, 'layout-colors': '{}',
        'fallback-colors': ['#808080'], 'layout-profiles': '{}', 'profile-format-version': 2, 'show-panel-symbol': true, 'show-system-label': true};
    const settings = Object.assign(new Signals(), {
        get_string: k => values[k], get_int: k => values[k],
        get_boolean: k => values[k], get_strv: k => values[k],
    });
    let reloads = 0;
    let inputSettings;
    const manager = Object.assign(new Signals(), {reload() {reloads++;}, currentSource: {type: 'xkb', id: 'ru'}});
    const fullscreen = new Set([1]);
    const display = Object.assign(new Signals(), {get_monitor_in_fullscreen: i => fullscreen.has(i)});
    const sessionMode = Object.assign(new Signals(), {isLocked: false, isGreeter: false});
    const live = new Set();
    let failAttachment = false;
    const uiGroup = {
        add_child(actor) {
            assert.equal(actor.reactive, false);
            assert.equal(actor.can_focus, false);
            assert.equal(actor.visible, false);
            live.add(actor);
            if (failAttachment) throw new Error('Attachment failed after parenting');
        },
    };
    const layoutManager = Object.assign(new Signals(), {
        monitors: [{index: 0, x: 0, y: 0, width: 1920, height: 1080},
            {index: 1, x: 1920, y: 0, width: 1365, height: 767}],
        // Match GNOME 50: addChrome can parent an actor BEFORE validating options.
        addChrome(actor, options = {}) {
            live.add(actor);
            for (const key of Object.keys(options))
                if (!['affectsStruts', 'trackFullscreen'].includes(key))
                    throw new Error(`Unrecognized parameter ${key}`);
        },
    });
    layoutManager.primaryMonitor = layoutManager.monitors[0];
    const panel = {statusArea: {}, addToStatusArea(uuid, indicator) {this.statusArea[uuid] = indicator;}};
    const LayoutIndicator = class {
        symbol = {text: ''};
        attach(uuid) {panel.addToStatusArea(uuid, this);}
        refresh() {}
        destroy() {this.destroyed = true;}
    };
    const St = {Label: class {constructor(props) {Object.assign(this, props);}}, Widget: class {
        constructor(props) { Object.assign(this, props); }
        set_position(x, y) { this.x = x; this.y = y; }
        set_size(width, height) { this.width = width; this.height = height; }
        destroy() { live.delete(this); this.destroyed = true; }
    }};
    const code = fs.readFileSync(new URL('../extension.js', import.meta.url), 'utf8')
        .replace(/^import .*;\n/gm, '')
        .replace('export default class LayoutStripe', 'class LayoutStripe');
    let shortcutHandler;
    let registered = false;
    const wm = {
        addKeybinding(name, schema, flags, modes, handler) {
            assert.equal(name, DIRECT_SHORTCUT_KEY);
            assert.equal(schema, settings);
            assert.equal(flags, 8);
            assert.equal(modes, 7);
            assert.equal(registered, false);
            registered = true;
            shortcutHandler = handler;
            return 42;
        },
        removeKeybinding(name) {
            assert.equal(name, DIRECT_SHORTCUT_KEY);
            assert.equal(registered, true);
            registered = false;
            shortcutHandler = null;
        },
    };
    const Class = vm.runInNewContext(`${code}\nLayoutStripe;`, {
        St, Extension: class {getSettings() {return settings;}},
        Main: {layoutManager, sessionMode, uiGroup, panel, wm}, Keyboard: {getInputSourceManager: () => manager},
        global: {display}, Meta: {KeyBindingFlags: {IGNORE_AUTOREPEAT: 8}, KeyBindingAction: {NONE: 0}},
        Shell: {ActionMode: {NORMAL: 1, OVERVIEW: 2, POPUP: 4}}, DIRECT_SHORTCUT_KEY, ...common, console, LayoutIndicator, PanelVisibility, Gio: {Settings: class extends Signals {
            constructor() {super(); inputSettings = this;}
            get_value() {return {deep_unpack: () => [['xkb', 'ru'], ['xkb', 'us']]};}
        }},
    });
    const extension = new Class();
    extension.enable();
    const activated = [];
    const sources = [0, 2, 7].map(index => ({index, type: 'xkb', id: 'ru', activate(interactive) {
        assert.equal(interactive, true);
        activated.push(index);
        manager.currentSource = this;
    }}));
    manager.inputSources = Object.fromEntries(sources.map(s => [s.index, s]));
    manager.currentSource = sources[0];
    for (let i = 0; i < 3; i++) shortcutHandler();
    assert.deepEqual(activated, [2, 7, 0]);
    sessionMode.isLocked = true;
    shortcutHandler();
    sessionMode.isLocked = false;
    assert.equal(activated.length, 3);
    manager.inputSources = {0: sources[0]};
    shortcutHandler();
    assert.equal(activated.length, 3);
    for (let i = 0; i < 3; i++)
        inputSettings.emit('changed::xkb-options');
    assert.equal(reloads, 3);
    assert.equal(live.size, 6);
    const actors = [...live];
    settings.emit('changed', settings, 'user-presets');
    assert.deepEqual([...live], actors);
    assert.equal(extension._stripes.filter(s => s.actor.visible).length, 3);
    values['show-fullscreen'] = true;
    settings.emit('changed');
    assert.equal(extension._stripes.filter(s => s.actor.visible).length, 6);
    sessionMode.isLocked = true;
    sessionMode.emit('updated');
    assert.equal(extension._stripes.filter(s => s.actor.visible).length, 0);
    sessionMode.isLocked = false;
    sessionMode.emit('updated');
    values['layout-profiles'] = JSON.stringify({'xkb:ru': {reverse: true}});
    values.edge = 'right';
    settings.emit('changed');
    assert.ok(extension._stripes[0].actor.style.includes('#D52B1E'));
    assert.equal(extension._stripes[0].actor.x, 1916);
    manager.currentSource = {type: 'xkb', id: 'us'};
    manager.emit('current-source-changed');
    assert.equal(live.size, 0); // English is hidden by default.
    assert.equal(extension._symbol.text, '🇺🇸');
    assert.equal(extension._indicator.visible, true);
    values['show-panel-symbol'] = false;
    settings.emit('changed');
    assert.equal(extension._indicator.visible, false);
    values['show-panel-symbol'] = true;
    values['layout-profiles'] = JSON.stringify({'xkb:us': {hidden: false, opacity: 70}});
    settings.emit('changed');
    assert.equal(live.size, 2);
    assert.equal(extension._stripes[0].actor.opacity, Math.round(70 * 255 / 100));
    values['all-monitors'] = false;
    settings.emit('changed');
    assert.equal(live.size, 1);
    layoutManager.monitors = [];
    layoutManager.primaryMonitor = null;
    layoutManager.emit('monitors-changed');
    assert.equal(live.size, 0);
    extension.disable();
    assert.equal(registered, false);
    for (const obj of [settings, inputSettings, manager, display, layoutManager, sessionMode])
        assert.equal(obj.handlers.size, 0);
    layoutManager.primaryMonitor = {index: 0, x: 0, y: 0, width: 1920, height: 1080};
    extension.enable();
    assert.equal(live.size, 1);
    extension.disable();
    assert.equal(live.size, 0);

    // A changed runtime API must fail without leaving signals or actors behind.
    const originalConnect = manager.connect;
    manager.connect = function (signal, fn) {
        if (signal === 'sources-changed') throw new Error('API changed');
        return originalConnect.call(this, signal, fn);
    };
    assert.throws(() => extension.enable(), /API changed/);
    assert.equal(live.size, 0);
    for (const obj of [settings, inputSettings, manager, display, layoutManager, sessionMode])
        assert.equal(obj.handlers.size, 0);
    manager.connect = originalConnect;
    const originalFullscreen = display.get_monitor_in_fullscreen;
    delete display.get_monitor_in_fullscreen;
    assert.throws(() => extension.enable(), /incompatible GNOME Shell API/);
    assert.equal(live.size, 0);
    display.get_monitor_in_fullscreen = originalFullscreen;
    // Partial parenting errors must not leave the first segment on screen.
    failAttachment = true;
    assert.throws(() => extension.enable(), /Attachment failed/);
    assert.equal(live.size, 0);
    for (const obj of [settings, inputSettings, manager, display, layoutManager, sessionMode])
        assert.equal(obj.handlers.size, 0);
    failAttachment = false;
    extension.enable();
    failAttachment = true;
    assert.throws(() => manager.emit('current-source-changed'), /Attachment failed/);
    assert.equal(live.size, 0);
    failAttachment = false;
    manager.emit('current-source-changed');
    assert.equal(live.size, 1);
    extension.disable();
    assert.equal(live.size, 0);
    extension.disable();
    assert.equal(live.size, 0);
});
