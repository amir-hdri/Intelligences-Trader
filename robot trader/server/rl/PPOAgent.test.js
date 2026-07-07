import { test, describe } from 'node:test';
import assert from 'node:assert';
import util from 'node:util';
if (!util.isNullOrUndefined) {
  util.isNullOrUndefined = (val) => val === null || val === undefined;
}
import { PPOAgent } from './PPOAgent.js';

describe('PPOAgent', () => {
  test('getValues returns a 1D array of correct size for a single state input', () => {
    const agent = new PPOAgent(5, 1);
    const singleState = [0, 0, 1, 0.5, -0.2];
    
    const values = agent.getValues([singleState]);
    
    assert.ok(Array.isArray(values), 'getValues must return an array');
    assert.strictEqual(values.length, 1, 'getValues array length must match number of states (1)');
    assert.strictEqual(typeof values[0], 'number', 'The value at index 0 must be a number');
    assert.ok(!isNaN(values[0]), 'Value must not be NaN');
  });

  test('getValues returns a 1D array of correct size for multiple states input', () => {
    const agent = new PPOAgent(5, 1);
    const multipleStates = [
      [0, 0, 1, 0.5, -0.2],
      [1, 0.1, -1, 0.4, 0.3],
      [0, 0.2, 1, 0.3, -0.5]
    ];
    
    const values = agent.getValues(multipleStates);
    
    assert.ok(Array.isArray(values), 'getValues must return an array');
    assert.strictEqual(values.length, 3, 'getValues array length must match number of states (3)');
    assert.strictEqual(typeof values[0], 'number');
    assert.strictEqual(typeof values[1], 'number');
    assert.strictEqual(typeof values[2], 'number');
    assert.ok(!isNaN(values[0]) && !isNaN(values[1]) && !isNaN(values[2]), 'Values must not be NaN');
  });
});
