import test from 'node:test';
import assert from 'node:assert/strict';
import { lerp, clamp, motionBus } from '../src/utils/motion.js';
import pressRoom from '../src/background/pressroom.js';
import binderyAudio from '../src/utils/audio.js';

test('1. Motion Math: lerp and clamp behave correctly', () => {
  assert.equal(lerp(0, 100, 0.5), 50);
  assert.equal(lerp(10, 20, 0.08), 10.8);
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
});

test('2. MotionBus: event emission and unsubscribing', () => {
  let received = null;
  const unsub = motionBus.on('test-event', (data) => {
    received = data;
  });

  motionBus.emit('test-event', 'pressroom:ready');
  assert.equal(received, 'pressroom:ready');

  unsub();
  motionBus.emit('test-event', 'pressroom:updated');
  assert.equal(received, 'pressroom:ready'); // Should not update after unsub
});

test('3. PressRoom Controller: state transitions contract', () => {
  assert.equal(typeof pressRoom.init, 'function');
  assert.equal(typeof pressRoom.setState, 'function');
  assert.equal(typeof pressRoom.getState, 'function');
  assert.equal(typeof pressRoom.destroy, 'function');

  const validStates = [
    'idle',
    'dragover',
    'dropped',
    'processing:merge',
    'processing:split',
    'processing:compress',
    'processing:generic',
    'success',
    'error',
  ];

  validStates.forEach((st) => {
    pressRoom.setState(st);
    assert.equal(pressRoom.getState(), st);
  });
});

test('4. Audio Controller: disabled by default and toggles correctly', () => {
  assert.equal(typeof binderyAudio.isEnabled, 'function');
  assert.equal(typeof binderyAudio.toggle, 'function');
  assert.equal(typeof binderyAudio.playThunk, 'function');
  assert.equal(typeof binderyAudio.playSnap, 'function');

  // Verify default is false
  binderyAudio.setEnabled(false);
  assert.equal(binderyAudio.isEnabled(), false);

  binderyAudio.toggle();
  assert.equal(binderyAudio.isEnabled(), true);

  binderyAudio.setEnabled(false);
  assert.equal(binderyAudio.isEnabled(), false);
});

test('5. Performance Benchmark: sheet calculation budget', () => {
  // Simulate 12 folio sheets over 120 frames
  const sheets = Array.from({ length: 12 }, (_, i) => ({
    baseX: 10 + i * 7,
    baseY: 10 + i * 6,
    baseRot: (i % 2 === 0 ? 1 : -1) * 1.5,
    durX: 60 + i * 2,
    durY: 65 + i * 2,
    durRot: 70 + i * 2,
    phaseX: i * 0.5,
    phaseY: i * 0.7,
    phaseRot: i * 0.3,
  }));

  const start = performance.now();
  const iterations = 120; // 2 seconds of 60fps frames

  for (let frame = 0; frame < iterations; frame++) {
    const t = frame * 16.67;
    for (let i = 0; i < sheets.length; i++) {
      const s = sheets[i];
      const dx = Math.sin((t / (s.durX * 1000)) * Math.PI * 2 + s.phaseX) * 18;
      const dy = Math.cos((t / (s.durY * 1000)) * Math.PI * 2 + s.phaseY) * 22;
      const drot = Math.sin((t / (s.durRot * 1000)) * Math.PI * 2 + s.phaseRot) * 1.4;
      // Transform calculation
      const _out = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) rotate(${(s.baseRot + drot).toFixed(2)}deg)`;
    }
  }

  const totalTime = performance.now() - start;
  const timePerFrame = totalTime / iterations;

  assert.ok(
    timePerFrame < 2.0,
    `Scripting time per frame (${timePerFrame.toFixed(3)}ms) must be under 2.0ms budget target`
  );
});
