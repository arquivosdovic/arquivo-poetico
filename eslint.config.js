import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

// Config flat (formato padrão a partir do ESLint 9). Dois blocos porque o
// projeto tem dois ambientes bem diferentes:
//   - js/**        → roda no navegador (window, document, localStorage...),
//                     carregado via <script type="module"> sem bundler
//   - tests/**      → roda em Node (node:test), com shims próprios que
//                     simulam localStorage/DOM (ver tests/helpers/)
export default [
    js.configs.recommended,

    // ─── Código de produção (navegador) ──────────────────────────
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                // Carregado via <script src="..."> global em index.html/filtrar.html,
                // antes dos módulos ES — não é importado, então o ESLint não
                // consegue inferir sozinho (ver js/estatisticas.js).
                Chart: 'readonly',
            },
        },
        rules: {
            // window.NOME = função é o padrão usado pra expor handlers que o
            // HTML chama via onclick="..." (ver main.js) — não é var não-usada.
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-console': 'off', // console.error/warn são usados de propósito em catch de storage
            eqeqeq: 'off', // o projeto usa == de propósito ao comparar ids (string vs number vindos de dataset/form)
            // U+3000 (espaço ideográfico) é usado de propósito em render-estrutura.js
            // e ui.js pra indentar visualmente item-filho dentro de <option> de <select>
            // (não dá pra usar CSS ali). Os dois usos ficam dentro de template
            // literals, então skipTemplates cobre exatamente esse caso.
            'no-irregular-whitespace': ['error', { skipTemplates: true }],
        },
    },

    // ─── Testes (Node) ────────────────────────────────────────────
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
                // Os testes shimam um "window"/"document" mínimo (globalThis.window
                // = {...}) pra rodar código de produção escrito pro navegador — ver
                // tests/helpers/dom-shim.js (shim de mentira, só pra permitir
                // importar módulos) e tests/helpers/dom-real.js (DOM de verdade via
                // happy-dom, usado só pelos testes de renderização/interação).
                window: 'writable',
                document: 'writable',
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },

    // ─── Scripts utilitários soltos (ex.: scripts/normalizar-datas.js) ───
    {
        files: ['scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
    },

    // Desliga regras de estilo que conflitam com o Prettier — sempre por
    // último, pra sobrepor qualquer coisa estilística vinda do recommended.
    eslintConfigPrettier,

    {
        ignores: [
            'node_modules/**',
            'data/**', // dados pessoais do acervo, fora do lint
            'assets/js/**', // bibliotecas de terceiros vendorizadas (chart.js, purify.js minificados)
            'assets/**/*.svg',
        ],
    },
];
