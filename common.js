// SPDX-License-Identifier: GPL-3.0-or-later

export const DEFAULT_GREEN = '#57E389';
export const MAX_OUTLINE_THICKNESS = 20;
// Editable color cues, not complete flag artwork.
export const PRESETS = [
    {id: 'us', name: 'English (US)', colors: [DEFAULT_GREEN], hidden: true, symbol: '🇺🇸',
        outlineColors: ['#000000']},
    {id: 'gb', name: 'English (GB)', colors: [DEFAULT_GREEN], hidden: true, symbol: '🇬🇧',
        outlineColors: ['#000000']},
    {id: 'de', name: 'German', symbol: '🇩🇪', colors: ['#000000', '#DD0000', '#FFCE00'],
        outlineColors: ['#FFFFFF', '#FFFFFF', '#000000']},
    {id: 'fr', name: 'French', symbol: '🇫🇷', colors: ['#0055A4', '#FFFFFF', '#EF4135'],
        outlineColors: ['#FFFFFF', '#000000', '#000000']},
    {id: 'it', name: 'Italian', symbol: '🇮🇹', colors: ['#009246', '#FFFFFF', '#CE2B37'],
        outlineColors: ['#000000', '#000000', '#FFFFFF']},
    {id: 'es', name: 'Spanish', symbol: '🇪🇸', colors: ['#AA151B', '#F1BF00', '#AA151B'],
        outlineColors: ['#FFFFFF', '#000000', '#FFFFFF']},
    {id: 'ru', name: 'Russian', symbol: '🇷🇺', colors: ['#FFFFFF', '#0039A6', '#D52B1E'],
        outlineColors: ['#000000', '#FFFFFF', '#FFFFFF']},
    {id: 'by', name: 'Belarusian', symbol: '🇧🇾', colors: ['#D22730', '#009739'],
        outlineColors: ['#FFFFFF', '#000000']},
    {id: 'ua', name: 'Ukrainian', symbol: '🇺🇦', colors: ['#0057B7', '#FFD700'],
        outlineColors: ['#FFFFFF', '#000000']},
    {id: 'pl', name: 'Polish', symbol: '🇵🇱', colors: ['#FFFFFF', '#DC143C'],
        outlineColors: ['#000000', '#FFFFFF']},
].map(p => ({outlineThickness: 1, opacity: p.hidden ? 0 : 100, restoreOpacity: 100, reverse: false,
    hidden: false, ...p}));

export function validColors(value) {
    return Array.isArray(value) && value.length >= 1 && value.length <= 3 &&
        value.every(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c));
}

export function parseObject(text) {
    try {
        const value = JSON.parse(text);
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
        return {};
    }
}

function percent(value, fallback) {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback;
}

export function normalizeSymbol(value) {
    return [...value.replace(/\p{Cc}/gu, '')].slice(0, 32).join('');
}

export function normalizeProfile(value, fallback = {}) {
    const hidden = typeof value?.hidden === 'boolean' ? value.hidden : Boolean(fallback.hidden);
    const opacity = percent(value?.opacity, percent(fallback.opacity, 100));
    const colors = [...(validColors(value?.colors) ? value.colors :
        validColors(fallback.colors) ? fallback.colors : [DEFAULT_GREEN])];
    const samePalette = validColors(fallback.colors) && colors.length === fallback.colors.length &&
        colors.every((color, i) => color.toLowerCase() === fallback.colors[i].toLowerCase());
    const outlineColors = Array.isArray(value?.outlineColors) ? value.outlineColors :
        samePalette && Array.isArray(fallback.outlineColors) ? fallback.outlineColors : [];
    const width = Number.isFinite(value?.outlineThickness) ? value.outlineThickness :
        Number.isFinite(fallback.outlineThickness) ? fallback.outlineThickness : 1;
    return {
        colors,
        outlineThickness: Math.max(0, Math.min(MAX_OUTLINE_THICKNESS, Math.round(width))),
        // A null entry follows the segment color; a hex entry is a manual override.
        outlineColors: colors.map((_color, i) =>
            typeof outlineColors[i] === 'string' && /^#[0-9a-f]{6}$/i.test(outlineColors[i]) ? outlineColors[i] : null),
        symbol: normalizeSymbol(typeof value?.symbol === 'string' ? value.symbol : fallback.symbol ?? '🌐'),
        opacity: hidden ? 0 : opacity,
        restoreOpacity: percent(value?.restoreOpacity,
            hidden && opacity > 0 ? opacity : percent(fallback.restoreOpacity, 100)),
        hidden,
        reverse: typeof value?.reverse === 'boolean' ? value.reverse : Boolean(fallback.reverse),
        presetId: value?.presetId === null ? null :
            typeof value?.presetId === 'string' ? value.presetId : fallback.presetId ?? null,
    };
}

export function contrastColor(hex) {
    const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    // Black and white have equal contrast near this relative luminance.
    return luminance > 0.179 ? '#000000' : '#FFFFFF';
}

export function outlineColor(profile, index) {
    return profile.outlineColors[index] ?? contrastColor(profile.colors[index] ?? DEFAULT_GREEN);
}

export function stripeSegments(profile) {
    const segments = profile.colors.map((color, i) => ({color, outline: outlineColor(profile, i)}));
    return profile.reverse ? segments.reverse() : segments;
}

export function segmentStyle(segment, edge, outlineThickness, crossSize) {
    // Draw toward the window content, within the existing stripe footprint.
    const side = {bottom: 'top', top: 'bottom', left: 'right', right: 'left'}[edge];
    const width = Math.min(outlineThickness, Math.max(0, crossSize - 1));
    return `background-color: ${segment.color};` +
        (width > 0 ? ` border-${side}: ${width}px solid ${segment.outline};` : '');
}

export function userPresets(text) {
    try {
        const value = JSON.parse(text);
        return Array.isArray(value) ? value.filter(p => p && typeof p.name === 'string' &&
            p.name.trim() && validColors(p.colors)).map(p => ({name: p.name,
                ...normalizeProfile(p), id: `user:${p.name}`})) : [];
    } catch {
        return [];
    }
}

export function sourceKey(source) {
    return `${source.type}:${source.id}`;
}

export function presetFor(source) {
    if (source?.type !== 'xkb' || typeof source.id !== 'string')
        return null;
    const base = source.id.split('+')[0];
    return PRESETS.find(p => p.id === base) ?? null;
}

export function profileFor(source, assignments, fallback) {
    const preset = presetFor(source);
    const defaults = preset ? {...preset, presetId: preset.id} : {colors: fallback};
    const value = source ? assignments[sourceKey(source)] : null;
    return normalizeProfile(value, defaults);
}

export function toggleHidden(profile, hidden) {
    const result = normalizeProfile(profile);
    if (hidden === result.hidden)
        return result;
    if (hidden) {
        result.restoreOpacity = result.opacity;
        result.opacity = 0;
    } else {
        result.opacity = result.restoreOpacity;
    }
    result.hidden = hidden;
    return result;
}

export function matchingPreset(profile, choices) {
    // Keep the selected name when customized; missing or deleted presets are Custom.
    return choices.findIndex(p => p.id === profile.presetId);
}

export function migrateSettings(settings, sources) {
    const version = settings.get_int('profile-format-version');
    if (version >= 2)
        return;
    const profiles = parseObject(settings.get_string('layout-profiles'));
    const legacy = parseObject(settings.get_string('layout-colors'));
    const oldOpacity = settings.get_user_value('opacity') !== null;
    const oldReverse = settings.get_user_value('reverse') !== null;
    const known = new Map(sources.map(([type, id]) => [sourceKey({type, id}), {type, id}]));
    for (const key of new Set([...Object.keys(legacy), ...Object.keys(profiles)])) {
        const separator = key.indexOf(':');
        if (separator > 0)
            known.set(key, {type: key.slice(0, separator), id: key.slice(separator + 1)});
    }
    for (const [key, source] of known) {
        if (version >= 1 || Object.hasOwn(profiles, key))
            continue;
        if (!validColors(legacy[key]) && !oldOpacity && !oldReverse)
            continue;
        const profile = profileFor(source, {}, settings.get_strv('fallback-colors'));
        if (validColors(legacy[key])) {
            profile.colors = [...legacy[key]];
            profile.outlineColors = profile.colors.map(() => null);
            const preset = presetFor(source);
            if (['us', 'gb'].includes(preset?.id) && profile.colors.length === 1 &&
                [DEFAULT_GREEN.toLowerCase(), '#36b86a'].includes(profile.colors[0].toLowerCase()))
                profile.colors = [...preset.colors];
            if (JSON.stringify(profile.colors.map(c => c.toLowerCase())) !==
                JSON.stringify(preset?.colors.map(c => c.toLowerCase())))
                profile.presetId = null;
        }
        if (oldOpacity) {
            profile.restoreOpacity = settings.get_int('opacity');
            profile.opacity = profile.hidden ? 0 : profile.restoreOpacity;
        }
        if (oldReverse)
            profile.reverse = settings.get_boolean('reverse');
        profiles[key] = profile;
    }
    // Version 1 used a shared English preset and a British flag for US layouts.
    for (const [key, source] of known) {
        const preset = presetFor(source);
        const profile = profiles[key];
        if (!['us', 'gb'].includes(preset?.id) || !profile)
            continue;
        const defaultColors = validColors(profile.colors) && profile.colors.length === 1 &&
            [DEFAULT_GREEN.toLowerCase(), '#36b86a'].includes(profile.colors[0]?.toLowerCase());
        if (profile.presetId === 'us' && profile.symbol === '🇬🇧' && defaultColors) {
            profile.presetId = preset.id;
            profile.symbol = preset.symbol;
        } else if (profile.presetId === null && defaultColors && typeof profile.symbol !== 'string') {
            profile.presetId = preset.id;
            profile.colors = [...preset.colors];
        }
    }
    settings.set_string('layout-profiles', JSON.stringify(profiles));
    settings.set_int('profile-format-version', 2);
}

export function segmentRects(monitor, edge, thickness, count) {
    const vertical = edge === 'left' || edge === 'right';
    const t = Math.min(thickness, vertical ? monitor.width : monitor.height);
    const length = vertical ? monitor.height : monitor.width;
    const x = monitor.x + (edge === 'right' ? monitor.width - t : 0);
    const y = monitor.y + (edge === 'bottom' ? monitor.height - t : 0);
    return Array.from({length: count}, (_, i) => {
        const start = Math.round(length * i / count);
        const end = Math.round(length * (i + 1) / count);
        return {x: x + (vertical ? 0 : start), y: y + (vertical ? start : 0),
            width: vertical ? t : end - start, height: vertical ? end - start : t};
    });
}

// Keep user-presets and migration state; clear old overrides so defaults stay restored.
export function resetSettings(settings) {
    for (const key of ['edge', 'thickness', 'all-monitors', 'show-fullscreen', 'fallback-colors',
        'show-panel-symbol', 'show-system-label', 'layout-profiles', 'layout-colors', 'opacity', 'reverse'])
        settings.reset(key);
    settings.set_int('profile-format-version', 2);
}
