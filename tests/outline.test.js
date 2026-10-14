import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS, contrastColor, normalizeProfile, outlineColor, profileFor, stripeSegments,
    segmentStyle, userPresets, toggleHidden} from '../common.js';

test('built-in outlines are fixed, valid and contrast with every segment', () => {
    for (const preset of PRESETS) {
        assert.equal(preset.outlineThickness, 1);
        assert.equal(preset.outlineColors.length, preset.colors.length);
        preset.colors.forEach((color, i) => assert.equal(preset.outlineColors[i], contrastColor(color)));
    }
    assert.equal(contrastColor('#FFFFFF'), '#000000');
    assert.equal(contrastColor('#000000'), '#FFFFFF');
    assert.equal(contrastColor('#0039A6'), '#FFFFFF');
    assert.equal(contrastColor('#FFD700'), '#000000');
});

test('old custom profiles gain automatic outlines; manual settings survive saving and Hide', () => {
    const old = userPresets('[{"name":"Old","colors":["#FFFFFF","#000000"]}]')[0];
    assert.equal(old.outlineThickness, 1);
    assert.deepEqual(old.outlineColors, [null, null]);
    assert.deepEqual(stripeSegments(old), [{color: '#FFFFFF', outline: '#000000'}, {color: '#000000', outline: '#FFFFFF'}]);
    const manual = normalizeProfile({...old, outlineColors: ['#123456', null], outlineThickness: 3});
    const stored = userPresets(JSON.stringify([{name: 'Saved', ...toggleHidden(manual, true)}]))[0];
    assert.equal(stored.outlineThickness, 3);
    assert.deepEqual(stored.outlineColors, ['#123456', null]);
    assert.equal(toggleHidden(stored, false).outlineThickness, 3);
    const customSource = profileFor({type: 'xkb', id: 'ru'}, {'xkb:ru': {colors: ['#000000']}}, []);
    assert.equal(outlineColor(customSource, 0), '#FFFFFF');
    assert.deepEqual(customSource.outlineColors, [null]);
});

test('outline validation rejects CSS injection and clamps malformed widths', () => {
    const profile = normalizeProfile({colors: ['#000000', '#FFFFFF', '#888888'], outlineThickness: 999,
        outlineColors: ['#ABCDEF', 'red; border-width: 50px', 42]});
    assert.equal(profile.outlineThickness, 20);
    assert.deepEqual(profile.outlineColors, ['#ABCDEF', null, null]);
    assert.equal(normalizeProfile({outlineThickness: -2}).outlineThickness, 0);
    assert.equal(normalizeProfile({outlineThickness: NaN}).outlineThickness, 1);
    assert.equal(normalizeProfile({outlineThickness: 0}).outlineThickness, 0);
    assert.doesNotThrow(() => normalizeProfile({}, {colors: [null], outlineColors: ['#FFFFFF']}));
});

test('outlines face the window on every edge and reverse together with their main colors', () => {
    const profile = normalizeProfile({colors: ['#FFFFFF', '#000000'], outlineColors: ['#123456', null], reverse: true});
    const segments = stripeSegments(profile);
    assert.deepEqual(segments, [{color: '#000000', outline: '#FFFFFF'}, {color: '#FFFFFF', outline: '#123456'}]);
    for (const [edge, side] of Object.entries({bottom: 'top', top: 'bottom', left: 'right', right: 'left'})) {
        const style = segmentStyle(segments[0], edge, 2, 6);
        assert.ok(style.includes(`border-${side}: 2px solid #FFFFFF`));
        assert.ok(style.includes('background-color: #000000;'));
        assert.ok(segmentStyle(segments[0], edge, 20, 6).includes('5px solid'));
        assert.equal(segmentStyle(segments[0], edge, 0, 6), 'background-color: #000000;');
        assert.equal(segmentStyle(segments[0], edge, 1, 1), 'background-color: #000000;');
    }
});
