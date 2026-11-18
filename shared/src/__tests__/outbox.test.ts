import { describe, expect, it, vi } from 'vitest';
import { createMockDataSource } from '../data/mock';
import { DEMO_PASSWORD } from '../data/demo';
import { applyPending, createOutbox, noticesFor, pendingFor, randomUuid, sendingFor, type OutboxOptions, type OutboxStorage } from '../data/outbox';
import { DataError, type ActionMeta, type StaffApi } from '../data/ports';
import type { Alert } from '../domain';

/**
 * A fila de toques sem sinal contra a camada simulada (as mesmas regras do
 * banco). A "rede" é um interruptor na frente dela:
 * - `down`: o toque nem chega (modo avião);
 * - `lost`: o toque chega e é aplicado, mas a resposta se perde;
 * - `broken`: o servidor recusa com um erro que o app não conhece;
 * - `server`: erro interno do servidor (5xx);
 * - `auth`: o login não vale mais;
 * - `ack-broken`: só o "Vi" é recusado.
 * `hold()` segura o próximo envio até `release()` ser chamado.
 */
function setup(options: Pick<OutboxOptions, 'maxAgeMs' | 'maxAttempts' | 'currentUserId' | 'onAuthLost'> = {}) {
  const ds = createMockDataSource();
  const net = {
    mode: 'up' as 'up' | 'down' | 'lost' | 'broken' | 'server' | 'auth' | 'ack-broken',
    calls: [] as string[],
    metas: [] as (ActionMeta | undefined)[],
    gate: null as Promise<void> | null,
  };
  let release = () => {};
  const hold = () => {
    net.gate = new Promise<void>((resolve) => (release = resolve));
    return () => release();
  };
  const through = async (label: string, meta: ActionMeta | undefined, fn: () => Promise<void>) => {
    net.calls.push(`${label}:${meta?.actionId}`);
    net.metas.push(meta);
    if (net.gate) {
      const gate = net.gate;
      net.gate = null;
      await gate;
    }
    if (net.mode === 'down') throw new DataError('network');
    if (net.mode === 'broken' || (net.mode === 'ack-broken' && label === 'ack')) throw new DataError('unknown');
    if (net.mode === 'server') throw new DataError('server_error');
    if (net.mode === 'auth') throw new DataError('not_staff');
    await fn();
    if (net.mode === 'lost') throw new DataError('network');
  };
  const staff: Pick<StaffApi, 'ackAlert' | 'startResponse' | 'resolveAlert'> = {
    ackAlert: (id, meta?: ActionMeta) => through('ack', meta, () => ds.staff.ackAlert(id, meta)),
    startResponse: (id, meta?: ActionMeta) => through('start', meta, () => ds.staff.startResponse(id, meta)),
    resolveAlert: (id, outcome, note, meta?: ActionMeta) => through('resolve', meta, () => ds.staff.resolveAlert(id, outcome, note, meta)),
  };
  const disk: { value: string | null } = { value: null };
  const storage: OutboxStorage = { get: () => disk.value, set: (v) => void (disk.value = v) };
  const clock = { now: 1_000_000 };
  const make = () => createOutbox({ staff, storage, now: () => clock.now, ...options });
  const login = async (name: 'diego' | 'ana' | 'marta') => (await ds.staff.signIn(`${name}@bar-esquina.test`, DEMO_PASSWORD)).id;
  const known = new Set<string>();
  const newAlert = async () => {
    const { token } = await ds.public.createAlert('ESQBF7K2', 'unsafe');
    const statuses: string[] = [];
    ds.public.watchAlert(token, (a) => a && statuses.push(a.status));
    // O alerta que ainda não era conhecido (dois criados no mesmo milissegundo não têm ordem garantida).
    const alert = (await ds.staff.listActiveAlerts()).find((x) => !known.has(x.id))!;
    known.add(alert.id);
    return { id: alert.id, statuses };
  };
  return { ds, net, disk, clock, make, login, newAlert, hold, staff, storage, outbox: make() };
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

  // ---------------------------------------------------------------- correções da revisão (18/11)

  it('o toque enviado na hora vai com espera zero; o guardado vai com o tempo de espera, e os dois dizem quem tocou', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    await s.outbox.perform({ kind: 'ack', alertId: id, userId: diego });
    expect(s.net.metas.at(-1)).toMatchObject({ queuedMs: 0, userId: diego });

    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'start', alertId: id, userId: diego });
    s.clock.now += 90_000;
    s.net.mode = 'up';
    await s.outbox.flush(diego);
    expect(s.net.metas.at(-1)).toMatchObject({ queuedMs: 90_000, userId: diego });
  });

  it('o toque que está sendo enviado não aparece como guardado sem sinal, mas já está gravado no aparelho', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    const release = s.hold();
    const tap = s.outbox.perform({ kind: 'start', alertId: id, userId: diego });
    await vi.waitFor(() => expect(s.net.calls).toHaveLength(1));
    // Em voo: a tela não pode dizer "sem sinal" nem mostrar o estado como se já valesse.
    expect(pendingFor(s.outbox.snapshot(), diego)).toHaveLength(0);
    // Mas o alarme precisa saber que a pessoa já tocou, para parar na hora.
    expect(sendingFor(s.outbox.snapshot(), diego, id).map((x) => x.kind)).toEqual(['start']);
    // Mas, se o app fechar agora, o toque não se perde.
    expect(JSON.parse(s.disk.value!).actions).toHaveLength(1);
    release();
    expect(await tap).toBe('sent');
    expect(pendingFor(s.outbox.snapshot(), diego)).toHaveLength(0);
    expect(sendingFor(s.outbox.snapshot(), diego)).toHaveLength(0);
    expect(JSON.parse(s.disk.value!).actions).toHaveLength(0);
  });

  it('login vencido com toque antigo guardado: o toque novo volta como erro de login, o antigo fica e o app é avisado', async () => {
    const lost: string[] = [];
    const s = setup({ onAuthLost: (userId) => lost.push(userId) });
    const diego = await s.login('diego');
    const a = await s.newAlert();
    const b = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'start', alertId: a.id, userId: diego });

    s.net.mode = 'auth';
    await expect(s.outbox.perform({ kind: 'start', alertId: b.id, userId: diego })).rejects.toMatchObject({ code: 'not_staff' });
    // O toque antigo continua guardado para quando a mesma pessoa entrar de novo; o novo não ficou.
    expect(pendingFor(s.outbox.snapshot(), diego).map((x) => x.alertId)).toEqual([a.id]);
    expect(s.outbox.snapshot().notices).toHaveLength(0);
    expect(lost).toEqual([diego]);
  });

  it('o login mudou no meio da rodada: o toque seguinte de quem saiu não é enviado', async () => {
    const current = { id: null as string | null };
    const s = setup({ currentUserId: () => current.id });
    const diego = await s.login('diego');
    current.id = diego;
    const { id } = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'ack', alertId: id, userId: diego });
    await s.outbox.perform({ kind: 'start', alertId: id, userId: diego });

    s.net.mode = 'up';
    s.net.calls.length = 0;
    const release = s.hold();
    const round = s.outbox.flush(diego);
    await vi.waitFor(() => expect(s.net.calls).toHaveLength(1));
    // O "Vi" do Diego está em voo; ele sai e a Ana entra no mesmo aparelho.
    current.id = null;
    const ana = await s.login('ana');
    current.id = ana;
    release();
    await round;
    expect(s.net.calls.map((c) => c.split(':')[0])).toEqual(['ack']);
    expect(pendingFor(s.outbox.snapshot(), diego).map((x) => x.kind)).toContain('start');
    expect((await s.ds.staff.getAlert(id))?.responderId).toBeNull();
  });

  it('mesmo sem a conferência do app, o servidor recusa o toque de quem não está logado, e ele fica guardado', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'start', alertId: id, userId: diego });
    await s.login('ana');
    s.net.mode = 'up';
    await s.outbox.flush(diego);
    expect(pendingFor(s.outbox.snapshot(), diego)).toHaveLength(1);
    expect(s.outbox.snapshot().notices).toHaveLength(0);
    const alert = await s.ds.staff.getAlert(id);
    expect(alert?.status).toBe('open');
    expect(alert?.responderId).toBeNull();
  });

  it('erro interno do servidor não gasta tentativa nem derruba os toques: eles saem quando o servidor volta', async () => {
    const s = setup({ maxAttempts: 2 });
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'ack', alertId: id, userId: diego });
    await s.outbox.perform({ kind: 'start', alertId: id, userId: diego });
    await s.outbox.perform({ kind: 'resolve', alertId: id, userId: diego, outcome: 'escorted' });

    s.net.mode = 'server';
    for (let i = 0; i < 6; i++) await s.outbox.flush(diego);
    expect(pendingFor(s.outbox.snapshot(), diego)).toHaveLength(3);
    expect(s.outbox.snapshot().notices).toHaveLength(0);

    s.net.mode = 'up';
    await s.outbox.flush(diego);
    expect(s.outbox.snapshot().actions).toHaveLength(0);
    expect((await s.ds.staff.getAlert(id))?.outcome).toBe('escorted');
  });

  it('o "Vi" automático recusado sai sozinho, sem aviso e sem derrubar o "Estou indo"', async () => {
    const s = setup({ maxAttempts: 2 });
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'ack', alertId: id, userId: diego });
    await s.outbox.perform({ kind: 'start', alertId: id, userId: diego });

    s.net.mode = 'ack-broken';
    await s.outbox.flush(diego);
    expect(s.outbox.snapshot().actions).toHaveLength(0);
    expect(s.outbox.snapshot().notices).toHaveLength(0);
    expect((await s.ds.staff.getAlert(id))?.responderId).toBe(diego);
  });

  it('tocar de novo num toque já guardado devolve o que aconteceu com ele: se foi recusado, volta como erro', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'start', alertId: id, userId: diego });
    // A Ana assume enquanto o Diego está sem sinal.
    await s.login('ana');
    await s.ds.staff.startResponse(id);
    await s.login('diego');

    s.net.mode = 'up';
    await expect(s.outbox.perform({ kind: 'start', alertId: id, userId: diego })).rejects.toMatchObject({ code: 'already_taken' });
    expect(s.outbox.snapshot().actions).toHaveLength(0);
  });

  it('dois toques iguais ao mesmo tempo, recusados: os dois voltam como erro (nenhum diz "enviado")', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    await s.login('ana');
    await s.ds.staff.startResponse(id);
    await s.login('diego');
    const results = await Promise.allSettled([
      s.outbox.perform({ kind: 'start', alertId: id, userId: diego }),
      s.outbox.perform({ kind: 'start', alertId: id, userId: diego }),
    ]);
    expect(results.map((r) => (r.status === 'rejected' ? (r.reason as DataError).code : r.value))).toEqual(['already_taken', 'already_taken']);
    expect(s.outbox.snapshot().notices).toHaveLength(0);
  });

  it('duas chamadas esperando o mesmo toque guardado, recusado: as duas voltam como erro', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'start', alertId: id, userId: diego });
    await s.login('ana');
    await s.ds.staff.startResponse(id);
    await s.login('diego');

    s.net.mode = 'up';
    const results = await Promise.allSettled([
      s.outbox.perform({ kind: 'start', alertId: id, userId: diego }),
      s.outbox.perform({ kind: 'start', alertId: id, userId: diego }),
    ]);
    expect(results.map((r) => (r.status === 'rejected' ? (r.reason as DataError).code : r.value))).toEqual(['already_taken', 'already_taken']);
  });

  it('toque feito com a tela desatualizada vai ao servidor como guardado: nem a gerência encerra por cima de quem assumiu', async () => {
    const s = setup();
    const marta = await s.login('marta');
    const { id } = await s.newAlert();
    // A tela da Marta não conseguiu ler o alerta; enquanto isso, a Ana assume.
    const ana = await s.login('ana');
    await s.ds.staff.startResponse(id);
    await s.login('marta');

    await expect(s.outbox.perform({ kind: 'resolve', alertId: id, userId: marta, outcome: 'false_alarm', stale: true })).rejects.toMatchObject({
      code: 'already_taken',
    });
    expect(s.net.metas.at(-1)?.queuedMs).toBeGreaterThan(0);
    const kept = await s.ds.staff.getAlert(id);
    expect(kept?.status).toBe('on_the_way');
    expect(kept?.responderId).toBe(ana);
  });

  it('o aviso de conflito diz quais outros toques caíram junto', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const { id } = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'start', alertId: id, userId: diego });
    await s.outbox.perform({ kind: 'resolve', alertId: id, userId: diego, outcome: 'escorted', note: 'ela disse X' });
    await s.login('ana');
    await s.ds.staff.startResponse(id);
    await s.login('diego');
    s.net.mode = 'up';
    await s.outbox.flush(diego);
    expect(noticesFor(s.outbox.snapshot(), diego)).toMatchObject([{ kind: 'start', reason: 'taken', alsoDropped: ['resolve'] }]);
  });

  it('o "Encerrar" da gerência guardado sem sinal não passa por cima de quem assumiu depois; com sinal, a gerência encerra', async () => {
    const s = setup();
    const marta = await s.login('marta');
    const { id } = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'resolve', alertId: id, userId: marta, outcome: 'false_alarm' });
    const ana = await s.login('ana');
    await s.ds.staff.startResponse(id);
    await s.login('marta');

    s.net.mode = 'up';
    await s.outbox.flush(marta);
    const kept = await s.ds.staff.getAlert(id);
    expect(kept?.status).toBe('on_the_way');
    expect(kept?.responderId).toBe(ana);
    expect(noticesFor(s.outbox.snapshot(), marta)).toMatchObject([{ kind: 'resolve', reason: 'taken' }]);

    // Com o alerta atual na tela (toque enviado na hora), a gerência continua podendo encerrar.
    expect(await s.outbox.perform({ kind: 'resolve', alertId: id, userId: marta, outcome: 'escorted' })).toBe('sent');
    expect((await s.ds.staff.getAlert(id))?.outcome).toBe('escorted');
  });

  it('a leitura da fila falhou ao abrir o app: nada é apagado, e a fila volta na rodada seguinte', async () => {
    const s = setup();
    const diego = await s.login('diego');
    const a = await s.newAlert();
    const b = await s.newAlert();
    s.net.mode = 'down';
    await s.outbox.perform({ kind: 'start', alertId: a.id, userId: diego });
    const saved = s.disk.value;

    let reads = 0;
    const flaky: OutboxStorage = {
      get: () => {
        if (reads++ === 0) throw new Error('disco ocupado');
        return s.storage.get();
      },
      set: (v) => s.storage.set(v),
    };
    const reopened = createOutbox({ staff: s.staff, storage: flaky, now: () => s.clock.now });
    await reopened.ready;
    // Não leu: a fila parece vazia, mas o que está no aparelho continua lá.
    expect(reopened.snapshot().actions).toHaveLength(0);
    expect(s.disk.value).toBe(saved);

    // Um toque novo sem sinal: a rodada lê de novo e junta os dois, o antigo primeiro.
    expect(await reopened.perform({ kind: 'start', alertId: b.id, userId: diego })).toBe('queued');
    expect(pendingFor(reopened.snapshot(), diego).map((x) => x.alertId)).toEqual([a.id, b.id]);
    expect(JSON.parse(s.disk.value!).actions).toHaveLength(2);
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
