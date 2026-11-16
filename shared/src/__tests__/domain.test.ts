import { describe, expect, it } from 'vitest';
import { computeStats, formatDuration, onTheWayMessage, percentile, responseSeconds, type Alert } from '../domain';

describe('domínio', () => {
  it('formata durações', () => {
    expect(formatDuration(40)).toBe('40 s');
    expect(formatDuration(125)).toBe('2 min');
    expect(formatDuration(125, true)).toBe('2 min 05 s');
    expect(formatDuration(4200)).toBe('1 h 10 min');
  });

  it('mensagem de "a caminho" com e sem a roupa do dia', () => {
    expect(onTheWayMessage('Diego', 'camisa preta')).toBe('Diego, de camisa preta, está indo até você.');
    expect(onTheWayMessage(null, null)).toBe('Alguém da equipe está indo até você.');
  });

  it('tempo de resposta e mediana', () => {
    const createdAt = '2026-11-16T22:00:00Z';
    expect(responseSeconds({ createdAt, onTheWayAt: '2026-11-16T22:00:40Z' })).toBe(40);
    expect(responseSeconds({ createdAt, onTheWayAt: null })).toBeNull();

    const make = (s: number, outcome: Alert['outcome']) =>
      ({
        createdAt,
        onTheWayAt: new Date(Date.parse(createdAt) + s * 1000).toISOString(),
        seenAt: null,
        status: 'resolved',
        outcome,
        spotLabel: 'Mesa 12',
      }) as Alert;
    const stats = computeStats([make(30, 'escorted'), make(40, 'escorted'), make(90, 'ride_called')]);
    expect(stats.medianResponseSeconds).toBe(40);
    expect(stats.byOutcome).toEqual({ escorted: 2, ride_called: 1 });
    expect(stats.bySpot).toEqual({ 'Mesa 12': 3 });
  });

  it('percentil 90', () => {
    expect(percentile([], 90)).toBeNull();
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 90)).toBe(90);
    expect(percentile([5], 90)).toBe(5);
  });
});
