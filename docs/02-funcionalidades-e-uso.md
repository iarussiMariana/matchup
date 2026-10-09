# 02 — Funcionalidades e guia de uso do MatchUp 3.3.3

[Índice da documentação](README.md)

## 1. O que este manual descreve

O **MatchUp** conecta estudantes para apoio em disciplinas, monitorias entre pares e grupos de estudo. A experiência atual é **exclusivamente acadêmica**: não há seletor de namoro ou caronas no produto público. Uma pessoa pode ajudar em uma matéria e aprender outra; não precisa escolher uma identidade permanente de “monitor” ou “aluno”.

A referência deste manual é o **MatchUp 3.3.3 / versionCode 13**, com abertura opcional em vídeo e os refinamentos responsivos anteriores preservados. Os artefatos são `MatchUp-3.3.3.apk` e `MatchUp-PWA-3.3.3.zip`, sem recriar `Spark.apk`. Consulte a implantação, hashes e verificações efetivas no [histórico da entrega](13-historico-de-releases.md). A PWA usa <https://matchup-87k.pages.dev>. As versões 3.3, 3.3.1 e 3.3.2 permanecem históricas.

O patch 3.3.3 não modifica o banco nem executa operações em contas reais. A migração de laboratório é da campanha anterior 3.3.1, que registrou **57 testes Node, 74 Chrome, 74 WebKit e 49 assertivas SQL com rollback**, com preservação de dados e sem reset de participantes. Esses números não devem ser atribuídos ao novo patch. A campanha atual de navegador, seus recortes e limites estão em [testes e validação](07-testes-e-validacao.md). Homologação física e entrega real de e-mails continuam pendentes.

O serviço não confirma matrícula, vínculo institucional, domínio de disciplinas ou credenciais docentes. Curso, experiência e disponibilidade são declarações do próprio participante. Não há garantia de atendimento, aprovação acadêmica ou segurança de encontros. Combine horários e locais públicos com cuidado e compartilhe apenas o necessário.

### 1.1 Mapa dos cinco destinos

| Destino | Para que serve | Próximo passo típico |
|---|---|---|
| **Início** | Resumo, sugestões, matérias e próximo encontro | Revisar perfil, procurar apoio ou abrir grupos |
| **Descobrir** | Encontrar pessoas que oferecem ajuda e examinar compatibilidade | Abrir perfil e enviar solicitação contextualizada |
| **Chat** | Solicitações recebidas/enviadas, conexões aceitas e acesso a grupos | Aceitar pedido, conversar e organizar estudo |
| **Agenda** | Consultar, criar e acompanhar encontros | Confirmar presença, remarcar ou exportar calendário |
| **Perfil** | Identidade acadêmica, preferências e configurações | Atualizar matérias/foto, gerenciar segurança e sair |

Grupos são acessíveis pelo Início e pelo Chat; não constituem uma sexta aba principal. Notificações ajudam a reencontrar os objetos correspondentes, mas abrir ou ler uma notificação não toma decisões pelo usuário.

### 1.2 A jornada em uma frase

**Criar conta → declarar trajetória e matérias → encontrar apoio → enviar pedido → obter aceite → conversar → combinar encontro → estudar e, quando elegível, avaliar.** Grupos oferecem uma jornada coletiva paralela, sem exigir uma solicitação individual aceita entre todos os integrantes.

## 2. Entrar, criar conta e recuperar acesso

### 2.1 Primeiro acesso

1. Abra o endereço público ou o aplicativo Android correspondente à versão desejada.
2. Escolha o cadastro e informe nome, nascimento, e-mail e senha.
3. Use nome de 2 a 80 caracteres, nascimento válido e idade mínima de **18 anos**. O formulário não aceita datas anteriores a 1900.
4. Use e-mail válido, com até 254 caracteres, e senha de **8 a 128 caracteres**. Não reutilize senha de outros serviços.
5. Envie uma vez e aguarde. Se o serviço fornecer uma sessão, prossiga ao perfil; se exigir confirmação, abra a mensagem recebida no e-mail antes de entrar.

A existência do formulário não comprova entrega real de e-mails no ambiente. A validação desse fluxo está separada da automação de navegador no [capítulo de testes](07-testes-e-validacao.md).

#### Abertura em vídeo: você pode pular

Na primeira abertura elegível da sessão da aba, a apresentação MatchUp pode tocar **sem som**, por cerca de dez segundos. Use o botão de pular a qualquer momento ou **Escape** no teclado. O aplicativo carrega por trás e continua utilizável se a reprodução falhar. No Android, o vídeo vem depois da tela inicial do sistema, não no lugar dela.

Ela não se repete ao navegar entre as áreas do app. A frequência depende da sessão/aba do navegador; restauração de abas pode variar. Com armazenamento bloqueado, o controle vale apenas para o documento aberto. Movimento reduzido, economia de dados/conexão muito lenta, offline, abertura em segundo plano e links de autenticação/recuperação dispensam a mídia sem baixá-la. **Não ver o vídeo nessas condições é esperado, não um erro de acesso.**

### 2.2 Login e recuperação

No login, utilize a senha já cadastrada. A exigência de tamanho para uma **nova** senha não deve ser interpretada como migração automática das senhas existentes.

Se esqueceu a senha:

1. Abra a recuperação e informe seu e-mail.
2. Solicite o link e confira caixa de entrada e spam.
3. Abra o link válido no contexto indicado pelo serviço.
4. No formulário de recuperação, informe a nova senha e sua confirmação; aguarde a atualização.

O fluxo atual reconhece a sessão de recuperação do Supabase. **Não é necessário copiar manualmente um token para um modal antigo.** Links inválidos, expirados ou já consumidos exigem nova solicitação. Não encaminhe o link a terceiros nem o inclua em capturas de tela.

Em **Perfil**, a área de segurança da conta também pode enviar um link ao e-mail da própria conta. **Sair** encerra a sessão local e limpa o estado privado da interface; não exclui conta, perfil, mensagens ou sessões de outros dispositivos.

## 3. Montar e manter o perfil acadêmico

O preenchimento inicial tem **duas etapas**: trajetória e matérias/preferências. Nome, curso e semestre são obrigatórios; o semestre deve ser inteiro entre **1 e 20**. Instituição, cidade, biografia, foto e demais informações são opcionais, respeitadas as condições para oferecer ajuda.

### 3.1 Trajetória e apresentação

- Identifique curso/modalidade e semestre reais.
- Se desejar, informe instituição e cidade sem publicar endereço residencial.
- Use a biografia para apresentar objetivos acadêmicos, com até **1.000 caracteres**.
- Descreva metodologia e experiência declarada, cada uma com até **1.000 caracteres**.
- Informe disponibilidade em texto livre, até **160 caracteres**, e marque dias e períodos habituais: manhã, tarde e noite.
- Escolha preferência individual, em grupo ou ambas, e formato presencial, online ou híbrido.

Horários habituais são sinais para combinar disponibilidade, **não reservas de agenda**. Experiência e metodologia não são verificadas pela instituição.

### 3.2 Três listas com significados diferentes

| Lista | Significado | Limite |
|---|---|---:|
| **Estou cursando** | Matérias atuais da trajetória escolhida | 12 |
| **Posso ajudar com** | Matérias em que a pessoa oferece apoio | 8 |
| **Quero aprender** | Matérias para as quais procura ajuda | 8 |

Para aparecer como disponível para oferecer monitoria, selecione pelo menos uma matéria em **Posso ajudar com**. Desativar essa disponibilidade retira a oferta da descoberta; não impede procurar apoio nem elimina conversas existentes.

Assuntos gerais complementam o perfil: até **20 itens**, separados por vírgula, com até **80 caracteres por item**. Um assunto escrito livremente não é convertido automaticamente em disciplina do catálogo.

### 3.3 Usar o catálogo sem confundir cobertura com completude

O catálogo de referência reúne **21 nomes de curso, 24 combinações curso/modalidade, 718 disciplinas e 1.087 vínculos**. A cobertura está dividida em **18 grades completas, 4 parciais e 2 indisponíveis**. Esses números descrevem a base documentada, não uma consulta em tempo real ao sistema acadêmico institucional.

1. Escolha curso e modalidade com atenção: um mesmo nome pode ter combinações diferentes.
2. Pesquise a matéria; a busca desconsidera acentos.
3. Selecione o resultado e confira o chip adicionado e o contador.
4. Remova um chip para corrigir a escolha. Há carregamento de mais resultados em lotes de 30.
5. Salve o perfil para persistir as alterações.

**Estou cursando** usa a grade do curso. As listas de ajuda e aprendizagem permitem procurar no catálogo global. Uma grade parcial apresenta somente conteúdo verificado; uma indisponível não recebe disciplinas inventadas para preencher a tela. Consulte os links oficiais oferecidos quando precisar conferir a matriz.

Trocar de curso pode ajustar seleções ainda não salvas. Dados previamente persistidos fora da grade atual são preservados com aviso, e não convertidos silenciosamente. Perfis antigos sem identificador de curso do catálogo podem manter sua informação textual; isso não comprova que foram automaticamente recatalogados.

### 3.4 Adicionar, trocar ou remover foto

A foto é opcional. Sem ela, o aplicativo utiliza iniciais.

1. Abra a edição do perfil e selecione uma imagem **JPG/JPEG, PNG ou WebP**, não vazia, de até **5 MiB** — 5 × 1.024 × 1.024 bytes.
2. Confira a prévia. Selecionar o arquivo **não faz upload imediatamente**.
3. Se necessário, selecione outra imagem ou marque a remoção.
4. Pressione salvar perfil e aguarde a confirmação.

O cliente valida tipo e assinatura do arquivo, reduz a maior dimensão para até **640 pixels**, sem ampliar imagens menores, e produz JPEG com qualidade 0,82 e fundo branco. Transparência pode, portanto, ser substituída por branco. O editor oferece prévia, troca e remoção; não pressupõe ferramentas de recorte ou rotação.

As fotos usam o bucket `photos` e uma URL pública do projeto. **Foto pública não tem a mesma proteção de um material privado.** Remover a foto no formulário e salvar retira a referência do perfil; não equivale a comprovar exclusão física de todas as cópias.

Upload e gravação do perfil são etapas distintas. Se o primeiro funcionar e a segunda falhar, o arquivo pode já existir; o rascunho pode guardar a URL para nova tentativa. Não conclua que nada foi enviado apenas porque o salvamento final falhou. Alterações não salvas ainda não foram publicadas, mas rascunhos em memória podem se perder ao recarregar ou fechar o aplicativo.

## 4. Encontrar apoio no Início e em Descobrir

### 4.1 Ler o Início

O Início resume matérias, próximo encontro e indicadores, além de até três sugestões relacionadas às disciplinas de aprendizagem. Ausência de sugestões pode significar falta de ofertas compatíveis, não falha do sistema. Atualize o perfil e amplie a procura antes de concluir que a disciplina não tem participantes.

Uma nota sem avaliações aparece sem valor, como “—”; não existe pontuação fictícia. Contagens de encontros concluídos usam estado confirmado e horário final passado, **não comprovação de presença ou aprendizagem real**.

### 4.2 Buscar e examinar uma pessoa

1. Em **Descobrir**, procure uma disciplina.
2. Refine por curso/modalidade, semestre, formato e horários habituais quando necessário.
3. Examine o cartão: nome, curso/semestre, foto ou iniciais, formato e resumo de matérias.
4. Abra o perfil completo para consultar todas as matérias, metodologia, experiência, horários e avaliações disponíveis.
5. Use **Por que este perfil?** para entender os fatores apresentados.

A explicação de compatibilidade compara declarações de matérias, curso/modalidade, formato, horários e preferência. É uma regra explicável do produto, **não um diagnóstico por IA ou uma certificação de competência**.

Os cartões compactos priorizam identificação e ações; informações extensas ficam no detalhe. Essa divulgação progressiva é discutida em [UI/UX e acessibilidade](11-ui-ux-e-acessibilidade.md), com referência a [Tidwell e coautoras](12-referencias-e-glossario.md#ux03).

### 4.3 Pular, favoritar e solicitar não são a mesma coisa

- **Pular:** retira o cartão da lista local daquele momento; ele pode reaparecer ao atualizar. Não bloqueia a pessoa.
- **Favoritar:** registra uma preferência privada persistida no backend, consultável na lista de favoritos. Não cria pedido nem avisa que houve uma conexão.
- **Solicitar:** abre um formulário para explicar a necessidade acadêmica.
- **Bloquear ou denunciar:** ações de segurança distintas, explicadas adiante.

O gesto para a esquerda pula; o gesto para a direita **abre a solicitação**, não cria um match automaticamente. Há botões equivalentes: ninguém precisa depender exclusivamente de arrastar o cartão.

## 5. Enviar e responder solicitações

### 5.1 Quem precisa de ajuda

1. Abra o perfil de quem oferece a matéria.
2. Escolha uma das disciplinas oferecidas.
3. Descreva sua dúvida com **10 a 1.000 caracteres**.
4. Explique o objetivo com **5 a 500 caracteres**.
5. Opcionalmente, sugira data futura dentro dos próximos **365 dias**.
6. Revise e envie. Consulte as solicitações enviadas em **Chat**.

Exemplo de conteúdo adequado: “Estou com dificuldade para escolher o método de resolução deste tipo de exercício” e “Quero conseguir resolver um exemplo e explicar cada etapa”. Não inclua respostas sigilosas de avaliações, dados pessoais desnecessários ou pedidos para fraudar atividades.

A data sugerida **não cria um encontro na Agenda**. Se já houver solicitação para aquela disciplina e pessoa, consulte seu estado em vez de repetir o envio indiscriminadamente.

### 5.2 Quem recebe o pedido

1. Abra **Chat** e a lista de solicitações recebidas.
2. Leia matéria, dúvida, objetivo e eventual data sugerida.
3. Em um pedido pendente, escolha aceitar ou recusar.
4. Após o aceite, abra a conversa para alinhar expectativas e disponibilidade.

| Estado do pedido | Significado | Efeito |
|---|---|---|
| `pending` — pendente | Ainda aguarda decisão de quem recebeu | Não libera a conversa individual |
| `accepted` — aceito | Apoio aceito pelo destinatário | Libera a conexão e o chat |
| `declined` — recusado | Destinatário não aceitou | Não libera chat |

Somente quem recebeu decide um pedido pendente. “Deu match!” significa uma **conexão acadêmica aceita**, não reciprocidade romântica. Este manual não promete retirada de pedido ou desfazer conexão individual por um botão inexistente; bloqueio e reset de laboratório possuem finalidades e efeitos próprios.

## 6. Conversar com contexto acadêmico

Abra uma conexão aceita em **Chat**, digite a mensagem e envie. Use a conversa para definir escopo de apoio, local público ou link, materiais e próximos passos. Ferramentas do contexto permitem organizar encontros e acessar materiais.

- O chat individual é textual; recursos de stickers do servidor legado não fazem parte desse contrato.
- A aplicação consulta atualizações por polling de **12 segundos** enquanto está visível e interrompe esse acompanhamento em segundo plano. O frontend atual não abre assinaturas Supabase Realtime. Não é promessa de entrega instantânea ou push com o aplicativo fechado.
- Se o envio falhar, confira o aviso e tente novamente pelo fluxo apresentado. O identificador de cliente do mesmo envio é reutilizado para reduzir duplicação; isso não deve ser generalizado a toda operação do sistema.
- Se perder acesso por bloqueio, restrição ou mudança do contexto, a interface limpa conteúdo e ferramentas protegidas e orienta retornar à lista.
- O rascunho em memória não é backup nem fila de envio offline. Copie texto importante antes de recarregar.

Há controles de acesso no servidor; isso não significa criptografia ponta a ponta. Consulte [privacidade e suporte](08-operacao-privacidade-e-suporte.md) antes de compartilhar conteúdo sensível.

## 7. Organizar encontros pela Agenda

### 7.1 Criar um encontro

É necessário ter uma conexão aceita ou organizar um grupo aberto elegível.

1. Abra **Agenda → Novo encontro** ou a ação de agendamento no contexto da conversa/grupo.
2. Escolha o contexto autorizado e sua matéria.
3. Informe título, com até **100 caracteres**, e tópico opcional, com até **160**.
4. Escolha data futura e duração de **15 a 240 minutos**.
5. Defina formato e local público ou link, com até **200 caracteres**.
6. Salve e peça aos participantes que revisem o convite.

A matéria vem do contexto: o agendamento não é um cadastro arbitrário de disciplinas. Um horário habitual no perfil ou no grupo não substitui esse procedimento.

### 7.2 Confirmar, recusar, remarcar e cancelar

A Agenda oferece navegação por mês e dia, outros encontros e atualização da lista. Participantes podem confirmar ou informar **Não poderei**. Quem criou pode remarcar ou cancelar; uma remarcação exige nova confirmação.

Não confunda três decisões: **aceitar apoio** libera uma conexão; **entrar em grupo** cria participação coletiva; **confirmar encontro** registra resposta àquela sessão. Um pedido aceito não confirma automaticamente todos os encontros.

Encontros possuem estados como pendente, confirmado e cancelado. Se houver divergência após uma alteração, atualize antes de repetir a ação: uma falha de comunicação pode ter ocorrido depois da gravação.

### 7.3 Avaliar uma experiência

A avaliação é disponibilizada quando o servidor indica elegibilidade: encontro confirmado e encerrado pelo horário, acesso válido e participação confirmada, entre outras regras. Não há autoavaliação do responsável. A interface não deve liberar avaliação apenas porque o relógio local avançou.

Quando a ação aparecer, selecione nota de **1 a 5** e, se desejar, comentário respeitoso de até **1.000 caracteres**. Revise antes de enviar: não há promessa de edição livre de avaliação já registrada. O feedback ajuda a descrever a experiência, mas não certifica qualificação docente nem comprova resultado de aprendizagem.

### 7.4 Levar a agenda a outro calendário

1. Abra o encontro ou a exportação de agenda.
2. Gere o arquivo **`.ics`**. A aplicação reconsulta dados e permissões antes da exportação.
3. Use o compartilhamento ou download disponível.
4. Escolha o aplicativo de calendário e conclua a importação nele.
5. Confira data, horário, duração e fuso no destino.

No Android, a integração usa compartilhamento nativo pelo Capacitor. No navegador, usa compartilhamento de arquivos quando suportado ou download. No iPhone, o arquivo pode precisar ser aberto em aplicativo compatível/Arquivos ou importado pelo computador; **essa experiência ainda depende de validação física**. A ação do grupo direciona à Agenda.

Exportar não adiciona eventos automaticamente nem configura sincronização bidirecional. Após remarcação ou cancelamento, reexporte e confira o calendário externo; atualização ou duplicação depende do aplicativo escolhido. Links privados de acesso permanecem no MatchUp. Uma cópia já importada não desaparece quando o dado muda no sistema. Detalhes técnicos: [frontend](03-frontend.md) e [RFC 5545 nas referências](12-referencias-e-glossario.md#doc11).

## 8. Compartilhar materiais privados

Materiais pertencem ao contexto de uma conexão ou grupo e ficam disponíveis apenas a participantes autorizados naquele contexto.

1. Abra **Materiais** na conversa ou grupo.
2. Escolha arquivo não vazio de até **10 MiB**.
3. Use um formato aceito: **PDF, DOC, DOCX, PPT, PPTX, JPG/JPEG, PNG ou WebP**.
4. Aguarde envio e confirmação; depois confira a lista.
5. Para abrir/baixar, use a ação apresentada na lista, que gera acesso temporário.

Tipo, extensão e assinatura são verificados. O envio envolve preparar registro, transferir ao Storage e confirmar metadados. Em falha, o cliente tenta desfazer etapas incompletas; não considere um arquivo disponível só porque a transferência começou.

O acesso de download usa URL assinada com validade de **60 segundos**. Se expirar, volte à lista e gere novo acesso. A expiração não apaga um download já concluído, não impede capturas e não oferece DRM ou antivírus. Distribua apenas conteúdo próprio ou autorizado; não publique provas restritas, dados de colegas ou obras sem permissão. A interface documentada permite enviar, listar e baixar; não se pressupõe um gerenciador completo de edição/exclusão de arquivos.

## 9. Estudar em grupos

### 9.1 Criar e configurar

O formulário começa pelo essencial: **Matéria**, **Nome do grupo**, **Assunto** e **Descrição e objetivo**. As opções detalhadas continuam disponíveis em duas seções expansíveis:

- **Participantes e acesso:** máximo de participantes (incluindo você), visibilidade e inscrições.
- **Formato e apoio ao estudo:** formato, local/link restrito a membros, horário preferencial e busca de monitor.

Mesmo fechadas, as seções mostram um resumo atualizado das escolhas. Abra-as para revisar os valores antes de salvar. Um campo inválido dentro de uma seção fechada a abre antes de receber foco; erros de validação do servidor revelam ambas. Erros de rede não apagam o que foi digitado.

Os valores do rascunho, inclusive a matéria selecionada, são mantidos em memória ao navegar dentro da mesma conta; o estado aberto/fechado das seções não é restaurado. O salvamento concluído e a limpeza do estado da conta removem o rascunho. Isso não é salvamento no servidor nem garantia de recuperação após recarregar/fechar o aplicativo.

1. Abra a área de grupos pelo Início ou Chat.
2. Crie um grupo ligado a uma disciplina do catálogo.
3. Informe nome de até **100 caracteres**, tópico de até **160** e objetivo de até **1.000**.
4. Escolha capacidade entre **2 e 100 pessoas**; o padrão é **12**, contando o organizador.
5. Defina formato, local/link de até **200 caracteres**, horário preferencial opcional e se procura monitor.
6. Revise visibilidade e inscrições antes de salvar.

O grupo é **privado por padrão**. Um grupo público pode aparecer na listagem; um privado é apresentado a quem tem autorização ou convite. Local/link é informação para membros. **Visibilidade** e **inscrições abertas/fechadas** são controles diferentes: estar público não obriga aceitar novas entradas.

O horário preferencial não cria encontro. Editar configurações do grupo não remarca sessões existentes; faça isso na Agenda.

### 9.2 Participar e consultar o espaço coletivo

Procure um grupo público elegível, aceite um convite disponível ou utilize um código fornecido pelo organizador. Todas essas formas continuam submetidas a disponibilidade de vagas, inscrições e autorização.

Dentro do grupo, use conversa textual, materiais, participantes e encontros. Mensagens de grupo têm até **2.000 caracteres**. Seções como configurações, convites/código, participantes, agenda e sugestões compatíveis ficam recolhidas para reduzir a quantidade de informação simultânea; expanda apenas a necessária.

### 9.3 Convites e código

- O organizador pode consultar/copiar o código. Se o acesso à área de transferência falhar, copie manualmente o texto exibido.
- O código possui 32 caracteres hexadecimais e pode aparecer agrupado com hífens. A entrada tolera diferenças de maiúsculas/minúsculas, espaços e hífens.
- Renovar ou desativar invalida o código anterior.
- Convite individual enviado a uma sugestão compatível **não reserva vaga**.
- Uma pessoa **removida pelo organizador não pode retornar**, nem usando um código renovado. Isso é diferente de saída voluntária.

Não publique o código de um grupo privado em slides, repositórios ou capturas abertas. Ele é um meio de ingresso sujeito às regras, não uma credencial para contornar capacidade ou remoção.

### 9.4 Sair, remover e arquivar

O integrante pode sair e perde acesso à conversa e materiais, além da participação em encontros futuros. O organizador pode remover outros integrantes, mas não remove a si mesmo pelo mesmo botão.

Para encerrar seu grupo, o organizador **arquiva**, em vez de sair. O arquivamento é irreversível no fluxo documentado: fecha inscrições/convites, cancela encontros futuros e impede novas mensagens e materiais. Confirme o objetivo antes da ação. O reset de conexões individuais descrito adiante **não apaga grupos**, inclusive seus conteúdos e encontros.

## 10. Favoritos, segurança, denúncias e notificações

### 10.1 Guardar uma referência

Use a ação de favorito no cartão ou perfil e consulte a lista de favoritos. O estado pertence à conta e é persistido no servidor, não apenas no aparelho. Favoritar não obriga a outra pessoa a responder e não substitui pedido de ajuda. Se o perfil ficar indisponível, a lista não deve contornar suas restrições de acesso.

### 10.2 Bloquear e denunciar separadamente

**Bloquear** exige confirmação e admite motivo opcional de até **500 caracteres**. Interrompe o acesso entre o par conforme regras do serviço. Não envia automaticamente uma denúncia e não possui opção de desfazer na interface atual. Não use bloqueio apenas para esconder temporariamente um cartão: para isso existe pular.

**Denunciar** registra uma situação para análise. Selecione a categoria — assédio, spam, falsa identidade, conteúdo inadequado ou outro — e descreva os fatos em **10 a 2.000 caracteres**. Evite inserir informações sensíveis que não sejam necessárias. A identidade de quem denuncia não é mostrada ao denunciado, mas a equipe autorizada pode acessá-la; não é anonimato perante a administração.

Em **Perfil → Segurança e denúncias**, consulte estados pendente, revisada ou descartada e eventual resolução. Existe painel de moderação condicionado à autorização do servidor; não é recurso visível a toda conta. Revisores autorizados podem registrar decisão, ação de nenhuma alteração/restrição/restauração, justificativa e confirmação, com auditoria.

O canal não é serviço de emergência e não há promessa de prazo garantido. Orientações adicionais estão em [operação, privacidade e suporte](08-operacao-privacidade-e-suporte.md).

### 10.3 Interpretar notificações

A central reúne ocorrências de pedidos, conexões, mensagens, grupos, materiais e encontros/lembretes. Use filtros de leitura/categoria, seções de novas/anteriores e a ação de **marcar visíveis como lidas**.

Abra o item para acessar o pedido, grupo ou encontro correspondente. Uma notificação pode se tornar indisponível se seu contexto mudar. **Marcar lida não aceita pedido ou convite, não entra em grupo e não confirma presença.** O acompanhamento depende do aplicativo e da rede; não é um serviço de push com o app fechado.

## 11. Instalação web, atualização e falta de rede

A versão web pode ser usada diretamente ou instalada como **PWA** quando o navegador permitir. Use a ação instalar apresentada pelo aplicativo. No Safari do iPhone, siga as instruções de **Compartilhar → Adicionar à Tela de Início**, quando disponíveis. Não se trata de aplicativo iOS distribuído pela App Store.

A instalação web precisa de contexto compatível, normalmente HTTPS. Safari e a versão aberta pela Tela de Início podem manter sessões distintas. O APK Android é outra forma de distribuição; não assuma que atualizar o site atualiza os arquivos empacotados em um APK instalado.

Após visita inicial, parte da interface pode abrir sem rede. **Login, consulta atualizada e gravações dependem da conexão.** Não há fila offline de mensagens, pedidos ou alterações de perfil. Instalar a PWA não transforma o produto em aplicativo totalmente offline.

Quando surgir atualização disponível, conclua ou copie rascunhos antes de confirmar o recarregamento. A aplicação não promete preservar texto não salvo. Compatibilidade real de Safari/offline, Android e iPhone precisa das verificações físicas indicadas em [testes](07-testes-e-validacao.md); automação de navegador não substitui aparelhos reais.

## 12. Como interpretar vazios, erros e novas tentativas

| Situação | O que pode significar | Como agir |
|---|---|---|
| Descoberta vazia | Nenhum perfil compatível/disponível ou filtros estreitos | Atualizar, ampliar filtros e revisar matérias |
| Sem conversas | Nenhum pedido aceito ainda | Consultar recebidos/enviados; não esperar chat de pedido pendente |
| Agenda vazia | Nenhum encontro autorizado no recorte | Conferir dia/mês, atualizar ou criar no contexto elegível |
| Grupo lotado/fechado | Regra de participação, não falha de conexão | Consultar organizador; código não ignora essa regra |
| Grade parcial/indisponível | Cobertura limitada do catálogo | Consultar fonte oficial; não cadastrar suposição como dado verificado |
| Foto/arquivo recusado | Formato, assinatura, tamanho ou arquivo vazio | Selecionar arquivo válido; não apenas renomear extensão |
| Envio ou salvamento falhou | Rede, sessão, validação ou autorização | Ler aviso, preservar rascunho, conferir sessão e atualizar |
| Timeout após uma ação | Resultado ainda incerto; servidor pode ter gravado | Consultar estado antes de reenviar para não duplicar |
| Link de material expirado | Validade temporária encerrada | Gerar novo link pela lista autorizada |
| Conteúdo antes acessível sumiu | Bloqueio, saída, remoção, restrição ou mudança do contexto | Voltar e atualizar; não tentar acesso por URL antiga |
| E-mail de acesso não chegou | Entrega/serviço ainda não confirmados | Conferir endereço/spam e suporte, sem expor token |
| Interface offline sem dados novos | Somente shell disponível | Restabelecer rede; não presumir que ações foram enfileiradas |

Estados vazios não devem ser preenchidos com pessoas, notas ou matches fictícios. Feedback de erro deve explicar o próximo passo sem afirmar sucesso. Essa separação entre ação, retorno e resultado se relaciona a [Norman](12-referencias-e-glossario.md#ux01) e à discussão de operações distribuídas em [Kleppmann](12-referencias-e-glossario.md#ar03); não representa estudo de usabilidade realizado com participantes.

## 13. Laboratório: reset consciente de conexões

> **Recurso publicado na 3.3.1, com RPC instalada.** A migração preservou todos os dados/funções existentes e não executou reset real. A validação SQL foi realizada com rollback. Publicar o recurso não autoriza apagar conexões de participantes: demonstre somente em contas controladas e com ciência dos envolvidos. Consulte os [resultados de validação](07-testes-e-validacao.md) e o [registro da release](13-historico-de-releases.md).

A opção **Perfil → Configurações → Laboratório → Resetar matches** serve para reiniciar conexões individuais da **própria conta**. “Matches” aqui inclui o conjunto de solicitações acadêmicas, não somente as aceitas. Não é exclusão de conta, limpeza global ou reset de grupos.

### 13.1 O que muda

| Removido | Preservado |
|---|---|
| Todos os pedidos individuais recebidos/enviados pela conta: pendentes, aceitos e recusados | Conta/Auth, perfil e referência de foto |
| Mensagens vinculadas a esses pedidos | Catálogo, favoritos e bloqueios |
| Encontros individuais ligados, participantes e avaliações correspondentes | Denúncias, moderação e auditoria correspondente |
| Metadados dos materiais ligados a essas conexões | Todos os grupos, seus encontros e conteúdos |
| Marcadores de notificações lidas dos objetos removidos, dos dois lados | Conexões entre outras pessoas sem envolvimento da conta |

**A operação afeta também os parceiros dessas conexões e é irreversível.** Ela não apaga fisicamente arquivos do Storage, downloads ou eventos já importados via ICS. URLs de material já assinadas podem continuar válidas até expirar.

### 13.2 Demonstração segura, passo a passo

1. Use exclusivamente contas de laboratório controladas. Informe os envolvidos e confira que nenhuma conexão a preservar pertence à conta escolhida.
2. Confirme a versão do ambiente e a disponibilidade da função; não experimente em contas de participantes.
3. Abra a opção de laboratório e leia o resumo dos efeitos.
4. Digite **`RESETAR` exatamente**, em maiúsculas e sem espaços extras. O botão só libera com a confirmação correta.
5. Confirme uma vez e aguarde. Fechar o diálogo depois do envio **não cancela a operação no servidor**.
6. Confira a resposta e atualize pedidos, conversas, agenda e materiais nas contas controladas dos dois lados.
7. Verifique também que perfis, favoritos, bloqueios, grupos e conexões alheias continuam preservados. Não confunda preservação de metadados com limpeza física de arquivos.

Se houver falha de comunicação, consulte o estado antes de repetir. Se a RPC estiver ausente, a orientação é atualizar o ambiente; não existe fallback autorizado para exclusões livres pelo navegador.

A chamada é `mentor_reset_connections(p_confirmation text)`, sem valor padrão e sem usuário-alvo informado pelo cliente: a identidade vem da sessão no servidor. Instalar essa função **não executa o reset**. Procedimentos, pré-requisitos e proibições operacionais estão no [capítulo 10](10-manutencao-e-evolucao.md) e na [configuração Supabase](05-supabase-e-configuracao.md).

## 14. Limites de uso e leituras seguintes

O produto oferece conexão acadêmica, não tutoria garantida. Não oferece fila offline de escrita, push com o app fechado, sincronização bidirecional de calendário, verificação institucional, comprovação de credenciais docentes ou eliminação de cópias já baixadas. Recursos históricos de namoro, caronas, premium e stickers não devem ser apresentados como capacidades atuais.

Para estudar o projeto além do uso cotidiano:

- [Visão geral e arquitetura](01-visao-geral-e-arquitetura.md): responsabilidades do cliente e serviços.
- [Frontend](03-frontend.md) e [banco de dados](04-banco-de-dados.md): implementação e contratos.
- [Testes e validação](07-testes-e-validacao.md): evidências, limites e pendências.
- [UI/UX e acessibilidade](11-ui-ux-e-acessibilidade.md): desenho inspirado em Material Design 3, sem alegação automática de conformidade.
- [Referências e glossário](12-referencias-e-glossario.md): bibliografia e vocabulário.
- [Manutenção e evolução](10-manutencao-e-evolucao.md): roteiro de demonstração e critérios de aceite.
