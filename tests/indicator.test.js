import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as common from '../common.js';

class Menu {
    items = [];
    isOpen = false;
    addAction(label, action) {
        const item = {label: {text: label}, action};
        this.items.push(item);
        return item;
    }
    addSettingsAction(label, desktop) {
        return this.addAction(label, () => desktop);
    }
    addMenuItem(item) {this.items.push(item);}
    removeAll() {this.items = [];}
    open() {this.isOpen = true;}
    close() {this.isOpen = false;}
}
class Item {
    label = {text: ''};
    constructor(_text, props) {Object.assign(this, props);}
    connect(_signal, action) {this.action = action;}
    setOrnament(value) {this.ornament = value;}
}
function create(gesture = true) {
    let gestureEnabled = true;
    const Button = class {
        constructor(...args) {this._init(...args);}
        _init(alignment) {
            this.alignment = alignment;
            this.menu = new Menu();
            if (gesture)
                this._clickGesture = {set_enabled(value) {gestureEnabled = value;}};
        }
        add_child(child) {this.child = child;}
        destroy() {this._onDestroy();}
        _onDestroy() {this.destroyed = true;}
    };
    let preferencesOpened = 0;
    let layoutOpened = 0;
    const panelManager = {removed: [], removeMenu(menu) {this.removed.push(menu);}};
    const Main = {
        sessionMode: {allowSettings: true},
        panel: {menuManager: panelManager, statusArea: {keyboard: {_showLayout() {layoutOpened++;}}},
            addToStatusArea(uuid, actor) {this.statusArea[uuid] = actor;}},
    };
    const PopupMenu = {
        PopupMenuItem: Item, PopupSeparatorMenuItem: class {}, Ornament: {NONE: 0, CHECK: 1},
        PopupMenuManager: class {
            menus = [];
            addMenu(menu) {this.menus.push(menu);}
            removeMenu(menu) {this.menus = this.menus.filter(item => item !== menu);}
        },
    };
    const Clutter = {ActorAlign: {CENTER: 0}, EVENT_STOP: true, EVENT_PROPAGATE: false,
        EventType: {BUTTON_PRESS: 1, TOUCH_BEGIN: 2, KEY_PRESS: 3}, ModifierType: {SHIFT_MASK: 1},
        KEY_Menu: 10, KEY_F10: 11, KEY_space: 12, KEY_Return: 13, KEY_KP_Enter: 14, KEY_Down: 15};
    const code = fs.readFileSync(new URL('../indicator.js', import.meta.url), 'utf8')
        .replace(/^import .*;\n/gm, '').replace('export const LayoutIndicator', 'const LayoutIndicator');
    const Class = vm.runInNewContext(`${code}\nLayoutIndicator;`, {
        GObject: {registerClass: (...args) => args.at(-1)}, PanelMenu: {Button}, PopupMenu, Clutter,
        St: {Label: class {constructor(props) {Object.assign(this, props);}}}, Main, ...common,
    });
    const ru = {type: 'xkb', id: 'ru', index: 1, displayName: 'Russian', activate(flag) {this.activated = flag;}};
    const us = {type: 'xkb', id: 'us', index: 0, displayName: 'English (US)', activate(flag) {this.activated = flag;}};
    const manager = {inputSources: {1: ru, 0: us}, currentSource: ru};
    const values = {'layout-profiles': '{}', 'fallback-colors': ['#57E389']};
    const settings = {get_string: key => values[key], get_strv: key => values[key]};
    const indicator = new Class(manager, settings, () => preferencesOpened++);
    indicator.attach('test');
    const event = (type, button = 1, key = 0, state = 0) => ({type: () => type,
        get_button: () => button, get_key_symbol: () => key, get_state: () => state});
    return {indicator, manager, ru, us, values, Main, panelManager, Clutter, event,
        gestureEnabled: () => gestureEnabled, preferencesOpened: () => preferencesOpened,
        layoutOpened: () => layoutOpened};
}

for (const gestures of [true, false]) {
    test(`left/right menus work with ${gestures ? 'GNOME 50 gestures' : 'GNOME 46 events'}`, () => {
        const env = create(gestures);
        const {indicator, event, manager, us, values, panelManager} = env;
        assert.equal(indicator.alignment, 0.5);
        assert.equal(panelManager.removed[0], indicator.menu);
        assert.deepEqual(indicator._menuManager.menus, [indicator.menu]);
        if (gestures) assert.equal(env.gestureEnabled(), false);
        assert.equal(indicator.vfunc_event(event(1)), true);
        assert.equal(indicator.menu.isOpen, true);
        assert.deepEqual(indicator.menu.items.map(item => item.label.text), ['🇺🇸  English (US)', '🇷🇺  Russian']);
        assert.equal(indicator.menu.items[1].ornament, 1);
        indicator.menu.items[0].action();
        assert.equal(us.activated, true);
        manager.currentSource = us;
        const item = indicator.menu.items[0];
        values['layout-profiles'] = '{"xkb:us":{"symbol":"🦊"}}';
        indicator.refresh();
        assert.equal(indicator.menu.items[0], item); // Refresh must not recreate an open menu.
        assert.equal(item.label.text, '🦊  English (US)');
        assert.equal(item.ornament, 1);
        indicator.vfunc_event(event(1, 3));
        assert.equal(indicator.menu.isOpen, true);
        assert.equal(indicator.menu.items[0].label.text, 'Layout Stripe Settings');
        indicator.menu.items[0].action();
        assert.equal(env.preferencesOpened(), 1);
        indicator.menu.items[2].action();
        assert.equal(env.layoutOpened(), 1);
        assert.equal(indicator.menu.items[3].action(), 'gnome-keyboard-panel.desktop');
        indicator.vfunc_event(event(1, 3));
        assert.equal(indicator.menu.isOpen, false);
        indicator.vfunc_event(event(1, 2));
        assert.equal(indicator.menu.isOpen, false);
        indicator.vfunc_event(event(2));
        assert.equal(indicator.menu.isOpen, true);
        const ownManager = indicator._menuManager;
        indicator.destroy();
        assert.equal(indicator.menu.isOpen, false);
        assert.equal(ownManager.menus.length, 0);
        assert.equal(indicator._settings, null);
    });
}

test('menu tracks source list changes, keyboard opening and unavailable system layout viewer', () => {
    const {indicator, event, manager, Main, Clutter} = create();
    indicator.vfunc_event(event(3, 0, Clutter.KEY_Return));
    manager.inputSources = {};
    indicator.refresh(true);
    assert.equal(indicator.menu.items[0].reactive, false);
    indicator.menu.close();
    delete Main.panel.statusArea.keyboard;
    indicator.vfunc_event(event(3, 0, Clutter.KEY_Menu));
    assert.equal(indicator.menu.items[2].sensitive, false);
    indicator.destroy();
});
