# 12 — Referências e glossário

> **Base documental:** MatchUp 3.3.3, aplicativo acadêmico; Android `versionCode` 13. A bibliografia da 3.3.1 foi mantida. Os livros abaixo são edições determinadas, não uma indicação de “última edição”. As relações entre teoria e produto são interpretações para manutenção, não prova de que houve pesquisa com usuários ou de que o aplicativo é certificado.

[Índice](README.md) · [Frontend](03-frontend.md) · [UI, UX e acessibilidade](11-ui-ux-e-acessibilidade.md) · [Histórico](13-historico-de-releases.md)

## 1. Como usar as referências

Os identificadores `[UX01]`, `[AR01]` e `[DOC01]` permitem separar três tipos de fonte:

- **UX:** livros de interação, percepção, usabilidade e composição visual.
- **AR:** livros de arquitetura, refatoração e sistemas de dados.
- **DOC:** normas e documentação técnica oficial.

O código é a fonte para dizer **o que o MatchUp implementa**. Um livro fundamenta uma interpretação ou recomendação; não demonstra que a implementação alcançou seus objetivos. As explicações são paráfrases: não reproduzem capítulos nem atribuem números de página que não foram conferidos.

### Convenções bibliográficas e verificabilidade

A consulta priorizou páginas de autores, editoras e organizações responsáveis. Ano de lançamento, copyright e data de comercialização podem diferir, inclusive entre formatos do mesmo livro. Essas diferenças são indicadas onde encontradas. URLs podem conter identificadores editoriais; não se oferece aqui uma lista de ISBNs supostamente intercambiáveis entre formatos.

**Limite de verificação:** os metadados de *Designing Interfaces* foram corroborados por resultados indexados da página oficial da O’Reilly; a leitura direta dessa página retornou bloqueio de acesso. Isso é diferente de ter consultado o livro integral. Para os demais livros, foram acessadas páginas oficiais de autor ou editora; em alguns casos, os metadados estruturados da página complementaram o texto visível. Nenhuma referência implica leitura integral ou validação empírica do produto.

A documentação de plataformas é atualizada continuamente. Seus links são referências conceituais; antes de aplicar uma API, conferir a versão instalada e as instruções de [desenvolvimento](06-desenvolvimento-e-android.md).

## 2. Livros de UI e UX

<a id="ux01"></a>
### [UX01] Donald A. Norman — *The Design of Everyday Things*

- **Edição:** revised and expanded edition; **ano:** 2013; **editora:** Basic Books.
- **Fonte oficial do autor:** <https://jnd.org/books/the-design-of-everyday-things-revised-and-expanded-edition/>.
- **Conferência:** a página identifica a edição revisada e expandida e apresenta a referência de 2013. Ela também diferencia a publicação britânica; esta documentação usa a edição da Basic Books.
- **Ideias utilizadas:** significantes, feedback, restrições, mapeamento e modelo conceitual.
- **Conexão com o MatchUp:** os botões “Pular”, “Favorito” e “Solicitar”, a prévia de foto e a distinção entre leitura de notificação e confirmação de encontro tornam as consequências das ações mais explícitas.
- **Limite:** a existência de um rótulo não prova que as pessoas entendem a ação. A expressão “Deu match!” ainda merece avaliação por poder sugerir um contexto não acadêmico.

<a id="ux02"></a>
### [UX02] Steve Krug — *Don't Make Me Think, Revisited: A Common Sense Approach to Web Usability*

- **Edição:** 3ª; **ano de referência:** 2014, copyright; **editora:** New Riders, selo apresentado no catálogo Peachpit.
- **Fonte oficial da editora:** <https://www.peachpit.com/store/dont-make-me-think-revisited-a-common-sense-approach-9780321965516>.
- **Conferência:** autoria, terceira edição, selo e copyright estão no catálogo. Datas comerciais de 2013 não significam outra edição; a referência aqui adota 2014.
- **Ideias utilizadas:** leitura por varredura, convenções reconhecíveis, redução de decisões desnecessárias e testes simples de usabilidade.
- **Conexão:** cinco destinos persistentes, títulos de seções e informações resumidas nos cartões ajudam a orientar o próximo passo.
- **Limite:** “menos conteúdo visível” não é necessariamente “menos esforço”. Grupos acessados pelo Início e pedidos associados ao Chat precisam ser encontrados por pessoas reais em testes futuros.

<a id="ux03"></a>
### [UX03] Jenifer Tidwell, Charles Brewer e Aynne Valencia — *Designing Interfaces: Patterns for Effective Interaction Design*

- **Edição:** 3ª; **lançamento:** dezembro de 2019; **copyright de referência:** 2020; **editora:** O’Reilly Media.
- **Fonte oficial:** <https://www.oreilly.com/library/view/designing-interfaces-3rd/9781492051954/>.
- **Conferência:** metadados da página oficial indexada indicam autores, edição e lançamento. A consulta direta foi bloqueada; a distinção 2019/2020 evita apresentar lançamento e copyright como se fossem a mesma data.
- **Ideias utilizadas:** padrões de navegação, organização da informação, seleção, formulários e apresentação progressiva de detalhes.
- **Conexão:** `details/summary` em grupos e filtros, chips de disciplinas, seleção pesquisável e navegação mês/dia na agenda.
- **Limite:** um padrão é uma solução contextual, não um componente universalmente adequado. Detalhes recolhidos podem esconder ações importantes; o calendário de sete colunas pode reduzir a largura dos alvos.

<a id="ux04"></a>
### [UX04] Jeff Johnson — *Designing with the Mind in Mind: Simple Guide to Understanding User Interface Design Guidelines*

- **Edição:** 2ª; **ano de referência:** 2014; **editora:** Morgan Kaufmann, Elsevier.
- **Fonte oficial da editora:** <https://shop.elsevier.com/books/designing-with-the-mind-in-mind/johnson/978-0-12-407914-4>.
- **Conferência:** a página e seus metadados identificam Jeff Johnson, segunda edição e Morgan Kaufmann. O registro de publicação do formato impresso é de fevereiro de 2014 e há data comercial de dezembro de 2013; os metadados da própria página não são uniformes quanto ao ano. Adota-se aqui o copyright 2014 do registro editorial do produto, sem afirmar uma data única para todos os formatos.
- **Ideias utilizadas:** percepção, agrupamento, atenção limitada, reconhecimento em vez de memorização e coordenação entre mão e visão.
- **Conexão:** disciplinas escolhidas permanecem visíveis em chips; informações relacionadas aparecem juntas; títulos, contadores e feedback textual ajudam a localizar o estado atual.
- **Limite:** cores, proximidade e tamanho precisam ser verificados com zoom, contraste e tecnologias assistivas. Esses princípios não autorizam presumir capacidades cognitivas de um aluno específico.

<a id="ux05"></a>
### [UX05] Jakob Nielsen — *Usability Engineering*

- **Edição referenciada:** publicação original; **ano:** 1993; **editora da edição original em capa dura:** AP Professional, Academic Press.
- **Fonte oficial do autor/NNGroup:** <https://www.nngroup.com/books/usability-engineering/>.
- **Conferência:** a página identifica autor e ano e explica que a versão paperback da Morgan Kaufmann é ligeiramente expandida. Não se confundem essa versão e a edição original sob uma editora única.
- **Ideias utilizadas:** ciclo de engenharia de usabilidade, avaliação heurística e dimensões como aprendizagem de uso, eficiência, memorização, erros e satisfação.
- **Conexão:** revisar visibilidade do estado, mensagens de erro, prevenção de enganos em convites e recuperação de falhas de envio.
- **Limite:** uma revisão heurística não substitui um teste com participantes. “Aprendizagem de uso” significa aprender a operar a interface, não melhoria comprovada de notas ou aprendizagem de uma disciplina.

<a id="ux06"></a>
### [UX06] Adam Wathan e Steve Schoger — *Refactoring UI*

- **Edição:** publicação digital original, sem número de edição declarado nas páginas consultadas; **ano:** 2018; **publicação:** independente pelos autores, sob a marca Refactoring UI.
- **Página oficial:** <https://refactoringui.com/>.
- **Confirmação do lançamento pelo autor:** <https://adamwathan.me/2018-year-in-review/>.
- **Conferência:** a retrospectiva do autor descreve a parceria com Steve Schoger e o lançamento em dezembro de 2018. A página do produto identifica os autores e o livro; não se inventa um selo de editora tradicional nem uma edição numerada.
- **Ideias utilizadas:** hierarquia visual, espaçamento, contraste relativo, composição e uso deliberado de cor e tipografia.
- **Conexão:** tokens de espaçamento/cores/formas, diferenciação entre ação primária e secundária, legenda de cartão sobre camada escura e agrupamento de conteúdo.
- **Limite:** atratividade visual não assegura compreensão, acessibilidade nem sucesso de uma tarefa. A referência não significa que o projeto usa Tailwind CSS ou recursos gráficos licenciados do livro.

## 3. Livros de arquitetura e manutenção

<a id="ar01"></a>
### [AR01] Len Bass, Paul Clements e Rick Kazman — *Software Architecture in Practice*

- **Edição:** 4ª; **ano:** 2021; **editora:** Addison-Wesley Professional.
- **Fonte oficial:** <https://www.informit.com/store/software-architecture-in-practice-9780136886099>.
- **Ideias utilizadas:** atributos de qualidade, cenários verificáveis e escolhas com custos e benefícios.
- **Aplicação:** a separação entre núcleo, catálogo, produto, recursos acadêmicos e calendário facilita localizar responsabilidades; o polling troca simplicidade por atraso e tráfego periódico.
- **Limite:** cinco arquivos/globais não equivalem, por si só, a uma arquitetura desacoplada. Há contratos implícitos, dependência de ordem de carregamento e acesso compartilhado ao cliente Supabase.

<a id="ar02"></a>
### [AR02] Martin Fowler — *Refactoring: Improving the Design of Existing Code*

- **Edição:** 2ª; **lançamento:** 2018; **copyright editorial:** 2019; **editora:** Addison-Wesley Professional.
- **Página oficial do autor:** <https://martinfowler.com/books/refactoring.html>.
- **Catálogo oficial:** <https://www.informit.com/store/refactoring-improving-the-design-of-existing-code-9780134757599>.
- **Conferência:** o autor situa a segunda edição no fim de 2018; o catálogo informa copyright 2019. Não se deve apresentar a segunda edição como se fosse a primeira, de 1999.
- **Ideias utilizadas:** alterações pequenas que preservam comportamento, apoiadas por verificação.
- **Aplicação:** extrair uma função de apresentação mantendo escaping, nomes exportados, eventos e guardas contra respostas atrasadas; ampliar testes de regressão antes de mudar o fluxo.
- **Limite:** alterar regras, contratos de RPC ou permissões não é apenas refatorar. Uma reorganização “mais bonita” que duplica mensagens ou apaga rascunhos muda comportamento.

<a id="ar03"></a>
### [AR03] Martin Kleppmann — *Designing Data-Intensive Applications: The Big Ideas Behind Reliable, Scalable, and Maintainable Systems*

- **Edição:** 1ª; **ano:** 2017; **editora:** O’Reilly Media.
- **Anúncio oficial do autor:** <https://martin.kleppmann.com/2017/03/27/designing-data-intensive-applications.html>.
- **Página do livro:** <https://dataintensive.net/>.
- **Conferência:** o anúncio identifica o lançamento de março de 2017 pela O’Reilly. O site atual pode apresentar edições posteriores; esta referência continua sendo a primeira.
- **Ideias utilizadas:** confiabilidade, consistência, operações distribuídas, repetição de requisições e resultados incertos diante de falhas.
- **Aplicação:** `p_client_id` em mensagens, timeout que não comprova rollback, upload separado do salvamento do perfil e necessidade de atualizar dados após uma mutação incerta.
- **Limite:** essas analogias não demonstram operação em larga escala nem garantem entrega “exatamente uma vez”. As garantias concretas dependem das funções e restrições do servidor.

## 4. Normas e documentação oficial

<a id="doc01"></a>
### [DOC01] Material Design 3 — Google

<https://m3.material.io/>

Referência de papéis de cor, tipografia, forma, estados e componentes. O MatchUp tem CSS próprio inspirado nessas ideias, não adoção automática de uma biblioteca Material nem certificação de conformidade.

<a id="doc02"></a>
### [DOC02] Web Content Accessibility Guidelines — WCAG 2.2, W3C

<https://www.w3.org/TR/WCAG22/>

Norma para critérios de sucesso e níveis A, AA e AAA. É a referência normativa; as páginas “Understanding” abaixo explicam critérios, mas não substituem o texto normativo. O capítulo 11 apresenta evidências de código e verificações pendentes, não uma declaração de conformidade.

<a id="doc03"></a>
### [DOC03] Understanding SC 2.5.8 — Target Size (Minimum), nível AA

<https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>

Mínimo de **24 × 24 pixels CSS**, com exceções previstas, inclusive espaçamento. Não é uma regra universal de 44 px para AA; é preciso avaliar área efetiva e condições do critério.

<a id="doc04"></a>
### [DOC04] Understanding SC 2.5.5 — Target Size (Enhanced), nível AAA

<https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html>

Meta de **44 × 44 pixels CSS**, também com exceções. Serve como referência mais exigente para alvos de toque; declarar `min-height:44px` não prova que a largura também alcança 44 px.

<a id="doc05"></a>
### [DOC05] Understanding SC 2.5.7 — Dragging Movements, nível AA

<https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html>

Funcionalidades de arrastar precisam de alternativa por ponteiro sem arrastar, ressalvadas as exceções do critério. No cartão, botões explícitos são relevantes tanto para essa alternativa quanto para a operação por teclado, que deve ser verificada separadamente.

<a id="doc06"></a>
### [DOC06] Supabase — Row Level Security

<https://supabase.com/docs/guides/database/postgres/row-level-security>

Explica RLS e sua relação com privilégios. Uma chave publicável e um botão oculto não substituem autorização. Conferir também funções SQL, privilégios de execução e políticas dos buckets descritos nos capítulos de [dados](04-banco-de-dados.md) e [Supabase](05-supabase-e-configuracao.md).

<a id="doc07"></a>
### [DOC07] Capacitor — Share

<https://capacitorjs.com/docs/apis/share>

API de compartilhamento usada na integração nativa da agenda. Um compartilhamento entregue ao sistema não comprova importação em um calendário; suporte e comportamento variam por plataforma e aplicativo destinatário.

<a id="doc08"></a>
### [DOC08] Capacitor — Filesystem

<https://capacitorjs.com/docs/apis/filesystem>

Referência para escrita/leitura de arquivos e diretórios nativos. No MatchUp, o calendário usa uma área de cache própria; as regras de retenção são da implementação, não uma garantia de limpeza automática do sistema.

<a id="doc09"></a>
### [DOC09] PostgreSQL — Row Security Policies

<https://www.postgresql.org/docs/current/ddl-rowsecurity.html>

Referência oficial de políticas por linha, papéis e exceções, incluindo o comportamento de proprietários de tabelas. O endereço `current` acompanha a documentação corrente; conferir a versão do PostgreSQL do ambiente antes de aplicar detalhes de sintaxe ou administração.

<a id="doc10"></a>
### [DOC10] Playwright — Accessibility testing

<https://playwright.dev/docs/accessibility-testing>

Mostra integração de verificações automatizadas e explica sua cobertura parcial. A documentação menciona ferramentas complementares; isso não significa que todas estejam instaladas neste projeto. Consultar a suíte efetiva no [capítulo 07](07-testes-e-validacao.md).

<a id="doc11"></a>
### [DOC11] RFC 5545 — Internet Calendaring and Scheduling Core Object Specification (iCalendar)

<https://www.rfc-editor.org/rfc/rfc5545>

IETF, 2009. Referência para a estrutura iCalendar, propriedades, escapes e continuação de linhas. Gerar um `.ics` não implementa sincronização bidirecional, CalDAV ou inclusão automática de compromissos.

## 5. Glossário para quem está começando

### 5.1 Produto acadêmico e interação

| Termo | Significado neste projeto |
|---|---|
| MatchUp | Aplicativo de apoio à conexão acadêmica entre estudantes, monitorias e grupos de estudo. |
| Monitor / aluno | Papéis associados ao que uma pessoa oferece ou deseja aprender; não são duas identidades necessariamente exclusivas. |
| Disciplina atual | Matéria que a pessoa declara estar cursando; não é confirmação de matrícula pela instituição. |
| Disciplina de ajuda | Matéria em que a pessoa declara poder ajudar. Não equivale a certificação de domínio. |
| Interesse de aprendizagem | Matéria em que a pessoa procura apoio. |
| Catálogo | Lista estruturada de cursos e disciplinas usada nos seletores; pode conter grades completas, parciais ou indisponíveis. |
| Compatibilidade | Explicações derivadas de declarações de curso, matérias, formato e disponibilidade; não uma previsão de sucesso. |
| Pedido / solicitação | Convite acadêmico com assunto e contexto, sujeito a aceite ou recusa. |
| “Deu match!” | Mensagem visual associada ao aceite de um pedido acadêmico; não nome de um algoritmo de namoro. |
| Reset de laboratório / “Resetar matches” | Recurso entregue na 3.3.1, com evidência delimitada no capítulo 07: ação em Configurações que exige `RESETAR` e elimina todos os pedidos próprios enviados/recebidos e dependências acadêmicas dessas conexões, afetando ambos os lados. Preserva conta/perfil/foto, favoritos, bloqueios, denúncias, grupos e relações de terceiros; não exclui Storage físico, downloads ou ICS exportados. Não é o reset romântico legado nem `MentorAcademic.reset()`, que apenas limpa estado local. Ver [contrato e limites](03-frontend.md#94-laboratório-em-configurações--adição-posterior-à-base-33). |
| Favorito | Perfil marcado para consulta posterior; não pedido enviado nem aceite recíproco. |
| Grupo privado | Grupo cujo ingresso depende das regras de convite/acesso; “privado” não significa sigilo absoluto contra todo participante. |
| Proprietário do grupo | Pessoa responsável por configurações, código, remoção de membros e arquivamento. Conta na capacidade. |
| Código de convite | Código de acesso compartilhável; conhecê-lo não ignora capacidade, bloqueios ou demais validações do servidor. |
| Rotação do código | Substituição do código atual por outro, invalidando o anterior. Não remove automaticamente participantes existentes. |
| Revogação / desativação | Interrupção do uso do código. Na RPC, a ação implementada chama-se `disable`. |
| Horário preferido | Preferência cadastrada no grupo; não é um encontro efetivamente agendado. |
| Encontro / sessão acadêmica | Compromisso com data, duração, participantes e estado. Não confundir com sessão de autenticação. |
| Notificação interna | Item consultado dentro do app. Não equivale a push recebido com o aplicativo fechado. |
| Material | Arquivo vinculado a um contexto acadêmico autorizado, distinto da foto pública de perfil. |

### 5.2 Interface e acessibilidade

| Termo | Explicação prática |
|---|---|
| UI | Interface de usuário: controles, textos, layouts e estados apresentados. |
| UX | Experiência de uso mais ampla, incluindo compreensão, confiança, esforço e contexto da tarefa. |
| Usabilidade | Qualidade de conseguir operar o sistema em um contexto; precisa de avaliação, não apenas preferência estética. |
| Acessibilidade | Possibilidade de perceber, compreender e operar o produto com diferentes capacidades e tecnologias. |
| Affordance | Possibilidade de ação na relação entre pessoa e objeto; não é apenas a aparência de um botão. |
| Significante | Pista perceptível de onde e como agir: rótulo, ícone, forma ou instrução. |
| Feedback | Resposta após uma ação, como prévia, estado de envio ou mensagem de falha. |
| Modelo conceitual | Explicação que ajuda a pessoa a prever como o sistema funciona. Exemplo: selecionar foto não é ainda publicar foto. |
| Hierarquia visual | Diferenciação de importância por tamanho, posição, espaçamento, contraste e agrupamento. |
| Divulgação progressiva | Mostrar primeiro o essencial e permitir abrir detalhes, sem eliminar informações importantes. |
| Chip | Pequeno elemento que representa uma seleção ou atributo; alguns chips são botões removíveis, outros são apenas texto. |
| Estado vazio | Explicação de que não há itens, idealmente acompanhada de próxima ação; não deve mascarar uma falha de rede. |
| Alvo de toque | Área realmente acionável. O tamanho do desenho do ícone não é necessariamente o tamanho do botão. |
| Pixel CSS | Unidade de layout do navegador; não equivale diretamente a um pixel físico da tela. |
| Foco | Elemento que recebe a interação por teclado. Foco visível é a indicação perceptível dessa posição. |
| Ordem de foco | Sequência percorrida com teclado. Deve acompanhar uma ordem de uso compreensível. |
| Leitor de tela | Tecnologia que apresenta a estrutura e os estados da interface por voz ou braille. |
| ARIA | Atributos que complementam nomes, papéis e estados acessíveis; não substituem comportamento nem HTML semântico. |
| Região viva | Área marcada para anunciar mudanças, como `aria-live="polite"`; excesso de anúncios também prejudica o uso. |
| Reflow | Reorganização do conteúdo com largura reduzida ou zoom, evitando perda de informação e rolagem desnecessária em duas dimensões. |
| Contraste | Relação entre cores de conteúdo e fundo; deve ser medida no estado e no contexto efetivos. |
| Movimento reduzido | Preferência do usuário para diminuir animações; no CSS há tratamento de `prefers-reduced-motion`. |
| WCAG AA / AAA | Níveis de critérios de acessibilidade. Um componente que cumpre um critério AAA não certifica a aplicação inteira. |
| Heurística | Princípio para inspeção especializada; encontra riscos, mas não mede sozinho o comportamento de usuários. |
| Persona | Representação de público que precisa de base e escopo explícitos. Esta documentação não apresenta personas fictícias como pesquisa realizada. |

### 5.3 Frontend e concorrência

| Termo | Explicação prática |
|---|---|
| DOM | Árvore de elementos da página manipulada pelo JavaScript. |
| Renderização | Construção ou atualização do DOM a partir de dados e estado; não significa necessariamente uso de framework. |
| IIFE | Função executada imediatamente, usada aqui para guardar variáveis privadas e publicar uma API global pequena. |
| Contrato de módulo | Nomes exportados, argumentos, resultados e condições esperados entre arquivos. |
| Getter | Propriedade que calcula ou retorna o valor no momento da leitura. Os getters do app não são cópias imutáveis. |
| Estado | Informações que orientam a tela atual: usuário, perfil, filtros, mensagens e operações pendentes. |
| Epoch | Contador de geração da tela. Uma resposta de uma geração antiga não deve pintar a nova tela. |
| Revision | Contador de versão local usado para invalidar trabalho antigo ou evitar que uma leitura anterior sobrescreva uma mutação recente. |
| Corrida assíncrona | Situação em que operações terminam em ordem diferente da ordem em que começaram. |
| Promise / `await` | Mecanismos para lidar com resultados futuros sem bloquear a execução da página. |
| AbortController | Recurso para sinalizar cancelamento de uma requisição; não comprova reversão de uma transação no servidor. |
| Timeout | Limite de espera; uma falha por tempo pode deixar incerto se a escrita foi efetivada. |
| Polling | Consultas periódicas. No núcleo, pedidos e chats usam intervalo de 12 segundos em condições específicas. |
| Realtime | Atualizações por canal de eventos; a disponibilidade desse produto no Supabase não significa que o frontend o utiliza. |
| Rascunho | Conteúdo ainda não confirmado pelo servidor; os rascunhos descritos no frontend ficam em memória. |
| Outbox | Registro local de mensagem pendente e identificador de envio. Aqui não é uma fila offline persistente. |
| Idempotência | Propriedade de poder repetir uma operação sem repetir indevidamente seu efeito; depende do contrato e do servidor. |
| Escaping | Codificação de caracteres para apresentar texto sem interpretá-lo como HTML. |
| Object URL | Endereço `blob:` temporário que permite mostrar um arquivo local sem publicá-lo; deve ser revogado quando não for mais usado. |
| ResizeObserver | Observador de alterações de tamanho de elementos, usado para recalcular espaço disponível do cartão. |
| Token de design | Variável que centraliza uma decisão visual, como cor, forma, tipografia ou elevação. |

### 5.4 Dados, autenticação, arquivos e distribuição

| Termo | Explicação prática |
|---|---|
| Autenticação | Identificar a conta que está usando o serviço. |
| Autorização | Decidir quais ações e dados essa conta pode acessar. Esconder um botão não resolve essa decisão. |
| Sessão de autenticação | Estado de login administrado pelo Supabase Auth; diferente de um encontro da agenda. |
| Chave publicável | Identificador de acesso do cliente ao projeto; não deve receber poderes administrativos. |
| RPC | Chamada a função remota, como as funções `mentor_*` executadas no PostgreSQL via Supabase. |
| RLS | Políticas de segurança por linha no banco. Funcionam em conjunto com papéis e privilégios. |
| Transação | Conjunto de operações de banco com regras de confirmação/reversão; não abrange automaticamente upload e DOM. |
| Storage / bucket | Serviço e área de armazenamento de arquivos, com políticas próprias. |
| URL pública | Endereço acessível sem gerar uma autorização temporária por download; não é apropriado para todo material acadêmico. |
| URL assinada | Endereço temporário autorizado. Quem obtém o endereço pode usá-lo enquanto válido, conforme as regras do serviço. |
| MIME | Tipo informado para um arquivo, como `image/jpeg`; pode estar ausente ou incorreto. |
| Assinatura de arquivo | Bytes iniciais característicos de um formato. Uma verificação simples não é análise completa nem antivírus. |
| `safePhoto` | Validador local de origem e formato de URL de foto. Não valida conteúdo binário nem propriedade da imagem. |
| JPEG / PNG / WebP | Formatos de imagem aceitos na seleção de foto. A otimização de perfil produz JPEG. |
| UUID | Identificador amplamente usado para entidades e envios. Uma expressão regular aproximada não verifica todas as propriedades do formato. |
| ICS / iCalendar | Formato de arquivo para intercâmbio de eventos de calendário, definido pela RFC 5545. |
| UTC | Referência de tempo usada na serialização dos horários exportados; a exibição local depende de fuso e aplicativo. |
| PWA | Aplicação web com recursos de instalação e shell em cache; não significa que todas as funções operam offline. |
| Service worker | Script separado da página que pode interceptar requisições e gerenciar cache/atualização. |
| Cache | Cópia reutilizável de dados ou arquivos. O cache do shell não é backup de mensagens. |
| Capacitor | Camada de integração entre aplicação web e recursos nativos; não é evidência de teste em aparelho físico. |
| WebView | Componente que apresenta conteúdo web dentro do aplicativo nativo. |
| `versionName` / `versionCode` | Versão legível e número inteiro de distribuição Android, respectivamente; não são o mesmo campo. |
| Teste E2E | Teste de uma jornada integrada pela interface; ambiente simulado não comprova comportamento de todo serviço real. |
| Regressão | Comportamento antes funcional que deixa de funcionar após uma alteração. |
| Evidência histórica | Registro de uma versão/execução anterior. Não é automaticamente validação da versão atual. |

## 6. Percursos de leitura

- **Quero entender o produto:** [visão geral](01-visao-geral-e-arquitetura.md) → [manual](02-funcionalidades-e-uso.md) → [UI/UX](11-ui-ux-e-acessibilidade.md).
- **Vou manter o frontend:** [implementação](03-frontend.md) → [testes](07-testes-e-validacao.md) → [manutenção](10-manutencao-e-evolucao.md); complementar com [AR02] e [UX03].
- **Vou revisar dados e permissões:** [banco](04-banco-de-dados.md) → [Supabase](05-supabase-e-configuracao.md) → [operação e privacidade](08-operacao-privacidade-e-suporte.md); complementar com [DOC06], [DOC09] e [AR03].
- **Vou preparar uma versão:** [desenvolvimento e Android](06-desenvolvimento-e-android.md) → [testes](07-testes-e-validacao.md) → [histórico](13-historico-de-releases.md).
- **Encontrei descrições antigas:** comparar [backend legado](09-backend-legado.md) e [histórico](13-historico-de-releases.md), sem transportar comportamentos antigos para o produto atual.
