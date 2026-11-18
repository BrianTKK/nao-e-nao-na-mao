import { describe, expect, it } from 'vitest';
import { createMockDataSource } from '../data/mock';
import { DEMO_PASSWORD } from '../data/demo';
import { applyPending, createOutbox, noticesFor, pendingFor, randomUuid, type OutboxStorage } from '../data/outbox';
import { DataError, type ActionMeta, type StaffApi } from '../data/ports';
import type { Alert } from '../domain';

/**
 * A fila de toques sem sinal contra a camada simulada (as mesmas regras do
 * banco). A "rede" é um interruptor na frente dela:
 * - `down`: o toque nem chega (modo avião);
 * - `lost`: o toque chega e é aplicado, mas a resposta se perde.
 */
function setup(options: { maxAgeMs?: number; maxAttempts?: number } = {}) {
  const ds = createMockDataSource();
  const net = { mode: 'up' as 'up' | 'down' | 'lost' | 'broken', calls: [] as string[] };
  const through = async (label: string, fn: () => Promise<void>) => {
    net.calls.push(label);
    if (net.mode === 'down') throw new DataError('network');
    if (net.mode === 'broken') throw new DataError('unknown');
    await fn();
    if (net.mode === 'lost') throw new DataError('network');
  };
  const staff: Pick<StaffApi, 'ackAlert' | 'startResponse' | 'resolveAlert'> = {
    ackAlert: (id, meta?: ActionMeta) => through(`ack:${meta?.actionId}`, () => ds.staff.ackAlert(id, meta)),
    startResponse: (id, meta?: ActionMeta) => through(`start:${meta?.actionId}`, () => ds.staff.startResponse(id, meta)),
    resolveAlert: (id, outcome, note, meta?: ActionMeta) => through(`resolve:${meta?.actionId}`, () => ds.staff.resolveAlert(id, outcome, note, meta)),
  };
  const disk: { value: string | null } = { value: null };
  const storage: OutboxStorage = { get: () => disk.value, set: (v) => void (disk.value = v) };
  const clock = { now: 1_000_000 };
  const make = () => createOutbox({ staff, storage, now: () => clock.now, ...options });
  const login = async (name: 'diego' | 'ana' | 'marta') => (await ds.staff.signIn(`${name}@bar-esquina.test`, DEMO_PASSWORD)).id;
  const newAlert = async () => {
    const { token } = await ds.public.createAlert('ESQBF7K2', 'unsafe');
    const statuses: string[] = [];
    ds.public.watchAlert(token, (a) => a && statuses.push(a.status));
    const alert = (await ds.staff.listActiveAlerts()).at(-1)!;
    return { id: alert.id, statuses };
  };
  return { ds, net, disk, clock, make, login, newAlert, outbox: make() };
}

describe('fila de toques sem sinal', () => {
  it('com conexão, o toque vai direto e nada fica guardado', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    expect(await s.outbox.perform({ kind: 'start', alertId: id, userId: diego })).toBe('sent');
    expect(s.outbox.snapshot().actions).toHaveLength(0);
    expect((await s.ds.staff.getAlert(id))?.responderId).toBe(diego);
  });

  it('sem conexão, guarda no aparelho e envia quando a conexão volta (mesmo depois de fechar o app)', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    s.net.mode = 'down';
    expect(await s.outbox.perform({ kind: 'start', alertId: id, userId: diego, spotLabel: 'Banheiro feminino' })).toBe('queued');
    expect(pendingFor(s.outbox.snapshot(), diego, id)).toHaveLength(1);
    expect((await s.ds.staff.getAlert(id))?.status).toBe('open');
    expect(JSON.parse(s.disk.value!).actions).toHaveLength(1);

    // O app foi fechado e aberto: a fila volta do aparelho.
    const reopened = s.make();
    await reopened.ready;
    expect(pendingFor(reopened.snapshot(), diego)).toHaveLength(1);

    // Ainda sem conexão: continua guardado.
    await reopened.flush(diego);
    expect(pendingFor(reopened.snapshot(), diego)).toHaveLength(1);

    s.net.mode = 'up';
    await reopened.flush(diego);
    expect(reopened.snapshot().actions).toHaveLength(0);
    expect(reopened.snapshot().notices).toHaveLength(0);
    const alert = await s.ds.staff.getAlert(id);
    expect(alert?.status).toBe('on_the_way');
    expect(alert?.responderId).toBe(diego);
    expect(JSON.parse(s.disk.value!).actions).toHaveLength(0);
  });

  it('o toque chegou mas a resposta se perdeu: o reenvio usa o mesmo id e não repete a transição', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id, statuses } = await s.newAlert();
    s.net.mode = 'lost';
    expect(await s.outbox.perform({ kind: 'resolve', alertId: id, userId: diego, outcome: 'escorted' })).toBe('queued');
    // O servidor já aplicou.
    expect((await s.ds.staff.getAlert(id))?.status).toBe('resolved');

    s.net.mode = 'up';
    await s.outbox.flush(diego);
    // Sem o id, o reenvio daria "já foi encerrado" e a tela avisaria um conflito que não existiu.
    expect(s.outbox.snapshot().notices).toHaveLength(0);
    expect(s.outbox.snapshot().actions).toHaveLength(0);
    expect(statuses).toEqual(['open', 'resolved']);
    const sent = s.net.calls.filter((c) => c.startsWith('resolve:'));
    expect(sent).toHaveLength(2);
    expect(sent[0]).toBe(sent[1]);
  });

  it('vários toques guardados saem na ordem em que foram feitos', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id, statuses } = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'ack', alertId: id, userId: diego });
    await s.outbox.perform({ kind: 'start', alertId: id, userId: diego });
    await s.outbox.perform({ kind: 'resolve', alertId: id, userId: diego, outcome: 'ride_called', note: ' táxi ' });
    expect(pendingFor(s.outbox.snapshot(), diego, id).map((a) => a.kind)).toEqual(['ack', 'start', 'resolve']);

    s.net.mode = 'up';
    await s.outbox.flush(diego);
    expect(statuses).toEqual(['open', 'seen', 'on_the_way', 'resolved']);
    const alert = await s.ds.staff.getAlert(id);
    expect(alert?.outcome).toBe('ride_called');
    expect(alert?.note).toBe('táxi');
    expect(s.outbox.snapshot().actions).toHaveLength(0);
  });

  it('tocar duas vezes no mesmo botão sem sinal guarda um toque só', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'start', alertId: id, userId: diego });
    expect(await s.outbox.perform({ kind: 'start', alertId: id, userId: diego })).toBe('queued');
    expect(pendingFor(s.outbox.snapshot(), diego, id)).toHaveLength(1);
  });

  it('conflito: outra pessoa encerrou enquanto o aparelho estava sem sinal; o app avisa e não sobrescreve', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'resolve', alertId: id, userId: diego, outcome: 'false_alarm', spotLabel: 'Banheiro feminino' });

    // A Ana, com sinal, atende e encerra.
    await s.login('ana');
    await s.ds.staff.startResponse(id);
    await s.ds.staff.resolveAlert(id, 'escorted', 'Levei até o carro');

    await s.login('diego');
    s.net.mode = 'up';
    await s.outbox.flush(diego);
    const alert = await s.ds.staff.getAlert(id);
    expect(alert?.outcome).toBe('escorted');
    expect(alert?.note).toBe('Levei até o carro');
    expect(s.outbox.snapshot().actions).toHaveLength(0);
    const [notice] = noticesFor(s.outbox.snapshot(), diego, id);
    expect(notice).toMatchObject({ kind: 'resolve', reason: 'closed', spotLabel: 'Banheiro feminino' });

    s.outbox.dismissNotice(notice.id);
    expect(s.outbox.snapshot().notices).toHaveLength(0);
  });

  it('conflito: outra pessoa assumiu; o "Estou indo" e o "Encerrar" guardados caem juntos, com um aviso só', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'ack', alertId: id, userId: diego });
    await s.outbox.perform({ kind: 'start', alertId: id, userId: diego });
    await s.outbox.perform({ kind: 'resolve', alertId: id, userId: diego, outcome: 'escorted' });

    const ana = await s.login('ana');
    await s.ds.staff.startResponse(id);

    await s.login('diego');
    s.net.mode = 'up';
    await s.outbox.flush(diego);
    const alert = await s.ds.staff.getAlert(id);
    expect(alert?.status).toBe('on_the_way');
    expect(alert?.responderId).toBe(ana);
    expect(s.outbox.snapshot().actions).toHaveLength(0);
    expect(noticesFor(s.outbox.snapshot(), diego).map((n) => `${n.kind}:${n.reason}`)).toEqual(['start:taken']);
  });

  it('só o "Encerrar" guardado, e outra pessoa assumiu: a equipe comum não encerra o alerta de quem assumiu', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'resolve', alertId: id, userId: diego, outcome: 'not_found' });
    await s.login('ana');
    await s.ds.staff.startResponse(id);
    await s.login('diego');
    s.net.mode = 'up';
    await s.outbox.flush(diego);
    expect((await s.ds.staff.getAlert(id))?.status).toBe('on_the_way');
    expect(noticesFor(s.outbox.snapshot(), diego).map((n) => `${n.kind}:${n.reason}`)).toEqual(['resolve:taken']);
  });

  it('recusa na hora (com conexão) volta como erro para a tela, sem aviso nem toque guardado', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    await s.login('ana');
    await s.ds.staff.startResponse(id);
    await s.login('diego');
    await expect(s.outbox.perform({ kind: 'start', alertId: id, userId: diego })).rejects.toMatchObject({ code: 'already_taken' });
    expect(s.outbox.snapshot()).toMatchObject({ actions: [], notices: [] });
  });

  it('toque guardado por tempo demais é descartado com aviso, sem ser enviado', async () => {
    const s = setup({ maxAgeMs: 60_000 });
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'start', alertId: id, userId: diego });
    s.net.mode = 'up';
    s.net.calls.length = 0;
    s.clock.now += 61_000;
    await s.outbox.flush(diego);
    expect(s.net.calls).toHaveLength(0);
    expect(noticesFor(s.outbox.snapshot(), diego).map((n) => n.reason)).toEqual(['expired']);
    expect((await s.ds.staff.getAlert(id))?.status).toBe('open');
  });

  it('o toque de uma pessoa não é enviado com o login de outra', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'start', alertId: id, userId: diego });
    const ana = await s.login('ana');
    s.net.mode = 'up';
    s.net.calls.length = 0;
    await s.outbox.flush(ana);
    expect(s.net.calls).toHaveLength(0);
    expect(pendingFor(s.outbox.snapshot(), ana)).toHaveLength(0);
    expect(pendingFor(s.outbox.snapshot(), diego)).toHaveLength(1);
    expect((await s.ds.staff.getAlert(id))?.status).toBe('open');
  });

  it('erro inesperado do servidor: tenta de novo algumas vezes, segura a ordem do alerta e depois desiste com aviso', async () => {
    const s = setup({ maxAttempts: 2 });
    const diego = await s.login('diego');
    const a = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'start', alertId: a.id, userId: diego });
    await s.outbox.perform({ kind: 'resolve', alertId: a.id, userId: diego, outcome: 'escorted' });

    s.net.mode = 'broken';
    s.net.calls.length = 0;
    await s.outbox.flush(diego);
    // O "Encerrar" não passa na frente do "Estou indo" que falhou.
    expect(s.net.calls.map((c) => c.split(':')[0])).toEqual(['start']);
    expect(pendingFor(s.outbox.snapshot(), diego)).toHaveLength(2);

    await s.outbox.flush(diego);
    expect(s.outbox.snapshot().actions).toHaveLength(0);
    expect(noticesFor(s.outbox.snapshot(), diego).map((n) => `${n.kind}:${n.reason}`)).toEqual(['start:failed']);
  });

  it('duas rodadas de envio ao mesmo tempo mandam cada toque uma vez só', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'start', alertId: id, userId: diego });
    s.net.mode = 'up';
    s.net.calls.length = 0;
    await Promise.all([s.outbox.flush(diego), s.outbox.flush(diego), s.outbox.flush(diego)]);
    expect(s.net.calls).toHaveLength(1);
  });

  it('avisa quem assina a cada mudança e devolve o mesmo retrato enquanto nada muda', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    let changes = 0;
    const stop = s.outbox.subscribe(() => changes++);
    const before = s.outbox.snapshot();
    expect(s.outbox.snapshot()).toBe(before);
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'start', alertId: id, userId: diego });
    expect(changes).toBeGreaterThan(0);
    expect(s.outbox.snapshot()).not.toBe(before);
    stop();
  });

  it('fila guardada corrompida não derruba o app', async () => {
    const s = setup();
    s.disk.value = '{"v":1,"actions":"x"';
    const outbox = s.make();
    await outbox.ready;
    expect(outbox.snapshot()).toMatchObject({ actions: [], notices: [] });
  });
});

describe('o alerta como a tela mostra enquanto há toques guardados', () => {
  const me = { id: 'u1', fullName: 'Diego Santos' };
  const base = { id: 'a1', status: 'open', responderId: null, responderName: null, outcome: null, note: null } as unknown as Alert;
  const action = (kind: 'ack' | 'start' | 'resolve', extra: object = {}) => ({ id: randomUuid(), kind, alertId: 'a1', userId: 'u1', createdAt: 0, attempts: 0, ...extra });

  it('aplica os toques em ordem', () => {
    expect(applyPending(base, [action('ack')], me).status).toBe('seen');
    expect(applyPending(base, [action('ack'), action('start')], me)).toMatchObject({ status: 'on_the_way', responderId: 'u1', responderName: 'Diego Santos' });
    expect(applyPending(base, [action('resolve', { outcome: 'escorted', note: ' ok ' })], me)).toMatchObject({
      status: 'resolved',
      outcome: 'escorted',
      note: 'ok',
      responderId: 'u1',
    });
  });

  it('ignora toques de outro alerta, de outra pessoa e o que vem depois do encerramento', () => {
    expect(applyPending(base, [action('start', { alertId: 'a2' }), action('start', { userId: 'u2' })], me)).toBe(base);
    const closed = { ...base, status: 'resolved', outcome: 'escorted' } as Alert;
    expect(applyPending(closed, [action('start')], me)).toBe(closed);
  });

  it('gera ids no formato UUID v4', () => {
    for (let i = 0; i < 20; i++) expect(randomUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
