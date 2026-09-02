import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CITY_LANDMARK_ART_KINDS, renderCityLandmarkArt
} from '../src/city-landmark-art.js';

test('every city landmark kind has distinct, detailed accessible line art', () => {
  assert.deepEqual(CITY_LANDMARK_ART_KINDS,
    ['spire', 'arch', 'rotunda', 'bridge', 'tower', 'arcade', 'aqueduct']);
  const drawings = CITY_LANDMARK_ART_KINDS.map((kind) =>
    renderCityLandmarkArt({ kind, name: `Test ${kind}`, material: 'survey stone' }, 'city-17'));
  assert.equal(new Set(drawings).size, CITY_LANDMARK_ART_KINDS.length);
  for (const [index, drawing] of drawings.entries()) {
    assert.match(drawing, /<svg[^>]+role="img"[^>]+aria-labelledby=/);
    assert.match(drawing, new RegExp(`city-landmark-art-${CITY_LANDMARK_ART_KINDS[index]}`));
    assert.match(drawing, /<title[^>]*>Test /);
    assert.match(drawing, /data-architectural-form=/);
    assert.ok((drawing.match(/<(?:path|circle|ellipse)\b/g) || []).length >= 35,
      `${CITY_LANDMARK_ART_KINDS[index]} should contain substantial drawn detail`);
  }
});

test('landmark line art is deterministic by seed and safely escapes accessible metadata', () => {
  const hostile = {
    kind: 'arch', name: '<script>alert("landmark")</script>',
    material: 'stone & "glass" <foreignObject>'
  };
  const first = renderCityLandmarkArt(hostile, 'aso-1');
  const second = renderCityLandmarkArt(hostile, 'aso-1');
  assert.equal(first, second);
  assert.notEqual(first, renderCityLandmarkArt(hostile, 'aso-2'));
  assert.doesNotMatch(first, /<script>|<foreignObject>|onload=/i);
  assert.match(first, /&lt;script&gt;alert\(&quot;landmark&quot;\)&lt;\/script&gt;/);
  assert.match(first, /stone &amp; &quot;glass&quot; &lt;foreignObject&gt;/);
});

test('unknown landmark kinds safely fall back to the spire renderer', () => {
  const drawing = renderCityLandmarkArt({ kind: '../script', name: 'Unknown' }, 'safe');
  assert.match(drawing, /city-landmark-art-spire/);
  assert.doesNotMatch(drawing, /\.\.\/script/);
});
