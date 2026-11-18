# PDF da entrega

O `build-pdf.mjs` lê `Mariana_PDF.md` e gera dois arquivos nesta pasta:

- `Mariana_PDF.html`: a página completa, com CSS, fontes e logo embutidos;
- `Mariana_PDF.pdf`: o PDF em A4, impresso pelo Chromium do Playwright.

## Como regenerar

Na raiz do repositório:

```
node docs/pdf/build-pdf.mjs
```

O script usa o Playwright e as fontes que o pacote `web` já instala. Não há dependência nova. Se faltar o Chromium, rode `npx playwright install chromium` uma vez.

No fim, o terminal mostra o número de páginas e a lista do que ainda falta preencher, com a seção de cada item. Quando a lista sumir, o PDF está completo.

Opções, todas opcionais:

| Opção | Variável | Para quê |
| --- | --- | --- |
| `--in=arquivo.md` | `MD_IN` | outro Markdown de entrada |
| `--out-dir=pasta` | `PDF_OUT_DIR` | outra pasta de saída |
| `--imagens=pasta` | `IMAGENS_DIR` | outra pasta de imagens |
| `--repo=pasta` | `REPO_ROOT` | raiz do repositório, se o script estiver fora dele |
| `--capturas=1,2,9` | `CAPTURAS` | PNG dessas páginas em `capturas/`, mais `visao-geral.png` com todas (`todas` gera todas) |

## O que preencher

Tudo é editado em `Mariana_PDF.md`. Cada trecho marcado com `⬜ PREENCHER`, `⬜ IMAGEM` ou `⬜ CONFERIR` vira, no PDF, uma caixa tracejada em latão. Ao preencher, apague o marcador e o texto de instrução, e deixe só o conteúdo.

1. **Capa: turma e disciplina.** Na linha "Data de entrega", logo abaixo do título.
2. **Integrantes (seção 1).** Nome completo e RM na tabela, **em ordem alfabética pelo nome completo**. Apague as linhas que sobrarem. A capa lê essa mesma tabela, então basta preencher uma vez.
3. **Pesquisa de campo (seção 8).** As duas tabelas de conversa (quem e quando, o que foi perguntado, o que ouvimos, o que mudou na interface) e a conclusão logo abaixo.
4. **Estado da publicação (seção 9).** O trecho "⬜ CONFERIR": confirme o que foi publicado antes da entrega.
5. **Links (seção 10).** O link do repositório público e o link do vídeo-pitch.

## Imagens

Ponha as imagens na pasta `imagens/`, ao lado do script. O nome começa com o número da figura, com dois dígitos, na ordem em que os marcadores `⬜ IMAGEM` aparecem no Markdown:

| Arquivo | Figura |
| --- | --- |
| `imagens/01-pagina-do-qr-no-celular.png` | a página do QR no celular, com as três opções e o 190 e o 180 |
| `imagens/02-pagina-dela-depois-do-pedido.png` | a página dela depois do pedido, com a palavra-código e a linha do tempo |
| `imagens/03-app-com-o-alerta-novo.png` | o app da equipe com o alerta novo em latão, na lista de alertas |
| `imagens/04-quadro-ao-vivo-do-painel.png` | o quadro ao vivo do painel da gerência, com um alerta novo e os quatro controles |
| `imagens/05-antes-e-depois-do-visual.png` | antes e depois do visual |

Só o prefixo conta: `01-qualquer-nome.jpg` também serve. Aceita `.png`, `.jpg`, `.jpeg`, `.webp` e `.svg`. Com o arquivo na pasta, a imagem entra no lugar da caixa, o texto do marcador vira a legenda e a figura sai da lista de pendências. Mantenha o marcador `⬜ IMAGEM` no Markdown: é ele que diz onde a figura entra. Se inserir ou remover um marcador, a numeração das figuras seguintes muda junto.

Capturas de celular ficam lado a lado, até três por linha. Capturas largas ocupam a largura da página.
