# Soluções de IA

App local para cadastrar, classificar e priorizar as soluções de IA de uma empresa, por área. Ele roda no próprio computador, guarda os dados numa pasta local e usa a IA do provedor que você escolher, com a sua chave de API.

Licença: [MIT](LICENSE). Desenvolvido por 3Value Brasil Tecnologia Dados Negócios LTDA - Leandro Nogueira.

As seções 01 a 07 da página principal podem ser recolhidas e expandidas: uma a uma, clicando no título, ou todas de uma vez, pelos botões acima da seção 01. O navegador lembra quais ficaram recolhidas.

## Como abrir

No Windows, dê dois cliques em `iniciar.cmd`.

- Na primeira vez, ele instala a dependência (o SDK da Anthropic).
- Depois, abre o navegador em http://localhost:5180.
- Para fechar o app, feche a janela preta.

Em outro sistema, rode `npm install` e depois `npm start`, e abra http://localhost:5180.

Só o próprio computador acessa esse endereço: o servidor escuta apenas em `127.0.0.1`. Para usar outra porta, defina a variável de ambiente `PORT`.

Requisito: Node.js 20 ou mais novo.

## Chaves de API

O app lê as chaves do arquivo `.env`, na pasta do app.

1. Copie `.env.example` para `.env`, se ele ainda não existir.
2. Preencha só a linha do provedor que for usar.
3. Clique em **Configurações → Testar conexão**. Não precisa reiniciar o app.

| Provedor | Variável |
|---|---|
| Anthropic (Claude) | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Google Gemini | `GEMINI_API_KEY` ou `GOOGLE_API_KEY` |
| Compatível com OpenAI (OpenRouter e outros) | `OPENAI_COMPAT_API_KEY` |

Ollama e LM Studio rodam no próprio computador e não precisam de chave.

O `.env` está no `.gitignore`. Não o envie para nenhum repositório nem o compartilhe. O `.env.example`, sem valores, é o modelo que acompanha o app.

Também dá para colar uma chave em **Configurações → Usar nesta sessão**. Ela fica só na memória do servidor e some quando ele é fechado. Nada é gravado em disco.

O navegador nunca recebe a chave: quem fala com o provedor é o servidor local.

## Configurações (botão no topo da lista)

- **IA:** escolha o provedor, o modelo e o esforço.
  - "Testar conexão e listar modelos" consulta a lista de modelos da conta. Essa consulta não gera custo.
  - Com o Claude, o app usa o SDK oficial. Nos modelos que aceitam, ele liga o fallback do servidor (`fallbacks: "default"`), que tenta outro modelo quando o filtro de segurança recusa o pedido.
- **Empresa e logo:** o nome da empresa e as logos dos modos claro e escuro (PNG, JPG, WebP, GIF ou SVG, até 2 MB). Sem logo própria no modo escuro, vale a do modo claro. Sem nenhuma logo, aparece a logo padrão do app.
- **Áreas:** a lista de áreas sugeridas no cadastro, uma por linha, na ordem de exibição. Também dá para digitar uma área nova direto no cadastro de uma solução.

## Prompts da IA

Os prompts ficam em `public/index.html`, nas funções `promptIA` (classificar uma solução), `promptReavaliar` (reavaliar com as suas justificativas) e `promptRecalc` (revisar todas com o perfil da empresa). Eles usam os blocos `perfilTexto`, `REGRAS`, `processoTexto`, `FORMATO_V2` e `FORMATO_MOTIVOS`. O texto é o mesmo para todos os provedores. Depois de editar, basta recarregar a página.

## Exemplos ou do zero

Na primeira vez que o app abre, o banco está vazio e ele pergunta como começar:

- **Carregar os exemplos:** 25 soluções de IA de várias áreas, já classificadas, para ver o app funcionando. Elas vêm de `exemplos/solucoes.json` e podem ser editadas ou apagadas como qualquer outra.
- **Começar do zero:** o app abre sem soluções, para você cadastrar as suas.

Depois, as duas opções ficam em **Configurações → Soluções**:

- "Carregar os exemplos" acrescenta os que faltam e não mexe nos que já estão no banco.
- "Apagar todas as soluções" mantém o perfil da empresa e as configurações, e antes guarda uma cópia do banco em `data/backups/antes-de-apagar-<data e hora>.json`.

## Importar soluções

Em **Configurações → Importar soluções**, escolha um arquivo CSV ou JSON. O app pode estar aberto.

- **CSV:** use as colunas que a página mostra. "Colunas e valores aceitos", na mesma tela, lista cada coluna, os valores que ela aceita e o campo correspondente no JSON. "Baixar modelo CSV" traz o cabeçalho e uma linha de exemplo. O CSV de "Exportar CSV" também serve: exporte, mude o que quiser numa planilha e importe de volta.
- **JSON:** uma lista de soluções com os nomes internos dos campos (`nome`, `setor`, `codigo`, `notas`...), ou um objeto com a lista em `solucoes`. Na nota, `tecnico` vale como `dados`.
- **Como a solução é achada:** pelo `id`, no JSON, ou pelo código. Sem uma solução igual, ela entra como nova no roadmap.
- **O que muda:** no CSV, a célula vazia mantém o valor atual. As colunas calculadas (facilidade, faixa, carga, ganho) são ignoradas. A importação não muda a situação das soluções nem a aprovação da regra de acesso.
- **Antes de gravar,** a tela mostra o que entra, o que muda e o que tem erro. Com qualquer erro, nada é gravado. Ao gravar, o app guarda uma cópia do banco em `data/backups/antes-de-importar-<data e hora>.json`.

## Dados

| Arquivo | Conteúdo |
|---|---|
| `data/db.json` | Soluções, perfil da empresa e configurações |
| `data/backups/db-AAAA-MM-DD.json` | Cópia do banco antes da primeira alteração de cada dia. O app guarda as últimas 30. |
| `data/logo-light.bin`, `data/logo-dark.bin` | Logos enviadas |

A pasta `data/` é criada na primeira vez que o app abre e fica fora do controle de versão. Para zerar tudo, inclusive o perfil e as configurações, feche o app e apague `data/db.json`. Na próxima abertura, ele volta a perguntar como começar.

## Arquivos

| Arquivo | Função |
|---|---|
| `server.js` | Servidor local: página, API do banco, logos e IA |
| `lib/llm.js` | Chamadas a Anthropic (SDK), OpenAI, Gemini e APIs compatíveis |
| `lib/store.js` | Banco em JSON, com gravação atômica e backup diário |
| `lib/env.js` | Leitura do `.env`. Só lê: não grava nem registra valores. |
| `public/index.html` | A página e os prompts |
| `public/local.js` | Ponte entre a página e o servidor, e a tela de Configurações |
| `public/assets/` | Logo padrão do app (modos claro e escuro) |
| `exemplos/solucoes.json` | As 25 soluções de exemplo |
| `.env.example` | Modelo do `.env`, sem valores |
| `iniciar.cmd` | Atalho de abertura no Windows |
