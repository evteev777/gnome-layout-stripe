import test from 'node:test';
import assert from 'node:assert/strict';
import {modifierSelection, withModifierShortcut, shortcutConflict} from '../shortcut-options.js';

test('modifier shortcuts preserve unrelated XKB options and recognize custom configurations', () => {
    const original = ['compose:ralt', 'caps:escape', 'grp:alt_shift_toggle', 'grp_led:scroll'];
    assert.equal(modifierSelection(original), 1);
    assert.deepEqual(withModifierShortcut(original, 2),
        ['compose:ralt', 'caps:escape', 'grp_led:scroll', 'grp:ctrl_shift_toggle']);
    assert.deepEqual(withModifierShortcut(original, 0), ['compose:ralt', 'caps:escape', 'grp_led:scroll']);
    assert.equal(modifierSelection(['grp:win_space_toggle']), 4);
    assert.equal(modifierSelection(['grp:alt_shift_toggle', 'grp:caps_toggle']), 4);
    assert.deepEqual(withModifierShortcut(original, 4), original);
    assert.equal(modifierSelection(['compose:ralt']), 0);
    assert.deepEqual(original, ['compose:ralt', 'caps:escape', 'grp:alt_shift_toggle', 'grp_led:scroll']);
});

test('shortcut conflicts exclude the edited action but include the opposite direction and aliases', () => {
    const bindings = {next: ['Ctrl+Space'], previous: ['Super+Shift+Space'], other: ['Alt+F4']};
    const normalize = value => value.replace('Control', 'Ctrl');
    assert.equal(shortcutConflict(bindings, 'next', 'Control+Space', normalize), null);
    assert.equal(shortcutConflict(bindings, 'previous', 'Control+Space', normalize), 'next');
    assert.equal(shortcutConflict(bindings, 'next', 'Alt+F4', normalize), 'other');
    assert.equal(shortcutConflict(bindings, 'next', '', normalize), null);
});
