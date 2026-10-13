// SPDX-License-Identifier: GPL-3.0-or-later

export const MODIFIER_SHORTCUTS = [
    {label: 'None', option: null, accelerators: []},
    {label: 'Alt+Shift', option: null,
        accelerators: ['<Alt>Shift_L', '<Alt>Shift_R', '<Shift>Alt_L', '<Shift>Alt_R']},
    {label: 'Ctrl+Shift', option: null,
        accelerators: ['<Control>Shift_L', '<Control>Shift_R', '<Shift>Control_L', '<Shift>Control_R']},
    {label: 'Caps Lock', option: 'grp:caps_toggle', accelerators: []},
];

function canonical(value) {
    return value.replaceAll('<Ctrl>', '<Control>').replaceAll('<Primary>', '<Control>');
}

export function modifierAccelerators(accelerators) {
    const managed = new Set(MODIFIER_SHORTCUTS.flatMap(shortcut => shortcut.accelerators));
    return accelerators.filter(value => managed.has(canonical(value)));
}

export function primaryAccelerators(accelerators) {
    const modifiers = new Set(modifierAccelerators(accelerators));
    return accelerators.filter(value => !modifiers.has(value));
}

export function withPrimaryShortcut(accelerators, primary) {
    return [...new Set([...primary, ...modifierAccelerators(accelerators)])];
}

export function modifierSelection(options, accelerators = []) {
    const groups = options.filter(option => option.startsWith('grp:'));
    const native = new Set(accelerators.map(canonical));
    const active = [1, 2].filter(index => MODIFIER_SHORTCUTS[index].accelerators.some(value => native.has(value)));
    if (!groups.length)
        return active.length === 0 ? 0 : active.length === 1 ? active[0] : MODIFIER_SHORTCUTS.length;
    if (groups.length === 1 && groups[0] === 'grp:caps_toggle' && !active.length)
        return 3;
    // Legacy XKB Alt/Ctrl switches are Custom until the user chooses the native preset.
    return MODIFIER_SHORTCUTS.length;
}

export function withModifierShortcut(options, accelerators, index) {
    const shortcut = MODIFIER_SHORTCUTS[index];
    if (!shortcut)
        return {options: [...options], accelerators: [...accelerators]};
    const groups = options.filter(option => !option.startsWith('grp:'));
    if (shortcut.option)
        groups.push(shortcut.option);
    return {options: groups, accelerators: [...primaryAccelerators(accelerators), ...shortcut.accelerators]};
}

export function shortcutConflict(bindings, key, accelerator, normalize) {
    if (!accelerator)
        return null;
    const candidate = normalize(accelerator);
    return Object.keys(bindings).find(name => name !== key &&
        bindings[name].some(value => normalize(value) === candidate)) ?? null;
}
