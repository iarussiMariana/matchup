# 08 — Operação, privacidade e suporte

[Índice](README.md) · [Uso do produto](02-funcionalidades-e-uso.md) · [Configuração segura](05-supabase-e-configuracao.md)

## 1. Compromissos reais, não promessas de infraestrutura

MatchUp 3.3.3 conecta adultos de **18 anos ou mais** para colaboração acadêmica. Não é serviço de relacionamento, não é um serviço oficial da FACENS e não comprova matrícula, identidade civil ou qualificação pedagógica de alguém. A idade é uma regra de acesso baseada na data de nascimento do perfil-base; não equivale a verificação documental.

A aplicação implementa bloqueio, denúncia, moderação por papel explícito e controles de acesso a conversas/grupos/materiais. Isso não constitui serviço de emergência nem garantia de resposta humana imediata. **Não há operador de moderação atribuído por padrão nem canal/plantão/SLA comprovado por este código.** Antes de ampliar o uso, responsáveis reais precisam ser designados e comunicados aos participantes.

Este capítulo foi reescrito a partir dos fontes locais, sem consultar dados privados ou configurar serviços. Não declara conformidade jurídica certificada, SMTP funcionando, banimentos Auth configurados, backup testado no ambiente atual ou entrega de e-mail validada. Os procedimentos propostos abaixo precisam de aprovação, responsáveis e registro de execução.

## 2. Quem deve assumir cada responsabilidade?

A tabela é uma **proposta operacional**, não uma lista de pessoas já designadas.

| Papel a designar | Responsabilidade | Acesso mínimo necessário |
|---|---|---|
| Responsável pelo produto | Escopo, comunicação, critérios de abertura/pausa e prioridades | Indicadores sem conteúdo privado, quando suficiente |
| Responsável técnico Supabase | Migrações, Auth, RLS/grants, Storage, recuperação e incidentes | Administração por canal separado e controlado |
| Moderador autorizado | Analisar denúncias, justificar decisão, evitar conflito de interesse | Papel em `mentor_moderators`; não precisa senha de banco |
| Responsável por suporte | Triagem e orientação; encaminhar incidentes/direitos | Dados mínimos do chamado, não sessão/senha de usuário |
| Responsável por privacidade | Definir controlador/operadores, canal, bases legais, retenção e atendimento de direitos | Inventário e procedimentos; consulta a dados conforme necessidade/autorização |
| Organizador de grupo | Visibilidade, inscrição, código, membros e local de encontro | Apenas ferramentas do próprio grupo; não administração de conta |

Controlador, operadores e encarregado são papéis jurídicos a definir conforme a operação efetiva, contratos e LGPD — não é correto atribuí-los automaticamente à FACENS, a uma pessoa do código ou ao provedor de nuvem. Publicar um canal válido e uma política aprovada antes de prometer atendimento. Não inventar nome, telefone, e-mail ou prazo neste manual.

## 3. Inventário de dados e exposição

| Categoria | Exemplos | Quem pode acessar no fluxo normal | Atenção de privacidade |
|---|---|---|---|
| Identidade/Auth | Conta, e-mail, sessão; data de nascimento em perfil-base | Titular e serviços autorizados, conforme Auth/políticas | Não enviar tokens/senha ao suporte; confirmação de e-mail pode não estar ativa |
| Perfil acadêmico | Nome, curso, semestre, matérias, bio, experiência, metodologia, horários, cidade/instituição opcionais | Pessoas elegíveis conforme descoberta, perfil, relação e bloqueios | Não colocar endereço residencial, documento ou informação sensível na bio |
| Foto | URL em bucket `photos` público | Quem obtiver a URL pública | Bloqueio, logout ou troca de foto não revogam cópias/URLs já conhecidas |
| Pedido/conversa | Disciplina, dúvida, objetivo, proposta; mensagens | Dupla autorizada; chat exige pedido aceito | Não há criptografia ponta a ponta implementada/verificada |
| Grupo | Nome, matéria, objetivo, capacidade, preferência de horário | Público autenticado elegível ou convidados/membros, conforme visibilidade | “Público” não significa leitura anônima da RPC; descrição do grupo não é campo secreto |
| Membros/local/código | Participantes, sala/link, código reutilizável | Membros para detalhes; somente organizador consulta/gera código | Não publicar códigos nem links de encontro em canal aberto |
| Agenda | Data, duração, formato, local, respostas | Participantes com acesso ao contexto | Remarcação exige reconfirmação; histórico tem regras distintas de grupo aberto |
| Materiais | Nome, tipo, tamanho, autor, conteúdo | Participantes autorizados do contexto e com autor ainda autorizado | Bucket privado, mas downloads/cópias podem persistir |
| Avaliações | Nota, comentário e identificação do avaliador | Leitores autorizados do perfil, com filtros de elegibilidade/bloqueio | Não são avaliações anônimas; comentar apenas o encontro acadêmico |
| Favoritos | Perfil salvo por alguém | Próprio titular | Não representam conexão recíproca nem consentimento do alvo |
| Denúncias | Motivo, relato, envolvidos e estado | Denunciante vê próprias; moderadores autorizados veem fila | Notas internas e evidências precisam de acesso restrito |
| Auditoria de moderação | Moderador/alvo, decisão, ação, justificativa e data | Processo autorizado de moderação/administração | Trilha imutável por trigger; identificação histórica exige política específica |
| Logs, backups e metadados de provedores | Eventos técnicos, identificadores e cópias de recuperação | Operadores autorizados conforme contrato/configuração | Retenção efetiva não foi inventariada no ambiente remoto nesta revisão |
| Legado preservado | Tabelas de relacionamento/Campus e integrações antigas | Não são jornada atual; dependem de políticas próprias | Não excluir sem inventário, base legal e análise das dependências |

As 24 tabelas acadêmicas e integrações estão no [dicionário](04-banco-de-dados.md). A ausência de um campo na tela não prova que não exista no legado, num backup ou em logs do provedor.

## 4. O que as ações do usuário fazem — e não fazem

| Ação | Efeito verificado | Não equivale a |
|---|---|---|
| Desativar oferta de monitoria | `active=false`; deixa de oferecer como monitor ativo | Apagar conta ou necessariamente sair da aprendizagem mútua/favoritos com relação aceita |
| Bloquear pessoa | Interrompe contatos e visibilidade autorizada conforme regras, inclusive efeito em contexto compartilhado | Banimento de Auth, exclusão de mensagens ou remoção de foto pública |
| Denunciar | Cria/recupera denúncia pendente para análise | Bloqueio automático ou decisão humana instantânea |
| Sair do grupo | Remove participação/convite; declina encontros futuros relacionados | Apagar histórico, excluir conta ou impedir para sempre reentrada válida |
| Remover membro como organizador | Remove participação, registra impedimento duradouro, ajusta agenda futura | Só esconder o cartão; código novo não permite reentrada do removido |
| Rotacionar/desabilitar código | Invalida o código anterior para novas entradas | Remover membros que já entraram ou invalidar seus arquivos baixados |
| Arquivar grupo | Estado `cancelled`, encerra inscrições, anula código, cancela encontros futuros | Exclusão física do grupo e de todo histórico |
| Desvincular foto | Retira/altera referência no perfil | Apagar objeto Storage, caches ou cópias de terceiros |
| Sair da conta | Cliente usa `signOut({scope:'local'})` | Excluir conta ou garantir revogação de todas as sessões em outros dispositivos |
| Restrição de moderação | Nega elegibilidade acadêmica via `mentor_restrictions` | Escrever `auth.users.banned_until` ou desabilitar todo o Auth |

Não há RPC acadêmica de desbloqueio nem de desfazer remoção de grupo verificada nos contratos 3.3 aqui inspecionados. Não orientar suporte a apagar registros manualmente para simular botões inexistentes. Um recurso futuro exige desenho, autorização e testes próprios.

### Reset de laboratório — entregue na 3.3.1

O código atual de `mentorship.js` acrescenta **Configurações → Laboratório → Resetar meus matches**, com diálogo que exige digitar exatamente `RESETAR`. “Matches” significa aqui conexões acadêmicas, não o reset romântico legado. A RPC foi instalada e a interface publicada na 3.3.1; os testes e limites estão nos capítulos 07 e 13. Nenhum reset de conta real foi realizado na entrega.

| Ação adicionada | Efeito do contrato validado com fixtures | Preserva / não realiza |
|---|---|---|
| Resetar próprias conexões | Apaga todos os pedidos enviados/recebidos, de qualquer status, e em cascata mensagens, encontros individuais, participantes, avaliações e metadados de materiais; remove leituras das notificações correspondentes para ambos os lados | Conta, perfil, foto, favoritos, bloqueios, denúncias, todos os grupos e relações entre terceiros; não apaga arquivos físicos Storage, downloads ou ICS exportados |

Usar somente com contas de laboratório e ciência das pessoas envolvidas: **afeta ambos os participantes**, não apenas a tela de quem confirma. A RPC autoriza a própria conta acadêmica elegível; não existe nessa implementação papel especial ou allowlist de “conta de laboratório”. A confirmação textual é uma barreira contra acidentes, não uma autorização administrativa.

Fechar o diálogo não cancela a operação enviada. O cliente só invalida seu estado se a conta atual ainda for a que iniciou o reset; isso não promete atualização imediata da tela do outro participante. Em falha de rede, consultar novamente as conexões antes de repetir: não há chave idempotente, e uma nova chamada pode apagar conexões criadas depois da anterior. Não há desfazer pela interface após commit.

Arquivos remanescentes precisam do procedimento supervisionado de retenção/Storage: remover metadados revoga o acesso futuro baseado naquele contexto, mas não recolhe URLs já emitidas, cópias ou calendários exportados. O reset não substitui exclusão de conta nem atendimento de direitos. Instalar `mentorship-lab.sql` com `tools\deploy-lab.cjs` **nunca invoca** a ação destrutiva. Consulte [o contrato e a transação](04-banco-de-dados.md#71-reset-das-próprias-conexões--adição-pós-33) e [a implantação incremental](05-supabase-e-configuracao.md).

## 5. Fotos, materiais e compartilhamento responsável

### Fotos públicas

- A foto é opcional no perfil; evitar imagens com documentos, crachás legíveis, localização residencial ou terceiros sem autorização.
- O cliente aceita JPEG/PNG/WebP não vazio até 5 MiB, usa editor/otimização e envia JPEG. O limite é do cliente inspecionado, não uma configuração cloud comprovada do bucket.
- URL pública é acessível por quem a conhece. Controle de edição por pasta do próprio UID **não torna o conteúdo privado**.
- Retirar a foto do perfil é desvinculação. Uma solicitação de remoção física requer localizar e tratar o objeto pelo procedimento autorizado; caches e cópias externas não têm apagamento garantido.

### Materiais privados

- Máximo 10 MiB por arquivo e 50 registros por contexto, **incluindo reservas não confirmadas**. PDF, Word, PowerPoint, JPEG/PNG/WebP são tipos permitidos no contrato atual.
- O fluxo é `mentor_file_prepare` → upload Storage → `mentor_file_commit`. Material só fica publicado após conferir proprietário, MIME e tamanho.
- Não há autosserviço geral de exclusão de material confirmado verificado. `mentor_file_abort` apenas limpa reserva própria, não confirmada e sem objeto Storage.
- O cliente emite URL assinada por 60 segundos. Quem recebe o link pode utilizá-lo durante sua validade; não o compartilhar nem anexar em chamados. Revogação de contexto impede novas autorizações, mas não garante cancelar imediatamente links já emitidos.
- Extensão/MIME/tamanho válidos não provam que o arquivo seja livre de malware, vazamento ou conteúdo inadequado. Não há verificação antivírus garantida no código.
- Compartilhar só material próprio ou autorizado; não distribuir avaliações sigilosas, dados pessoais de colegas ou obras sem direito de reprodução. Um arquivo acessível a um grupo ainda pode ser copiado.

### Encontros e códigos

Grupos novos são **privados, com 12 vagas incluindo organizador**, ajustáveis de 2 a 100. Convites e códigos não reservam lugar. Preferir locais públicos/apropriados para encontros presenciais e não tratar o app como serviço de supervisão. Links de reunião devem ficar no campo de local, que não aparece em cartões de não membros; escrever o link na descrição pública contorna essa proteção.

## 6. Retenção e LGPD: decisões ainda necessárias

### 6.1 Princípios aplicados ao procedimento

Finalidade, adequação, necessidade, transparência, segurança e prestação de contas orientam a coleta e a operação. Na prática: explicar por que cada informação é necessária; não recolher documento “por garantia”; limitar quem acessa relatos; atender correções; manter registro de decisões e incidentes.

Não afirmar que todos os tratamentos usam consentimento, que aceitar termos resolve todas as obrigações ou que o produto é “certificado LGPD”. Base legal, direitos aplicáveis, relações com provedores, transferências e obrigações de comunicação precisam de avaliação do responsável jurídico/privacidade. Os links oficiais ao fim são referência, não parecer legal.

### 6.2 Retenção não é um timer já implementado

**Não foi identificado mecanismo de expurgo automático geral** de contas, mensagens, fotos, materiais, reservas ou auditoria. Políticas de retenção de provedores também não foram consultadas nesta revisão. Não prometer “apagamento após X dias” sem decisão e implementação verificadas.

| Conjunto | Decisão operacional a formalizar | Limitação técnica a considerar |
|---|---|---|
| Conta/perfil e conteúdo de uso | Finalidade, prazo após inatividade/encerramento, acesso e revisão | Cascatas e integrações legadas; excluir Auth não substitui plano de arquivos |
| Fotos e materiais | Remoção física, órfãos/reservas, conteúdo de terceiros e denúncias | Referência no banco não equivale a bytes; URLs/cópias externas |
| Conversas/agenda/avaliações | Retenção compartilhada, correções e direitos dos demais participantes | Conteúdo pertence a relações; não apagar tudo unilateralmente sem análise |
| Denúncias/auditoria | Necessidade, base legal, acesso, prazo e descarte autorizado | Denúncias anulam FKs de pessoas; auditoria preserva UUIDs e bloqueia alteração/exclusão |
| Backups/logs | Prazo, proteção, restauração e reaplicação de exclusões após restore | Backup antigo pode reintroduzir dados; políticas variam por serviço/plano |

Definir “quem decide”, “quem executa”, “como prova” e “quando revisa” antes de anunciar uma política. Exceções de conservação devem ser justificadas; não desabilitar a auditoria imutável para limpar um chamado de privacidade.

### 6.3 Pedidos de direitos e encerramento de conta

**Não há fluxo completo de autoexclusão de conta verificado no frontend/RPCs acadêmicos.** Não orientar a usar um botão inexistente ou confundir logout/desativação com exclusão. O seguinte é um **procedimento supervisionado proposto**, ainda a operacionalizar:

1. Receber o pedido pelo canal oficial a ser definido e verificar identidade de forma proporcional. Nunca solicitar senha, token, código de sessão ou cópia indiscriminada de documento.
2. Esclarecer a intenção: corrigir perfil, deixar de oferecer monitoria, parar contato, sair de grupo, remover foto, obter acesso/cópia, encerrar conta ou apagar dados. São operações diferentes.
3. Localizar dados por identificador exato com acesso autorizado: Auth, perfil-base/acadêmico, relações, grupos organizados, arquivos, legado, denúncias, auditoria, logs e backups relevantes. Não exportar banco inteiro para “procurar”.
4. Avaliar finalidade/base legal, direitos de terceiros e exceções; registrar escopo, conservação necessária, responsável e comunicação prevista. Não prometer eliminação imediata total.
5. Planejar os efeitos: conta organizadora tem FKs em grupos; cascatas podem afetar outros participantes. Objetos Storage precisam de tratamento próprio e ordem compatível com a API do provedor.
6. Ensaiar a operação específica em staging; exigir revisão técnica/privacidade e recuperação controlada. Não usar reset de banco, seed ou comandos amplos de exclusão. Um reset de laboratório não substitui o atendimento de uma solicitação de exclusão de dados pessoais.
7. Executar pelo canal administrativo aprovado, com IDs exatos e evidência mínima. Verificar conta/sessões, registros pretendidos, objetos e dados preservados; explicar limites de cache, cópias externas e backup.
8. Responder ao titular com o que foi efetivamente feito, pendências e justificativas; guardar prova mínima de atendimento com prazo definido.

Correção de data de nascimento do perfil-base pode exigir fluxo supervisionado; não burlar a regra de 18+ editando `age` ou usando conta alheia. Não há exportação integral de dados pessoais de autosserviço verificada; eventual acesso/cópia segue o mesmo processo de identidade, minimização e revisão.

## 7. Moderação: da denúncia à decisão

### 7.1 Limites e acesso

- `mentor_report` aceita `harassment`, `spam`, `impersonation`, `inappropriate` ou `other`, relato de 10–2000 caracteres, alvo distinto do denunciante e conhecido por contexto permitido.
- Uma denúncia pendente por par é reutilizada. No máximo 10 denúncias novas por denunciante em uma janela móvel de um dia; repetição não gasta uma nova vaga.
- `mentor_my_reports` mostra próprias denúncias e mensagem pública genérica de resolução, não justificativa interna.
- `mentor_moderation_access` exige elegibilidade e registro em `mentor_moderators`. E-mail, ser organizador de grupo ou claim `moderator=true` não conferem esse papel.
- `tools\moderation-admin.cjs` administra concessão/revogação por UUID explícito. Não há usuário padrão ou operador automaticamente criado. Veja [configuração](05-supabase-e-configuracao.md).

### 7.2 Roteiro recomendado para operador autorizado

1. Confirmar que está usando conta individual autorizada; nunca compartilhar conta de moderador.
2. Abrir a fila no estado desejado (`pending`, `reviewed`, `dismissed`; até 200 resultados). Proteger tela/exportações e evitar capturas de relatos identificáveis.
3. Verificar conflito de interesse. A RPC impede julgar denúncia em que o moderador é denunciante ou alvo; encaminhar a outro operador autorizado, quando existente.
4. Considerar contexto estritamente necessário; denúncia não é prova automática. Não pedir ao denunciante para revelar mais dados do que precisa nem repassar relato integral ao alvo.
5. Selecionar estado `reviewed` ou `dismissed`, ação `none`, `restrict` ou `restore`, justificativa interna até 2000 caracteres. Ações `restrict`/`restore` exigem ao menos 10 caracteres; `dismissed` com `restrict` é proibido.
6. Confirmar resultado. Alvo já excluído só admite ação `none`. O banco registra auditoria e atualiza a mensagem pública genérica; justificativa interna não é exibida ao denunciante.
7. Registrar encaminhamento operacional quando necessário. A infraestrutura não envia e-mail/push de decisão automaticamente por este fluxo.

A decisão usa locks de conta, papel e denúncia, para se coordenar com revogação de moderador e mudanças de elegibilidade. A auditoria é imutável por trigger; outra decisão acrescenta evento em vez de apagar a anterior. Não repetir cliques como se toda moderação fosse idempotente.

### 7.3 Restrição, restauração e suporte

`restrict` tira elegibilidade acadêmica; `restore` remove essa restrição lógica. Nenhuma das ações garante alterar bans Auth, apagar conteúdo público, desfazer bloqueios, readmitir membro removido ou restaurar associação perdida. Se não houver operador disponível, comunicar a limitação real pelo canal definido; não prometer prazo nem contornar o papel com acesso direto ao banco.

## 8. Suporte: coleta mínima e triagem

### Modelo seguro de chamado

- Versão identificável do app/release, navegador/sistema e horário com fuso.
- Ação tentada, resultado esperado e mensagem exibida, sem conteúdo de conversas.
- Tipo de contexto: perfil, pedido, grupo, encontro ou material.
- Passos para reproduzir com dados fictícios; captura recortada/anonimizada se indispensável.
- Identificador técnico estritamente necessário por canal restrito; não postar UUIDs reais em issue pública.
- Nunca pedir senha, JWT, refresh token, código completo de convite, link assinado ativo, dump de banco ou HAR não saneado. HAR/console podem conter credenciais e conteúdo privado.

### Árvore de encaminhamento

```text
Há exposição de dados, perda de conta ou risco imediato?
 ├─ Sim → preservar evidência mínima e seguir runbook de incidente.
 └─ Não → app carrega?
           ├─ Não → artefato/cache/rede, sem apagar conta ou banco.
           └─ Sim → problema é login?
                     ├─ Sim → separar sessão, confirmação, redirecionamento e entrega real.
                     └─ Não → operação é recusada ou resultado não aparece?
                               ├─ Recusada → regra de acesso/limite/estado, tabela abaixo.
                               └─ Ausente → filtro, atualização de sessão/dados e versão.
```

| Cenário | Hipóteses e orientação | Escalar quando |
|---|---|---|
| Login/cadastro não conclui | Rede/Auth, redirect, configuração de confirmação; repetir só após entender erro, sem criar contas em série | Configuração do provedor exige acesso administrativo não disponível |
| E-mail não chegou | Configuração não comprova entrega; checar modo de confirmação e caixa/destinatário sem coletar credenciais | Precisar de SMTP/DNS/provedor/teste físico; `auth-readiness` não resolve tudo |
| Pessoa sumiu da descoberta | Filtros, opt-out de oferta, incompatibilidade de aprendizagem, pedido já enviado, bloqueio/restrição | Com dados sintéticos o comportamento divergir do contrato; não revelar motivo privado do alvo |
| “Matéria inválida” ao salvar | Nome/curso do catálogo, lista atual do curso, limite 256; valor legado só preservável na mesma lista | Snapshot/currículo incompleto ou contrato/schema divergente |
| Grupo privado não aparece | Não membro/sem convite é negação esperada; código permite tentativa de entrada, não consulta privada | Organizador elegível não acessa ações próprias com versão atual |
| Código correto não entra | Código rotacionado/desabilitado; grupo arquivado; inscrições fechadas; lotação; remoção/bloqueio/restrição | Reproducível com contas de teste elegíveis; nunca pedir que se apague impedimento no SQL |
| Duas pessoas tentam a última vaga | Transação/lock deve aceitar no máximo uma; organizador conta nas vagas | Contagem exceder capacidade; preservar evidência técnica, não conteúdo privado |
| Encontro ficou pendente | Novo membro ou remarcação exige reconfirmação; saída/remoção altera respostas futuras | Estado impossível após atualização, fora das regras de `mentor_session_save` |
| Não pode avaliar | Encontro não confirmado/terminado, presença não confirmada, alvo próprio ou acesso revogado | Todos os pré-requisitos conferidos com caso sintético |
| Material falha no upload | Limite 10 MiB, nome/tipo, quota 50 inclusive reservas, contexto; não repetir indefinidamente | Reserva/objeto órfão, commit com metadados divergentes, cleanup não confirmado |
| Download expirou | Solicitar novamente pelo app com contexto ainda autorizado | Novo link autorizado falhar; não compartilhar o anterior no chamado |
| Foto antiga continua visível | URL pública/cache ou arquivo anterior ainda presente; desvincular não apaga | Pedido de remoção física ou exposição indevida: procedimento supervisionado |
| Mensagem duplicada/reenvio incerto | Cliente deve preservar `client_id`; mesma chave/contexto/texto é idempotente | Duplicidade com mesma chave persistida ou erro consistente de contexto |
| Fila de moderação ausente | Ausência de papel explícito é esperada para usuário comum | Responsável já autorizado perdeu acesso; checar UUID/eligibilidade por canal seguro |

Um `42501` pode ser proteção correta. Não dar grants amplos, tornar material público, usar conta privilegiada na PWA ou reduzir idade mínima para “resolver acesso”.

## 9. Runbook de incidente

Este é um roteiro proposto; cobertura, responsáveis e prazos precisam ser formalizados. Se houver risco físico imediato, procurar os serviços locais de emergência apropriados: o MatchUp não os substitui.

### 9.1 Detectar e classificar

- Registrar hora, sistema, categoria (indisponibilidade, integridade, exposição, credencial, abuso) e alcance conhecido/ desconhecido.
- Separar observação de hipótese. Um erro de download não prova vazamento; uma foto pública acessível após bloqueio pode ser comportamento previsto, ainda sujeito a privacidade.
- Preservar evidência mínima saneada: ID técnico, revisão, erro e ações; não copiar conversas completas ou banco para grupo de chat.

### 9.2 Conter com menor impacto

- Credencial administrativa exposta: responsável revoga/rotaciona pelo provedor e revisa uso; remover do artefato não torna o segredo antigo seguro. Chave publicável isolada não é segredo admin; investigar permissões antes de classificá-la como vazamento.
- Código de grupo exposto: organizador rotaciona/desabilita; revisar membros já admitidos. Rotação sozinha não remove intruso existente.
- Material exposto: restringir novas autorizações e avaliar objetos/URLs conforme contexto; não prometer apagar cópias baixadas.
- Conta suspeita/abuso: usar bloqueio/denúncia e moderação autorizada; ação de Auth, se necessária, é administração separada não comprovada como já configurada.
- Falha de autorização generalizada: pausar a funcionalidade/publicação afetada conforme decisão do responsável; preservar evidência. Não resetar contas ou apagar tabelas.

### 9.3 Investigar e corrigir

Comparar versão implantada, grants/RLS, funções `SECURITY DEFINER`/`search_path`, políticas Storage e artefato `www`. Procurar alteração não autorizada sem abrir escopo de dados desnecessário. Reproduzir em staging com caso sintético. Corrigir por incremento revisado; ver [PRECHECK/BACKUP/STAGING/APPLY/VERIFY](05-supabase-e-configuracao.md).

### 9.4 Recuperar e comunicar

Validar fluxos positivos e negativos, integridade e recuperação de arquivos separadamente. Só reabrir quando os critérios forem atendidos. Responsável por privacidade avalia risco/dano e eventual comunicação à ANPD/titulares segundo regras aplicáveis; não declarar que toda falha exige a mesma comunicação ou inventar prazo neste manual. Registrar fatos, medidas, pendências e prevenção de recorrência com acesso limitado.

## 10. Backups, continuidade e manutenção rotineira

O provedor pode oferecer backups e PITR conforme plano/configuração; isso deve ser conferido e restaurado em ensaio, não presumido. Snapshot/hash antes/depois de migração prova invariantes de comparação, não disponibilidade de recuperação. Metadados Storage e bytes precisam de planos complementares.

Checklist proposto para cada ciclo de manutenção, com frequência definida pelo responsável:

- [ ] Responsáveis, canal de suporte e disponibilidade real de moderadores atualizados.
- [ ] Fila analisada por operador autorizado, com conflitos de interesse encaminhados.
- [ ] Concessões de moderação e credenciais administrativas revistas; sem conta compartilhada.
- [ ] Sinais de erros Auth/RPC/Storage acompanhados sem coletar conteúdo excessivo.
- [ ] Reservas órfãs/material não confirmado triados por processo supervisionado; sem purge indiscriminado.
- [ ] Backups protegidos, retenção documentada e restauração ensaiada; arquivos incluídos no plano.
- [ ] Artefato `www` conferido: allowlist de 23 arquivos + `sw.js` (24 públicos); 22 arquivos no precache obrigatório, sem MP4; nenhuma credencial de banco.
- [ ] Catálogo com origem/cobertura revisadas, sem anunciar matrícula verificada ou currículo completo quando parcial.
- [ ] Pedidos de direitos, correções e encerramento com situação rastreável.
- [ ] Testes/smokes autorizados isolados e cleanup verificado por IDs; não usar contas de participantes.

A exclusão do cache do navegador pode remover sessão/dados locais e prejudicar diagnóstico; não é primeiro passo universal. Distinguir cache do shell de dados remotos antes de orientar limpeza.

## 11. Critérios para abrir ou ampliar o piloto

| Item | Evidência existente / limite | Decisão necessária |
|---|---|---|
| Regras backend do hub 3.3 | Registro histórico: 241 assertions de rollback e 127 assertions autenticadas de grupos, com preservação/cleanup | Manter relatório da release; não chamar de teste executado nesta revisão |
| Regressões anteriores | 55 Node, 156 Chrome, 156 WebKit são evidência de release anterior | Não somar com 3.3 nem tratar como cobertura integral do estado atual |
| PWA/artefato | Contrato de build restrito a `www`; fonte na raiz | Verificar publicação específica e cache/service worker |
| iPhone/Safari e Android reais | **Validação física pendente** | Realizar em aparelhos autorizados; WebKit automatizado não é Safari de iPhone |
| Offline físico | **Pendente** | Testar shell, reconexão e falhas compreensíveis; não prometer CRUD offline |
| E-mail real | **Entrega física pendente**, acesso administrativo de e-mail não comprovado | Validar configuração, recuperação e entrega quando houver operador/acesso |
| Moderação humana | Painel/RPC/papel implementados; **sem operador padrão atribuído** | Designar responsável e comunicar cobertura real |
| Privacidade/encerramento | Controles técnicos presentes; retenção/purge/autoexclusão completos não verificados | Aprovar política, canal e procedimento supervisionado |

**Não usar emuladores** como substituição das pendências: não estão autorizados neste trabalho. A solicitação adicional de laboratório motivou testes/build/deploy da 3.3.1, registrados separadamente no capítulo 07; não elimina as pendências físicas, humanas e operacionais desta tabela. Uma checklist com item pendente não é atestado de indisponibilidade geral; é limite explícito do que se pode afirmar.

## 12. Fontes, navegação e referências oficiais

Contratos conferidos nos fontes: `supabase\mentorship.sql` (`mentor_actor`, bloqueio e chat), `mentorship-academic.sql` (contexto, agenda, avaliações e Storage), `mentorship-catalog.sql` (compatibilidade de currículo), `mentorship-product.sql` (denúncias, restrições, auditoria), `mentorship-groups.sql` (visibilidade/códigos/remoção); `tools\auth-readiness.cjs`, `tools\moderation-admin.cjs`, `tools\deploy-groups.cjs`; no cliente, `uploadPhoto`, `safePhoto`, `createSignedUrl` e logout local. Testes backend/live foram consultados como fontes, não executados.

- [01 — Arquitetura](01-visao-geral-e-arquitetura.md), [02 — Funcionalidades e uso](02-funcionalidades-e-uso.md), [03 — Frontend](03-frontend.md).
- [04 — Banco de dados](04-banco-de-dados.md), [05 — Supabase](05-supabase-e-configuracao.md), [06 — Desenvolvimento](06-desenvolvimento-e-android.md), [07 — Testes](07-testes-e-validacao.md).
- [09 — Legado](09-backend-legado.md), [10 — Manutenção](10-manutencao-e-evolucao.md), [11 — UI/UX e acessibilidade](11-ui-ux-e-acessibilidade.md), [12 — Referências/glossário](12-referencias-e-glossario.md), [13 — Histórico de releases](13-historico-de-releases.md).
- [LGPD — texto legal no Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm), [ANPD](https://www.gov.br/anpd/pt-br), [orientações ANPD para titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados).
- [Supabase: controle de acesso Storage](https://supabase.com/docs/guides/storage/security/access-control), [URLs assinadas](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl), [backups](https://supabase.com/docs/guides/platform/backups), [segurança de produção](https://supabase.com/docs/guides/deployment/going-into-prod).
