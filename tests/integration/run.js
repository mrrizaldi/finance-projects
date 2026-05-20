#!/usr/bin/env node
// Simple test runner — no dependencies needed
// Usage: node tests/integration/run.js

let passed = 0;
let failed = 0;
const failures = [];

export async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
    failures.push({ name, error: e.message });
  }
}

export function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan(n) {
      if (!(actual > n)) throw new Error(`Expected ${actual} > ${n}`);
    },
    toBeLessThan(n) {
      if (!(actual < n)) throw new Error(`Expected ${actual} < ${n}`);
    },
    toContain(str) {
      if (!String(actual).includes(str)) throw new Error(`Expected "${actual}" to contain "${str}"`);
    },
    toBeFinite() {
      if (!Number.isFinite(actual)) throw new Error(`Expected finite number, got ${actual}`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`);
    },
    toBeTruthy() {
      if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
    },
  };
}

export function describe(label, fn) {
  console.log(`\n${label}`);
  return fn();
}

export async function runSuite(label, fn) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(label);
  console.log('─'.repeat(50));
  await fn();
}

process.on('exit', () => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\nFailed tests:');
    failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
    process.exit(1);
  }
});
