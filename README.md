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
- **Setores dono:** os setores de cada área, uma linha por área, no formato "Área: Setor A, Setor B". Use quando uma área tem mais de um gestor. A área com setores ganha o campo "Setor dono" no cadastro e o filtro por setor na fila.

## O que cada solução guarda

Além do nome, do que ela faz e das notas, cada solução guarda o que precisa para decidir e acompanhar. Tudo é
preenchido em **Editar**. A seção 07 da página explica cada regra em detalhe.

- **Código:** um apelido curto, como "VE-02". Aparece antes do nome, funciona na busca e não pode se repetir.
- **Setor dono:** um ou mais setores da área que cuidam da solução. O campo só aparece quando a área tem setores em
  Configurações, e a fila ganha um filtro por setor.
- **Situação:** no roadmap, aguardando decisão, em execução, implantada ou arquivada. Cada situação tem a sua seção
  na página, e os botões de cada solução a levam de uma para outra.
- **Aguardando decisão:** quem decide, o que falta decidir e desde quando. A solução parada há mais de 30 dias fica
  em vermelho.
- **Em execução e implantada:** o responsável, a previsão de entrega, a data real de início, a data real de
  implantação, a meta e o resultado medido. Ao marcar uma solução, o app usa a data de hoje, e você troca pela data
  real se ela for outra.
- **Depende de:** as soluções que precisam estar implantadas antes. Enquanto a base não estiver implantada, a
  solução fica travada. A solução de que outras dependem ganha o selo "Base de N soluções" e sobe na fila.
- **Processos:** os processos que a solução ataca, um por vez, com quem executa, quantas vezes e quantos minutos. As
  horas de todos são somadas no valor em reais.
- **Tempo de quem opera depois:** quantas horas por semana a solução vai pedir de cada função depois de implantada,
  para aprovar, conferir ou corrigir. O app soma esse tempo por função nas soluções em execução e implantadas e
  avisa, ao iniciar uma solução, se alguma função passa do limite de horas por semana (seção 03).
- **Dado pessoal:** se a solução trata nenhum dado pessoal, dado pessoal ou dado sensível (como saúde), e qual.
  Com dado sensível, a solução fica travada até alguém aprovar a regra de quem pode ver o quê. Essa aprovação tem
  nome e data e só é feita pela tela: a importação não a muda.
- **Até onde o agente vai:** prepara e uma pessoa faz; sugere e uma pessoa aprova antes; faz e uma pessoa confere
  depois; ou faz sozinho. Também diz o que fica sempre com uma pessoa. Se o agente faz sozinho numa solução com a meta
  Risco, o app pede confirmação ao iniciar.

**Classificar com IA** preenche as metas, as quatro notas de facilidade, a natureza, as quatro checagens e a
justificativa, e mostra o motivo de cada item ao passar o mouse. Ela substitui o que já estiver marcado nesses campos,
mas nada é gravado antes de você clicar em Salvar. Os outros campos ficam com você. Preencha antes o dado pessoal, até
onde o agente vai e o "Depende de": a IA lê esses três campos e, sem eles, deixa a checagem de regras em no máximo
"parcial".

## Como a nota e a fila são calculadas

Para cada solução, o app responde a duas perguntas: **vale a pena?** e **dá para fazer agora?** Depois, junta as duas
respostas e monta uma fila, da primeira solução a fazer até a última. A seção 07 da página mostra o mesmo, de forma
resumida.

### 1. A solução ajuda em alguma meta?

São seis metas. As três primeiras pesam mais: aumentar a receita, diminuir o custo e aumentar a margem. As outras três
servem de desempate: diminuir o risco, aumentar a produtividade e aumentar o valor da empresa.

Se a solução não ajuda em nenhuma delas, ela vai para "Abandonar", e o resto do cálculo nem importa.

### 2. Facilidade, de 0 a 10

Pense numa prova que vale 10 pontos. A solução ganha pontos por cada coisa de que ela **não** precisa. São quatro
perguntas:

| A solução precisa de... | Não precisa | Precisa em parte | Precisa |
|---|---|---|---|
| Gente fazendo trabalho na mão para ela continuar funcionando? (Manual) | 4 | 2 | 0 |
| Tecnologia ou ligação entre sistemas que a empresa ainda não tem? (Infra) | 3 | 1,5 | 0 |
| Gente técnica para ajustar e consertar depois? (Técnico) | 2 | 1 | 0 |
| Que as pessoas mudem o jeito de trabalhar? (Cultura) | 1 | 0,5 | 0 |

A nota é a soma. **Exemplo:** uma solução não precisa de trabalho na mão (4), precisa de uma peça nova de tecnologia
(1,5), precisa de alguém ajustando de vez em quando (1) e não muda a rotina de ninguém (1). A nota é 4 + 1,5 + 1 + 1 =
**7,5**.

O trabalho na mão vale mais pontos porque é o que mais derruba uma solução: se alguém precisa alimentá-la todo dia,
ela para quando essa pessoa sai de férias.

Duas coisas **não** tiram pontos do Manual. A primeira é a conferência que a lei ou a segurança exige, que fica na
checagem de regras. A segunda é o trabalho que as pessoas fazem com o resultado, como o vendedor que liga para o
cliente indicado. Esse tempo entra no valor em reais (item 7): quem cadastra o desconta ao escolher o % do tempo
eliminado.

O que conta como "em parte" em cada pergunta está na seção 07 da página ("Como dar cada nota"). A IA do app usa a
mesma régua.

### 3. Valor: alto, médio ou baixo

Quem cadastra diz quanto a solução devolve à empresa: valor alto, médio ou baixo. Um selo mostra de onde veio essa
resposta: medido, informado, estimado ou só uma hipótese. Se o ganho em reais já foi calculado e o perfil da empresa
tem os limites (seção 06), o app sugere o nível. Por exemplo: a partir de R$ 5.000 por mês é alto, e a partir de
R$ 1.000 é médio.

### 4. A faixa: valor × facilidade

Uma solução é **fácil** quando a nota é 7 ou mais. Cruzando o valor com a facilidade, sai a faixa:

| Valor | Fácil (7 a 10) | Difícil (abaixo de 7) |
|---|---|---|
| Alto | Começar já | Planejar como projeto |
| Médio | Próxima onda | Avaliar com cuidado |
| Baixo | Se sobrar tempo | Abandonar |

**Exemplo:** a solução nota 7,5 com valor médio fica em "Próxima onda".

Sem valor informado, a solução conta como valor médio na ordem, e a faixa sai só da nota: de 9 a 10 é "Começar já";
de 7 a 8,5, "Próxima onda"; de 5 a 6,5, "Avaliar com cuidado"; abaixo de 5, "Projeto estrutural".

### 5. Travas

Uma trava é um problema que precisa ser resolvido antes de começar, por mais alta que seja a nota. Com trava, quem
estaria em "Começar já" vai para "Destravar antes". As travas são:

- a solução, na verdade, é organizar o processo;
- só uma pessoa sabe fazer o processo;
- uma checagem falhou (dado, integração, qualidade ou regra);
- ninguém confirmou se há regra legal;
- a solução trata dado sensível e ainda não tem a regra de quem pode ver o quê;
- a solução depende de outra que ainda não foi implantada.

### 6. A ordem da fila

Funciona como a tabela de um campeonato: primeiro contam os pontos e, no empate, o saldo de gols, e assim por diante.
Aqui, a ordem é esta:

1. O valor: alto antes de médio, e médio antes de baixo.
2. Quantas soluções da fila dependem desta. A solução que é base de outras vem antes.
3. A faixa.
4. A nota de facilidade.
5. Quantas metas principais (receita, custo, margem) ela atinge.
6. O ganho em reais no cenário conservador.

### 7. O valor em reais

São três contas, uma depois da outra:

1. **Horas por mês (carga)** = vezes por mês × minutos de cada vez ÷ 60. Se a tarefa acontece por semana, multiplique
   por 4,3, que é o número de semanas de um mês. Se acontece por dia, multiplique pelos dias de trabalho no mês (21, se
   ninguém informar). Se a solução cobre vários processos, as horas são somadas.
2. **Custo de hoje** = horas por mês × quanto custa uma hora de quem faz + horas de supervisão por mês × quanto custa
   uma hora de quem supervisiona. A solução nunca economiza mais do que isso.
3. **Ganho** = custo de hoje × % do tempo que a solução elimina − quanto a solução custa por mês. A conta é feita duas
   vezes: com um % conservador (pessimista) e com um % provável. A página mostra o conservador primeiro.

**Exemplo:** uma tarefa acontece 20 vezes por semana e leva 15 minutos.
- Por mês: 20 × 4,3 = 86 vezes. São 86 × 15 = 1.290 minutos, ou 21,5 horas.
- Custo de hoje: 21,5 h × R$ 40 = R$ 860, mais 2 h de supervisão × R$ 80 = R$ 160. O total é **R$ 1.020** por mês.
- Ganho conservador, eliminando 50% do tempo, com a solução custando R$ 200 por mês: R$ 1.020 × 50% − R$ 200 = **R$ 310**
  por mês.
- Ganho provável, eliminando 70%: R$ 714 − R$ 200 = **R$ 514** por mês.

A receita nova que a solução pode trazer é anotada à parte. Ela nunca é somada a essa conta, porque é mais difícil de
provar.

### 8. A prontidão da empresa

A empresa recebe uma nota de 1 a 5 em seis pontos, e cada um tem um peso. A prontidão é a média com esses pesos:
cada nota é multiplicada pelo seu peso, e os resultados são somados.

| Ponto | Peso | Exemplo de nota | Conta |
|---|---|---|---|
| Dados | 25% | 3 | 0,75 |
| Sistemas e integrações | 20% | 3 | 0,60 |
| Time técnico | 20% | 2 | 0,40 |
| Processos | 15% | 3 | 0,45 |
| Orçamento | 10% | 2 | 0,20 |
| Cultura | 10% | 4 | 0,40 |
| **Prontidão** | | | **2,80** |

Até 2,0, cuide primeiro da base: dados, sistemas e processos. Acima de 2,0 e até 3,5, faça uma solução de cada vez,
começando pelas mais simples e de menor risco. Acima de 3,5, dá para fazer mais de uma ao mesmo tempo. Qualquer ponto
com nota 1 é um bloqueio, mesmo que a média seja boa.

## Prompts da IA

Os prompts ficam em `public/index.html`, nas funções `promptIA` (classificar uma solução), `promptReavaliar` (reavaliar com as suas justificativas) e `promptRecalc` (revisar todas com o perfil da empresa). Eles usam os blocos `perfilTexto`, `REGRAS`, `processoTexto`, `contextoTexto`, `FORMATO_V2` e `FORMATO_MOTIVOS`. O texto é o mesmo para todos os provedores. Depois de editar, basta recarregar a página.

- **Réguas:** `REGRAS` diz o que vale 1, 0,5 e 0 em cada uma das quatro notas.
- **Contexto da solução:** `contextoTexto` manda até onde o agente vai, o dado pessoal e as soluções de que ela depende. A dependência não baixa nota, porque o app já trava a solução até a base ser implantada.
- **Perfil da empresa (seção 06):** além da régua e dos sistemas marcados, a IA usa três campos de texto. "O que já funciona e o que ainda não está ligado" entra na nota Infra: o que já funciona não conta como peça nova. "Como as pessoas trabalham hoje" entra na nota Cultura e "Exigências legais do negócio", na checagem de regras.
- **Exemplos:** ao classificar uma solução, a IA vê 8 já classificadas, até 5 da mesma área, espalhadas da menor à maior nota, com a natureza e a justificativa.
- **Revisar todas:** "Recalcular notas com o perfil" manda as soluções em partes de 12 (`LOTE_RECALC`). Se uma parte falhar, as outras seguem, e a tela diz quantas ficaram sem revisão.

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
