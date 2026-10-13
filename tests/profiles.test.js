import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS, profileFor, toggleHidden, normalizeProfile, userPresets,
    matchingPreset, migrateSettings, normalizeSymbol} from '../common.js';

test('requested preset order, separate English presets, automatic variants and English Hide', () => {
    assert.deepEqual(PRESETS.map(p => p.name), ['English (US)', 'English (GB)', 'German', 'French', 'Italian', 'Spanish',
        'Russian', 'Belarusian', 'Ukrainian', 'Polish']);
    for (const id of ['us', 'gb', 'us+intl']) {
        const profile = profileFor({type: 'xkb', id}, {}, []);
        assert.equal(profile.presetId, id.split('+')[0]);
        assert.equal(profile.hidden, true);
        assert.equal(profile.opacity, 0);
        assert.equal(toggleHidden(profile, false).opacity, 100);
        assert.equal(matchingPreset(profile, PRESETS), id === 'gb' ? 1 : 0);
    }
    for (const preset of PRESETS.slice(2)) {
        const profile = profileFor({type: 'xkb', id: preset.id}, {}, []);
        assert.equal(profile.hidden, false);
        assert.equal(profile.opacity, 100);
        assert.equal(PRESETS[matchingPreset(profile, PRESETS)].name, preset.name);
    }
});

test('Hide restores previous opacity through serialization, including manually entered zero', () => {
    for (const opacity of [0, 1, 37, 100]) {
        const original = normalizeProfile({colors: ['#123456'], opacity, reverse: true});
        const hidden = toggleHidden(original, true);
        assert.equal(hidden.opacity, 0);
        assert.equal(hidden.restoreOpacity, opacity);
        const reloaded = normalizeProfile(JSON.parse(JSON.stringify(hidden)));
        assert.equal(toggleHidden(reloaded, false).opacity, opacity);
        assert.equal(toggleHidden(reloaded, false).reverse, true);
        assert.equal(original.opacity, opacity);
    }
});

test('per-layout opacity and reverse do not affect another layout; saved presets carry all options', () => {
    const sources = {'xkb:ru': {colors: ['#123456'], opacity: 37, reverse: true, presetId: 'ru'}};
    const russian = profileFor({type: 'xkb', id: 'ru'}, sources, []);
    const german = profileFor({type: 'xkb', id: 'de'}, sources, []);
    assert.equal(russian.opacity, 37);
    assert.equal(german.opacity, 100);
    assert.equal(german.reverse, false);
    assert.equal(matchingPreset(russian, PRESETS), 6);
    const saved = userPresets(JSON.stringify([{name: 'Mine', ...toggleHidden(russian, true)}]))[0];
    assert.equal(saved.hidden, true);
    assert.equal(saved.opacity, 0);
    assert.equal(saved.restoreOpacity, 37);
    assert.equal(saved.reverse, true);
    assert.equal(toggleHidden(saved, false).opacity, 37);
    const old = userPresets('[{"name":"Legacy","colors":["#ABCDEF"]}]')[0];
    assert.equal(old.opacity, 100);
    assert.equal(old.hidden, false);
});

test('migration preserves old overrides and globals once, without overwriting new profiles', () => {
    const values = {'profile-format-version': 0, 'layout-profiles': JSON.stringify({'xkb:de': {opacity: 22}}),
        'layout-colors': JSON.stringify({'xkb:ru': ['#123456']}), opacity: 65, reverse: true,
        'fallback-colors': ['#808080']};
    const settings = {get_int: k => values[k], get_string: k => values[k], get_boolean: k => values[k],
        get_strv: k => values[k], get_user_value: k => ['opacity', 'reverse'].includes(k) ? {} : null,
        set_string: (k, v) => {values[k] = v;}, set_int: (k, v) => {values[k] = v;}};
    migrateSettings(settings, [['xkb', 'ru'], ['xkb', 'us'], ['xkb', 'de']]);
    const profiles = JSON.parse(values['layout-profiles']);
    assert.deepEqual(profiles['xkb:ru'].colors, ['#123456']);
    assert.equal(profiles['xkb:ru'].opacity, 65);
    assert.equal(profiles['xkb:ru'].reverse, true);
    assert.equal(profiles['xkb:ru'].presetId, null);
    assert.equal(profiles['xkb:us'].opacity, 0);
    assert.equal(profiles['xkb:us'].restoreOpacity, 65);
    assert.equal(profiles['xkb:de'].opacity, 22);
    const snapshot = values['layout-profiles'];
    values.opacity = 10;
    migrateSettings(settings, [['xkb', 'ru']]);
    assert.equal(values['layout-profiles'], snapshot);
    assert.equal(values['profile-format-version'], 2);
});


test('shared English profiles migrate once while customized symbols and presets survive', () => {
    const values = {
        'profile-format-version': 1,
        'layout-profiles': JSON.stringify({
            'xkb:us': {presetId: 'us', colors: ['#57E389'], symbol: '🇬🇧', hidden: true},
            'xkb:gb': {presetId: 'us', colors: ['#57E389'], symbol: '🇬🇧', hidden: true},
            'xkb:us+intl': {presetId: 'us', colors: ['#57E389'], symbol: '🦊'},
            'xkb:us+altgr-intl': {presetId: null, colors: ['#57E389'], symbol: ''},
        }),
        'layout-colors': '{}',
        'user-presets': '[{"name":"British","colors":["#57E389"],"symbol":"🇬🇧"}]',
    };
    const saved = values['user-presets'];
    const settings = {
        get_int: key => values[key],
        get_string: key => values[key],
        get_user_value: () => null,
        set_string: (key, value) => { values[key] = value; },
        set_int: (key, value) => { values[key] = value; },
    };
    const sources = ['us', 'gb', 'us+intl', 'us+altgr-intl'].map(id => ['xkb', id]);
    migrateSettings(settings, sources);
    const profiles = JSON.parse(values['layout-profiles']);
    assert.equal(profiles['xkb:us'].symbol, '🇺🇸');
    assert.equal(profiles['xkb:gb'].presetId, 'gb');
    assert.equal(profiles['xkb:gb'].symbol, '🇬🇧');
    assert.equal(profiles['xkb:us+intl'].symbol, '🦊');
    assert.equal(profiles['xkb:us+altgr-intl'].symbol, '');
    assert.equal(profiles['xkb:us+altgr-intl'].presetId, null);
    assert.equal(values['user-presets'], saved);
    assert.equal(values['profile-format-version'], 2);
    const snapshot = values['layout-profiles'];
    migrateSettings(settings, sources);
    assert.equal(values['layout-profiles'], snapshot);
});

test('symbol validation removes control characters and limits Unicode code points', () => {
    assert.equal(normalizeSymbol('A\n\tB'), 'AB');
    assert.equal(normalizeSymbol('🦊'.repeat(40)), '🦊'.repeat(32));
    assert.equal(normalizeSymbol('My flag '), 'My flag ');
    assert.equal(normalizeSymbol('🇺🇸'), '🇺🇸');
});


test('migration tolerates malformed profiles and fixes inactive saved input sources', () => {
    const values = {
        'profile-format-version': 1,
        'layout-profiles': JSON.stringify({
            'xkb:us': {presetId: 'us', colors: [42], symbol: '🇬🇧'},
            'xkb:gb': {presetId: 'us', colors: ['#57E389'], symbol: '🇬🇧'},
        }),
        'layout-colors': '{}',
    };
    const settings = {
        get_int: key => values[key], get_string: key => values[key], get_user_value: () => null,
        set_string: (key, value) => { values[key] = value; },
        set_int: (key, value) => { values[key] = value; },
    };
    migrateSettings(settings, [['xkb', 'us']]);
    const profiles = JSON.parse(values['layout-profiles']);
    assert.equal(profiles['xkb:gb'].presetId, 'gb');
    assert.equal(profileFor({type: 'xkb', id: 'us'}, profiles, []).colors[0], '#57E389');
});
