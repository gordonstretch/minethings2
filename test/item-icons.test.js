import assert from 'node:assert/strict';
import test from 'node:test';
import { machineIconSvg } from '../src/item-icons.js';

test('XML-escapes database-owned machine icon values', () => {
  const svg = machineIconSvg('live-<&-type', 1, ['#000', 'red" onload="alert(1)']);
  assert.match(svg, /<title>Live &lt;&amp; Type machine<\/title>/);
  assert.match(svg, /fill="red&quot; onload=&quot;alert\(1\)"/);
  assert.doesNotMatch(svg, /<title>Live <&/);
  assert.doesNotMatch(svg, /fill="red" onload=/);
});

test('does not clamp missing live rarity artwork to another rarity', () => {
  assert.equal(machineIconSvg('pump', 7, ['#000', '#111']), null);
  assert.equal(machineIconSvg('pump', -1, ['#000']), null);
});
