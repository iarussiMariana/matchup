# Documentação do MatchUp

[Apresentação do projeto](../README.md) · [Abrir a PWA](https://matchup-87k.pages.dev/)

**Manual do produto acadêmico 3.3.3 — Android versionCode 13.** Esta coleção substitui a documentação operacional dos antigos modos Spark Campus. Relacionamentos, caronas e backend Node/SQLite aparecem somente como legado ou história, não como instruções atuais de uso.

A 3.3.3 integra uma abertura opcional com o vídeo fornecido, sem mudar contratos backend. APK/ZIP atuais, hashes e publicação verificada estão no [capítulo 13](13-historico-de-releases.md); a campanha direcionada e o inventário de **201 testes em 15 arquivos**, sem alegar execução completa dessa suíte, estão no [capítulo 07](07-testes-e-validacao.md).

## 1. Como usar esta documentação

Os capítulos procuram responder, em ordem: **por que o produto existe, como usá-lo, como funciona por dentro, como mantê-lo e que evidências sustentam as afirmações**. Não é necessário ler tudo para começar. Escolha uma trilha e use os demais capítulos como referência.

| Capítulo | Conteúdo | Para quem |
|---|---|---|
| [01 — Visão geral e arquitetura](01-visao-geral-e-arquitetura.md) | Problema, papéis, escopo, requisitos, atributos de qualidade, diagramas e trade-offs | Todos; especialmente equipe e avaliadores |
| [02 — Funcionalidades e uso](02-funcionalidades-e-uso.md) | Jornada passo a passo, foto, descoberta, pedido, chat, grupos, agenda e recuperação | Estudantes e responsáveis por grupos |
| [03 — Frontend](03-frontend.md) | Arquivos, estado, renderização, eventos, contratos, estilos e manutenção | Desenvolvimento frontend |
| [04 — Banco de dados](04-banco-de-dados.md) | Modelo acadêmico, campos/relações, RPCs, constraints, RLS e autorização | Backend e manutenção |
| [05 — Supabase e configuração](05-supabase-e-configuracao.md) | Ambientes, Auth, Storage, precedência de migrations e operação segura | Responsável técnico |
| [06 — Desenvolvimento e Android](06-desenvolvimento-e-android.md) | Ambiente, comandos, allowlist, build, PWA, APK e diagnóstico | Desenvolvimento e publicação |
| [07 — Testes e validação](07-testes-e-validacao.md) | Camadas de teste, execução, evidências, casos de aceite e limitações | Desenvolvimento, QA e avaliadores |
| [08 — Operação, privacidade e suporte](08-operacao-privacidade-e-suporte.md) | Piloto, responsabilidades, dados, moderação, incidentes e suporte | Responsável pelo piloto |
| [09 — Backend legado](09-backend-legado.md) | Implementação Node/SQLite histórica e diferenças para o sistema atual | Manutenção histórica |
| [10 — Manutenção e evolução](10-manutencao-e-evolucao.md) | Invariantes, revisão de mudanças, decisões, roadmap e apresentação acadêmica | Equipe e avaliadores |
| [11 — UI/UX e acessibilidade](11-ui-ux-e-acessibilidade.md) | Fundamentos, Material Design 3, hierarquia, interação, textos e métodos de avaliação | Design, frontend e avaliadores |
| [12 — Referências e glossário](12-referencias-e-glossario.md) | Livros, documentação oficial, conceitos e vocabulário explicado | Consulta transversal |
| [13 — Histórico de releases](13-historico-de-releases.md) | Evolução, artefatos, hashes e evidências preservadas | Rastreabilidade e distribuição |

## 2. Trilhas de leitura

### Quero apenas usar o app

[Manual de uso](02-funcionalidades-e-uso.md) → [Privacidade e suporte](08-operacao-privacidade-e-suporte.md).

Não execute npm, SQL, servidor local ou testes para usar a PWA publicada. Instalar a PWA no Safari não exige baixar o ZIP.

### Vou apresentar o projeto na UPX

[Problema e arquitetura](01-visao-geral-e-arquitetura.md) → [Jornada do usuário](02-funcionalidades-e-uso.md) → [Fundamentação UI/UX](11-ui-ux-e-acessibilidade.md) → [Evidências e limites](07-testes-e-validacao.md) → [Referências](12-referencias-e-glossario.md).

Demonstre uma jornada com dados fictícios e explique as escolhas. Não apresente proposta de avaliação como pesquisa já realizada nem teste de navegador como homologação de iPhone.

### Vou modificar a interface

[Ambiente](06-desenvolvimento-e-android.md) → [Arquitetura](01-visao-geral-e-arquitetura.md) → [Frontend](03-frontend.md) → [UI/UX](11-ui-ux-e-acessibilidade.md) → [Testes](07-testes-e-validacao.md) → [Manutenção](10-manutencao-e-evolucao.md).

Edite fontes canônicos, não `www` ou assets nativos gerados. Alterar um formulário não permite retirar a validação correspondente no servidor.

### Vou manter o backend

[Banco](04-banco-de-dados.md) → [Configuração e migrations](05-supabase-e-configuracao.md) → [Testes reais e limpeza](07-testes-e-validacao.md) → [Operação](08-operacao-privacidade-e-suporte.md).

A ordem histórica das migrações importa. Não execute `setup-supabase.js`, reset ou migrations antigas sobre a base atual como “reinstalação”.

### Vou distribuir ou operar o piloto

[Estado do produto](../README.md) → [Operação](08-operacao-privacidade-e-suporte.md) → [Build/publicação](06-desenvolvimento-e-android.md) → [Artefatos](13-historico-de-releases.md) → [Checklist de qualidade](07-testes-e-validacao.md).

Distribua apenas o artefato aprovado. A pasta do projeto contém ferramentas administrativas e não deve ser enviada aos participantes.

## 3. Mapa da aplicação atual

```text
raiz
├── README.md                       entrada rápida do produto
├── docs                            documentação atual e histórico identificado
├── index.html                      documento e carregamento dos módulos atuais
├── startup.js / startup.css        abertura opcional independente do núcleo
├── mentorship.js / .css            coordenação principal e visual base
├── mentorship-academic.js / .css   grupos, encontros e integrações acadêmicas
├── mentorship-catalog.js / .css    seletores do catálogo
├── mentorship-product.js           helpers e recursos de produto
├── mentorship-calendar.js          exportação ICS e compartilhamento
├── pwa.js / pwa.css / sw.js         instalação, atualização e shell público
├── manifest.webmanifest            metadados de instalação
├── assets\brand                    identidade, ícones e matchup-intro.mp4
├── vendor\supabase.js              SDK local gerado da dependência
├── supabase                        migrations e políticas, não ativos públicos
├── data                            catálogo e auditoria de fontes
├── tools                           build, servidor e utilitários administrativos
├── tests                           testes atuais e regressões históricas
├── www                             saída gerada para publicação/Capacitor
├── android                         projeto nativo e saídas de build
├── server                          backend histórico independente
└── MatchUp-3.3.3.apk                artefato nomeado do piloto Android
```

`script.js`, `styles.css`, `campus.*` e `mode-shell.*` são preservados historicamente, mas não são carregados pelo `index.html` atual nem publicados pela allowlist. A existência de um arquivo não prova que participa do runtime.

## 4. Referência cruzada por dúvida

| Dúvida | Capítulos |
|---|---|
| Por que não usar o backend Express existente? | 01 e 09 |
| Como pular a abertura e quando o vídeo nem é baixado? | 02, 03 e 11 |
| Como empacotar o vídeo sem torná-lo obrigatório offline? | 06 e 07 |
| Como adicionar/trocar/remover foto? O que fica público? | 02, 03 e 08 |
| Por que favoritar não libera chat? | 01 e 02 |
| Como resetar matches no laboratório e o que será apagado? | 02, 03, 04 e 08 |
| Como funcionam códigos, vagas, remoção e arquivamento? | 02 e 04 |
| Quais matérias podem ser selecionadas? O catálogo é completo? | 02, 04 e 05 |
| Como evitar respostas antigas após navegar/trocar de conta? | 03 e 07 |
| O que é RLS e por que validar também no backend? | 01, 04 e 12 |
| Por que remover foto não garante excluir o arquivo? | 03, 04 e 08 |
| Como executar sem alterar dados reais? | 06 e 07 |
| Quais dados funcionam offline? | 01, 02, 06 e 07 |
| Como publicar e configurar e-mails sem expor segredos? | 05, 06 e 08 |
| Qual versão/hash deve ser distribuído? | 13 |
| O que Material Design 3 e os livros têm a ver com a interface? | 11 e 12 |
| Como avaliar se a experiência realmente ficou melhor? | 07, 10 e 11 |

## 5. Convenções editoriais

- **Implementado:** localizado nos fontes atuais; não é certificado de implantação remota.
- **Evidência da entrega:** execução registrada em uma versão anterior à reescrita documental.
- **Conferência documental:** inspeção/listagem/checagem realizada para produzir estes textos.
- **Proposto ou recomendado:** não deve ser tratado como funcionalidade já entregue.
- **Legado ou histórico:** pode explicar evolução, mas não orienta automaticamente a operação atual.

Caminhos de arquivos são relativos à raiz e usam barra invertida em exemplos Windows. Links Markdown usam sintaxe de URL. Nomes de símbolos são preferidos a números de linha, que mudam com frequência. Valores como `<UUID_DO_RESPONSAVEL>` são placeholders, não credenciais ou comandos prontos para executar sem revisão.

Os diagramas simplificam para ensinar: a visão lógica de domínio não substitui o dicionário físico do banco. A bibliografia contém referências para estudo e paráfrases aplicadas ao projeto; não reproduz capítulos dos livros nem comprova que houve pesquisa empírica com participantes.

## 6. Limitações que atravessam todos os capítulos

1. App independente, para adultos, sem verificação oficial de matrícula ou competência acadêmica.
2. Fotos públicas e materiais restritos têm modelos de acesso distintos.
3. Cache do shell não significa dados acadêmicos offline ou envio posterior automático.
4. Notificações internas não significam push com aplicativo fechado.
5. Exportar ICS não significa sincronização contínua nem alerta garantido no sistema.
6. APK debug não é publicação Play Store; PWA não é aplicativo publicado na App Store.
7. Chrome/WebKit não substituem homologação física Android/iOS, ainda pendente.
8. A limitação do runner WebKit offline não foi apresentada como defeito comprovado no Safari.
9. E-mails Auth e atribuição de moderação precisam de operação responsável e validação próprias.
10. Testes aprovados não demonstram perfeição de UX, conformidade jurídica ou ausência de vulnerabilidades.

## 7. Como manter a documentação confiável

Ao modificar o produto, atualize o capítulo do comportamento, o contrato técnico afetado e o teste relevante. Registre nova evidência sem apagar a anterior. Não altere números históricos para fazê-los parecer resultados atuais.

Uma revisão só de texto deve conferir navegação, links, caminhos, símbolos, versões e bibliografia. Um procedimento perigoso deve identificar pré-condições, efeito, autorização e recuperação **antes** do comando. Não publique valores de `.env`, tokens, conversas, arquivos de participantes ou códigos de convite ativos como exemplos.

Para começar do zero conceitualmente, avance para [01 — Visão geral e arquitetura](01-visao-geral-e-arquitetura.md).
