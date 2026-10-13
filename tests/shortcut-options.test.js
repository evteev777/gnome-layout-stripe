import test from 'node:test';
import assert from 'node:assert/strict';
import {modifierSelection, withModifierShortcut, shortcutConflict, MODIFIER_SHORTCUTS, primaryAccelerators, withPrimaryShortcut} from '../shortcut-options.js';

test('native modifier presets recognize manual settings and preserve unrelated shortcuts and XKB options', () => {
    const original = ['compose:ralt', 'caps:escape', 'grp:alt_shift_toggle', 'grp_led:scroll'];
    const primary = ['<Super>space', 'XF86Keyboard', '<Control>space'];
    assert.equal(modifierSelection(original, primary), 4);
    const alt = withModifierShortcut(original, primary, 1);
    assert.deepEqual(alt.options, ['compose:ralt', 'caps:escape', 'grp_led:scroll']);
    assert.deepEqual(alt.accelerators, [...primary, ...MODIFIER_SHORTCUTS[1].accelerators]);
    assert.equal(modifierSelection(alt.options, alt.accelerators), 1);
    const ctrl = withModifierShortcut(alt.options, alt.accelerators, 2);
    assert.deepEqual(ctrl.accelerators, [...primary, ...MODIFIER_SHORTCUTS[2].accelerators]);
    assert.equal(modifierSelection(ctrl.options, ctrl.accelerators), 2);
    const caps = withModifierShortcut(ctrl.options, ctrl.accelerators, 3);
    assert.deepEqual(caps.accelerators, primary);
    assert.equal(modifierSelection(caps.options, caps.accelerators), 3);
    const none = withModifierShortcut(caps.options, caps.accelerators, 0);
    assert.deepEqual(none.options, ['compose:ralt', 'caps:escape', 'grp_led:scroll']);
    assert.deepEqual(none.accelerators, primary);
    assert.equal(modifierSelection(none.options, none.accelerators), 0);
    assert.deepEqual(withModifierShortcut(original, primary, 4), {options: original, accelerators: primary});
});

test('mixed configurations stay Custom; editing a main shortcut retains the additional modifier switch', () => {
    const alt = MODIFIER_SHORTCUTS[1].accelerators;
    assert.equal(modifierSelection([], ['<Super>space', ...alt]), 1);
    assert.equal(modifierSelection([], ['<Ctrl>Shift_L']), 2);
    assert.equal(modifierSelection(['grp:caps_toggle'], alt), 4);
    assert.equal(modifierSelection([], [...alt, ...MODIFIER_SHORTCUTS[2].accelerators]), 4);
    assert.deepEqual(primaryAccelerators(['<Super>space', ...alt]), ['<Super>space']);
    assert.deepEqual(withPrimaryShortcut(['<Super>space', ...alt], ['<Control>space']), ['<Control>space', ...alt]);
    assert.deepEqual(withPrimaryShortcut(['<Super>space', ...alt], []), alt);
});

test('shortcut conflicts exclude the edited action but include the opposite direction and aliases', () => {
    const bindings = {next: ['Ctrl+Space'], previous: ['Super+Shift+Space'], other: ['Alt+F4']};
    const normalize = value => value.replace('Control', 'Ctrl');
    assert.equal(shortcutConflict(bindings, 'next', 'Control+Space', normalize), null);
    assert.equal(shortcutConflict(bindings, 'previous', 'Control+Space', normalize), 'next');
    assert.equal(shortcutConflict(bindings, 'next', 'Alt+F4', normalize), 'other');
    assert.equal(shortcutConflict(bindings, 'next', '', normalize), null);
});
