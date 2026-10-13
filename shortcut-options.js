// SPDX-License-Identifier: GPL-3.0-or-later

export const DIRECT_SHORTCUT_KEY = 'layout-stripe-modifier-shortcut';

export const MODIFIER_SHORTCUTS = [
    {label: 'None', option: null, accelerators: []},
    {label: 'Alt+Shift', option: null,
        accelerators: ['<Alt>Shift_L', '<Alt>Shift_R', '<Shift>Alt_L', '<Shift>Alt_R']},
    {label: 'Ctrl+Shift', option: null,
        accelerators: ['<Control>Shift_L', '<Control>Shift_R', '<Shift>Control_L', '<Shift>Control_R']},
    {label: 'Caps Lock', option: 'grp:caps_toggle', accelerators: []},
    {label: 'Left + right Ctrl', option: null, direct: true, accelerators: ['<Control>Control_L', '<Control>Control_R']},
    {label: 'Left + right Shift', option: null, direct: true, accelerators: ['<Shift>Shift_L', '<Shift>Shift_R']},
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

export function modifierSelection(options, accelerators = [], direct = []) {
    if (direct.length) {
        const index = MODIFIER_SHORTCUTS.findIndex(shortcut => shortcut.direct &&
            shortcut.accelerators.length === direct.length &&
            shortcut.accelerators.every(value => direct.map(canonical).includes(value)));
        return index >= 0 && modifierSelection(options, accelerators) === 0 ? index : -1;
    }
    const groups = options.filter(option => option.startsWith('grp:'));
    const native = new Set(accelerators.map(canonical));
    const active = MODIFIER_SHORTCUTS.map((shortcut, index) =>
        shortcut.accelerators.some(value => native.has(value)) ? index : -1).filter(index => index >= 0);
    if (!groups.length)
        return active.length === 0 ? 0 : active.length === 1 ? active[0] : -1;
    if (groups.length === 1 && groups[0] === 'grp:caps_toggle' && !active.length)
        return 3;
    // Unrecognized system configurations are not represented as a selectable preset.
    return -1;
}

export function withModifierShortcut(options, accelerators, index) {
    const shortcut = MODIFIER_SHORTCUTS[index];
    if (!shortcut)
        return {options: [...options], accelerators: [...accelerators], direct: []};
    const groups = options.filter(option => !option.startsWith('grp:'));
    if (shortcut.option)
        groups.push(shortcut.option);
    return {options: groups,
        accelerators: [...primaryAccelerators(accelerators), ...(shortcut.direct ? [] : shortcut.accelerators)],
        direct: shortcut.direct ? [...shortcut.accelerators] : []};
}

export function shortcutConflict(bindings, key, accelerator, normalize) {
    if (!accelerator)
        return null;
    const candidate = normalize(accelerator);
    return Object.keys(bindings).find(name => name !== key &&
        bindings[name].some(value => normalize(value) === candidate)) ?? null;
}
