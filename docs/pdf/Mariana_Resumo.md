<!-- pdf: capa=compacta; topo=Mariana · Funcionalidades e tecnologias -->

# Funcionalidades e tecnologias

**Pedido de ajuda discreto em bares e casas noturnas, da mulher à equipe, em tempo real**

A mulher lê o QR code do local e pede ajuda pela web, sem login e sem instalar nada. A equipe recebe o alerta com alarme no app. A gerência acompanha tudo no painel web. Estados do alerta: Novo, Visto, A caminho e Encerrado (resolvido ou cancelado).

Site: https://naoenao.obrian.me · Testar o app: https://naoenao.obrian.me/testar · Repositório: https://github.com/BrianTKK/nao-e-nao-na-mao

## 1. A mulher: página web pelo QR code

<!-- colunas: 24%, 76% -->
| Funcionalidade | O que faz |
| --- | --- |
| Abrir sem nada | O QR code do local abre `/q/<código>` no navegador. Sem login, sem cadastro, sem instalar app. O código identifica o local (banheiro, mesa, balcão). |
| Pedir em um toque | Três opções de mesmo peso: "Estou me sentindo insegura", "Quero sair daqui com segurança" e "Quero falar com alguém da equipe". Ao lado, ligação para o 190 e o 180. |
| Palavra-código | A página mostra uma palavra (lista de 62 palavras comuns, sem duplo sentido). Quem vier da equipe diz essa palavra: é a prova de que é da equipe. |
| Acompanhar ao vivo | Linha do tempo: "Pedido enviado", "A equipe viu", "A caminho", "Encerrado". Mostra quem vem e a roupa: "Diego, de camisa preta, está indo até você". |
| Cancelar | Cancela com confirmação na própria tela, sem janela do navegador. |
| Discrição | Sem logo. O título da aba é só o nome do bar. A tela pode virar o cardápio do próprio local ou o Wi-Fi do local, se o bar cadastrou; Voltar e Esc retornam. |
| Sem sinal | Se o tempo real cair, a página consulta o servidor a cada 3 segundos. Se a conexão cair, mostra um cartão para levar ao balcão. |

## 2. A equipe: app (Android e iPhone)

<!-- colunas: 24%, 76% -->
| Funcionalidade | O que faz |
| --- | --- |
| Entrar | Login com a conta criada pela gerência. O app só mostra os alertas do próprio bar. O estado da conexão fica sempre visível. |
| Alarme | Toca no volume de alarme, vibra e repete por 2 minutos (20, 40, 60, 90 e 120 s) até alguém ver. No APK Android, chega com o app minimizado ou fechado, por push. A palavra-código nunca vai na notificação. |
| Lista de alertas | O alerta novo é o único tíquete em latão e pulsa até alguém ver. |
| Detalhe do alerta | Local, tipo de pedido, tempo correndo e "Diga esta palavra a ela". Abrir marca "Visto" sozinho e cala o alarme daquele alerta. |
| Estou indo | Botão de 64 px numa barra fixa, ao alcance do polegar. A página dela e o painel mudam na hora. |
| Encerrar | Folha com 7 desfechos (ex.: "Acompanhei até um lugar seguro ou até o carro", "Acionamos o 190", "Alerta indevido"). |
| Designado pela gerência | Mostra "Marta pediu que você vá" e vibra de novo. |
| Fila sem sinal | "Visto", "Estou indo" e "Encerrar" ficam guardados e saem quando o sinal volta, sem duplicar. A tela mostra "Sem sinal: vai enviar quando voltar" e "A caminho, ainda não enviado". Conflito não sobrescreve quem assumiu; toque com mais de 12 horas é descartado, com aviso. |
| Ajustes | "Como você está vestido hoje?" (aparece na página dela), "Reduzir movimento" e "Testar o alarme". A gerência também cadastra o cardápio pelo app (fotos ou link). |

## 3. A gerência: painel web (`/painel`)

<!-- colunas: 24%, 76% -->
| Seção | O que faz |
| --- | --- |
| Início | Quadro ao vivo: cada alerta, quem está indo e o tempo correndo. O cartão acende a cada troca de estado. O painel bipa enquanto houver alerta que ninguém viu. Números dos últimos 30 dias, alertas por local e como terminaram. |
| Ações no quadro | "Vi o alerta", "Mandar alguém" (avisa só aquela pessoa no app), assumir ela mesma ("Estou indo") e "Encerrar". |
| Alertas | Histórico, com busca por palavra-código, local e desfecho. |
| Equipe | Cadastra e desativa pessoas, com a data do curso do protocolo. Quem é desativado perde o acesso e o tempo real na hora. |
| QR codes | Código aleatório de 10 caracteres por local, troca de código (o antigo para de valer) e cartazes A4 para imprimir, dois por folha. |
| Cardápio e Wi-Fi | Fotos ou PDF do cardápio (as páginas viram imagens), link do cardápio digital e o Wi-Fi do local: é o disfarce da página dela. |
| Relatório do mês | Acionamentos, tempo até ver e até ir (mediana e 9 em cada 10), tipo, local, desfecho, equipe capacitada e o registro de cada pedido. Imprime ou salva em PDF. |

## 4. Integração entre as partes

Um servidor próprio guarda os dados e avisa cada tela por WebSocket (Socket.IO), na sala certa: uma por bar, uma por pedido e uma por pessoa da equipe.

<!-- colunas: 30%, 70% -->
| Ação | Onde aparece |
| --- | --- |
| Ela pede ajuda (web) | App: alarme e alerta novo. Painel: cartão em latão e bipe. No APK, push pelo Firebase. |
| A equipe abre o alerta (app) | Página dela: "A equipe viu o seu pedido". Painel: "Visto". O push para de repetir. |
| A gerência manda alguém (web) | App da pessoa: "Marta pediu que você vá". Página dela: "Chamamos Diego, de camisa preta, para ir até você." |
| A equipe toca em "Estou indo" (app) | Página dela: "Diego, de camisa preta, está indo até você". Painel: "A caminho" e o tempo correndo. |
| Encerrar, no app ou no painel | Página dela: "Pedido encerrado". Painel: sai do quadro e vai ao histórico e ao relatório. |
| Ela cancela (web) | O cancelamento chega ao app e ao painel e some do quadro. |

- **Tempo real:** medida única em produção (16/11/2026): o pedido chegou ao app e ao painel em 69 ms, e o "Estou indo" voltou à página dela em 99 ms.
- **Push:** no APK Android, o servidor envia direto ao Firebase Cloud Messaging e repete 5 vezes em 2 minutos até alguém ver. Testado num celular em 18/11/2026: app fechado, tela bloqueada, alerta pelo QR code, e o toque na notificação abriu o alerta e marcou "Visto".
- **Sem sinal:** cada toque guardado tem um id, e o servidor aplica cada id uma vez só.
- **Quem vê o quê:** a página dela só lê o próprio pedido, por um token aleatório (o banco guarda só o hash). Equipe e gerência entram com senha (bcrypt) e token que vence em 16 horas, e só enxergam o próprio bar. Rotas da gerência exigem o papel `manager`.
- **Proteções:** limite de pedidos por local, por bar e por IP, e de login por IP; validação de toda entrada; cabeçalhos de segurança, CSP e CORS fechado; contêiner sem root.

## 5. Tecnologias

Versões lidas nos `package.json` do repositório, no `Dockerfile` e no `docker-compose.yml`.

<!-- colunas: 15%, 37%, 48% -->
| Parte | Tecnologia e versão | Papel |
| --- | --- | --- |
| App | React Native 0.88.1, Expo SDK 58, Expo Router 58 | App da equipe, com navegação por arquivos; roda no Expo Go ou como APK Android próprio |
| App | Reanimated 4.7.1, expo-haptics 58, expo-notifications 58.1.9, AsyncStorage 2.2.0 | Motion (pulso, troca de estado), toque háptico, alarme e push, fila sem sinal e login guardados no aparelho |
| Web | React 19.3.0, Vite 8.3, React Router 7.18 | Página do QR e painel da gerência, com CSS próprio a partir dos tokens |
| Web | qrcode 1.5, pdfjs-dist 5.7 | Gera os QR codes dos cartazes; converte o PDF do cardápio em imagens |
| Compartilhado | TypeScript 6.0 (shared, server, mobile) e 7.0 (web); pacote `@nenm/shared` | Tipos, textos, regras, tokens visuais e camada de dados comuns à web e ao app; socket.io-client 4.8 |
| Servidor | Node 24, Express 5.3, Socket.IO 4.8 | API em `/api`, tempo real em `/socket.io` e a web compilada, na mesma origem |
| Servidor | zod 4.6, bcryptjs 3.0, jose 6.2, helmet 8.3, express-rate-limit 8.7 | Validação de entrada, senhas em hash, tokens de login (JWT) e assinatura do acesso ao Firebase, cabeçalhos de segurança, limite por IP |
| Banco | PostgreSQL 17 (pg 8.23); PGlite 0.5.16 | Banco de produção; PGlite é o PostgreSQL embutido usado no PC e nos testes do banco e do servidor |
| Push | Firebase Cloud Messaging (HTTP v1) | Alerta com o app fechado no APK Android, enviado direto do servidor |
| Publicação | Docker Compose (app, Expo e banco) e Nginx | Servidor próprio com HTTPS e WebSocket; o Expo Go público e o APK saem do mesmo domínio |
| Testes | Vitest 5.1, node:test com tsx 4.23, Playwright 1.64 (Chromium), axe-core 4.14 | 167 testes automáticos; verificadores de reflow, acessibilidade (axe, teclado, texto a 200%) e fila sem sinal |

**Testado** (18/11/2026): 167 testes automáticos e o typecheck; reflow sem rolagem lateral de 195 a 1440 px (90 verificações); axe em 60 telas e tamanhos e 604 passos só com teclado na web; 463 verificações de acessibilidade no app pelo navegador; 28 da fila sem sinal; o alarme num celular real. **Não testado:** leitor de tela de verdade (TalkBack, VoiceOver, NVDA), a fila sem sinal e o motion em celular real, push no iPhone (não existe nesta entrega), Firefox e Safari, usuárias e bares reais.
