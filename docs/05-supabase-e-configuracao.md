# 05 — Supabase, configuração e mudanças seguras

[Índice](README.md) · [Modelo e autorização](04-banco-de-dados.md) · [Operação e incidentes](08-operacao-privacidade-e-suporte.md)

## 1. Objetivo e limites deste guia

Este capítulo separa **configuração declarada**, **ferramentas disponíveis**, **estado implantado** e **evidência de validação**. Um SQL correto no disco não prova que foi aplicado; um build válido não prova que Auth, RPC e Storage estão disponíveis; `config.toml` não é um espelho automático da configuração cloud.

O produto atual MatchUp 3.3.3 usa PWA/cliente estático + Supabase e conserva os contratos de backend da 3.3.1; a abertura opcional, assim como o patch responsivo anterior, não exige nova migração. Não requer iniciar o servidor Node/SQLite legado para operar. Este texto deriva da inspeção dos fontes, complementada pela campanha 3.3.1: migração de laboratório instalada com preservação, testes, build e publicação registrados nos capítulos [07](07-testes-e-validacao.md) e [13](13-historico-de-releases.md). **Nenhum reset de conta real foi executado.** Os demais procedimentos são instruções para manutenção autorizada, não operações automaticamente realizadas na revisão.

> **Regra principal:** nunca reaplicar migrações antigas sobre o banco atual para “garantir que está atualizado”. `CREATE OR REPLACE FUNCTION` pode substituir uma implementação nova por uma antiga, mesmo quando tabelas/dados não são apagados. Não usar `setup-supabase.js`, reset de banco ou seed de demonstração como procedimento de produção.

O script histórico `setup-supabase.js` exige a variável de ambiente `SUPABASE_DB_PASSWORD` e encerra sem conectar quando ela não está definida. Ele não carrega `.env` automaticamente. Somente um operador autorizado deve fornecer a credencial por um mecanismo local seguro; nunca a inclua no código, em comandos compartilhados ou em commits.

## 2. Fronteiras de configuração e credenciais

```text
Navegador / PWA / pacote cliente
  URL pública + chave anon/publicável + sessão individual
          │ Auth valida JWT
          ▼
Supabase API → RPC autenticada → guardas de domínio → PostgreSQL
          │
          └→ Storage público (fotos) / privado (materiais)

Operador autorizado — canal separado, não distribuído
  conexão administrativa PostgreSQL / Management API
          └→ ferramenta específica e mudança previamente revisada
```

| Informação | Onde pode aparecer | O que não significa |
|---|---|---|
| URL pública do Supabase | Configuração do SDK cliente | Credencial de banco |
| Chave `anon` ou publicável | Bundle cliente aprovado; é projetada para cliente público | Papel administrativo. Não dispensa Auth, grants e RLS |
| Access/refresh token de usuário | Sessão gerida pelo cliente; nunca anexar em chamado/log público | Segredo que possa ser compartilhado com suporte |
| `service_role` / secret key | Somente ambiente administrativo autorizado, se necessário à ferramenta | Chave aceitável no HTML, APK, `www` ou repositório |
| URI/senha de conexão PostgreSQL | Segredo operacional, limitado à rotina administrativa | Variável a colocar no frontend para “resolver RPC” |
| Access token da Management API | Somente rotina de configuração autorizada | Credencial de login do participante |
| Código de grupo | Compartilhamento intencional pelo organizador, por canal controlado | Senha de conta ou acesso que ignore lotação/restrição |
| URL assinada de material | Link temporário de acesso; não incluir em log público | URL inofensiva só porque expira |

Não copiar arquivos `.env` para documentação, anexos ou distribuição; não imprimir valores em troubleshooting. Usar gerenciador de segredos/processo seguro da organização e exemplos com placeholders. Não confundir o hostname público com autorização para descobrir participantes reais.

O código contém referências ao projeto atual no cliente, na validação SQL de fotos e em ferramentas de readiness. Uma troca de projeto exige revisão coordenada dessas referências. Relaxar a constraint de foto para aceitar qualquer URL elimina a garantia de origem/propriedade; não é uma solução de configuração.

## 3. Auth: intenção local versus configuração real

### 3.1 O que diz `supabase\config.toml`

O arquivo local usa identificador histórico de piloto e declara `auth.email.enable_confirmations = false`. Isso expressa a intenção do piloto de não depender de confirmação de e-mail. **Não prova** qual configuração está ativa no Supabase hospedado nem que o endereço do participante foi verificado.

Cadastro funcionando sem confirmação não comprova entregabilidade, recuperação de senha, SMTP próprio ou propriedade do e-mail. A elegibilidade acadêmica verifica idade a partir de `profiles.birth_date`; não verifica matrícula ou identidade civil.

### 3.2 O que `tools\auth-readiness.cjs` realmente faz

| Condição/modo | Ação | Limite |
|---|---|---|
| Sem token de Management API, modo padrão | Retorna pendência de acesso administrativo, sem rede | Não audita a configuração remota |
| Com token, modo padrão | GET da configuração Auth e relatório saneado | É **leitura remota**, não “sempre offline” |
| `--apply` com token | GET → PATCH dos URLs → GET de verificação | Escreve configuração cloud; exige autorização |
| `--apply` sem token | Falha | Não cria acesso administrativo |

Símbolos principais:

- `desired`: ajusta `site_url` e acrescenta o site aprovado à `uri_allow_list`, preservando entradas existentes.
- `audit`: calcula `siteUrlReady`, `redirectReady`, `emailConfirmationEnabled`, `customSmtpConfigured` e `emailDeliveryPhysicallyVerified`.
- O último campo permanece **false**: o script não envia uma mensagem de prova.
- `customSmtpConfigured` usa presença de campos de host/usuário/remetente; não demonstra validade da senha, DNS, reputação, aceitação pelo destinatário ou entrega física.

O site configurado na ferramenta é `https://matchup-87k.pages.dev/`. Alterá-lo exige revisar redirecionamentos, URLs permitidas e experiência de retorno ao app. Preservar allowlist não é auditoria de segurança das entradas antigas: o operador deve revisar itens obsoletos separadamente, sem removê-los às cegas.

**Não há evidência documental de acesso administrativo de e-mail disponível, SMTP/banimentos configurados ou entrega real validada.** Readiness só ajusta URLs; não habilita SMTP, confirmação, limites de envio ou bans. Os testes dessa ferramenta usam transporte simulado; não comprovam o provedor real.

## 4. Mapa de migrações e precedência

| Camada | Entrada esperada | Mudança principal | Risco de aplicar fora de ordem |
|---|---|---|---|
| Base de contas | Projeto Supabase e dependências auditadas | `auth.users`, perfil-base, trigger de cadastro, bloqueios/fotos e legado necessário | Não há bootstrap novo integralmente homologado neste guia |
| `mentorship.sql` | Base de contas existente | Perfil acadêmico, pedidos, mensagens, bloqueios; helpers/Auth/grants | Replay pode retirar extensões e guardas novas |
| `mentorship-academic.sql` | Núcleo completo | Grupos iniciais, encontros, arquivos privados, avaliações/notificações | Replay pode desfazer hub de grupos e permissões posteriores |
| `mentorship-catalog.sql` | Núcleo + acadêmico compatíveis | Catálogo, disciplina até 256, gravação validada | Patches exigem trechos/constraints esperados; serializador antigo pode conflitar com produto |
| `mentorship-product.sql` | Catálogo e versões reconhecidas | Campos/filtros, favoritos, dúvidas, moderação e restrições | Guardas de funções/view abortam para definições desconhecidas |
| `mentorship-groups.sql` | Produto com guardas de restrição presentes | Hub privado, capacidade 2–100/default 12, códigos e remoções | Recusa pré-requisito ausente; não substitui upgrade de produto |
| `mentorship-lab.sql` — incremento 3.3.1 instalado | Ambiente acadêmico atual; núcleo/academic/product necessários, incluindo guardas de restrição | Instala `mentor_reset_connections(text)`, sem criar tabela ou executar reset | Aplicar somente o incremento após o estado atual; nunca reaplicar as camadas anteriores |

A seta **núcleo → acadêmico → catálogo → produto → grupos** serve para interpretar as definições cumulativas e planejar um ambiente novo auditado. Em um banco 3.3, preparar **a próxima migração incremental**, não executar a seta inteira novamente. Comentários “safe to rerun” de camadas antigas e testes históricos não anulam essa regra.

### 4.1 Por que `IF NOT EXISTS` não torna tudo seguro?

Ele pode evitar recriar uma tabela, enquanto outro trecho executa `CREATE OR REPLACE` de função, altera constraint ou redefine política. O resultado pode preservar 100% das linhas e ainda perder a autorização correta. Avaliar dados, schema, corpo de funções, `proconfig`, ACL e view de Storage separadamente.

### 4.2 Novo projeto Supabase: processo manual, ainda a homologar

Não existe aqui um comando de bootstrap seguro para copiar/colar. Um responsável técnico deverá:

1. Inventariar extensões e schemas geridos por Supabase (`auth`, `storage`), versão compatível e propriedade dos objetos. Não reproduzir manualmente schemas internos geridos pelo provedor.
2. Reconstruir, em staging vazio, a base de contas necessária a `mentor_actor`, `handle_new_user`, perfil-base, filtros legados, bloqueios e bucket de fotos. Os arquivos históricos são evidência, não autorização de execução integral.
3. Revisar cada instrução histórica: triggers, políticas, grants, seeds, resets, alterações de contas e domínios hardcoded. Preparar um plano mínimo explicitamente auditado.
4. Aplicar, nesse staging, as camadas acadêmicas aprovadas na ordem acima, incluindo o snapshot de catálogo, sem credenciais/dados de participantes.
5. Validar cadastro/Auth real, RPCs, negações, Storage e build público com contas descartáveis controladas; documentar resultados e cleanup por IDs exatos.
6. Só então produzir um procedimento homologado para aquele projeto. Nenhuma execução deste bootstrap foi feita nesta tarefa.

## 5. Contrato das ferramentas de implantação

Os exemplos sem flags de escrita abaixo são **referência de modo**, não comandos executados nesta revisão. Mesmo uma ferramenta “offline” precisa ser lida antes de usar uma versão diferente.

| Ferramenta | Modo padrão | `--apply` / comportamento transacional |
|---|---|---|
| `node tools\deploy-catalog.cjs` | Valida arquivo local `data\facens-catalog.json`; `--data` seleciona outro snapshot | Conecta, abre transação, trava deploy, aplica SQL do catálogo e seed no mesmo commit; falha desfaz ambos |
| `node tools\deploy-product.cjs` | Validação estrutural offline do SQL e padrões proibidos | `applyProduct` abre transação, executa migração e hooks opcionais, confirma ou desfaz |
| `node tools\deploy-groups.cjs` | Validação estrutural offline, incluindo pré-requisitos e proteção de helpers | `applyGroups` abre transação, compara snapshots de dados e Auth, aplica patch, confirma só se invariantes preservadas |
| `node tools\deploy-lab.cjs` — adição pós-3.3 | Validação estrutural offline; nenhum reset/conexão | `apply` instala somente a RPC, compara dados/helpers Auth e funções públicas preexistentes; nunca chama o reset |

Estas ferramentas são **upgrades especializados**, não inicializadores de um banco vazio nem atualizadores universais idempotentes.

### Catálogo

`normalizeCatalog`/`compatibilityIssues` rejeitam incompatibilidade, inclusive nomes de curso acima de 80 e disciplinas acima de 256; não truncam. `seedCatalog` inativa cursos/vínculos antigos, faz upserts do snapshot e conserva entradas históricas. `applyCatalog` mantém schema e catálogo no mesmo commit e usa advisory lock.

**Atenção 3.3:** usar novamente a ferramenta de catálogo com `--apply` reaplica também o SQL histórico do catálogo. Sobre produto/grupos pode abortar por versões diferentes ou interferir em serialização posterior. Uma atualização futura de conteúdo exige plano incremental compatível com o estado atual; não presumir que “é só JSON” ou reaplicar produto/grupos depois para compensar.

### Produto

`validate` faz verificações estruturais e bloqueia padrões destrutivos amplos/alterações de `auth.users`. O próprio SQL tem guardas sobre definições e view conhecidas. `applyProduct(db,{beforeApply,afterApply})` oferece hooks dentro da transação e desfaz se falham ou retornam false. **A CLI não fornece esses hooks**; não anunciar que seu `--apply` executa automaticamente a mesma comparação completa de dados do teste backend.

### Grupos

`validate` recusa redefinir `mentor_actor`/`mentor__eligible`, operações amplas de remoção e escrita em `auth.users`. `snapshot` calcula contagem e hash das tabelas `public`, `auth.users`, `storage.objects` e `storage.buckets`, comparando as colunas originais para não confundir extensão de schema com alteração de dados. `authSnapshot` cobre definição, ACL e configuração de `mentor_actor`, `mentor__eligible` e `mentor_ac__actor`.

`applyGroups` aborta se qualquer fingerprint obrigatório diverge. Isso protege a migração contra alterações inesperadas; **não substitui backup**, nem copia arquivos Storage, nem garante ausência de uma alteração externa depois do commit. Planejar janela sem escrita concorrente de participantes/smokes.

### Laboratório — incremento posterior à 3.3

`supabase\mentorship-lab.sql` é a próxima migração incremental sobre o estado acadêmico atual; não reaplica núcleo, academic, catálogo, produto ou grupos. A guarda exige a tabela de restrições e sua referência em `mentor_actor`. Instala `mentor_reset_connections(text)`, seus grants e a notificação de recarga do schema cache; **não chama a RPC nem reseta conta alguma**.

`tools\deploy-lab.cjs` é offline por padrão. Com `--apply`, `apply(db)` abre transação, usa `snapshot`/`authSnapshot` de `deploy-groups.cjs`, instala o incremento e exige preservação dos hashes dos dados existentes, dos helpers Auth e de definição/ACL/configuração das funções públicas preexistentes, exceto a própria RPC adicionada. Falha provoca rollback; igualdade de snapshots não substitui backup nem comprova armazenamento físico. Planejar janela sem escrita concorrente.

**Situação desta documentação:** incremento 3.3.1 instalado por `node .\tools\deploy-lab.cjs --apply`, com preservação dos dados e funções existentes. Foram aprovadas 49 assertions específicas com rollback e os cenários de interface; evidência nos capítulos 07 e 13. Nenhuma conta real foi resetada. Os números históricos de testes da 3.3 não validam este incremento. Instalar a função e executar um reset são operações distintas: a primeira deve preservar todos os dados; a segunda remove conexões da conta autenticada e afeta os dois lados, conforme [o contrato](04-banco-de-dados.md). O frontend só deve ser publicado junto de compatibilidade comprovada com essa RPC. Não corrigir sua ausência reaplicando migrações anteriores.

## 6. Runbook de mudança: PRECHECK → BACKUP → STAGING → APPLY → VERIFY

### PRECHECK — saber exatamente o que muda

- [ ] Definir responsável, ambiente/alvo, finalidade, versão atual e versão desejada; confirmar que não é produção por engano.
- [ ] Separar credencial administrativa do artefato público; registrar somente referência segura, nunca valor.
- [ ] Ler SQL/ferramenta completos; identificar DDL, writes, locks, flags, hooks, guardas e efeitos de catálogo.
- [ ] Levantar inventário de schema, RLS, grants, triggers, corpos/ACL/`search_path` das funções e políticas Storage por procedimento autorizado de leitura.
- [ ] Conferir base de contas e a camada imediata requerida. Se houver versão desconhecida, **parar e preparar migração compatível**, não remover a guarda.
- [ ] Acordar janela sem operações concorrentes relevantes; lock timeout de 10 segundos pode recusar uma mudança sob contenção.
- [ ] Definir critérios objetivos de verificação e reversão; manter frontend anterior compatível disponível.

### BACKUP — recuperação demonstrável

- [ ] Confirmar backup do banco com ponto/horário conhecido e restauração ensaiada em ambiente separado.
- [ ] Verificar o que o plano Supabase realmente fornece (retenção, disponibilidade de PITR, permissões e escopo); não presumir benefícios de um plano.
- [ ] Tratar **bytes do Storage separadamente** dos registros `storage.objects`/`storage.buckets`.
- [ ] Registrar configuração Auth, políticas, artefatos públicos e dependências necessárias, sem despejar segredos em tickets.
- [ ] Proteger backups como dados pessoais; acesso e prazo precisam de responsável.

### STAGING — ensaio do procedimento, não só do SQL

- [ ] Usar ambiente separado e dados sintéticos ou minimizados sob autorização; não copiar participantes reais indiscriminadamente.
- [ ] Ensaiar o mesmo caminho de aplicação e verificar os fingerprints esperados.
- [ ] Testar papéis anônimo/autenticado e negações: menor de idade, restrito, bloqueado, não participante, não moderador.
- [ ] Validar referências host/bucket/foto, URL assinada, commit/abort e revogação no contexto de arquivos.
- [ ] Comprovar que grupos existentes preservam dados/visibilidade, novos têm 12 vagas privadas e dono conta na capacidade.
- [ ] Ensaiar rollback por erro dentro da transação e estratégia **pós-commit** separadamente.
- [ ] Não trocar staging por emuladores: não estão autorizados neste trabalho. Ensaios físicos ainda pendentes não podem ser marcados como concluídos.

### APPLY — alteração controlada

- [ ] Reconfirmar alvo e backup; informar janela operacional por canal previamente definido.
- [ ] Executar somente o incremento aprovado, com a ferramenta compatível e flags explícitas de escrita, em estação autorizada.
- [ ] Deixar guardas, snapshots e timeout ativos. Falha não é convite para executar pedaços do SQL manualmente.
- [ ] Registrar horário, revisão, resultado e hashes não sensíveis; não salvar connection string, tokens ou linhas de participantes em log de release.
- [ ] SQLs e wrappers usam transação; uma falha antes do commit reverte alterações dessa transação. Não prometer desfazer ações de serviços externos.

### VERIFY — provar o estado, inclusive negações

- [ ] Conferir schema e definições esperados, grants de RPC, RLS e políticas restritivas Storage.
- [ ] Comparar dados originais e controles de Auth; preservar dados não relacionados à mudança.
- [ ] Fazer somente smokes previamente aprovados com contas/IDs descartáveis; registrar e verificar cleanup.
- [ ] Confirmar APIs sob sessão real; claims simulados no SQL não substituem integração Auth/PostgREST.
- [ ] Confirmar frontend compatível, conteúdo de `www`, service worker e carregamento de recursos públicos.
- [ ] Separar resultado automatizado de navegador físico/offline/entrega de e-mail. Sem prova, deixar pendente.

**Critério de parada:** alvo incerto, backup não recuperável, guarda incompatível, fingerprint divergente ou falha de autorização em staging bloqueiam publicação. Não “corrigir” com grant amplo, bucket público ou reset de banco. Essa restrição operacional não define o contrato de uma eventual ação controlada de laboratório na interface.

### Rollback: o que realmente é reversível?

| Momento/problema | Caminho seguro | Limitação |
|---|---|---|
| SQL falhou antes do commit | Wrapper faz rollback; confirmar resultado/log saneado | Não prova recuperação de uploads externos |
| Migração confirmada, defeito descoberto depois | Correção incremental revisada ou restauração controlada do backup/PITR | Não existe script `down` universal verificado |
| Frontend publicado com erro | Voltar artefato público anterior compatível | Cache/service worker pode manter versão anterior/nova temporariamente; não desfaz schema |
| Arquivo apagado ou exposto | Processo Storage e resposta a incidente específicos | Restaurar metadados PostgreSQL não restaura automaticamente os bytes; exposição anterior não é desfeita |
| Guardas recusam schema desconhecido | Investigar diferença, criar patch compatível | Remover guarda ou replay antigo destrói o valor da proteção |

## 7. Moderação: configuração explícita de operador

A aplicação tem fila e RPCs de moderação; isso **não significa que existe uma pessoa escalada**. Não há operador padrão, autoelevação por claim de JWT ou acesso de moderador baseado em endereço de e-mail.

`tools\moderation-admin.cjs` usa UUID explícito de uma conta conhecida e autorização administrativa separada:

| Modo | Efeito |
|---|---|
| Sem ação / help | Explica uso, não conecta |
| `--check <UUID>` | Conecta e consulta autorização; leitura administrativa remota |
| `--grant <UUID>` | Verifica elegibilidade e insere em `mentor_moderators` de forma idempotente |
| `--revoke <UUID>` | Remove esse papel; não apaga conta nem denúncias |

Concessão/revogação usam transação e locks coordenados. Esses exemplos não devem ser executados com UUID de demonstração contra produção. O responsável deve documentar a identidade autorizada em registro restrito, revisar conflitos de interesse e prever substituição/revogação. Não incluir lista de operadores ou participantes neste manual.

`mentor_moderate` aplica `mentor_restrictions`; não escreve bans de `auth.users`. A tabela de restrições afeta o acesso acadêmico mesmo com sessão Auth ainda válida. Ver [procedimento de decisão e privacidade](08-operacao-privacidade-e-suporte.md).

## 8. Build público: apenas a pasta aprovada

A raiz contém o **fonte da PWA atual**, mas não é uma pasta publicável inteira. `tools\web-assets.cjs` define a allowlist de **23 arquivos**:

- `index.html`;
- `mentorship.js`, `mentorship.css`;
- `mentorship-academic.js`, `mentorship-academic.css`;
- `mentorship-catalog.js`, `mentorship-catalog.css`;
- `mentorship-product.js`, `mentorship-calendar.js`;
- `vendor\supabase.js`;
- `pwa.js`, `pwa.css`, `manifest.webmanifest`;
- `startup.js`, `startup.css` e `assets\brand\matchup-intro.mp4`;
- sete imagens/ícones de marca: símbolo, logo, 192, 512, maskable 512, Apple touch e favicon 32.

`tools\build-web.cjs` copia o bundle UMD instalado do SDK, recria **somente `www` gerado**, copia a allowlist e gera `www\sw.js`. Total atual: **23 arquivos aprovados + service worker = 24 arquivos públicos**. `shellAssets` exclui o vídeo: são **22 arquivos de precache obrigatório**, sem o próprio worker. `serviceWorker()` deriva versão de 20 caracteres hexadecimais do template e de todos os assets, inclusive MP4; não é só incrementar manualmente um número de release. Política de mídia/cache no [capítulo 06](06-desenvolvimento-e-android.md).

**Nunca publicar a raiz toda, SQL, ferramentas, testes, `.env`, backups ou banco local.** O deploy web recebe apenas `www` inspecionado. Nenhuma credencial PostgreSQL é necessária para hospedar arquivos estáticos. Segredo de provedor de hospedagem fica no canal administrativo de publicação, não no bundle.

O [capítulo 06](06-desenvolvimento-e-android.md) cobre desenvolvimento/pacote Android; o [capítulo 03](03-frontend.md) cobre o shell e carregamento. Este guia não presume que gerar um pacote ou service worker comprovou uso offline em dispositivos físicos.

## 9. Árvores de diagnóstico

### “O app abre, mas nada do banco funciona”

```text
Shell HTML/CSS/JS carregou?
 ├─ Não → conferir artefato www, caminhos e versão do service worker.
 └─ Sim → Auth tem sessão válida?
           ├─ Não → distinguir rede, login e configuração de retorno Auth.
           └─ Sim → qual família falha?
                     ├─ Todas RPCs → verificar versão/contratos/grants e elegibilidade.
                     ├─ Só catálogo → verificar camada e snapshot ativo, não reexecutar core.
                     ├─ Só grupo → verificar participação, visibilidade, bloqueios e lotação.
                     └─ Só arquivo → verificar reserva/commit, bucket privado e contexto.
```

### “A ferramenta falhou”

```text
Foi validação offline?
 ├─ Sim → corrigir incompatibilidade local; nenhum grant remoto resolve JSON inválido.
 └─ Não → autenticação/conexão administrativa ou guarda SQL?
           ├─ Conexão → conferir alvo/acesso por canal seguro, sem imprimir segredo.
           ├─ Timeout → verificar contenção/janela; não aumentar timeout indiscriminadamente.
           ├─ Guarda de versão → interromper, comparar definições, preparar incremento.
           └─ Fingerprint → confirmar rollback e investigar diferença/concorrência.
```

| Sintoma | Verificação segura | Não fazer |
|---|---|---|
| “Função não existe” após mudar frontend | Compatibilidade do schema e publicação, assinatura e schema cache da API pelo procedimento do provedor | Aplicar todas as migrações antigas |
| Erro `42501` | Sessão, idade, restrição, vínculo e bloqueio; pode ser negação correta | Dar `SELECT` geral a `authenticated` |
| Foto recusada em projeto novo | Host/caminho/UID/limites no SQL e cliente | Permitir qualquer domínio por regex ampla |
| Código não entra | Estado aberto, inscrições, vaga, versão do código, remoção duradoura | Aumentar capacidade via SQL sem contrato ou apagar tombstone |
| Material não aparece | Reserva versus commit, owner/MIME/tamanho, contexto do autor e leitor | Tornar bucket público |
| Mensagem de e-mail não chegou | Primeiro comprovar acesso administrativo, modo de confirmação, SMTP e teste físico separado | Declarar entrega validada por `auth-readiness` |
| Painel de moderação não aparece | `mentor_moderation_access` e concessão explícita ao UUID correto | Acrescentar claim `moderator=true` |

## 10. Evidência, fontes e próximos capítulos

Fontes operacionais locais: `supabase\mentorship*.sql`, `supabase\config.toml`, `tools\deploy-catalog.cjs`, `tools\deploy-product.cjs`, `tools\deploy-groups.cjs`, `tools\auth-readiness.cjs`, `tools\moderation-admin.cjs`, `tools\web-assets.cjs`, `tools\build-web.cjs`.

Os testes `mentorship-*-backend.cjs` não são todos equivalentes: alguns históricos têm opção `--apply` ou reaplicam camadas anteriores, ainda que normalmente revertam uma transação. O teste `mentorship-groups-live.cjs` não aplica migração, mas cria/exclui contas descartáveis e faz escrita real. Ler flags e versão antes de qualquer execução; não rodar smokes concorrentes sobre o mesmo alvo. A tarefa documental não os executou.

Evidência registrada de 3.3: **241 assertions de rollback e 127 assertions autenticadas de grupos**, com verificações de cleanup/preservação. **55 Node, 156 Chrome e 156 WebKit** pertencem a uma release anterior. Não são resultados desta revisão e não equivalem a Safari real, aparelhos físicos, funcionamento offline físico ou entrega de e-mail.

- [01 — Arquitetura](01-visao-geral-e-arquitetura.md), [02 — Uso](02-funcionalidades-e-uso.md), [03 — Frontend](03-frontend.md), [04 — Banco](04-banco-de-dados.md).
- [06 — Desenvolvimento](06-desenvolvimento-e-android.md), [07 — Testes](07-testes-e-validacao.md), [08 — Operação/privacidade](08-operacao-privacidade-e-suporte.md), [09 — Legado](09-backend-legado.md), [10 — Evolução](10-manutencao-e-evolucao.md).
- [11 — UI/UX e acessibilidade](11-ui-ux-e-acessibilidade.md), [12 — Referências/glossário](12-referencias-e-glossario.md), [13 — Histórico](13-historico-de-releases.md).
- Referências oficiais: [chaves Supabase](https://supabase.com/docs/guides/api/api-keys), [URLs de redirecionamento](https://supabase.com/docs/guides/auth/redirect-urls), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [backups](https://supabase.com/docs/guides/platform/backups), [Storage](https://supabase.com/docs/guides/storage), [transações PostgreSQL](https://www.postgresql.org/docs/current/tutorial-transactions.html).
