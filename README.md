# Sistema BGL Advogados

Sistema interno do escritório: agenda de audiências e prazos, rotina, processos e publicações do DJEN, carteira de clientes com contratos, financeiro, metas e atendimento comercial.

## Estrutura

```
index.html                 arquivo publicado (gerado pelo build; não editar à mão)
src/
  index.html               marcação das telas, com os marcadores <!-- @css --> e <!-- @js -->
  manifesto.json           ordem em que CSS e JS entram no arquivo final
  assets/
    css/
      legacy/              estilos originais dos componentes, separados por área
      ds/                  design system: tokens, base, casca, componentes, telas,
                           login, paleta de comandos e responsivo
    js/                    scripts por domínio (dados e nuvem, painel, processos,
                           rotina, clientes, financeiro, atendimento, backup, casca…)
    img/                   logos em PNG
tools/
  build.mjs                junta src/ no index.html publicado
  separar.py               registro de como o arquivo monolítico foi separado
```

## Build

Requer Node 18 ou superior, sem dependências.

```
node tools/build.mjs          # gera ./index.html, o arquivo que vai para o ar
node tools/build.mjs --dev    # gera ./dev.html, que carrega os arquivos de src/ separados
```

O arquivo publicado precisa ser único: o backup "sistema completo" copia a própria página com os dados embutidos, e isso só funciona se CSS, JS e imagens estiverem dentro dela. Por isso o código-fonte fica em pastas e o build monta o `index.html`.

Toda alteração é feita em `src/` e seguida de `node tools/build.mjs`. Os dois arquivos vão juntos no commit.

## Design system

A marca não muda: navy, creme e prata; Playfair Display em títulos de página e números de destaque; DM Sans em toda a interface. As regras de uso estão em `src/assets/css/ds/`:

1. **Tokens** (`01-tokens.css`): cores, espaçamento em múltiplos de 4px, raios, tipografia e elevação. Valores novos entram como token antes de serem usados.
2. **Superfícies**: fundo quente quase branco, cards brancos com borda fina. Sombra fica para o que flutua (modais, paleta, menus).
3. **Cor**: reservada para estado (verde, âmbar, vermelho, azul) e para a ação principal (navy). Formato de pílula só em status; botões e filtros usam raio de 8px.
4. **Casca**: barra lateral agrupada por fluxo de trabalho (operação, carteira, comercial), cabeçalho com a tela atual, busca global e ações.
5. **Paleta de comandos** (Ctrl K ou Cmd K): busca clientes, processos, leads, telas e ações a partir de qualquer tela.
6. **Movimento**: animação contínua só na tela de login; dentro do sistema, a troca de tela é instantânea. Tudo respeita a preferência de movimento reduzido.
