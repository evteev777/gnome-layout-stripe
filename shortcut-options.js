// SPDX-License-Identifier: GPL-3.0-or-later

export const MODIFIER_SHORTCUTS = [
    {label: 'None', option: null},
    {label: 'Alt+Shift', option: 'grp:alt_shift_toggle'},
    {label: 'Ctrl+Shift', option: 'grp:ctrl_shift_toggle'},
    {label: 'Caps Lock', option: 'grp:caps_toggle'},
];

export function modifierSelection(options) {
    const groups = options.filter(option => option.startsWith('grp:'));
    if (!groups.length)
        return 0;
    if (groups.length === 1) {
        const index = MODIFIER_SHORTCUTS.findIndex(shortcut => shortcut.option === groups[0]);
        if (index >= 0)
            return index;
    }
    return MODIFIER_SHORTCUTS.length;
}

export function withModifierShortcut(options, index) {
    const shortcut = MODIFIER_SHORTCUTS[index];
    if (!shortcut)
        return [...options];
    const result = options.filter(option => !option.startsWith('grp:'));
    if (shortcut.option)
        result.push(shortcut.option);
    return result;
}

export function shortcutConflict(bindings, key, accelerator, normalize) {
    if (!accelerator)
        return null;
    const candidate = normalize(accelerator);
    return Object.keys(bindings).find(name => name !== key &&
        bindings[name].some(value => normalize(value) === candidate)) ?? null;
}
