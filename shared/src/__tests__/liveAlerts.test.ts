import { describe, expect, it, vi } from 'vitest';
import { createMockDataSource } from '../data/mock';
import { DEMO_PASSWORD } from '../data/demo';
import { liveAlerts } from '../data/liveAlerts';
import { applyPending, createOutbox, pendingFor, SETTLED_MS, settledFor, type OutboxSnapshot } from '../data/outbox';
import { DataError, type ActionMeta, type StaffApi } from '../data/ports';

/**
 * Quem toca o alarme no app da equipe, passo a passo: a fila de toques de verdade
 * contra a camada simulada, com a "rede" na frente. A lista do servidor só muda
 * quando o teste pede (`list()`), como no app, em que ela chega pelo socket.
 */
function setup() {
  const ds = createMockDataSource();
  const net = { down: false, gate: null as Promise<void> | null, calls: 0 };
  let open = () => {};
  /** Segura o próximo envio (o toque fica "em envio") até a função devolvida ser chamada. */
  const hold = () => {
    net.gate = new Promise<void>((resolve) => (open = resolve));
    return () => open();
  };
  const through = async (fn: () => Promise<void>) => {
    net.calls += 1;
    if (net.gate) {
      const gate = net.gate;
      net.gate = null;
      await gate;
    }
    if (net.down) throw new DataError('network');
    await fn();
  };
  const staff: Pick<StaffApi, 'ackAlert' | 'startResponse' | 'resolveAlert'> = {
    ackAlert: (id, meta?: ActionMeta) => through(() => ds.staff.ackAlert(id, meta)),
    startResponse: (id, meta?: ActionMeta) => through(() => ds.staff.startResponse(id, meta)),
    resolveAlert: (id, outcome, note, meta?: ActionMeta) => through(() => ds.staff.resolveAlert(id, outcome, note, meta)),
  };
  const clock = { now: 1_000_000 };
  const outbox = createOutbox({ staff, storage: { get: () => null, set: () => {} }, now: () => clock.now });
  const login = async (name: 'diego' | 'ana' | 'marta') => {
    const user = await ds.staff.signIn(`${name}@bar-esquina.test`, DEMO_PASSWORD);
    return { id: user.id, fullName: user.fullName };
  };
  const newAlert = async () => {
    const before = new Set((await ds.staff.listActiveAlerts()).map((a) => a.id));
    await ds.public.createAlert('ESQBF7K2', 'unsafe');
    return (await ds.staff.listActiveAlerts()).find((a) => !before.has(a.id))!.id;
  };
  /** Cópia, como a resposta da API (a camada simulada devolve os próprios objetos, que mudam depois). */
  const list = async () => structuredClone(await ds.staff.listActiveAlerts());
  return { ds, net, clock, outbox, hold, login, newAlert, list };
}

type Me = { id: string; fullName: string };
const ringingOf = (server: Awaited<ReturnType<ReturnType<typeof setup>['list']>>, snap: OutboxSnapshot, me: Me, now: number) =>
  liveAlerts(server, snap, me, now).ringing;

describe('alarme do app da equipe (liveAlerts)', () => {
  it('"Vi": toca, cala no toque, continua calado com a lista antiga depois do envio e solta o toque quando a lista nova chega', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const id = await s.newAlert();
    const old = await s.list();
    expect(ringingOf(old, s.outbox.snapshot(), diego, s.clock.now).get(id)).toBe('new');

    // Diego abre o alerta: o "Vi" está em envio.
    const release = s.hold();
    const tap = s.outbox.perform({ kind: 'ack', alertId: id, userId: diego.id });
    await vi.waitFor(() => expect(s.net.calls).toBe(1));
    expect(ringingOf(old, s.outbox.snapshot(), diego, s.clock.now).has(id)).toBe(false);

    // O envio deu certo, mas a lista do servidor ainda é a de antes do toque.
    release();
    expect(await tap).toBe('sent');
    const after = s.outbox.snapshot();
    expect(ringingOf(old, after, diego, s.clock.now).has(id)).toBe(false);
    // Sem os toques aceitos há pouco, o alarme voltaria a tocar aqui (o defeito).
    expect(ringingOf(old, { ...after, settled: [] }, diego, s.clock.now).get(id)).toBe('new');
    // A lista na tela também segue no estado do toque.
    expect(liveAlerts(old, after, diego, s.clock.now).alerts.find((a) => a.id === id)?.status).toBe('seen');

    // A lista nova chega: continua calado, e o toque aceito não muda mais nada.
    s.clock.now += 1_000;
    const fresh = await s.list();
    const view = liveAlerts(fresh, s.outbox.snapshot(), diego, s.clock.now);
    expect(view.ringing.has(id)).toBe(false);
    expect(view.alerts).toEqual(fresh);
    const alert = fresh.find((a) => a.id === id)!;
    expect(applyPending(alert, settledFor(s.outbox.snapshot(), diego.id, id, s.clock.now), diego)).toBe(alert);
    // E sai de vez no prazo.
    expect(settledFor(s.outbox.snapshot(), diego.id, id, s.clock.now + SETTLED_MS)).toHaveLength(0);
  });

  it('"Estou indo" no alerta mandado pela gerência: cala no toque e não volta a tocar antes da lista nova', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const id = await s.newAlert();
    await s.login('marta');
    await s.ds.manager.assignAlert(id, diego.id);
    await s.login('diego');
    const old = await s.list();
    expect(ringingOf(old, s.outbox.snapshot(), diego, s.clock.now).get(id)).toBe('assigned');

    const release = s.hold();
    const tap = s.outbox.perform({ kind: 'start', alertId: id, userId: diego.id });
    await vi.waitFor(() => expect(s.net.calls).toBe(1));
    expect(ringingOf(old, s.outbox.snapshot(), diego, s.clock.now).has(id)).toBe(false);

    release();
    expect(await tap).toBe('sent');
    const after = s.outbox.snapshot();
    expect(ringingOf(old, after, diego, s.clock.now).has(id)).toBe(false);
    expect(ringingOf(old, { ...after, settled: [] }, diego, s.clock.now).get(id)).toBe('assigned');
    expect(liveAlerts(old, after, diego, s.clock.now).alerts.find((a) => a.id === id)?.responderId).toBe(diego.id);

    const fresh = await s.list();
    expect(fresh.find((a) => a.id === id)?.responderId).toBe(diego.id);
    const view = liveAlerts(fresh, s.outbox.snapshot(), diego, s.clock.now);
    expect(view.ringing.has(id)).toBe(false);
    expect(view.alerts).toEqual(fresh);
  });

  it('envio recusado (outra pessoa já foi): volta a tocar e a tela mostra o servidor; o "Vi" aceito antes continua valendo', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const id = await s.newAlert();
    await s.login('marta');
    await s.ds.manager.assignAlert(id, diego.id);
    await s.login('diego');
    const old = await s.list();
    // O "Vi" da tela vai e é aceito (o alerta já estava "visto": não muda nada no servidor).
    expect(await s.outbox.perform({ kind: 'ack', alertId: id, userId: diego.id })).toBe('sent');
    expect(settledFor(s.outbox.snapshot(), diego.id, id, s.clock.now)).toHaveLength(1);

    // Enquanto isso, a Ana assume.
    await s.login('ana');
    await s.ds.staff.startResponse(id);
    await s.login('diego');

    const release = s.hold();
    const tap = s.outbox.perform({ kind: 'start', alertId: id, userId: diego.id });
    await vi.waitFor(() => expect(s.net.calls).toBe(2));
    expect(ringingOf(old, s.outbox.snapshot(), diego, s.clock.now).has(id)).toBe(false);
    release();
    await expect(tap).rejects.toMatchObject({ code: 'already_taken' });

    // Com a lista antiga ainda (a gerência mandou o Diego), o alarme volta: o toque não valeu.
    const view = liveAlerts(old, s.outbox.snapshot(), diego, s.clock.now);
    expect(view.ringing.get(id)).toBe('assigned');
    expect(view.alerts).toEqual(old);
    // O "Vi" aceito antes não é apagado pela recusa: o servidor o tem.
    expect(settledFor(s.outbox.snapshot(), diego.id, id, s.clock.now).map((a) => a.kind)).toEqual(['ack']);
  });

  it('sem sinal, "Vi" e "Estou indo" guardados; outra pessoa assume: o "Vi" é aceito, o "Estou indo" cai, e o alarme não volta com a lista antiga', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const id = await s.newAlert();
    const old = await s.list();
    s.net.down = true;
    expect(await s.outbox.perform({ kind: 'ack', alertId: id, userId: diego.id })).toBe('queued');
    expect(await s.outbox.perform({ kind: 'start', alertId: id, userId: diego.id })).toBe('queued');
    expect(ringingOf(old, s.outbox.snapshot(), diego, s.clock.now).has(id)).toBe(false);

    await s.login('ana');
    await s.ds.staff.startResponse(id);
    await s.login('diego');

    s.net.down = false;
    await s.outbox.flush(diego.id);
    const snap = s.outbox.snapshot();
    expect(pendingFor(snap, diego.id, id)).toHaveLength(0);
    expect(snap.notices.map((n) => n.reason)).toEqual(['taken']);
    // A lista ainda é a de antes (alerta "novo"): o Diego já viu, e a Ana está indo. Não toca de novo.
    const view = liveAlerts(old, snap, diego, s.clock.now);
    expect(view.ringing.has(id)).toBe(false);
    expect(view.alerts.find((a) => a.id === id)?.status).toBe('seen');
  });

  it('a leitura seguinte falhou e não se repetiu: minutos depois, outro toque da fila não faz o alarme voltar', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const first = await s.newAlert();
    const second = await s.newAlert();
    const old = await s.list();
    expect(await s.outbox.perform({ kind: 'ack', alertId: first, userId: diego.id })).toBe('sent');
    // Dez minutos sem lista nova; o Diego abre o outro alerta (a fila anda e o alarme é reavaliado).
    s.clock.now += 10 * 60_000;
    expect(await s.outbox.perform({ kind: 'ack', alertId: second, userId: diego.id })).toBe('sent');
    const view = liveAlerts(old, s.outbox.snapshot(), diego, s.clock.now);
    expect(view.ringing.size).toBe(0);
    expect(view.alerts.filter((a) => a.status === 'seen').map((a) => a.id).sort()).toEqual([first, second].sort());
  });

  it('socket caído (a lista nunca chega): o alarme não recomeça dentro do prazo', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const id = await s.newAlert();
    const old = await s.list();
    expect(await s.outbox.perform({ kind: 'ack', alertId: id, userId: diego.id })).toBe('sent');
    for (const t of [1_000, 20_000, 40_000, SETTLED_MS - 1_000]) {
      expect(ringingOf(old, s.outbox.snapshot(), diego, s.clock.now + t).has(id)).toBe(false);
    }
  });

  it('sem rede no envio: o toque vira guardado e o alarme continua calado', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const id = await s.newAlert();
    const old = await s.list();
    s.net.down = true;
    expect(await s.outbox.perform({ kind: 'ack', alertId: id, userId: diego.id })).toBe('queued');
    expect(pendingFor(s.outbox.snapshot(), diego.id, id)).toHaveLength(1);
    expect(ringingOf(old, s.outbox.snapshot(), diego, s.clock.now).has(id)).toBe(false);
  });
});
