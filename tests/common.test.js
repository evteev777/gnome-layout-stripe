import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS, profileFor, parseObject, segmentRects, userPresets, validColors} from '../common.js';

test('all palettes have 1–3 safe RGB colors; malformed saved data is rejected', () => {
    for (const p of PRESETS)
        assert.ok(validColors(p.colors));
    for (const data of [null, [], ['red'], ['#ff0000; color: red'], ['#111111', '#222222', '#333333', '#444444']])
        assert.equal(validColors(data), false);
    assert.deepEqual(parseObject('null'), {});
    assert.deepEqual(parseObject('['), {});
    assert.deepEqual(userPresets('{"name":"bad"}'), []);
    assert.deepEqual(userPresets('[{"name":"ok","colors":["#ABCDEF"]},{"name":"bad","colors":[]}]').map(({name, colors}) => ({name, colors})),
        [{name: 'ok', colors: ['#ABCDEF']}]);
});

test('source-specific overrides, XKB variants and unknown/IBus fallback', () => {
    assert.deepEqual(profileFor({type: 'xkb', id: 'ru+phonetic'}, {}, []).colors, PRESETS.find(p => p.id === 'ru').colors);
    assert.deepEqual(profileFor({type: 'xkb', id: 'us'}, {'xkb:us': {colors: ['#123456']}}, []).colors, ['#123456']);
    assert.deepEqual(profileFor({type: 'ibus', id: 'pinyin'}, {}, ['#FEDCBA']).colors, ['#FEDCBA']);
    assert.deepEqual(profileFor(null, {}, []).colors, ['#57E389']);
    const copy = profileFor({type: 'xkb', id: 'ru'}, {}, []).colors;
    copy.reverse();
    assert.equal(PRESETS.find(p => p.id === 'ru').colors[0], '#FFFFFF');
});

test('four edges cover complete monitor length without gaps, including negative origins', () => {
    for (const monitor of [{x: -1920, y: -200, width: 1920, height: 1080},
        {x: 0, y: 0, width: 1365, height: 767}]) {
        for (const edge of ['bottom', 'top', 'left', 'right']) {
            for (const count of [1, 2, 3]) {
                const rects = segmentRects(monitor, edge, 4, count);
                const vertical = edge === 'left' || edge === 'right';
                const axis = vertical ? 'y' : 'x';
                const size = vertical ? 'height' : 'width';
                assert.equal(rects[0][axis], monitor[axis]);
                assert.equal(rects.at(-1)[axis] + rects.at(-1)[size], monitor[axis] + monitor[size]);
                for (let i = 1; i < count; i++)
                    assert.equal(rects[i - 1][axis] + rects[i - 1][size], rects[i][axis]);
                for (const r of rects) {
                    assert.ok(r.x >= monitor.x && r.y >= monitor.y);
                    assert.ok(r.x + r.width <= monitor.x + monitor.width);
                    assert.ok(r.y + r.height <= monitor.y + monitor.height);
                    assert.equal(vertical ? r.width : r.height, 4);
                }
            }
        }
    }
});
