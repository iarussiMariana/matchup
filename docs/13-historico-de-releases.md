# 13 · Histórico de releases e evidências

[← Portal da documentação](README.md) · [Testes](07-testes-e-validacao.md) · [Desenvolvimento e Android](06-desenvolvimento-e-android.md)

> Este capítulo preserva o que foi entregue e verificado em cada etapa. Uma evidência histórica não equivale a executar novamente um teste, validar um telefone físico ou garantir ausência de defeitos. O produto atual é **MatchUp**, de finalidade acadêmica; as fases Spark Campus não definem seu escopo.

## 1. Como ler uma versão

- **Código-fonte:** arquivos editáveis na raiz e migrações em `supabase`.
- **Build web:** cópia gerada em `www`, com lista explícita de arquivos públicos e service worker por hash.
- **PWA publicada:** conteúdo efetivamente servido pelo endereço de implantação; pode não corresponder imediatamente aos fontes locais.
- **APK:** pacote Android assinado. `versionName` é o nome apresentado; `versionCode` é o inteiro usado pelo Android para ordenar atualizações.
- **ZIP PWA:** fotografia do build web daquela release, não um backup de contas, banco ou Storage.
- **Hash SHA-256:** identifica os bytes de um arquivo. Não substitui assinatura confiável, auditoria ou teste funcional.

A entrega atual **3.3.3 / código 13** adiciona a abertura opcional com o vídeo fornecido. Reset de laboratório (3.3.1) e refinamento responsivo (3.3.2) são campanhas anteriores, preservadas separadamente da 3.3. Os arquivos de releases anteriores não devem ser sobrescritos silenciosamente com outro conteúdo.

## 2. Evolução do produto

| Etapa | Produto/decisão | Evidência e cautela |
|---|---|---|
| Protótipo HTML | Interface inicial separada em HTML, CSS e JavaScript | Base histórica; não descreve a arquitetura atual |
| 1.x | Backend local Node, Express, SQLite via sql.js e Socket.IO; depois adoção do Supabase | O backend local permanece legado independente, não fallback automático |
| 2.0 | Spark Campus com três modos | Recursos românticos e caronas deixaram de fazer parte do produto público atual |
| 2.1 | Padronização visual e correções responsivas | Registro histórico; o antigo relatório visual não está presente nesta pasta e não é o guia de design vigente |
| 3.0, código 7 | Monitoria acadêmica exclusiva | Simplificação do propósito, solicitações e conversas acadêmicas |
| 3.1 | Marca MatchUp, acabamento visual, instalação PWA/Android e hospedagem | Validação de navegador não demonstra usabilidade em aparelhos físicos |
| Catálogo FACENS | Seleção de cursos e matérias obtidos de fontes públicas oficiais | Matrizes parciais/indisponíveis são sinalizadas; não existe vínculo institucional demonstrado |
| 3.2 | Doze melhorias integradas do produto | Onboarding, descoberta, pedidos contextualizados, agenda, grupos, feedback, segurança e desempenho conforme capítulos funcionais |
| 3.3, código 10 | Cards compactos, editor de foto e administração/convites de grupos | Estado publicado que serviu de referência à documentação |
| 3.3.1, código 11 | Documentação reescrita e reset de laboratório | Publicado; validação proporcional e preservação de dados descritas abaixo |
| 3.3.2, código 12 | Layout adaptativo, estados de carregamento e formulários progressivos | Publicação anterior; regressões corretivas, build e verificação HTTPS preservados abaixo |
| 3.3.3, código 13 | Abertura opcional com o vídeo fornecido, sem bloquear sessão ou navegação | Publicado e verificado; artefatos e evidências na seção 5 |

### 2.1 Decisões que não devem ser revertidas por acidente

1. A marca pública é MatchUp; `com.spark.upx` é identificador técnico mantido por compatibilidade.
2. O produto é de conexões acadêmicas, sem recomendação romântica ou caronas na interface publicada.
3. O catálogo permite seleção; não inventa matrizes completas onde a fonte não as oferece.
4. Material privado e foto pública têm controles diferentes.
5. Histórico de migração não é instrução para reaplicar SQL antigo sobre dados existentes.
6. Material Design 3 é referência de decisões, não uma certificação concedida ao aplicativo.
7. O usuário proibiu emuladores/simuladores nas etapas atuais. Existiram registros antigos anteriores a essa instrução; não devem ser apresentados como validação física atual.

### 2.2 Entrega anterior — 3.3.1, código 11

- Reescrita completa do README e portal, com 13 capítulos: uso, arquitetura, frontend, dados, Supabase, desenvolvimento, testes, operação, legado, manutenção, UI/UX, referências/glossário e este histórico.
- Bibliografia identificada: seis livros de UI/UX, três de arquitetura/manutenção e onze referências oficiais. Diferencia inspiração teórica de validação empírica.
- Reset em **Perfil → Configurações → Laboratório**, exigindo `RESETAR`. Remove conexões próprias e dependências individuais de ambos os lados, preservando perfil, grupos e registros de segurança. Não é reset global nem exclusão física de Storage.
- `tools\deploy-lab.cjs --apply` instalou somente a RPC aditiva, verificando preservação dos dados e funções preexistentes. **Nenhum participante real teve conexões resetadas.**
- Testes aprovados: **57 Node**, **74 Chrome**, **74 WebKit** e **49 assertions SQL com rollback**. As regressões de navegador cobrem núcleo, foto, grupos e laboratório; os 166 casos descobertos não foram todos executados nesta campanha.
- Build Android concluído com JDK 21; APK inspecionado: `com.spark.upx`, MatchUp, 3.3.1/code 11, minSdk 24/target 36 e mesma assinatura debug do piloto. Nenhum emulador/simulador foi utilizado.
- **21 ativos públicos idênticos** entre fontes/build, APK, ZIP e publicação. Os únicos extras web do APK são os arquivos gerados `cordova.js` e `cordova_plugins.js`; não há URL de servidor de desenvolvimento na configuração nativa.
- Verificação HTTPS: bytes/MIME, cache estático e recarga offline Chrome aprovados; WebKit passou startup/cache/recarga controlada online. Safari offline físico, instalação física e entrega de e-mails permanecem pendentes.

Artefatos desta entrega: [APK 3.3.1](../MatchUp-3.3.1.apk) e [ZIP PWA 3.3.1](../MatchUp-PWA-3.3.1.zip). A publicação estável está na seção 5. Comandos reproduzíveis e limites da evidência estão no [capítulo 07](07-testes-e-validacao.md).

### 2.3 Entrega anterior — 3.3.2, código 12

- Shell autenticado adaptativo até 1120 px, início em duas colunas no desktop e formulários com largura de leitura controlada. Os cards de descoberta continuam compactos, com conteúdo limitado a 452 px.
- Tipografia de apoio maior, hierarquia semântica e navegação com espaço de rolagem que não encobre os últimos controles, inclusive em tela baixa e texto a 200%.
- Skeletons acessíveis para listas, cards e mensagens, com status textual, respeito a movimento reduzido e substituição correta por conteúdo, erro ou retry.
- Grupos mostram primeiro matéria/nome/assunto/objetivo. Participantes/acesso e formato/apoio ficam em seções expansíveis com resumo atualizado, sem remover opções. Rascunhos em memória da conta sobrevivem à navegação; controles inválidos são revelados e recebem foco.
- Correções verificadas no WebKit: evitar trocar texto inalterado durante `blur` e focar o primeiro campo inválido após revelar sua seção, sem desativar a validação nativa.
- **57/57 Node** finais. Suítes completas iniciais: **178/179 Chrome e 173/179 WebKit**; após corrigir o teste do catálogo e os comportamentos de grupos, **32/32 catálogo + grupos em cada motor**. Todos os cenários tiveram aprovação ao longo da campanha; não houve uma nova passagem única completa após as correções. Veja o [registro detalhado](07-testes-e-validacao.md).
- Android reconstruído com JDK 21: `com.spark.upx`, MatchUp, versão 3.3.2/código 12, minSdk 24 e target 36. Assinatura debug conferida; sem URL de servidor de desenvolvimento no APK.
- **21 ativos públicos idênticos** entre fontes/build, assets Android, APK, ZIP e publicação HTTPS, com MIME correto. ZIP limitado à allowlist; APK contém somente os dois extras gerados `cordova.js` e `cordova_plugins.js` dentro dos ativos web.
- Publicação verificada por `node .\tests\mentorship-release-live.cjs --run`: startup HTTPS, worker atual e cache somente estático passaram em Chrome/WebKit; recarga offline Chrome e recarga controlada online WebKit passaram.
- Sem migração, mutação de contas reais ou emuladores/simuladores. Uso com teclado/leitor de tela nativo, instalação física, Safari offline físico e entrega real de e-mails permanecem pendentes; não são promessas desta automação.

Artefatos finais: [APK 3.3.2](../MatchUp-3.3.2.apk) e [ZIP PWA 3.3.2](../MatchUp-PWA-3.3.2.zip). As versões anteriores foram preservadas. Os hashes abaixo correspondem à regeneração final, já incluindo as correções WebKit; não aos pacotes provisórios produzidos durante o desenvolvimento.

### 2.4 Entrega atual — 3.3.3, código 13

- Vídeo fornecido integral e byte a byte preservado em `assets\brand\matchup-intro.mp4`: **10,006 s, 1280 × 720, H.264/AAC, 2.648.263 bytes**. Autoplay silencioso/inline, poster local e quadro completo em retrato/paisagem, sem recorte.
- `startup.js` deferido antes do SDK local; `startup.css` após `pwa.css`. Intro independente do núcleo, com app carregando por trás. Diálogo inicialmente fechado e mídia sem `src`; botão de pular, Escape, término, erro e prazos liberam mídia e app. Preferências, conexão, visibilidade, sessão anterior e retornos Auth podem dispensar o download; contrato completo no [capítulo 03](03-frontend.md).
- Frequência por sessão da aba, sem repetir na navegação interna; armazenamento bloqueado degrada para uma vez por documento. Restauração de sessão varia por navegador. No Android, a mesma intro web aparece **após a splash do sistema**, não como vídeo nativo de splash.
- **57/57 Node** aprovados. Recortes iniciais de 76 cenários: 74 aprovados e duas falhas de asserção em cada motor. Após correções e dois novos cenários, recortes finais de startup + entrada principal: **23/23 Chrome e 23/23 WebKit**. Houve uma falha intermediária de teste 404 WebKit, corrigida usando arquivo realmente ausente. **78 cenários direcionados distintos aprovados por motor ao longo da campanha**, não uma passagem única final nem toda a suíte de **201 cenários em 15 arquivos**. Detalhes e limitações no [capítulo 07](07-testes-e-validacao.md).
- Chrome confirmou decodificação do vídeo real; WebKit verifica reprodução quando disponível ou saída segura. Isso não homologa codec Safari/iPhone. Sem telefone físico, emuladores, SQL ou mutação de dados de participantes; contratos backend inalterados.
- Build web e Android concluídos: `com.spark.upx`, MatchUp, **3.3.3/code 13**, minSdk 24/target 36, assinatura debug aprovada e sem URL de servidor de desenvolvimento.
- **24 arquivos públicos idênticos** entre fontes/worker gerado, `www`, assets nativos, APK e ZIP. A allowlist central tem **23 fontes + worker gerado**; `shellAssets` exige **22 arquivos** de precache, excluindo MP4 e worker. O vídeo participa do hash, mas não é interceptado pelo service worker, inclusive Range.
- Servidor local verificado com MIME `video/mp4`, `HEAD`, `Accept-Ranges`, intervalos simples válidos **206** e inválidos **416**, sem ampliar a allowlist. Na Cloudflare, Range retornou **200 com os 2.648.263 bytes completos**, fallback HTTP válido para reprodução progressiva, não evidência de 206 público.

Distribuição atual: [APK 3.3.3](../MatchUp-3.3.3.apk) e [ZIP PWA 3.3.3](../MatchUp-PWA-3.3.3.zip). Artefatos anteriores preservados; hashes de APK/ZIP 3.3.2 conferidos sem alteração. A seção 5 distingue implantação imutável, endereço estável e resultado de verificação, sem presumir que um deploy terminou a propagação.

## 3. Matriz histórica de testes

Os números são específicos de cada release e podem incluir assertivas de várias camadas. **Não os some** para produzir um indicador de cobertura: testar o mesmo comportamento em dois navegadores não significa duas funcionalidades independentes.

| Etapa | Node | Interface | Backend/outros |
|---|---:|---|---|
| 2.0 | 4 | 50 em execução completa + 1 recuperação direcionada | 1.161 assertivas de backend + 191 HTTPS |
| 2.1 | 4 | 77 testes; 2 opt-in desativados | Evidência detalhada no relatório histórico visual |
| 3.0 | 9 | 57 Chrome | 1.866 assertivas backend; 256 HTTPS; 21 RPCs e PDFs privados |
| 3.1 | 14 | 73 Chrome; WebKit 69 na suíte + 4 recuperados separadamente | 17 ativos públicos; **não** houve uma passagem estável única de 73 WebKit |
| Catálogo FACENS | 21 | 85 Chrome + 85 WebKit | 180 assertivas SQL; 31 tabelas preexistentes preservadas; 19 ativos públicos |
| 3.2 | 48 | 130 Chrome + 130 WebKit | 491 assertivas SQL com rollback; 35 tabelas preexistentes preservadas; 21 ativos públicos |
| 3.3 | 55 | 156 Chrome + 156 WebKit | 241 assertivas SQL com rollback + 127 assertivas autenticadas de grupos; smoke real da foto; 21 ativos públicos |

Na abertura desta revisão documental, `npm run test:ui -- --list` descobriu **156 testes em 12 arquivos**, antes da inclusão dos testes de laboratório. Isso é apenas descoberta, não execução. A lista corrente deve ser consultada novamente quando novos testes forem adicionados.

### 3.1 O que não foi provado por esses números

- Compatibilidade completa em Android e iPhone físicos.
- Entrega real de e-mails de confirmação/recuperação para todos os provedores.
- Operação offline de domínio: a PWA guarda shell estático, não oferece fila offline de pedidos ou mensagens.
- Offline físico em Safari instalado: a verificação WebKit publicada limitou-se a recarga controlada online; testes locais de host desconectado são outra evidência.
- Representatividade de estudo de usabilidade: não há estudo com participantes a ser inferido da automação.
- Disponibilidade de moderador, suporte ou compromisso institucional da FACENS.
- Cobertura formal de acessibilidade, conformidade integral com WCAG ou LGPD.

## 4. Artefatos e hashes registrados

Os hashes e tamanhos abaixo são registros das verificações locais de cada campanha; os da **3.3.3 foram calculados após seu build**, não recalculados nesta edição de texto. Os registros anteriores foram preservados. Na inspeção histórica de fechamento da reescrita, os APKs 3.1 e 3.2 e o alias `Spark.apk` já não estavam presentes. Seus hashes permanecem como registro histórico, não como promessa de arquivo disponível. Os artefatos novos não sobrescreveram os arquivos versionados existentes. Um hash permite comparar bytes, mas não prova que alguém instalou ou usou o aplicativo.

| Arquivo | Bytes | SHA-256 |
|---|---:|---|
| `MatchUp-3.3.3.apk` | 7.930.628 | `83953F2AACACDEACEC5A09887F96D3001D0E0A626344694E95803F0ED82D397F` |
| `MatchUp-PWA-3.3.3.zip` | 3.275.479 | `7B349704734DFF1BE5DB7C42634E7DE215C0688E7FC297FDEF09AB2124919E9F` |
| `MatchUp-3.3.2.apk` | 5.299.105 | `253937C1DFA0D7385C6B5391E088C091C24B9C57BD108B545B81170662F6DD36` |
| `MatchUp-PWA-3.3.2.zip` | 631.891 | `4DF9CBBD3F6CDF47370ADA164DB3D6A35F69CD223FFCA4BF83B0F79510604270` |
| `MatchUp-3.3.1.apk` | 5.277.181 | `5DA05941ABCFA22167375DEA874BCDAC66748FD3BCB75C4B0D41BACF7C393BD6` |
| `MatchUp-PWA-3.3.1.zip` | 629.417 | `FB2FF830059EB0C65EC2CB65F5C0187D4F317A6278A82ABCD8A2A425044EF6AC` |
| `MatchUp-3.3.apk` | 5.275.669 | `5BB6844E7B9B302E5D3B73F2AF72BB9589DBDD69BC7DCD852CB2D18ABEBA40BE` |
| `MatchUp-PWA-3.3.zip` | 628.195 | `FF50A6FE852CA9E340C001E0CA2412A4AE0299B2E4383199AD0477488F1198AA` |
| `MatchUp-3.2.apk` | 5.269.889 | `A39D6E50D6FC5F5E55C265C92F748D4D43153A6CDCE934BD13E8C41A611D9F62` |
| `MatchUp-PWA-3.2.zip` | 625.785 | `B5DD5F9CD3B89DF27159A84976B8BE9020EF93A601658FCD1557C346243A00CE` |
| `MatchUp-3.1.apk` | 5.126.420 | `12BFCA1BD942E7A7D529B7847AEE8D99915E03D302A419D72DB25D04AEFE274B` |
| `MatchUp-PWA-3.1.zip` | 604.989 | `1EFB4D3E85C98BC0CE2BFB55BA083D59E323CD304535FBCF5CD322F1110CAF56` |

Na checagem inicial da base 3.3, `Spark.apk` tinha os mesmos bytes de `MatchUp-3.3.apk`. Esse alias histórico não foi recriado nesta entrega. A distribuição atual utiliza explicitamente o arquivo `MatchUp-3.3.3.apk`. Os hashes/tamanhos da 3.3.3 foram calculados após seu build; seus 24 arquivos públicos foram comparados com fontes/worker gerado, build, assets Android, APK e ZIP. Os hashes/tamanhos da 3.3.2 e a conferência dos seus 21 ativos permanecem como evidência da campanha anterior.

### 4.1 Assinatura Android do piloto

Os APKs 3.2, 3.3, 3.3.1, 3.3.2 e 3.3.3 utilizaram a assinatura debug do piloto; a 3.3.3 passou na verificação de assinatura. As verificações anteriores permanecem históricas. SHA-256 do certificado:

```text
544fa75f9e27cd032d38540cb1dfa49ff78b1f511a08a03d46f1115ff38edd26
```

Assinatura debug permite testar instalação controlada; não é o plano final de assinatura e distribuição em loja. O certificado e o `versionCode` influenciam atualização sobre uma instalação existente. Não desinstale um app nem apague dados do aparelho como solução automática para incompatibilidade.

### 4.2 Artefatos anteriores

- Monitoria 3.0, código 7: 4.235.628 bytes; SHA-256 `77AFF3CC0410C47F976AE534E8D9478098DBE458FD94132542B26F81DC9D1747`.
- Spark 2.1: 4.278.574 bytes; SHA-256 `E7D870917F4C38DB3D3215EF6C9BFDE2E0971B04FEF0B3D63B7E1BDAAFD1BC41`.

Esses dois registros são históricos, não nova recomputação desses artefatos nesta revisão. Não se recomenda instalar versões antigas para uso corrente, pois contêm escopos e controles diferentes.

## 5. Publicação e instalação

- Endereço estável: **https://matchup-87k.pages.dev/**.
- Implantação imutável 3.3.3: **https://0ff58723.matchup-87k.pages.dev**.
- Cache estático 3.3.3: `matchup-static-e4a396563d6dc6efa254`.
- **Verificação final da 3.3.3 aprovada no endereço estável:** 24 arquivos públicos idênticos ao build em bytes/MIME; a URL imutável também passou na comparação dos 24 arquivos. Chrome observou `playing` real, vídeo silencioso/inline e liberação do diálogo/`src` após fim ou prazo. Ambos os motores confirmaram worker atual e **22 arquivos estáticos no cache, sem MP4**. Chrome passou recarga offline; WebKit passou recarga controlada online, não homologação de iOS offline.
- Durante a propagação inicial, raiz e `index.html` do endereço estável serviram HTML de versões diferentes; a verificação final acima ocorreu após essa divergência. Range público retornou **200 com vídeo completo e bytes verificados**, não 206. O verificador foi ajustado para aceitar esse fallback HTTP válido e aguardar o diálogo ficar oculto antes de conferir a liberação, pois o login carrega por trás do vídeo. Não foi necessária mudança de produção para esses ajustes de teste.
- Implantação anterior 3.3.2: **https://4dcd113f.matchup-87k.pages.dev**.
- Cache estático anterior 3.3.2: `matchup-static-28914cb6167515cf9afd`.
- Implantação anterior 3.3.1: **https://bd9ef3c7.matchup-87k.pages.dev**.
- Cache estático 3.3.1: `matchup-static-cce2b5a8ab1db45f1edb`.
- Implantação específica 3.3: **https://bfec1d6e.matchup-87k.pages.dev**.
- Cache estático observado na 3.3: `matchup-static-b59c5db6126b4b072f96`.

O endereço estável muda de conteúdo quando uma release é publicada. Uma URL de implantação específica identifica uma publicação, mas a aplicação nela contida continua dependendo de Auth, RPCs, políticas e dados do Supabase: não congela o backend nem constitui ambiente isolado de testes.

Instalação Safari: abrir o endereço em Safari, compartilhar e adicionar à Tela de Início. Instalação Android por APK: usar somente arquivo cuja origem e hash sejam conhecidos, em aparelho autorizado. Não atribuir validação física a um download bem-sucedido.

## 6. Como registrar a próxima release

1. Descrever mudança funcional e risco de dados, especialmente migrações e reset.
2. Informar versões, artefatos e seu conteúdo real, sem sobrescrever pacotes anteriores.
3. Registrar comando, ambiente e resultado dos testes executados; separar testes listados ou pendentes.
4. Registrar a preservação de dados em migrações, sem publicar contagens de participantes identificáveis nem credenciais.
5. Identificar publicação estável e implantação específica, quando houver.
6. Comparar os ativos HTTP com o build local e verificar a atualização do service worker.
7. Informar instalação física testada ou pendente e limitações conhecidas.
8. Atualizar o [portal](README.md), o [README principal](../README.md), os guias funcionais e o [roteiro de operação](08-operacao-privacidade-e-suporte.md).

Uma release está completa quando a evidência corresponde ao que foi de fato entregue. “Todos os testes passaram” sem inventário, ambiente e limite conhecido é uma declaração insuficiente para manutenção ou apresentação de UPX.
