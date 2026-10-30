// Guards the whole point of bunny-model.js: every line of bunny geometry in the
// lab must still be the game's own line. If Bunny Hop Adventures changes its
// bunny, this fails until ./build-bunny-model.sh is re-run.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const modelPath = new URL('../bunny-model.js', import.meta.url);
const model = readFileSync(modelPath, 'utf8');
const game = readFileSync(
  new URL('../../../../AlphaZone/src/bunny-hop-adventures/index.html', import.meta.url),
  'utf8',
);

test('every bunny body block is byte-identical to the game source', () => {
  const gameLines = game.split('\n');
  const modelLines = model.split('\n');
  // Anchors, not line numbers, so the check survives edits elsewhere in the game.
  const blocks = [
    '    const CHARACTER_OPTIONS = {',
    '    function getFurTexture() {',
    '    function applyCharacterAppearance(parts, materials, config) {',
    '    function applyChibiEnhancements(target, parts, config, mats) {',
    '    function createBunny(targetGroup = null, targetParts = bunnyParts, configOverride = null) {',
    '    function applyFluffyEnhancements(target, parts, config, materials) {',
    '    function applyHollandLopEnhancements(target, targetParts, config, materials) {',
    '    function clamp(value, min, max) {',
    '    function poseHoppingBunny(parts, elapsed, options) {',
    '    function applyHopOverlay(parts, delta) {',
  ];

  for (const opener of blocks) {
    const gameStart = gameLines.indexOf(opener);
    const modelStart = modelLines.indexOf(opener);
    assert.notEqual(gameStart, -1, `game is missing: ${opener}`);
    assert.notEqual(modelStart, -1, `bunny-model.js is missing: ${opener}`);

    const closer = opener.startsWith('    function ') ? '    }' : '    };';
    let end = gameStart;
    while (gameLines[end] !== closer) end += 1;

    const expected = gameLines.slice(gameStart, end + 1);
    const actual = modelLines.slice(modelStart, modelStart + expected.length);
    assert.equal(actual.join('\n'), expected.join('\n'), `drift in: ${opener}`);
  }
});

test('the jump constants are the game\'s own', () => {
  for (const line of [
    '    const GRAVITY = 0.015;',
    '    const JUMP_STRENGTH = 0.47;',
    '    const HOP_LANDING_DURATION = 0.34;',
    '    const HOP_TAKEOFF_DURATION = 0.16;',
  ]) {
    assert.ok(game.includes(line + '\n'), `game is missing: ${line.trim()}`);
    assert.ok(model.includes(line + '\n'), `bunny-model.js is missing: ${line.trim()}`);
  }
});

test('regenerating the module is a no-op', () => {
  execFileSync(new URL('../build-bunny-model.sh', import.meta.url).pathname);
  assert.equal(readFileSync(modelPath, 'utf8'), model, 'bunny-model.js is stale');
});
