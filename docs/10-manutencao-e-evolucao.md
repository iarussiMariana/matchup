# 10 — Manutenção, decisões arquiteturais e evolução do MatchUp

[Índice da documentação](README.md)

## 1. Objetivo e regra de evidência

Este guia orienta manutenção do **MatchUp acadêmico**, organiza decisões observáveis e propõe critérios de evolução e apresentação UPX. Não é autorização para executar operações remotas nem roadmap aprovado. As decisões arquiteturais abaixo foram **reconstruídas a partir das fontes**, não retiradas de atas ou ADRs formalmente assinadas.

Sempre distinga quatro tipos de informação:

| Tipo | Exemplo correto | O que não concluir |
|---|---|---|
| Fato de implementação | A RPC exige confirmação textual e identidade autenticada | Que já foi instalada em produção |
| Evidência executada | Um relatório identifica comando, versão, ambiente e resultado | Que toda plataforma foi validada |
| Registro histórico | A release 3.3 teve resultados registrados | Que a suíte atual passou novamente |
| Proposta | Avaliar push, CI ou calendário sincronizado | Que o recurso já existe |

O patch atual **3.3.3 / versionCode 13** acrescenta a intro opcional independente do núcleo, sem mudar contratos backend. Preserva o layout adaptativo, skeletons e divulgação progressiva da **3.3.2 / versionCode 12**. Ao manter a abertura, preserve a liberação por falha/preferências e a distinção entre ativos públicos e cache obrigatório, descritas nos capítulos 03/06. Evidências atuais ficam nos capítulos 07/13; os registros a seguir preservam a campanha anterior. A referência histórica deste guia é **3.3.1 / versionCode 11**, publicada em <https://matchup-87k.pages.dev> e em <https://bd9ef3c7.matchup-87k.pages.dev>. A migração de laboratório foi aplicada preservando todos os dados e funções existentes, **sem executar reset real**. A evidência final informada registra **57 testes Node, 74 Chrome, 74 WebKit e 49 assertivas SQL com rollback aprovados**, incluindo timeout de lock e exclusão atômica. Chrome/WebKit cobriram **núcleo, foto, grupos e laboratório, não a suíte completa de 166 testes**.

Foram criados `MatchUp-3.3.1.apk` e `MatchUp-PWA-3.3.1.zip`, sem `Spark.apk`. Os **21 ativos web conferidos** são idênticos entre APK, ZIP e publicação. Os smokes Chrome offline e WebKit online passaram; aparelho físico, Safari físico/offline e e-mail real continuam pendentes. A **3.3 / versionCode 10** permanece histórica. Evidência final e identificação dos artefatos ficam nos [capítulos 07](07-testes-e-validacao.md) e [13](13-historico-de-releases.md).

## 2. Fontes de verdade e saídas geradas

### 2.1 Onde editar

| Área | Fontes canônicas | Responsabilidade |
|---|---|---|
| Estrutura | `index.html` | Telas, formulários, pontos de montagem e carregamento |
| Núcleo acadêmico | `mentorship.js`, `mentorship.css` | Auth, estado, perfil, descoberta, solicitações e chat |
| Recursos acadêmicos | `mentorship-academic.js`, `mentorship-academic.css` | Agenda, grupos, materiais, feedback e notificações |
| Produto | `mentorship-product.js` | Preferências, compatibilidade, favoritos, denúncias/moderação e otimização de foto |
| Catálogo | `mentorship-catalog.js`, `mentorship-catalog.css` e dados/SQL correspondentes | Curso/modalidade, disciplinas, cobertura e seleção |
| Calendário | `mentorship-calendar.js` | Geração e entrega de calendário, incluindo integração nativa |
| Instalação web | `pwa.js`, `pwa.css`, `manifest.webmanifest`, `sw.js` | Instalação, atualização e template do service worker |
| Lista pública/build | `tools\web-assets.cjs`, `tools\build-web.cjs` | Allowlist, cópia de arquivos e service worker por hash |
| Banco e autorização | Migrações acadêmicas em `supabase` | Tabelas, contratos RPC, constraints, grants, RLS e políticas de Storage |
| Dependências | `package.json`, `package-lock.json` | Scripts e resolução de versões |
| Android | Configuração Capacitor e arquivos nativos de configuração em `android` | Identidade, versão, permissões e integração |
| Evidências | `tests` e relatórios identificados | Regressões, integração autorizada e rastreabilidade |
| Documentação | `README.md`, `docs` | Uso, contratos, operação, limites e histórico |

`script.js`, `styles.css`, arquivos de modos antigos e `server` **não são o centro da aplicação acadêmica atual**. Consulte o [legado](09-backend-legado.md) apenas quando a questão realmente pertencer a ele.

### 2.2 O que não editar como solução persistente

- `www` é uma saída de build, não a origem do frontend.
- Cópias web dentro dos assets Android são geradas pela sincronização.
- `vendor\supabase.js` é obtido da dependência instalada; não deve receber correção manual que se perde no próximo build.
- Configuração gerada do Capacitor não substitui mudanças na configuração fonte apropriada.
- APKs e ZIPs publicados são artefatos identificáveis, não pastas de trabalho editáveis.
- No inventário informado para esta atualização, APKs antigos 3.1, 3.2 e `Spark*.apk` (inclusive `Spark.apk`) foram removidos fora deste trabalho; `PATCH-PADRONIZACAO-VISUAL.md` também está ausente. Não recriá-los ou apresentá-los como arquivos disponíveis. O APK 3.3 e os três ZIPs de distribuição informados continuam existentes; a identificação precisa dos artefatos disponíveis pertence ao [histórico de releases](13-historico-de-releases.md).

`build-web.cjs` recria **a pasta gerada `www`**, copia somente os ativos permitidos e gera o service worker. `web-assets.cjs` calcula uma versão a partir do template e dos ativos. Incluir arquivo novo exige revisar a allowlist; copiar a raiz inteira pode expor ferramentas ou reincorporar recursos históricos.

### 2.3 Ordem de leitura para investigar um problema

1. Identifique a jornada no [manual funcional](02-funcionalidades-e-uso.md).
2. Localize o módulo e contrato no [frontend](03-frontend.md).
3. Se houver persistência, leia [dados](04-banco-de-dados.md) e [Supabase](05-supabase-e-configuracao.md).
4. Localize o teste mais próximo em [validação](07-testes-e-validacao.md).
5. Compare com a versão realmente instalada/publicada no [histórico](13-historico-de-releases.md).

Não use um print, o nome de um APK ou um comentário antigo como fonte única. Fonte local, conteúdo servido, cache PWA e APK instalado podem estar em versões diferentes.

## 3. Invariantes que uma alteração não pode quebrar

### 3.1 Identidade, autorização e privacidade

- A identidade da sessão no servidor determina quem atua. Esconder botão e confiar em `userId` enviado pelo cliente não são autorização.
- Toda operação precisa respeitar contexto, participação, restrição e bloqueio pertinentes, inclusive depois de a tela já estar aberta.
- Chave publicável pode estar no cliente; senha de banco, service-role, secret key, token de participante e link de recuperação não podem estar no bundle, logs ou documentação pública.
- Sair ou trocar de conta deve limpar estado privado e impedir reaproveitamento de respostas atrasadas de outra sessão.
- Denunciar e bloquear continuam operações distintas. Não importar o bloqueio automático da denúncia do backend legado.
- Moderação depende de acesso concedido no servidor e mantém decisão, justificativa e auditoria.

### 3.2 Perfil, catálogo e descoberta

- Papéis de ajuda/aprendizagem são por disciplina, não categorias exclusivas de pessoa.
- Nome, curso e semestre continuam coerentes com o contrato; oferecer ajuda exige matéria de ajuda.
- Catálogo não inventa grades. Preservar identificação curso/modalidade, cobertura completa/parcial/indisponível e avisos para dados antigos.
- Limites atuais: cursando 12, ajuda 8, aprendizagem 8; mudanças exigem sincronizar UI, contrato e testes.
- Foto é opcional: ausência ou erro de carregamento deve manter alternativa por iniciais e layout utilizável.
- Selecionar foto só cria prévia/pendência. Upload acontece ao salvar; não confirmar perfil antes da persistência correspondente.
- Favoritos pertencem à conta e são persistidos no backend; não regredir a um favorito somente local.
- Pular cartão é local; gesto para solicitar abre formulário, não aceita nem cria conexão sozinho.
- Explicação de compatibilidade usa dados declarados, não comprovação de competência.

### 3.3 Pedidos, mensagens e encontros

- Pedido pendente não libera chat; aceito e recusado têm efeitos diferentes.
- ID do parceiro, ID do pedido, ID do grupo e ID do encontro não são intercambiáveis.
- Data sugerida do pedido não cria encontro; horário habitual do perfil/grupo também não.
- Mensagem com falha não deve virar sucesso fictício. Repetição do mesmo envio preserva seu identificador de cliente; não presumir idempotência universal.
- Atualização periódica para no background e não se anuncia como push fechado.
- Remarcar exige nova confirmação. Cancelar encontro não é remover conexão.
- Feedback depende da elegibilidade do servidor, não apenas do relógio ou de um botão habilitado pelo cliente.
- Exportar ICS reconsulta permissões; não inclui link privado e não promete sincronização ou remoção de cópias externas.

### 3.4 Grupos e materiais

- Capacidade de grupo fica entre 2 e 100, padrão 12, com organizador incluído.
- Privado é o padrão; visibilidade, inscrições e capacidade são controles independentes.
- Convite não reserva vaga; código não contorna bloqueio, restrição ou remoção pelo organizador.
- Código renovado/desativado invalida o anterior. Removido pelo organizador não volta por código novo.
- Sair e arquivar não são equivalentes; arquivamento fecha interações futuras conforme contrato.
- Material usa contexto autorizado, bucket privado e preparação/upload/confirmação; foto pública tem outro regime.
- Link assinado expira, mas download já realizado não é revogado. Metadados apagados não provam purge físico.

### 3.5 Empacotamento e operação

- Publicar somente a allowlist acadêmica, sem `server`, fixtures, bancos, segredos e modos antigos.
- Não usar reset, seed ou migração antiga como ferramenta genérica de limpeza.
- Não manter serviço/processo de teste desnecessário após a atividade.
- Não executar emuladores/simuladores: a orientação atual exige verificações em aparelhos físicos quando a evidência depender de dispositivo.
- Separar “implementado”, “testado”, “implantado” e “distribuído” em toda comunicação de release.

## 4. Rotinas recomendadas de manutenção

As frequências abaixo são organização sugerida, não tarefas agendadas existentes. Operações remotas ou destrutivas continuam exigindo escopo e autorização próprios.

| Momento | Revisão recomendada | Evidência útil |
|---|---|---|
| Antes de uma mudança | Identificar versão, domínio, contrato e risco de escrita | Cenário reproduzível sem dados pessoais |
| A cada alteração funcional | Verificar percurso feliz, vazio, erro, retry e perda de acesso | Teste direcionado e descrição do efeito |
| Ao alterar dados/permissões | Revisar grants, RLS, RPC, locks, constraints e Storage | Integração isolada autorizada, preservação e rollback |
| Ao atualizar catálogo | Conferir fonte oficial, modalidade, vínculos e cobertura | Proveniência e contagens reconciliadas |
| Ao atualizar dependências | Revisar manifesto, lockfile, APIs usadas e saídas geradas | Testes afetados e identificação dos artefatos |
| Antes de distribuir | Conferir allowlist, versão/hash, cache e compatibilidade cliente/SQL | Registro de release e limitações explícitas |
| Periodicamente, se houver operação continuada | Revisar acessos administrativos, custos, retenção e restauração | Relatório sanitizado e responsáveis definidos |
| Antes de demonstração UPX | Preparar contas controladas e estados necessários | Checklist, roteiro e plano para indisponibilidade |

### 4.1 Diagnóstico sem exposição de dados

Registre ação, horário aproximado, versão, navegador/aparelho, mensagem sanitizada e expectativa. Não copie conversa, senha, token, código de grupo privado ou URL assinada para um relatório público. Uma captura de tela deve ocultar identificadores e conteúdo dos participantes.

Quando houver timeout de mutação, consulte o estado antes de repetir: falta de resposta não prova rollback. Quando houver bloqueio/perda de acesso, não tente contornar a autorização por um link antigo. Quando a PWA parecer desatualizada, identifique o cache e o build; não apague dados do navegador sem avisar sobre sessões e rascunhos.

Orientações de incidente, privacidade e suporte: [capítulo 08](08-operacao-privacidade-e-suporte.md).

### 4.2 Banco, arquivos e backup não são uma única coisa

PostgreSQL guarda identidade de domínio e metadados; Storage guarda objetos; calendários e downloads já entregues ficam fora do controle direto do aplicativo. Um backup apenas do schema não restaura usuários, dados e objetos. Uma exportação de dados não comprova que a restauração funciona.

Planeje restauração em ambiente separado, com autorização e conferência de acesso/consistência. Não produza cópias de participantes para apresentações. O diretório `server` e seu arquivo sql.js não são backup do Supabase.

## 5. Decisões arquiteturais observadas — resumo no formato ADR

Os registros seguintes expressam **contexto, escolha observada e consequência**. A bibliografia oferece vocabulário para analisá-los; não prova que a equipe seguiu formalmente determinada metodologia.

| Registro | Contexto e escolha observada | Benefício e custo | Diretriz de manutenção |
|---|---|---|---|
| D01 — Cliente estático modularizado por responsabilidade | HTML/CSS/JS e módulos globais, sem framework principal | Distribuição simples; há dependência da ordem de scripts, DOM e contratos compartilhados | Separar refatoração de mudança de regra; preservar exports, seletores e guardas |
| D02 — Supabase direto com autorização no servidor | Auth, RPC, grants/RLS e Storage sustentam o domínio | Dispensa Express próprio online; cliente distribuído não pode ser autoridade | Revisar segurança de cada contrato junto da UI |
| D03 — Solicitação contextualizada antes da conversa | Pessoa escolhe matéria, dúvida e objetivo; destinatário aceita | Torna intenção explícita; adiciona uma etapa deliberada | Não trocar consentimento por swipe que conecta automaticamente |
| D04 — Consistência por transações e identidade de operação | Regras no SQL e identificador de cliente no envio de mensagem | Reduz efeitos de concorrência/retry; falhas distribuídas continuam possíveis | Não generalizar garantia “exatamente uma vez” |
| D05 — Polling enquanto visível | Consultas a cada 12 segundos atualizam contexto aberto; frontend atual não abre assinaturas Realtime | Simplicidade de recuperação; tráfego periódico e atraso | Preservar pausa em background e limpeza ao perder acesso |
| D06 — Catálogo com proveniência e cobertura explícita | Seleção controlada e matrizes incompletas sinalizadas | Evita dados inventados; exige manutenção de fontes e compatibilidade | Nunca transformar ausência de informação em grade completa |
| D07 — Dois regimes de arquivo | Foto pública otimizada; material privado contextual | Adequa uso e custo; upload e gravação podem falhar em etapas diferentes | Testar compensação e distinguir referência de objeto físico |
| D08 — Distribuição web/PWA e Capacitor | Mesma base web, com integração nativa pontual | Reuso; navegadores, WebView e cache não são idênticos | Validar cada plataforma e registrar qual artefato foi usado |
| D09 — ICS como exportação explícita | Arquivo entregue ao sistema/aplicativo escolhido | Interoperabilidade sem integrar provedores de agenda | Não anunciar sincronização ou confirmação automática de importação |
| D10 — Reset limitado à conta autenticada | RPC dedicada com confirmação forte, sem usuário-alvo livre | Viabiliza laboratório sem limpeza global; ainda afeta parceiros | Instalar sem executar, preservar grupos/dados alheios e exigir consentimento |

Para atributos de qualidade e custos das escolhas, veja [Bass, Clements e Kazman](12-referencias-e-glossario.md#ar01). Para mudanças pequenas preservando comportamento, veja [Fowler](12-referencias-e-glossario.md#ar02). Para consistência e resultados incertos diante de falhas, veja [Kleppmann](12-referencias-e-glossario.md#ar03).

### 5.1 Decisões de UI/UX que acompanham a arquitetura

O CSS próprio é **inspirado em Material Design 3**, não uma certificação nem adoção automática de todos os componentes da biblioteca. Cinco destinos estáveis favorecem orientação; cards compactos e detalhes expansíveis reduzem competição visual; chips tornam seleção e limites visíveis; confirmações distinguem ações reversíveis e destrutivas.

- **Feedback e restrições:** prévia da foto, estado de envio e confirmação do reset; relação com [Norman](12-referencias-e-glossario.md#ux01).
- **Leitura rápida e convenções:** rótulos consistentes e ações reconhecíveis; relação com [Krug](12-referencias-e-glossario.md#ux02).
- **Divulgação progressiva:** perfil completo e seções recolhidas de grupos; relação com [Tidwell e coautoras](12-referencias-e-glossario.md#ux03).
- **Avaliação, não certificação presumida:** testar teclado, foco, contraste, zoom e leitor de tela; referências [Nielsen](12-referencias-e-glossario.md#ux05), [Material Design 3](12-referencias-e-glossario.md#doc01) e [WCAG 2.2](12-referencias-e-glossario.md#doc02).

Não afirmar que essas referências comprovam melhora estatística de aprendizagem ou usabilidade. Não foi demonstrado estudo empírico representativo por essa documentação. O detalhamento está no [capítulo 11](11-ui-ux-e-acessibilidade.md).

## 6. Matriz de impacto e validação proporcional

| Alteração | Componentes a revisar | Cobertura mínima recomendada |
|---|---|---|
| ID, rótulo ou estrutura de formulário | HTML, seletor/handler, CSS e teste UI | Jornada, foco, mensagens e erro de console |
| Cadastro/recuperação | Formulário, validação, Supabase Auth, redirects e configuração de e-mail | Idade/limites, link inválido e fluxo real autorizado separado do mock |
| Perfil/foto | Núcleo, produto, upload, URL, RPC e Storage | Selecionar sem upload, salvar, remover, formato/tamanho e falha após upload |
| Catálogo/curso | Catálogo, dados/SQL, onboarding e descoberta | Troca de curso, limites, parcial/indisponível e preservação de legado |
| Descoberta/favoritos | Filtros, perfil, explicação e RPC | Vazio, detalhe, pular local, persistência por conta e restrições |
| Pedidos | Formulário, RPC, locks e listas | Pendente/aceito/recusado, duplicação, permissões e concorrência |
| Chat | Estado do pedido, payload, renderização e polling | Retry do mesmo envio, background, perda de acesso e troca de conta |
| Agenda/feedback/ICS | Recursos acadêmicos, calendário, SQL e plugins nativos | Fuso, limites, remarcação, elegibilidade, exportação e importação física |
| Grupo/código | Configurações, participantes, convites e RPC | Privado, capacidade concorrente, código antigo, remoção e arquivamento |
| Materiais | Validação, prepare/upload/commit, bucket e URL assinada | Formato real, falha parcial, expiração e acesso após saída/bloqueio |
| Denúncia/moderação | Interface, acesso, decisão e auditoria | Conta sem privilégio, decisão válida, justificativa e ação associada |
| Reset de laboratório | Confirmação, RPC, cascatas, leituras e limpeza do estado | Escopo dos dois lados, preservações, concorrência e instalação sem reset |
| PWA/allowlist/SDK | Manifesto, lockfile, vendor, build e SW | Atualização, arquivos públicos, shell offline e limites declarados |
| Android | Configuração fonte, Gradle/SDK e ativos sincronizados | Pacote/versionamento e smoke em aparelho físico, sem emulador |
| Texto de documentação | Capítulo afetado, fontes e links | Leitura de coerência e links; não exige build por si só |

Execute primeiro o menor conjunto que cobre a alteração. Amplie a validação quando o risco ou o resultado exigir. Os scripts existentes incluem `npm test`, `npm run test:ui`, `npm run build:web` e `npm run sync:android`; os comandos exatos e pré-requisitos pertencem aos [capítulos 06](06-desenvolvimento-e-android.md) e [07](07-testes-e-validacao.md). Mencioná-los aqui não afirma que tenham sido executados nesta revisão documental.

## 7. Fluxo de mudança e entrega

### 7.1 Preparar

1. Defina cenário atual, resultado esperado e critérios de aceite.
2. Classifique a alteração: somente documentação, cliente, SQL, Storage, Auth ou artefato nativo.
3. Identifique dados que precisam ser preservados e se existe autorização para qualquer acesso remoto.
4. Escolha o teste mais próximo e ambiente apropriado; use dados controlados.
5. Planeje compatibilidade entre cliente novo/antigo e contrato de banco. Não reaplique todas as migrações por conveniência.

### 7.2 Implementar e verificar

1. Faça mudanças focadas. Não corrija legado ou reformule arquitetura incidentalmente.
2. Acrescente regressão pertinente para nova regra ou defeito corrigido.
3. Confira sucesso, vazio, erro, retry e invalidação de contexto.
4. Preserve rascunho e resultado incerto sem apresentar sucesso silencioso.
5. Atualize manual, contratos e limitações na mesma entrega.
6. Remova somente dados/artefatos de teste identificados; não limpe participantes ou arquivos alheios.

### 7.3 Distribuir com rastreabilidade

- Confirme versão do cliente, migrações necessárias e estado real de publicação.
- Revise build/allowlist e sincronização Android; não edite cópias geradas como solução.
- Preserve o artefato anterior e seus identificadores. Não sobrescreva “3.3” com bytes de outro patch sem registrar a mudança.
- Registre versão, código, hash, data, ambiente, comandos, resultados e pendências.
- Teste o caminho de atualização/cache e importação/compartilhamento nativo quando afetado.
- Distinga APK de teste, assinatura e estratégia de distribuição; não declare publicação em loja sem evidência.
- Atualize o [histórico de releases](13-historico-de-releases.md) somente com resultados reais.

Nesta pasta não há repositório Git configurado. Não inventar commit/PR ou executar `git add .` indiscriminadamente. Uma adoção futura de versionamento deve começar por inventário e exclusão de segredos, bancos, uploads e artefatos inadequados.

## 8. Reset de laboratório: instalação não é execução

> **Reset publicado na 3.3.1:** migração aplicada com preservação de todos os dados/funções; nenhum reset real executado. Foram aprovadas 49 assertivas SQL com rollback, incluindo timeout de lock e exclusão atômica, 57 testes Node e os recortes de 74 testes Chrome/74 WebKit de núcleo, foto, grupos e laboratório. APK e PWA foram entregues; a evidência final pertence aos [capítulos 07](07-testes-e-validacao.md) e [13](13-historico-de-releases.md). Instalar e publicar a função não executa limpeza de conta.

### 8.1 Contrato e efeitos

A assinatura é **`mentor_reset_connections(p_confirmation text)`**, **sem default** e **sem parâmetro de usuário-alvo**. A função deriva a identidade da sessão, exige `RESETAR` exatamente, usa lock do ator e revalida autorização.

Remove todos os pedidos recebidos/enviados da própria conta — pendentes, aceitos e recusados — com mensagens, sessões individuais ligadas, participantes, avaliações e metadados de materiais. Remove também os marcadores de notificação lida dos objetos removidos **para ambos os lados**.

Preserva contas/Auth, perfis/fotos, catálogo, favoritos, bloqueios, denúncias/moderação, **todos os grupos e seus conteúdos/encontros** e conexões alheias. Não purga objetos físicos no Storage nem remove downloads/ICS externos. URLs assinadas já emitidas podem durar até a expiração.

A interface fica em **Perfil → Configurações → Laboratório → Resetar matches**. Fechar o diálogo após envio não cancela a operação no servidor. O efeito é irreversível e envolve parceiros; use apenas contas controladas com ciência dos envolvidos. O passo a passo para uso está no [capítulo 02](02-funcionalidades-e-uso.md).

### 8.2 Instalação segura do contrato

| Ação/fonte | Comportamento | Cuidado |
|---|---|---|
| `tools\deploy-lab.cjs`, sem argumentos | Validação estrutural offline, sem conexão ao banco | Não testa efeito real da RPC |
| `tools\deploy-lab.cjs --apply` | Instala a RPC em transação | Exige autorização e ambiente correto; não chama reset |
| `supabase\mentorship-lab.sql` | Migração específica do laboratório | Deve ser a última, após pré-requisitos atuais de produto/restrições |
| Chamada da RPC pela conta | Executa reset somente do ator autenticado após confirmação | É destrutiva, diferente de instalar |
| `supabase\pilot-reset.sql` ou seed legado | Rotinas históricas de outro domínio | **Nunca reaplicar para esta finalidade** |

O instalador compara snapshots/hashes das linhas existentes, estado relacionado a Auth e definições/permissões/configuração das funções preexistentes, exceto a RPC que está instalando. Divergência provoca rollback. Seu compromisso é preservar dados/funções existentes ao instalar, **não limpar contas**.

Não use o editor SQL para reaplicar migrações antigas quando só falta esta função. Não substitua uma falha de instalação por exclusões manuais. Orientação completa do ambiente: [capítulo 05](05-supabase-e-configuracao.md).

### 8.3 Critérios de aceite do reset e ligação com a evidência

A lista abaixo é um modelo de conferência, não um placar atualizado da suíte. A instalação preservadora e os resultados Node/SQL já informados estão descritos acima; consulte os capítulos 07/13 para sua rastreabilidade e para o fechamento dos demais cenários.

- [ ] Texto ausente, incorreto, em minúsculas ou com espaços não executa reset.
- [ ] Não há default de confirmação nem escolha arbitrária de outro ator.
- [ ] Conta controlada possui pedidos de entrada e saída nos três estados para verificar o escopo.
- [ ] Mensagens, sessões individuais, participantes, avaliações e metadados vinculados desaparecem corretamente.
- [ ] Marcadores de leitura correspondentes são removidos dos dois lados, sem apagar leituras não relacionadas.
- [ ] Conta terceira e conexões alheias permanecem intactas.
- [ ] Perfis, favoritos, bloqueios, denúncias e todos os grupos/conteúdos permanecem intactos.
- [ ] Instalar a RPC preserva linhas/Auth/funções e não chama o reset.
- [ ] Ausência da RPC, perda de sessão, erro de rede e concorrência têm resultado definido.
- [ ] Interface limpa apenas o estado devido após resposta válida e não inventa purge de Storage/ICS.
- [ ] Resultado e versão são registrados sem reutilizar números históricos como aprovação do novo patch.

## 9. Roadmap proposto — não funcionalidades disponíveis

As prioridades abaixo são sugestões de planejamento. Cada uma precisa de escopo, responsável, esforço, risco e critério de aceite antes de virar compromisso.

| Prioridade sugerida | Proposta | Gate de conclusão |
|---|---|---|
| P0 — Fechar evidência de uso real | Validar Android/iPhone físicos, e-mail e Safari instalado/offline | Roteiro executado em aparelhos identificados, sem emuladores/simuladores |
| P1 — Acessibilidade e uso observado | Revisão de teclado, leitor de tela, zoom e estudo com consentimento | Problemas registrados/corrigidos; não somente score automático |
| P1 — Entrega reproduzível | Evoluir CI, homologação isolada, assinatura/custódia e verificação de artefatos | Pipeline sem segredos no bundle e artefato rastreável |
| P1 — Recuperação operacional | Exercitar backup/restore de dados e objetos, definir retenção | Restauração verificada em ambiente separado |
| P2 — Organização interna | Reduzir contratos globais, explicitar serviços/estado/renderização | Refatorações graduais com regressão, sem mudar regras incidentalmente |
| P2 — Observabilidade privativa | Eventos mínimos, métricas e diagnóstico sanitizado | Sem corpos de conversa/tokens; finalidade, retenção e custo definidos |
| P2 — Ambientes | Configuração publicável por ambiente e isolamento de dados | Homologação não aponta por engano a produção; permissões conferidas |
| P3 — Novas capacidades | Avaliar fila offline, push, sincronização de calendário, comprovação institucional e exclusão autosserviço | Requisitos, consentimento, modelo de dados e testes próprios antes de anunciar |

**Já existem** grupos privados, convites/códigos, remoção pelo organizador, materiais privados, feedback, favoritos persistentes, otimização de foto e moderação com acesso restrito. Não listá-los como “futuros” apenas porque não existiam nos protótipos antigos.

Fotos privadas, eliminação física automatizada de arquivos e sincronização de calendários exigiriam decisões específicas de compatibilidade e retenção. Não alterar um bucket público para privado esperando que URLs já usadas continuem funcionando sem adaptação.

## 10. Roteiro prático para apresentação UPX

### 10.1 Preparação ética e técnica

Prepare **duas contas controladas**, A e B, com perfis identificados como demonstração, e uma terceira C se for demonstrar isolamento. Não use contas reais de participantes nem publique senhas. Escolha uma disciplina efetivamente presente no catálogo, um material autoral pequeno e um encontro futuro. Se necessário, prepare antecipadamente uma sessão elegível para avaliação, sem falsificar frequência ou alterar o relógio para “aprovar” o cenário.

Antes da apresentação:

- Registre versão do site e do APK utilizado; não confunda ambos.
- Confira rede, acesso das contas e disponibilidade dos serviços.
- Separe capturas/vídeos sanitizados como alternativa se a rede falhar; apresente-os como gravações, não como execução ao vivo.
- Não exiba tokens, links de recuperação, código privado de grupo ou arquivos de participantes.
- Não dependa de e-mail real ou de integração de calendário ainda não validada sem deixar isso claro.
- Demonstrações físicas devem usar aparelhos reais; não utilizar emuladores/simuladores.

### 10.2 Sequência sugerida de 12–15 minutos

| Etapa | Ação demonstrada | Mensagem técnica/didática |
|---|---|---|
| 1 — Problema e escopo | Apresentar apoio por disciplina e os cinco destinos | Produto acadêmico, sem promessa de vínculo institucional |
| 2 — Perfil | A quer aprender; B oferece ajuda na mesma matéria | Papéis por disciplina; catálogo controlado e autodeclaração |
| 3 — Foto/seleção | Mostrar imagem opcional e prévia antes de salvar | Estado editado é diferente de estado persistido |
| 4 — Descoberta | Procurar, abrir detalhe e “Por que este perfil?” | Compatibilidade explicável; não IA que certifica domínio |
| 5 — Consentimento | A envia dúvida/objetivo; B lê e aceita | Pedido pendente não é conversa autorizada |
| 6 — Colaboração | Trocar mensagem e consultar material autoral | Persistência e acesso contextual; sem E2EE prometida |
| 7 — Agenda | Criar encontro, confirmar e mostrar exportação ICS | Encontro tem ciclo próprio; arquivo não é sincronização |
| 8 — Grupo | Criar grupo privado, rever capacidade e convidar | Visibilidade, inscrições, vagas e código são controles diferentes |
| 9 — Robustez | Mostrar um vazio, validação inválida ou erro controlado | Sem dados fictícios; feedback indica próximo passo |
| 10 — Encerramento | Exibir matriz de evidência e pendências | Honestidade sobre testes e plataformas |

Se houver tempo, mostre favoritos e notificações para diferenciar guardar referência, ler aviso e aceitar ação. Feedback só deve ser demonstrado em sessão realmente elegível no ambiente controlado. Arquivamento, remoção e bloqueio têm efeitos persistentes: reserve contas/contextos descartáveis e informe as consequências.

### 10.3 Demonstração opcional de reset

Somente com patch disponível, autorização e ciência dos envolvidos:

1. Mostre o conjunto de conexões controladas da conta e explique o que será perdido dos dois lados.
2. Mostre também um grupo e uma conexão entre outras contas para evidenciar preservação.
3. Abra Laboratório; confira que o botão exige `RESETAR` exatamente.
4. Execute uma vez, aguarde resposta e atualize os dois lados.
5. Compare perdas esperadas e preservações. Explique por que downloads, ICS e objetos físicos não foram apagados.

Não abra mão dessa explicação para obter um efeito visual rápido. Se a função não estiver instalada ou validada, mostre o contrato e declare a pendência; não recorra a seed ou SQL antigo.

### 10.4 Como apresentar fundamento acadêmico sem inventar pesquisa

Relacione cada referência a uma decisão concreta: Norman para feedback/consentimento, Krug para leitura e navegação, Tidwell para detalhes progressivos, Bass para responsabilidades/atributos de qualidade e Kleppmann para retry/consistência. Cite a [bibliografia](12-referencias-e-glossario.md), sem inventar citações literais ou dizer que o aplicativo provou aumento de aprendizagem.

Se houver avaliação futura com estudantes, documente objetivo, recrutamento, consentimento, tarefas, critérios e limitações da amostra. Teste automatizado e demonstração da equipe não são pesquisa com usuários.

## 11. Evidências e critérios de aceite da entrega

### 11.1 Baseline e pendências

O histórico da **3.3** registra **55 testes Node, 156 Chrome, 156 WebKit, 241 assertivas SQL com rollback e 127 assertivas autenticadas de grupos**. São categorias e execuções históricas distintas; não some os números como indicador de cobertura e não use o total para certificar o patch de reset ou o backend legado.

Para a **3.3.1 publicada**, foram informados **57 testes Node, 74 Chrome, 74 WebKit e 49 assertivas SQL com rollback aprovados**, incluindo timeout de lock e exclusão atômica. O recorte de navegador cobre **núcleo, foto, grupos e laboratório — não a suíte inteira de 166 testes**. Os smokes Chrome offline e WebKit online passaram; WebKit online não comprova Safari físico offline.

A migração preservou todos os dados/funções, sem reset real. Foram criados `MatchUp-3.3.1.apk` e `MatchUp-PWA-3.3.1.zip`; os **21 ativos web** conferidos são idênticos entre APK, ZIP e publicação. Igualdade dos ativos não significa igualdade binária dos pacotes nem teste em aparelho físico. Consulte procedimentos e identificação dos artefatos nos [capítulos 07](07-testes-e-validacao.md) e [13](13-historico-de-releases.md).

Permanecem separados os gates de Android físico, iPhone físico, e-mail real e Safari instalado/offline. Automação Chromium/WebKit não é validação física, estudo de usabilidade nem declaração de conformidade WCAG. Consulte a evidência exata nos [capítulos 07](07-testes-e-validacao.md) e [13](13-historico-de-releases.md).

### 11.2 Ficha mínima de uma evidência nova

| Campo | Conteúdo esperado |
|---|---|
| Identificação | Data, responsável e cenário |
| Versão | Fonte/build/URL ou APK, versionCode e hash quando aplicável |
| Ambiente | Homologação/produção autorizada, navegador e dispositivo real quando houver |
| Procedimento | Comando ou passos reproduzíveis, precondições e dados controlados |
| Expectativa | Regra observável e preservações exigidas |
| Resultado | Passou/falhou/bloqueado, com mensagem sanitizada e artefato correspondente |
| Limites | O que o cenário não verifica |
| Encerramento | Limpeza restrita de fixtures, processos encerrados e dados preservados |

### 11.3 Checklist de aceite funcional e de publicação

- [ ] Jornadas principais percorrem perfil → descoberta → pedido → aceite → chat → encontro.
- [ ] Catálogo distingue cobertura e preserva escolhas antigas sem inventar disciplinas.
- [ ] Foto é opcional, só envia ao salvar e não quebra layout em formatos diferentes.
- [ ] Solicitações e mensagens respeitam ator/contexto, retry e perda de acesso.
- [ ] Grupos preservam privado por padrão, capacidade, código e regra de remoção.
- [ ] Materiais e agenda/feedback possuem autorização e estados coerentes.
- [ ] Estados vazios, erros e caminhos de recuperação não simulam sucesso.
- [ ] Teclado, foco, zoom e leitores de tela têm evidência apropriada, sem extrapolar automação.
- [ ] Build público contém só ativos aprovados e não inclui segredos ou legado.
- [ ] APK, PWA e SQL necessários estão identificados e compatíveis.
- [ ] Novas funcionalidades têm resultado próprio; pendências físicas/e-mail estão explícitas.
- [ ] Manual, contratos e histórico correspondem ao que foi realmente distribuído.

Os itens são critérios para preencher na entrega correspondente, **não marcações de aprovação obtida nesta reescrita**.

## 12. Manter a documentação útil

Ao alterar um campo, limite, RPC, política, versão ou processo, atualize o capítulo especializado e revise os links. Evite duplicar listas extensas de SQL ou comandos em vários documentos: o manual explica a jornada; frontend explica o cliente; banco explica relações; configuração explica instalação; operação explica responsabilidades; testes e histórico registram evidência.

A autoria destes três capítulos limitou-se a documentação: leitura de fontes, reescrita e conferência de coerência/links, sem executar builds, testes de aplicação, deploy ou operações de banco. Os resultados finais de migração, testes, equivalência dos ativos e publicação da 3.3.1 incorporados posteriormente foram informados pelo responsável pela entrega de código; a rastreabilidade da release concluída fica nos capítulos 07/13.
