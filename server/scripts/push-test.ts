// Teste do push de ponta a ponta, do PC, antes do deploy (sugestão da Central, 17/11/2026):
// manda um alarme direto ao FCM para o token de um aparelho, com a mesma
// mensagem que o servidor manda num alerta de verdade.
//
// Uso:  npm run push:test -w server -- <token-do-aparelho> [--repetir]
//       npm run push:test -w server -- --validar
//   - --validar: sem aparelho, pede ao FCM só para validar a mensagem (validate_only, num
//     tópico): confere a chave, a API ligada e o formato exato que o servidor manda;
//   - o token aparece nos Ajustes do app próprio, para quem é da gerência ("Teste do push");
//   - --repetir manda também as 5 repetições (20, 40, 60, 90 e 120 s), com o mesmo tag:
//     no celular, cada uma substitui a anterior em vez de empilhar;
//   - a chave vem de FCM_SERVICE_ACCOUNT_FILE (padrão D:/segredos/mariana/fcm-service-account.json).
// O script nunca mostra a chave; mostra só o resultado de cada envio.
import { ALARM_REPEAT_AT_S, type Alert } from '@nenm/shared';
import { createFcmSender, messageData, readServiceAccount } from '../src/push';

const args = process.argv.slice(2);
const validate = args.includes('--validar');
const token = validate ? 'validacao-sem-aparelho-0000000000' : args.find((a) => !a.startsWith('--'));
const repeat = args.includes('--repetir');
if (!token || !/^[A-Za-z0-9_:-]{20,4096}$/.test(token)) {
  console.error('Uso: npm run push:test -w server -- <token-do-aparelho> [--repetir]');
  process.exit(2);
}

const file = process.env.FCM_SERVICE_ACCOUNT_FILE ?? 'D:/segredos/mariana/fcm-service-account.json';
const account = readServiceAccount(file);
const sender = createFcmSender({ account, validateOnly: validate ? { topic: 'mariana-validacao' } : undefined });

// Um alerta de mentira, só com o que a mensagem usa. O id vira o tag da notificação.
const alert = {
  id: `teste-${Date.now()}`,
  kind: 'unsafe',
  spotLabel: 'Teste do push',
  assignedByName: null,
} as unknown as Alert;

async function sendOnce(again: boolean): Promise<void> {
  const result = await sender.send({ token: token!, data: messageData(alert, 'new', again) });
  console.log(`${new Date().toLocaleTimeString('pt-BR')}  ${again ? 'repetição' : 'primeiro aviso'}: ${result}`);
  if (result === 'invalid_token') {
    console.error('O FCM recusou o token: app desinstalado, dados apagados, token de outro projeto ou texto que não é token.');
    process.exit(1);
  }
}

if (validate) {
  // Os dois formatos que o servidor manda: o alerta novo (e a repetição) e o designado.
  for (const [why, again] of [['new', false], ['new', true], ['assigned', false]] as const) {
    const result = await sender.send({ token, data: messageData(alert, why, again) });
    console.log(`validação (${why}${again ? ', repetição' : ''}): ${result === 'ok' ? 'o FCM aceitou a mensagem' : result}`);
    if (result !== 'ok') process.exit(1);
  }
  process.exit(0);
}

console.log(`Projeto ${account.project_id}. Feche o app e bloqueie a tela antes de o aviso chegar.`);
await sendOnce(false);
if (repeat) {
  let last = 0;
  for (const s of ALARM_REPEAT_AT_S) {
    await new Promise((r) => setTimeout(r, (s - last) * 1000));
    last = s;
    await sendOnce(true);
  }
}
