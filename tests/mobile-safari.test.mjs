import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const model = readFileSync(new URL('../bunny-model.js', import.meta.url), 'utf8');
const threeSource = readFileSync(
  new URL('../vendor/three.min.js', import.meta.url),
  'utf8',
);

test('the lab only uses geometry APIs provided by Bunny Hop Three r85', () => {
  const sandbox = {};
  vm.runInNewContext(threeSource, sandbox);

  assert.equal(sandbox.THREE.REVISION, '85dev');
  assert.equal(typeof sandbox.THREE.BufferGeometry.prototype.setFromPoints, 'undefined');
  for (const source of [html, model]) {
    assert.doesNotMatch(source, /new THREE\.BufferGeometry\(\)\.setFromPoints/);
    assert.doesNotMatch(source, /THREE\.CapsuleGeometry/);
  }
});

test('the shared model module loads and builds every bun without a DOM canvas', () => {
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(threeSource, sandbox);
  sandbox.window.THREE = sandbox.THREE;
  // getFurTexture() paints into a 2D canvas; stub just enough of it.
  sandbox.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => new Proxy({}, { get: () => () => {} }),
    }),
  };
  vm.runInNewContext(model, sandbox);

  const { BunnyModel, THREE } = sandbox.window.BunnyModel ? sandbox.window : sandbox;
  assert.ok(BunnyModel, 'BunnyModel was not exported');
  assert.equal(BunnyModel.order.join(), Object.keys(BunnyModel.CHARACTER_OPTIONS).join());
  assert.equal(BunnyModel.order.length, 8);

  for (const id of BunnyModel.order) {
    const parts = {};
    const group = BunnyModel.build(id, new sandbox.THREE.Group(), parts);
    for (const key of ['body', 'belly', 'head', 'snout', 'nose', 'leftEarPivot', 'rightEarPivot',
      'frontLeftLeg', 'frontRightLeg', 'backLeftLeg', 'backRightLeg', 'tail']) {
      assert.ok(parts[key], `${id} is missing ${key}`);
    }
    assert.equal(group.scale.x, BunnyModel.CHARACTER_OPTIONS[id].scale ?? 1, `${id} scale`);
  }
  void THREE;
});

test('the game jump reproduces the game arc: 7.6 units up, 1.07s long', () => {
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(threeSource, sandbox);
  sandbox.window.THREE = sandbox.THREE;
  sandbox.document = { createElement: () => ({ width: 0, height: 0,
    getContext: () => new Proxy({}, { get: () => () => {} }) }) };
  vm.runInNewContext(model, sandbox);
  const { jump } = sandbox.window.BunnyModel;

  assert.equal(jump.GRAVITY, 0.015);
  assert.equal(jump.JUMP_STRENGTH, 0.47);

  assert.equal(jump.start(), true);
  assert.equal(jump.start(), false, 'a second jump mid-air must be refused');

  // Step at 60fps, the rate the game's per-frame integration assumes.
  let height = 0, apex = 0, frames = 0;
  while (jump.airborne && frames < 600) {
    height = jump.step(1 / 60, height);
    apex = Math.max(apex, height);
    frames += 1;
  }
  assert.ok(!jump.airborne, 'the jump must land');
  assert.equal(height, 0, 'it must land exactly on the ground');
  // Euler integration, so these are the game's discrete numbers, a little above
  // the continuous v^2/2g = 7.363 and 2v/g = 1.045s the same constants imply.
  assert.ok(Math.abs(apex - 7.6) < 0.05, `apex was ${apex}`);
  assert.ok(Math.abs(frames / 60 - 1.067) < 0.05, `took ${frames / 60}s`);
});

test('the inline lab program compiles', () => {
  const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter(Boolean);

  assert.equal(inlineScripts.length, 1);
  assert.doesNotThrow(() => new Function(inlineScripts[0]));
});

test('a visible 2D preview protects startup and WebGL context loss', () => {
  const fallbackStart = html.indexOf('const fallback=startCanvasFallback()');
  const threeGuard = html.indexOf("typeof THREE==='undefined'");

  assert.ok(fallbackStart >= 0 && fallbackStart < threeGuard);
  assert.match(html, /renderer\.domElement\.style\.visibility='hidden'/);
  assert.match(html, /webglcontextlost/);
  assert.match(html, /webglcontextrestored/);
  assert.match(html, /fallback\.hide\(\)/);
});

test('iOS Safari reverses only the move stick vertical axis, including iPad desktop mode', () => {
  const source = html.slice(html.indexOf('    const iosSafari='), html.indexOf("    bindStick('move');bindStick('look');") + "    bindStick('move');bindStick('look');".length);
  for (const [userAgent, maxTouchPoints, inverted] of [
    ['Mozilla/5.0 (iPhone) AppleWebKit/605.1 Version/18.0 Mobile Safari/604.1', 5, true],
    ['Mozilla/5.0 (Macintosh) AppleWebKit/605.1 Version/18.0 Safari/605.1', 5, true],
    ['Mozilla/5.0 (Macintosh) AppleWebKit/605.1 Version/18.0 Safari/605.1', 0, false],
    ['Mozilla/5.0 (Linux; Android) Chrome/130.0 Mobile Safari/537.36', 5, false],
  ]) {
    const elements = Object.fromEntries(['move', 'look'].map(name => [name, {
      handlers: {}, thumb: { style: {} },
      querySelector() { return this.thumb; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
      addEventListener(type, handler) { this.handlers[type] = handler; },
    }]));
    const context = { window: { addEventListener() {} }, navigator: { userAgent, maxTouchPoints }, document: {
      addEventListener() {},
      getElementById(id) { return elements[id.replace('-stick', '')]; },
    } };
    vm.runInNewContext(source + ';globalThis.inputSticks=sticks;', context);
    for (const name of ['move', 'look']) {
      for (const [x, y] of [[0, -20], [0, 20], [-20, 0], [20, 0]]) {
        const touch = { identifier: 1, clientX: 50 + x, clientY: 50 + y };
        elements[name].handlers.touchstart({ changedTouches: [touch], preventDefault() {} });
        const actual = context.inputSticks[name].v;
        assert.equal(actual.x, x / 31);
        assert.ok(Math.abs(actual.y - (name === 'move' && inverted ? -y : y) / 31) < 1e-10);
        assert.equal(elements[name].thumb.style.transform, `translate(-50%,-50%) translate(${x}px,${y}px)`);
        elements[name].handlers.touchend({ changedTouches: [touch], preventDefault() {} });
        assert.equal(actual.x, 0);
        assert.equal(actual.y, 0);
      }
    }
  }
});


test('iframe mouse-only stick presses hold, drag, and release without a timer', () => {
  const source = html.slice(html.indexOf('    const iosSafari='), html.indexOf("    bindStick('move');bindStick('look');") + "    bindStick('move');bindStick('look');".length);
  const windowHandlers = {}, documentHandlers = {};
  const elements = Object.fromEntries(['move', 'look'].map(name => [name, {
    handlers: {}, thumb: { style: {} },
    querySelector() { return this.thumb; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    addEventListener(type, handler) { this.handlers[type] = handler; },
  }]));
  const context = {
    navigator: { userAgent: 'Chrome', maxTouchPoints: 0 },
    window: { addEventListener(type, handler) { (windowHandlers[type] ??= []).push(handler); } },
    document: {
      hidden: false,
      addEventListener(type, handler) { (documentHandlers[type] ??= []).push(handler); },
      getElementById(id) { return elements[id.replace('-stick', '')]; },
    },
  };
  vm.runInNewContext(source + ';globalThis.inputSticks=sticks;', context);
  const fire = (type, event = {}) => windowHandlers[type].forEach(handler => handler(event));
  for (const name of ['move', 'look']) {
    const handlers = elements[name].handlers, value = context.inputSticks[name].v;
    const press = button => handlers.mousedown({ button, clientX: 70, clientY: 50, preventDefault() {} });
    press(2);
    assert.equal(value.x, 0, 'right click must not activate');
    press(0);
    assert.equal(value.x, 20 / 31);
    fire('mousemove', { clientX: 50, clientY: 70 });
    assert.equal(value.y, 20 / 31);
    fire('mouseup', { button: 2 });
    assert.equal(value.y, 20 / 31, 'other buttons do not end the hold');
    fire('mouseup', { button: 0 });
    assert.equal(value.y, 0);
    press(0);
    fire('blur');
    assert.equal(value.x, 0);
    press(0);
    context.document.hidden = true;
    documentHandlers.visibilitychange.forEach(handler => handler());
    assert.equal(value.x, 0);
    context.document.hidden = false;
    handlers.pointerdown({ pointerType: 'mouse', button: 0, pointerId: 7, clientX: 70, clientY: 50 });
    handlers.mousedown({ button: 0, clientX: 50, clientY: 70, preventDefault() {} });
    assert.equal(value.x, 20 / 31, 'compatibility mouse press must not overwrite pointer input');
    fire('mouseup', { button: 0 });
    assert.equal(value.x, 0, 'window release clears uncaptured forwarded pointers');
  }
});
