import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStats } from '../src/services/statsService.js';

test('calculateStats returns dashboard metrics from reminder history', () => {
  const history = [
    { status: 'taken', medicine_name: 'Paracetamol' },
    { status: 'taken', medicine_name: 'Paracetamol' },
    { status: 'missed', medicine_name: 'Amoxicillin' },
    { status: 'delayed', medicine_name: 'Paracetamol' }
  ];

  const stats = calculateStats(history);

  assert.equal(stats.totalReminders, 4);
  assert.equal(stats.takenCount, 2);
  assert.equal(stats.missedCount, 1);
  assert.equal(stats.delayedCount, 1);
  assert.equal(stats.adherenceRate, 50);
  assert.equal(stats.topForgottenMedicines[0].name, 'Amoxicillin');
});
