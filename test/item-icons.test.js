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

test('uses the Oil Field flat-top hex orientation without turning the machine glyph', () => {
  const svg = machineIconSvg('pump-pipe', 1, ['#777', '#d8be32']);

  assert.match(svg, /<path d="M17 6H47L62 32 47 58H17L2 32Z"/);
  assert.doesNotMatch(svg, /M32 2 58 17v30L32 62 6 47V17Z/);
  assert.match(svg, /<g transform="translate\(32 32\)"[^>]*><circle r="6"\/><path d="M0-6V-23/);
});
