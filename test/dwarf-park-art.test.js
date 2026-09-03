import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDwarfParkArt } from '../src/dwarf-park-art.js';

test('draws a detailed accessible Dwarf park with six visibly vicious youngsters', () => {
  const drawing = renderDwarfParkArt({
    cityName: 'Cinderwake', mapSlug: 'aso',
    appearance: { signature: 'aso-6', district: 'Courtyard wards' }
  });

  assert.match(drawing,
    /<svg class="dwarf-park-art dwarf-park-art-aso"[^>]+role="img"[^>]+aria-labelledby=/u);
  assert.match(drawing, /<title[^>]*>Young Dwarves causing trouble in Cinderwake<\/title>/u);
  assert.match(drawing, /practise biting, pickpocketing, ambushes, slingshot attacks/u);
  assert.equal((drawing.match(/class="park-dwarf-action/gu) ?? []).length, 6);
  assert.equal((drawing.match(/data-tendency="biting"/gu) ?? []).length, 2);
  assert.equal((drawing.match(/data-tendency="pickpocketing"/gu) ?? []).length, 2);
  assert.equal((drawing.match(/data-tendency="ambush"/gu) ?? []).length, 1);
  assert.equal((drawing.match(/data-tendency="slingshot"/gu) ?? []).length, 1);
  for (const noise of ['CHOMP!', 'YOINK!', 'THWACK!', 'PING!']) {
    assert.ok(drawing.includes(`>${noise}<`));
  }
  assert.ok((drawing.match(/<(?:path|circle|ellipse|rect|polygon)\b/gu) ?? []).length >= 150,
    'the park should be a substantial illustrated scene rather than a few CSS blocks');
});

test('varies park architecture by city and region while escaping accessible copy', () => {
  const regions = ['aso', 'bromo', 'calbuco', 'dempo', 'ebeko', 'fogo', 'gallego'];
  const drawings = regions.map((mapSlug, index) => renderDwarfParkArt({
    cityName: `City ${index}`, mapSlug,
    appearance: { signature: `${mapSlug}-${index}`, district: `District ${index}` }
  }));
  assert.equal(new Set(drawings).size, regions.length);
  for (const [index, drawing] of drawings.entries()) {
    assert.match(drawing, new RegExp(`dwarf-park-art-${regions[index]}`, 'u'));
    assert.match(drawing, /class="park-region-detail park-/u);
  }

  const hostile = renderDwarfParkArt({
    cityName: '<script onload="bite()">', mapSlug: '../fogo',
    appearance: { signature: '<foreignObject>' }
  });
  assert.match(hostile, /dwarf-park-art-aso/u);
  assert.match(hostile, /&lt;script onload=&quot;bite\(\)&quot;&gt;/u);
  assert.doesNotMatch(hostile, /<script|<foreignObject|<svg[^>]+onload=/iu);
});
