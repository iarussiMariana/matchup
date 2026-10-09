# 11 — UI, UX e acessibilidade

> **Escopo:** interface acadêmica do MatchUp 3.3.3, com Android `versionCode` 13. Este capítulo descreve o código e propõe critérios de evolução. Não é laudo WCAG, pesquisa com estudantes, medição de aprendizagem nem comprovação de funcionamento em aparelhos físicos.

[Índice](README.md) · [Manual](02-funcionalidades-e-uso.md) · [Frontend](03-frontend.md) · [Referências e glossário](12-referencias-e-glossario.md)

## 1. Separar implementação, interpretação e evidência

Uma documentação de UX precisa evitar que intenção de projeto seja confundida com resultado demonstrado. Usaremos quatro categorias:

| Categoria | O que permite afirmar | Exemplo |
|---|---|---|
| **Implementação atual** | Algo verificável no código consultado | Os cartões oferecem botões além do gesto horizontal. |
| **Interpretação fundamentada** | Uma relação entre a implementação e conceitos de design | Rótulos explícitos podem ajudar a prever consequências, conforme [UX01]. |
| **Recomendação** | Algo a investigar ou validar no futuro | Observar se participantes encontram grupos pelo Início. |
| **Evidência histórica** | Resultado de uma execução/versão identificada | Um relatório de teste ou uma captura datada, com ambiente e limitações. |

As referências simbólicas são definidas em [12 — Referências e glossário](12-referencias-e-glossario.md). Livros ajudam a formular hipóteses; não provam que o MatchUp é fácil, inclusivo ou pedagogicamente eficaz. Não há aqui personas inventadas apresentadas como observação de campo, nem percentuais de melhoria atribuídos a pesquisas inexistentes.

## 2. O problema de interação é acadêmico

O produto permite declarar disciplinas, procurar apoio, enviar solicitações, conversar, organizar grupos e encontros e compartilhar materiais. A mesma pessoa pode ajudar em uma matéria e aprender outra. Isso deve permanecer perceptível nos textos e nas escolhas de navegação.

O cartão de descoberta não representa uma pessoa como possível par romântico. A compatibilidade de `MentorProduct.reasons` usa informações declaradas — disciplinas, curso, formato, turnos e preferência de estudo — para produzir explicações. Não calcula uma previsão de afinidade, não certifica conhecimento e não usa inteligência artificial.

**Risco de linguagem:** a celebração “Deu match!” existe no fluxo de aceite. Ela deve ser explicada como aceite de uma solicitação acadêmica. Em futuras avaliações, verificar se o termo causa interpretação romântica ou sugere uma avaliação automática inexistente. A documentação não altera o texto do produto nem presume que ele já foi validado com o público.

### 2.1 Arquitetura de informação das cinco abas

| Aba | Papel na jornada | Decisões e riscos |
|---|---|---|
| **Início** | Orientação, próximo encontro, indicadores e acessos acadêmicos | Resumir favorece varredura; números e avaliações não devem parecer certificações. Grupos e notificações são telas ligadas ao Início, não abas extras. |
| **Descobrir** | Encontrar perfis e explicar possíveis pontos em comum | Cartão compacto evita exposição inicial de tudo, mas detalhes precisam ser encontráveis. |
| **Chat** | Acesso às conversas e solicitações associadas | A relação entre pedido, aceite e conversa deve ficar clara; “Chat” não implica atualização instantânea. |
| **Agenda** | Consultar, responder e organizar encontros; exportar calendário | Separar proposta, confirmação e cancelamento. Exportação não é sincronização automática. |
| **Perfil** | Atualizar informações, disciplinas, disponibilidade e foto | Separar seleção/edição local de salvamento efetivo. Foto é opcional. |

A navegação usa `aria-current="page"`. `navigate` move o foco para o conteúdo principal quando solicitado. Grupos e notificações mantêm o contexto visual do Início; pedidos se relacionam à aba Chat. Esse agrupamento é uma escolha atual, não resultado comprovado de card sorting ou teste de encontrabilidade. [UX02] [UX03]

## 3. Seis lentes de design aplicadas ao código

### 3.1 Norman: tornar a consequência previsível — [UX01]

**Princípio:** uma pessoa precisa perceber o que pode fazer e entender o resultado. Feedback e restrições ajudam a construir um modelo conceitual coerente.

**Aplicações atuais:**

- No cartão, “Solicitar” abre um formulário; arrastar à direita leva ao mesmo formulário, não envia um pedido silenciosamente.
- “Escolher foto” mostra uma prévia; salvar o perfil é uma etapa separada.
- Ao marcar notificações como lidas, o texto esclarece que isso não aceita convites nem confirma encontros.
- Rotação/desativação do código e remoção de membro têm mensagens de consequência e confirmação.

**Limitações e verificação recomendada:** observar se a pessoa distingue favorito de pedido e prévia de publicação. Em um timeout de mutação acadêmica, o resultado pode ser incerto; a mensagem deve orientar atualização antes de repetir, sem apresentar “nada foi salvo” como certeza.

**Rastreabilidade:** `renderCard`, fluxo de pedido e `saveProfile` em `mentorship.js`; `renderNotifications`, gestão do código e helper `rpc` em `mentorship-academic.js`.

### 3.2 Krug: reduzir a investigação desnecessária — [UX02]

**Princípio:** interfaces são frequentemente examinadas por varredura, não lidas como um manual. Convenções e textos diretos podem diminuir esforço de orientação.

**Aplicações atuais:** cinco abas persistentes; rótulos ao lado dos ícones; estados vazios com contexto; cartão mostra nome, curso, semestre e poucas disciplinas antes de abrir detalhes; ações principais aparecem separadas da legenda.

**Limitações e verificação recomendada:** compactar não deve ocultar o assunto necessário para decidir. Testar tarefas como “encontre alguém que possa ajudar nesta disciplina” sem instruir previamente onde tocar. Medir conclusão, hesitações e necessidade de ajuda; não deduzir sucesso pela ausência de rolagem em uma captura.

**Rastreabilidade:** `nav`, `renderCard`, `homeView`, `.card-info`, `.card-actions`, `.home-actions`.

### 3.3 Tidwell, Brewer e Valencia: reutilizar padrões com contexto — [UX03]

**Princípio:** seleção pesquisável, navegação, agrupamento e divulgação progressiva são padrões reutilizáveis, mas precisam corresponder à tarefa.

**Aplicações atuais:** os seletores de catálogo combinam busca, opções, chips selecionados e contador; grupos usam um centro de atividades com seções expansíveis; agenda combina calendário e lista do dia; detalhes de compatibilidade ficam recolhidos inicialmente.

**Limitações e verificação recomendada:** avaliar se a pessoa percebe o que está recolhido, volta à seleção anterior e entende quando uma disciplina foi mantida como legado. Abrir uma seção deve permitir distinguir “carregando”, “não há itens” e “falhou”. Repetir uma abertura não pode ligar o mesmo handler várias vezes.

**Rastreabilidade:** `MentorCatalog.mount`, `single`, `values`; `renderGroup`, seções de configurações/código/encontros; `renderAgenda`.

### 3.4 Johnson: apoiar reconhecimento e atenção limitada — [UX04]

**Princípio:** a interface deve ajudar a reconhecer opções e estados sem exigir que a pessoa memorize tudo. Agrupamento visual e estrutura importam tanto quanto texto.

**Aplicações atuais:** disciplinas selecionadas permanecem visíveis; busca normaliza acentos; contadores explicitam limites; campos relacionados formam grupos; informações de agenda e status aparecem próximas das ações.

**Limitações e verificação recomendada:** um contador não pode ser a única forma de descobrir o limite, nem cor a única indicação de estado. Listas extensas, nomes longos e ajuda recebida de uma tecnologia assistiva podem alterar completamente o esforço. Testar a busca sem acentos e seleções de cursos diferentes; não atribuir “carga cognitiva reduzida” como resultado medido.

**Rastreabilidade:** normalização e opções de `mentorship-catalog.js`, `.catalog-count`, `.catalog-chip`, `.academic-session-card`.

### 3.5 Nielsen: avaliar a tarefa inteira, incluindo erros — [UX05]

**Princípio:** usabilidade inclui aprendizagem de uso, eficiência, lembrança, erros e satisfação. Inspeção heurística é útil, mas precisa ser complementada com avaliação da tarefa.

**Aplicações atuais:** botões de envio são desabilitados durante operações; mensagens não confirmadas preservam rascunho; falhas transitórias oferecem recuperação; perda de autorização remove o conteúdo privado do chat; ações sensíveis descrevem consequências.

**Limitações e verificação recomendada:** sucesso no caminho feliz não comprova boa recuperação. Simular uma resposta tardia, navegação durante leitura, erro de upload, lotação de grupo e convite inválido em ambiente de teste. Avaliar se a mensagem ajuda a decidir o próximo passo, sem expor detalhes técnicos ou criar certeza falsa.

**Rastreabilidade:** `pending`, `outbox`, `sendMessage`, `chatError`, `friendly`, `action`, `catchLoad`, fluxo de upload de materiais.

### 3.6 Wathan e Schoger: hierarquia visual sem confundir beleza e qualidade — [UX06]

**Princípio:** contraste relativo, espaçamento e diferenças de peso organizam prioridades visuais; adicionar mais cores ou caixas não resolve hierarquia por si só.

**Aplicações atuais:** tokens centralizam papéis visuais; superfícies separam conteúdo; ações primárias contrastam com ações secundárias; texto branco do cartão recebe uma camada escura independente da foto; chips e indicadores ocupam níveis menores que títulos e ações.

**Limitações e verificação recomendada:** medir contraste em estados reais, com fotografia muito clara/escura e falha de imagem. Confirmar que textos secundários não ficaram pequenos ou apagados. O código não importa Tailwind nem uma biblioteca Material por citar essa referência.

**Rastreabilidade:** tokens no início de `mentorship.css`, `.card-info`, `.btn`, `.notice`, `.academic-card`, `mentorship-catalog.css`.

## 4. Material Design 3: o que foi implementado e o que não foi

O CSS é escrito no projeto. Há nomes de variáveis inspirados em Material Design 3, como `--md-sys-color-primary`, `--md-sys-color-surface` e papéis `on-*`, além de escalas tipográficas, formas, elevação, opacidades de estado e duração/easing. [DOC01]

| Aspecto | Evidência atual | Cuidado de manutenção |
|---|---|---|
| Cor semântica | Primária `#087e8b`, secundária `#28664d`, terciária `#65548b`; papéis de superfície, erro e conteúdo | Mudar o token não basta: verificar pares de contraste, contornos, links, estados selecionados e desabilitados. |
| Tipografia | Variáveis de texto e família Inter com alternativas do sistema | `index.html` não carrega uma fonte Inter remota; a aparência depende da fonte disponível. Testar sem assumir métricas idênticas. |
| Forma e elevação | Raios e sombras por tokens; cartões, diálogos e controles compartilham linguagem | Não aumentar sombra para compensar hierarquia ambígua ou contraste insuficiente. |
| Estado | Hover, pressionado, selecionado, foco e desabilitado | Hover não existe da mesma forma no toque. Estados selecionados devem ter nome/valor acessível além da cor. |
| Movimento | Transições curtas; media query de movimento reduzido | Desligar CSS de transição não elimina necessariamente transformações aplicadas por JavaScript durante o gesto. |
| Layout | Shell de até 500 px no celular/acesso à conta; sessão autenticada acima de 700 px usa até 1120 px; Início ganha duas colunas acima de 1000 px | Navegação inferior continua fixa em cinco destinos; texto pode crescer e rolar, com safe areas. Descobrir permanece compacto e formulários têm largura de leitura limitada. |
| Integração | CSS acadêmico e de catálogo herda papéis do núcleo; aliases antigos ainda existem | Alterar aliases ou ordem das folhas pode causar divergências entre módulos. |

**Não afirmar:** uso oficial de todos os componentes Material, conformidade automática com especificações MD3, cores dinâmicas derivadas do sistema ou modo escuro completo apenas porque existem tokens com nomes parecidos. Isso exige implementação e validação próprias.

### 4.1 Refinamento responsivo da 3.3.2

- **Celular:** mantém os cards compactos, botões explícitos, navegação fixa e crescimento natural do conteúdo. Rótulos da navegação não encolhem mais para 11 px em 320 px.
- **Tablet:** o shell deixa de ficar preso a 500 px. Formulários e conversas mantêm uma largura de leitura controlada, sem alterar a rolagem para um painel interno.
- **Desktop:** Início agrupa encontro/indicadores e aprender/ensinar lado a lado, na mesma ordem de leitura. Descobrir não é esticado para ocupar a tela inteira.
- **Tipografia:** instruções de campos, rodapé de conta, indicadores e detalhes do próximo encontro usam 14 px na escala padrão; ações secundárias do Início usam 13 px. A escala em `rem` acompanha a ampliação de texto.
- **Carregamento:** listas, descoberta e conversa exibem placeholders decorativos com status textual. São substituídos por resultados ou erro; não simulam pessoas, métricas nem mensagens. Movimento reduzido desativa a animação. Não se promete eliminação de todo deslocamento de layout.
- **Hierarquia:** regiões do Início têm títulos associados e nomes acessíveis distintos nos atalhos “Ver todas”. As ações existentes e a identidade Material Design 3 foram preservadas.

A validação automatizada usa larguras de 320, 568, 768 e 1280 px, orientação horizontal curta e texto a 200%. Isso não equivale a testar teclado virtual, leitor de tela ou instalação em aparelhos físicos. Consulte os resultados exatos da campanha no [capítulo 07](07-testes-e-validacao.md).

### 4.2 Abertura opcional sem bloquear a jornada — 3.3.3

A apresentação usa o vídeo fornecido integralmente, sem som e inline. O poster é o logo local; `object-fit: contain` mantém todo o quadro visível em retrato e paisagem, aceitando faixas livres em vez de recorte. O aplicativo inicializa por trás; a intro não deve ser confundida com espera obrigatória para acessar uma função.

**Controle e acesso:** diálogo nativo com botão de pular focado e alvo mínimo de 48 px; Escape encerra. O conteúdo subjacente permanece fora do foco enquanto modal. Tab pode alcançar controles do próprio navegador: isso não é permissão para focar o app atrás do vídeo. Ao sair, libera a mídia e devolve foco ao conteúdo principal quando visível e sem outro modal, evitando roubar foco de outro diálogo.

**Preferências e falhas:** movimento reduzido, economia de dados, conexão muito lenta, offline e retornos Auth dispensam a intro sem download. Também não começa num documento oculto e termina se ele for para segundo plano. Se não iniciar em 2 s, ultrapassar 12 s, falhar ou for pulada, o app continua disponível, sem tela vazia. Não se repete na navegação interna; a frequência é por sessão da aba, com degradação por documento se o armazenamento falhar, não uma promessa permanente.

Essas salvaguardas preservam controle e recuperação [UX01] [UX05], mas não provam benefício da animação para estudantes. Os testes incluem teclado, preferência de movimento e texto a 200% em 320 × 568, 568 × 320 e 1280 × 900. Chrome comprovou vídeo realmente decodificado; WebKit cobre reprodução disponível **ou saída segura**, não comprova codec no Safari/iPhone. Homologação física e avaliação com tecnologia assistiva real continuam pendentes. Ciclo técnico no [capítulo 03](03-frontend.md); resultados separados no [capítulo 07](07-testes-e-validacao.md).

## 5. Jornadas que merecem cuidado especial

### 5.1 Cartão compacto e gesto opcional

O retrato usa `clamp(280px, calc(100svh - var(--card-clearance, 440px)), 420px)`. A altura disponível é estimada com `ResizeObserver`, levando em conta posição do cartão, navegação e ações. A foto usa `object-fit:cover` e posicionamento fixo; a legenda está sobre uma camada escura. Nome e textos podem quebrar linha.

Isso é um compromisso: em tela baixa ou texto ampliado, a altura mínima de 280 px pode exigir rolagem. Não se deve esconder conteúdo ou reduzir arbitrariamente a fonte para “passar” um teste de screenshot.

O gesto só se torna horizontal após superar 12 px e predominar sobre o deslocamento vertical. Ao soltar, o limiar de ação é 65 px, também com predominância horizontal. Direita abre solicitação; esquerda pula localmente. Cancelar o ponteiro não executa a ação. `touch-action:pan-y` procura preservar rolagem vertical.

**Critérios de manutenção:**

- Manter os três botões Pular/Favorito/Solicitar, inclusive para quem não usa arrastar.
- Não tratar todo movimento vertical como intenção de descartar um perfil.
- Não transformar uma abertura de formulário em envio automático.
- Não depender do selo visual do gesto para comunicar a consequência final.
- Medir a posição das ações em tamanhos e zoom representativos, aceitando rolagem quando necessária.

Essas alternativas são relevantes para WCAG 2.5.7 e operação por teclado; cada critério exige verificação própria. [DOC02] [DOC05]

### 5.2 Catálogo e perfil

O onboarding tem duas etapas visíveis, sem converter a pessoa em um papel exclusivo de “monitor” ou “aluno”. A seleção de disciplinas distingue as atuais, aquelas em que pode ajudar e aquelas em que deseja aprender. Os limites atuais são 12, 8 e 8, respectivamente.

`MentorCatalog` mostra até 30 opções iniciais e expande em lotes. Os chips permitem remover escolhas; a busca trata acentos; controles não selecionados são desabilitados ao atingir o limite. Há tratamento de foco após seleção/remoção. A estrutura usa labels, fieldsets e legends.

**Riscos:** busca não deve apagar escolhas invisíveis no filtro; trocar curso não deve apagar silenciosamente dados já persistidos; catálogo parcial não deve parecer grade oficial completa. Seleções legadas preservadas precisam de explicação compreensível. Se links de fontes estiverem indisponíveis, isso não deve ser confundido com inexistência da disciplina.

**Verificação recomendada:** preencher somente com teclado, buscar com e sem acento, atingir cada limite, remover uma seleção, mudar curso com dados salvos e retomar o formulário após erro. Conferir o anúncio dos contadores sem excesso de interrupções.

### 5.3 Foto: escolher, conferir e salvar são atos diferentes

A interface oferece escolha e remoção da foto, prévia local, status e fallback por iniciais. Não há ferramenta de recorte manual, zoom ou reposicionamento interativo: a otimização é automática, produz JPEG de até 640 px no maior lado e qualidade 0,82.

O arquivo selecionado não é publicado até o salvamento. Remover a foto no formulário também precisa ser salvo. O upload precede a gravação do perfil; pode haver arquivo enviado sem que a atualização do perfil seja confirmada. O texto de erro deve preservar essa distinção.

**Verificação recomendada:** foto ausente, imagem clara, imagem escura, formato não aceito, arquivo vazio, assinatura inválida, arquivo acima de 5 MiB, erro de decodificação e falha após upload. Não presumir que uma simples verificação de assinatura equivale a antivírus. [UX01] [AR03]

### 5.4 Grupo como centro de atividades

Na 3.3.2, a criação/configuração separa os campos essenciais das opções **Participantes e acesso** e **Formato e apoio ao estudo**. `<details>/<summary>` oferece expansão nativa por teclado e toque. Resumos atualizados expõem capacidade, acesso e formato sem obrigar a percorrer todos os campos; não escondem que escolhas adicionais existem. É uma aplicação de divulgação progressiva [UX03], não remoção de capacidades.

A validação nativa abre os ancestrais fechados antes de focar um campo inválido; erros de validação do servidor abrem as seções avançadas. Os valores são preservados em rascunho por conta durante navegação e falhas de rede, sem prometer persistência após fechar o app. Esse comportamento evita que simplificação visual torne um erro impossível de localizar.

O grupo reúne resumo, membros, encontros, chat e materiais. O proprietário tem configurações, código de convite, sugestões de estudantes e ações administrativas. O padrão de criação é **privado**, com **12 vagas**, configuráveis entre **2 e 100**, incluindo o proprietário.

O código é normalizado para entrada e formatado em blocos para leitura. Copiar pode usar clipboard ou seleção manual. Rotacionar, desativar e remover são ações distintas:

- **Rotacionar:** gerar outro código; o anterior deixa de valer.
- **Desativar:** impedir entrada por aquele código, sem “desconvidar” participantes já presentes.
- **Remover membro:** alterar participação; a interface informa a restrição de reentrada, que depende de aplicação no servidor.
- **Arquivar:** encerrar novas atividades do grupo conforme as regras; histórico não deve ser confundido com grupo ativo.

Convite não reserva vaga. O horário preferido das configurações não cria um encontro, e alterá-lo não reagenda compromissos existentes. Esses limites precisam aparecer perto das ações, não apenas nesta documentação.

**Verificação recomendada:** compreensão de “privado”, capacidade que inclui o proprietário, preenchimento de código com espaços/hífens, grupo lotado, código desativado, membro removido, convite aceito em outra sessão e leitura de histórico após arquivamento. Testes devem usar contas/dados de teste. A campanha 3.3.1 executou regressões de grupos com fixtures, não um novo ensaio de convites com participantes reais; os resultados estão no capítulo 07.

### 5.5 Agenda, notificações e calendário externo

Na agenda, status do encontro e resposta individual são informações diferentes. A lista do dia complementa o calendário; ações de exportação usam dados novamente autorizados pelo servidor. `MentorCalendar` gera `.ics` e permite download ou compartilhamento, inclusive por bridge nativa.

**Não prometer:** importação automática, sincronização contínua, notificação push com o app fechado, ausência de duplicação em qualquer calendário ou remoção automática de uma cópia já importada após cancelamento. A pessoa pode precisar exportar/importar novamente. [DOC07] [DOC08] [DOC11]

Notificações internas têm filtros por leitura/categoria e seções Novas/Anteriores. “Marcar visíveis como lidas” atua sobre os itens visíveis; não confirma pedidos/encontros. A cor de fundo e o ponto visual são pistas adicionais, não substitutos do texto e do nome acessível.

### 5.6 Reset de laboratório — entrega 3.3.1

A entrega 3.3.1 de `mentorship.js`, incremental sobre a base 3.3, inclui **Configurações → Laboratório → Resetar matches**. Aqui, matches significa conexões acadêmicas; não se transfere o reset romântico legado para o produto atual. O contrato técnico está em [03, seção 9.4](03-frontend.md#94-laboratório-em-configurações--adição-posterior-à-base-33).

O diálogo alerta sobre irreversibilidade e efeito nos dois participantes, exige digitar exatamente `RESETAR`, mantém envio desabilitado até essa confirmação e oferece cancelamento. Depois de enviar, fechar o diálogo não cancela a operação. O frontend aguarda confirmação do servidor e, diante de falha incerta, orienta atualizar antes de repetir. [UX01] [UX05] [AR03]

**Consequência que precisa ser compreendida:** apaga todos os pedidos próprios enviados/recebidos, de qualquer status, e as mensagens, encontros individuais, participantes, avaliações e metadados de materiais vinculados, além das leituras de notificações correspondentes. Preserva conta, perfil/foto, favoritos, bloqueios, denúncias, grupos e relações de terceiros. Não apaga Storage físico, downloads nem eventos já exportados ao calendário.

**Limites:** digitar uma palavra não demonstra compreensão nem consentimento da contraparte. A recomendação de uso em contas de laboratório não é uma barreira técnica que restrinja o recurso exclusivamente a contas de teste. Favoritos preservados não devem ser confundidos com conexão ainda ativa; ausência de dados na tela não prova apagamento de cópias externas.

**Validação executada na 3.3.1:** dez cenários de laboratório aprovados em Chrome e WebKit, incluindo confirmação exata/cancelamento, duplicação, RPC ausente, timeout, resposta inválida, logout durante espera, preservação de rascunho e layout estreito com texto ampliado. O SQL passou 49 assertions com rollback, incluindo preservação de grupos e dados fora do escopo. Consulte [os limites da campanha](07-testes-e-validacao.md).

**Validação ainda recomendada:** leitor de tela no diálogo; qualidade da restauração de foco; troca direta para outra conta sem passar pelo logout; percepção da atualização pela contraparte; e compreensão com participantes. Avaliar se a pessoa entende que a exclusão inclui pedidos recusados e pendentes, não só os “matches” aceitos. Executar somente em ambiente/contas de teste autorizados, com ciência dos envolvidos. Não marcar esses ensaios humanos/físicos como aprovados com base na automação.

## 6. Matriz de acessibilidade: evidência não é certificação

A referência é WCAG 2.2. Os critérios abaixo orientam manutenção, mas a tabela não cobre todos os requisitos de uma declaração de conformidade. [DOC02]

| Critério / tema | Evidência no código | Risco ou verificação necessária |
|---|---|---|
| 1.1.1 — Conteúdo não textual | Imagens, iniciais, ícones e botões com rótulos | Auditar nomes acessíveis; foto redundante e ícone decorativo não devem gerar leitura duplicada. |
| 1.3.1 — Informação e relações | Uso de labels, fieldsets, legends, títulos e listas | Verificar associações reais após cada rerender; estrutura visual não basta. |
| 1.4.1 — Uso de cor | Textos de status, `aria-pressed`, `aria-current` e indicadores adicionais | Conferir se seleção, erro, encontro e notificação são compreensíveis sem cor. |
| 1.4.3 — Contraste mínimo | Tokens de cor; camada escura no cartão | Medir 4,5:1 para texto comum e 3:1 para texto grande, respeitando definições/exceções. Comentário em CSS não é laudo. |
| 1.4.4 — Redimensionar texto | Quebra de linha e espaçamento da navegação previsto para ampliação | Avaliar texto a 200%, sem corte nem perda de controles. O ajuste precisa alcançar diálogos e formulários. |
| 1.4.10 — Reflow | `min-width:0`, grids flexíveis, largura máxima e media queries | Verificar largura equivalente a 320 px CSS, conforme condições do critério, e possíveis exceções. Não confundir apenas viewport estreita com toda a avaliação de zoom. |
| 1.4.11 — Contraste não textual | Contornos, foco e estados de controles | Medir 3:1 onde o critério exigir; avaliar ícones e limites necessários para reconhecer controles. |
| 2.1.1 — Teclado | Botões nativos; alternativas ao gesto; links e formulários | Percorrer todas as ações sem mouse, incluindo chips, seções expansíveis, upload e calendário. |
| 2.1.2 — Sem bloqueio de teclado | Uso de `<dialog>` nativo e fechamento por cancelamento | Testar entrada, saída e retorno do foco no navegador/WebView real; não presumir implementação própria de foco completa. |
| 2.4.1 — Ignorar blocos | Link para `#main`; `main` com `tabindex="-1"` | Confirmar foco e destino efetivo após renderização. |
| 2.4.3 / 2.4.7 — Ordem e foco visível | Foco no conteúdo ao navegar; outline de foco de 3 px | Rerender pode remover o elemento focado; testar sequência, posição e retorno após diálogo. |
| 2.4.11 — Foco não obscurecido, mínimo | Espaço inferior e compensação de navegação/composer | Conferir foco sob barra fixa, toast, teclado virtual e rolagem de diálogo. |
| 2.5.2 — Cancelamento do ponteiro | Ação do cartão no `pointerup`; `pointercancel` sem ação | Testar soltar fora, movimento cancelado, clique posterior suprimido e botões internos. |
| 2.5.3 — Rótulo no nome | Controles com textos visíveis e nomes acessíveis | Comparar nome acessível ao texto; importante também para controle por voz. |
| 2.5.7 — Movimentos de arrastar | Botões equivalentes para pular e abrir solicitação | Manter alternativa por ponteiro sem arrastar; teclado é outra obrigação, não substituto único. |
| 2.5.8 — Tamanho mínimo do alvo, AA | Muitos controles têm altura de 44–56 px | Medir largura, altura e espaçamento efetivos; o mínimo normativo é 24 × 24 px CSS, com exceções. |
| 3.3.1 / 3.3.2 — Erros e instruções | Campos rotulados, limites e mensagens amigáveis | Identificar o erro em texto e associá-lo ao campo quando necessário; evitar apenas toast efêmero. |
| 3.3.8 — Autenticação acessível, mínimo | Fluxos de autenticação são tratados no núcleo | Avaliar possibilidade de colar, gerenciadores de senha e eventuais desafios do provedor; não presumir conformidade só pelo formulário. |
| 4.1.2 — Nome, função e valor | Elementos nativos, `aria-current`, `aria-pressed` e títulos de diálogo | Inspecionar árvore acessível, controles gerados e estado após interação. |
| 4.1.3 — Mensagens de status | `role="status"`, `aria-live="polite"`, status de foto e seleção | Avaliar se alterações são anunciadas uma vez, na ordem adequada, sem roubar foco. |

### 6.1 Por que 44 px não significa “WCAG AA aprovada”

- **2.5.8, nível AA:** mínimo de 24 × 24 px CSS, com exceções como espaçamento e controle equivalente. [DOC03]
- **2.5.5, nível AAA:** mínimo de 44 × 44 px CSS, também com exceções. [DOC04]
- **Decisão visual atual:** muitos botões usam 44 px ou mais; ações do cartão usam 56 × 56 px. É uma escolha útil, não uma certificação.
- **Ponto importante:** o calendário distribui sete colunas. Seus dias têm altura mínima de 44 px, mas a largura pode ficar abaixo disso. Medir o alvo e o espaçamento no layout efetivo.
- **Outro ponto:** inputs radio/checkbox podem ter desenho de 22 px dentro de um label maior. Avaliar a área inteira acionável, não apenas o quadrado desenhado.

### 6.2 Movimento, contraste forçado e modais

Há regras para `prefers-reduced-motion:reduce` e `forced-colors:active`. São evidências de intenção e implementação parcial; é necessário validar o resultado, inclusive estados selecionados do calendário, foco e legibilidade.

O helper de diálogo usa `<dialog>` e `showModal()`, título associado e fechamento. O navegador oferece comportamento modal nativo, mas o aplicativo continua responsável por conteúdo compreensível, foco útil e recuperação do contexto. Testar também se um clique fora fecha um formulário com alterações e se isso causa perda inesperada de trabalho.

## 7. Protocolo recomendado de avaliação

Esta seção é **plano de validação**, não relato de atividades executadas. A suíte e as evidências efetivas devem ser registradas no [capítulo 07](07-testes-e-validacao.md); resultados de releases anteriores ficam no [histórico](13-historico-de-releases.md).

### 7.1 Preparar cenários reproduzíveis

1. Usar ambiente autorizado de teste e dados sintéticos, sem publicar contatos, fotos ou materiais reais de estudantes.
2. Registrar versão do código, navegador, sistema, dimensões em pixels CSS, escala de texto/zoom e tecnologia assistiva.
3. Preparar contas representando situações, não “personas comprovadas”: perfil incompleto, disciplinas extensas, participante de grupo, proprietário, convite inválido e conversa indisponível.
4. Definir sucesso observável antes da execução: por exemplo, abrir uma solicitação para a disciplina correta e reconhecer que ela ainda não foi aceita.
5. Anotar falhas, ajuda solicitada, mensagens incompreendidas e estado final, sem transformar uma amostra pequena em estatística populacional.

### 7.2 Tarefas sugeridas

| Tarefa | O que observar | Não confundir com |
|---|---|---|
| Declarar uma matéria em que ajuda e outra em que aprende | Entendimento dos papéis e dos limites de seleção | Competência acadêmica verificada. |
| Encontrar apoio sem usar gesto | Descoberta de filtros, botões e detalhes | Eficiência de um algoritmo de recomendação. |
| Escolher foto e voltar antes de salvar | Compreensão de prévia, erro e persistência | Foto já publicada no servidor. |
| Recuperar falha de envio | Preservação do texto e entendimento da nova tentativa | Fila offline automática. |
| Criar grupo e compartilhar código | Compreensão de privacidade, vagas e expiração por rotação | Entrada garantida ou vaga reservada. |
| Alterar horário preferido do grupo | Distinção entre preferência e encontro existente | Reagendamento automático. |
| Exportar um encontro | Entendimento de arquivo/compartilhamento e calendário destinatário | Sincronização contínua. |
| Marcar notificações como lidas | Compreensão de leitura versus resposta | Aceite de convite ou presença confirmada. |

### 7.3 Camadas de verificação

- **Inspeção de código:** semântica HTML, escaping, limites, fluxo de foco, cleanup e contratos entre módulos.
- **Automação existente:** regressões funcionais e de layout, com dados controlados. A documentação oficial do Playwright ressalta que automação cobre apenas parte da acessibilidade. [DOC10]
- **Avaliação manual:** teclado, leitor de tela, zoom, contraste, movimento reduzido e modo de cores forçadas, quando disponíveis.
- **Avaliação com participantes:** tarefas sem induzir a resposta, consentimento adequado e registro anonimizado. Incluir pessoas com diferentes necessidades de acesso conforme o objetivo do estudo.
- **Validação nativa futura:** comportamento de WebView, teclado virtual, seletor de arquivo e compartilhamento em aparelhos autorizados. Não foi executada nesta revisão; emulação, quando usada por outro processo, também não substitui aparelho físico.

### 7.4 Como registrar um achado útil

Registrar **tarefa → ambiente → passos → esperado → observado → impacto → evidência → proposta → reteste**. Exemplo hipotético: “Na largura X e texto ampliado, o foco no botão Y fica sob a navegação; esperado: alvo perceptível e acionável; proposta: rever folga e rolagem”. Identificar o exemplo como hipotético até haver reprodução.

Não anexar tokens, conversas ou códigos de convite reais. Em métricas, separar falha de rede, falha de autorização e falha de compreensão; todas afetam experiência, mas exigem soluções diferentes.

## 8. Checklist para uma alteração de interface

- [ ] A mudança continua expressando uma tarefa acadêmica, sem prometer IA ou qualidade não medida?
- [ ] Rótulo, ação e mensagem de sucesso descrevem a mesma consequência?
- [ ] Estado vazio, carregamento, erro, resultado incerto e sucesso têm tratamentos distintos?
- [ ] Rascunhos e seleções sobrevivem às falhas previstas, sem vazar entre contas?
- [ ] Há alternativa aos gestos e operação por teclado?
- [ ] Nome acessível, foco e anúncios permanecem corretos após rerender?
- [ ] Largura estreita, zoom, texto longo e navegação fixa não ocultam controles?
- [ ] Contraste e área acionável foram medidos onde necessário, sem dedução apenas por tokens?
- [ ] Controles de grupo explicam capacidade, rotação, remoção e horários corretamente?
- [ ] Fotos, materiais e calendário mantêm seus diferentes modelos de privacidade?
- [ ] O relatório distingue código inspecionado, testes executados e recomendações futuras?

Para implementar, seguir os contratos e receitas do [frontend](03-frontend.md). Para discutir prioridades e atributos de qualidade, usar [arquitetura](01-visao-geral-e-arquitetura.md), [manutenção](10-manutencao-e-evolucao.md) e [AR01], sem transformar justificativa teórica em evidência de resultado.
