import { describe, expect, it } from 'vitest';
import { createMockDataSource } from '../data/mock';
import { DEMO_PASSWORD } from '../data/demo';

function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  };
}

describe('camada simulada', () => {
  it('faz o laço completo e avisa as duas pontas', async () => {
    const ds = createMockDataSource({ storage: memoryStore() });
    const { token, shortCode } = await ds.public.createAlert('esqbf7k2', 'unsafe');
    const seenByWoman: string[] = [];
    ds.public.watchAlert(token, (a) => {
      if (a) seenByWoman.push(a.status);
    });

    await ds.staff.signIn('diego@bar-esquina.test', DEMO_PASSWORD);
    const active = await ds.staff.listActiveAlerts();
    expect(active).toHaveLength(1);
    expect(active[0].shortCode).toBe(shortCode);

    await ds.staff.ackAlert(active[0].id);
    await ds.staff.startResponse(active[0].id);
    const view = await ds.public.getAlert(token);
    expect(view?.responderFirstName).toBe('Diego');
    expect(view?.responderAppearance).toBe('camisa preta');

    await ds.staff.resolveAlert(active[0].id, 'escorted');
    expect(seenByWoman).toEqual(['open', 'seen', 'on_the_way', 'resolved']);
    expect(await ds.staff.listActiveAlerts()).toHaveLength(0);
  });

  it('recusa senha errada, tipo inválido e excesso de pedidos', async () => {
    const ds = createMockDataSource();
    await expect(ds.staff.signIn('diego@bar-esquina.test', 'errada')).rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(ds.public.createAlert('ESQM12T3', 'x' as never)).rejects.toMatchObject({ code: 'invalid_kind' });
    for (let i = 0; i < 3; i++) await ds.public.createAlert('ESQM12T3', 'talk');
    await expect(ds.public.createAlert('ESQM12T3', 'talk')).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('sem login não há acesso às funções da equipe', async () => {
    const ds = createMockDataSource();
    await expect(ds.staff.listActiveAlerts()).rejects.toMatchObject({ code: 'not_staff' });
    await expect(ds.manager.listStaff()).rejects.toMatchObject({ code: 'not_staff' });
  });

  it('o histórico simulado tem cerca de 40 pedidos com tempos de resposta', async () => {
    const ds = createMockDataSource();
    await ds.staff.signIn('marta@bar-esquina.test', DEMO_PASSWORD);
    const all = await ds.manager.listAlerts({ from: '2000-01-01', to: '2100-01-01' });
    expect(all.length).toBeGreaterThan(35);
    expect(all.filter((a) => a.status === 'resolved').every((a) => a.onTheWayAt && a.outcome)).toBe(true);
  });

  it('duas abas com o mesmo armazenamento veem o mesmo pedido', async () => {
    const store = memoryStore();
    const listeners: (() => void)[] = [];
    const channel = {
      postMessage: () => listeners.forEach((l) => l()),
      addEventListener: (_type: 'message', l: () => void) => {
        listeners.push(l);
      },
    };
    const tabA = createMockDataSource({ storage: store, channel });
    const tabB = createMockDataSource({ storage: store, channel });
    await tabB.staff.signIn('marta@bar-esquina.test', DEMO_PASSWORD);
    await tabA.public.createAlert('ESQBAL3W', 'leave');
    const active = await tabB.staff.listActiveAlerts();
    expect(active.map((a) => a.spotLabel)).toContain('Balcão');
  });
});
