import './helpers/localstorage-shim.js';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// colunas.js não importa nada (nem document): só usa localStorage e
// window.dispatchEvent/CustomEvent. Montamos aqui um "window" próprio
// que REGISTRA os eventos disparados (ao contrário do dom-shim.js
// genérico, cujo dispatchEvent é um no-op) — precisamos disso pra
// testar que toggleColuna/moverColuna avisam quem estiver ouvindo.
globalThis.window = {
    _eventos: [],
    dispatchEvent(e) {
        this._eventos.push(e);
    },
    addEventListener() {},
    removeEventListener() {},
};
globalThis.CustomEvent = class CustomEvent {
    constructor(type, opts) {
        this.type = type;
        Object.assign(this, opts);
    }
};

const { DEFINICAO_COLUNAS, getColunasAtivas, isColunaAtiva, toggleColuna, moverColuna } =
    await import('../js/colunas.js');

// Mesmo prefixo usado internamente em colunas.js (LS_PREFIX, não
// exportado) — duplicado aqui de propósito pra poder inspecionar e
// pré-popular o localStorage diretamente nos testes.
const LS_PREFIX = 'arquivoPoetico_colunas_';

function resetar() {
    localStorage.clear();
    window._eventos = [];
}

function salvarEstado(tabela, ordem, ativas) {
    localStorage.setItem(LS_PREFIX + tabela, JSON.stringify({ ordem, ativas }));
}

// ─── DEFINICAO_COLUNAS ───────────────────────────────────────────

describe('DEFINICAO_COLUNAS', () => {
    it('cada coluna definida tem key, label e default, e as keys não se repetem dentro da mesma tabela', () => {
        for (const [tabela, colunas] of Object.entries(DEFINICAO_COLUNAS)) {
            const keys = colunas.map((c) => c.key);
            assert.equal(new Set(keys).size, keys.length, `keys duplicadas em "${tabela}"`);
            colunas.forEach((c) => {
                assert.equal(typeof c.key, 'string');
                assert.equal(typeof c.label, 'string');
                assert.equal(typeof c.default, 'boolean');
            });
        }
    });
});

// ─── getColunasAtivas / isColunaAtiva ────────────────────────────

describe('getColunasAtivas (sem nada salvo ainda — estado padrão)', () => {
    beforeEach(resetar);

    it('tabela desconhecida retorna lista vazia, sem quebrar', () => {
        assert.deepEqual(getColunasAtivas('tabela-que-nao-existe'), []);
    });

    it(
        'sem nada no localStorage, retorna só as colunas com default:true, ' +
            'na mesma ordem em que estão definidas',
        () => {
            assert.deepEqual(getColunasAtivas('poemas'), [
                'dataEscrita',
                'dataPublicacao',
                'estrutura',
                'status',
            ]);
            assert.deepEqual(getColunasAtivas('prosas'), [
                'dataEscrita',
                'dataPublicacao',
                'vinculo',
            ]);
        },
    );
});

describe('getColunasAtivas (com estado salvo no localStorage)', () => {
    beforeEach(resetar);

    it('respeita a ordem e o subconjunto ativo salvos', () => {
        salvarEstado(
            'poemas',
            [
                'status',
                'dataEscrita',
                'dataPublicacao',
                'estrutura',
                'elos',
                'referencias',
                'etiquetas',
                'notas',
            ],
            ['dataEscrita', 'elos'],
        );
        assert.deepEqual(getColunasAtivas('poemas'), ['dataEscrita', 'elos']);
    });

    it('JSON corrompido no localStorage cai pro padrão, sem quebrar', () => {
        localStorage.setItem(LS_PREFIX + 'poemas', '{ isso não é json válido');
        assert.deepEqual(getColunasAtivas('poemas'), [
            'dataEscrita',
            'dataPublicacao',
            'estrutura',
            'status',
        ]);
    });

    it('JSON válido mas em formato inesperado (sem ordem/ativas como arrays) cai pro padrão', () => {
        localStorage.setItem(LS_PREFIX + 'poemas', JSON.stringify({ outraCoisa: true }));
        assert.deepEqual(getColunasAtivas('poemas'), [
            'dataEscrita',
            'dataPublicacao',
            'estrutura',
            'status',
        ]);
    });

    it('keys salvas que não existem mais em DEFINICAO_COLUNAS são descartadas (não quebram nem aparecem)', () => {
        salvarEstado(
            'poemas',
            ['dataEscrita', 'colunaAntigaRemovida', 'status'],
            ['dataEscrita', 'colunaAntigaRemovida'],
        );
        assert.deepEqual(getColunasAtivas('poemas'), ['dataEscrita']);
    });

    it(
        'coluna nova, adicionada a DEFINICAO_COLUNAS depois que já existia uma escolha salva, ' +
            'entra no fim da ordem e começa desligada (migração automática)',
        () => {
            salvarEstado(
                'poemas',
                [
                    'status',
                    'dataEscrita',
                    'dataPublicacao',
                    'estrutura',
                    'elos',
                    'referencias',
                    'etiquetas',
                    'notas',
                ],
                ['status'],
            );

            DEFINICAO_COLUNAS.poemas.push({ key: 'colunaNova', label: 'Nova', default: false });
            try {
                assert.deepEqual(getColunasAtivas('poemas'), ['status']); // continua só "status" ativa
                // mas a coluna nova já existe na ordem interna — confirmamos
                // ativando-a e checando se aparece no fim
                toggleColuna('poemas', 'colunaNova', true);
                const ativas = getColunasAtivas('poemas');
                assert.equal(ativas[ativas.length - 1], 'colunaNova');
            } finally {
                DEFINICAO_COLUNAS.poemas.pop(); // desfaz a mutação pra não vazar pros outros testes
            }
        },
    );
});

describe('isColunaAtiva', () => {
    beforeEach(resetar);

    it('true pra coluna ativa, false pra inativa ou inexistente', () => {
        assert.equal(isColunaAtiva('poemas', 'status'), true); // default: true
        assert.equal(isColunaAtiva('poemas', 'elos'), false); // default: false
        assert.equal(isColunaAtiva('poemas', 'coluna-fantasma'), false);
    });
});

// ─── toggleColuna ─────────────────────────────────────────────────

describe('toggleColuna', () => {
    beforeEach(resetar);

    it('liga uma coluna desligada — ela passa a aparecer em getColunasAtivas', () => {
        assert.equal(isColunaAtiva('poemas', 'elos'), false);
        toggleColuna('poemas', 'elos', true);
        assert.equal(isColunaAtiva('poemas', 'elos'), true);
    });

    it('desliga uma coluna ligada — ela some de getColunasAtivas', () => {
        assert.equal(isColunaAtiva('poemas', 'status'), true);
        toggleColuna('poemas', 'status', false);
        assert.equal(isColunaAtiva('poemas', 'status'), false);
    });

    it('ligar uma coluna respeita a ordem de definição, não vai pro fim da lista', () => {
        toggleColuna('poemas', 'elos', true); // "elos" vem depois de "status" na ordem padrão
        assert.deepEqual(getColunasAtivas('poemas'), [
            'dataEscrita',
            'dataPublicacao',
            'estrutura',
            'status',
            'elos',
        ]);
    });

    it('persiste a mudança — uma nova leitura (nova chamada) reflete o estado salvo', () => {
        toggleColuna('poemas', 'elos', true);
        // getColunasAtivas relê do localStorage a cada chamada; simula reabrir a página
        assert.equal(isColunaAtiva('poemas', 'elos'), true);
    });

    it('tabela desconhecida não quebra e não altera nada', () => {
        assert.doesNotThrow(() => toggleColuna('tabela-fantasma', 'x', true));
        assert.equal(localStorage.getItem(LS_PREFIX + 'tabela-fantasma'), null);
    });

    it('dispara o evento "colunas:alteradas" com a tabela certa no detail', () => {
        toggleColuna('prosas', 'etiquetas', true);
        assert.equal(window._eventos.length, 1);
        assert.equal(window._eventos[0].type, 'colunas:alteradas');
        assert.equal(window._eventos[0].detail.tabela, 'prosas');
    });

    it('tabela desconhecida NÃO dispara evento (retorna antes de chegar lá)', () => {
        toggleColuna('tabela-fantasma', 'x', true);
        assert.equal(window._eventos.length, 0);
    });
});

// ─── moverColuna ────────────────────────────────────────────────

describe('moverColuna', () => {
    beforeEach(resetar);

    it('"up" troca de posição com o vizinho anterior', () => {
        // ordem padrão: dataEscrita, dataPublicacao, estrutura, status, elos, referencias, etiquetas, notas
        moverColuna('poemas', 'estrutura', 'up');
        const estado = JSON.parse(localStorage.getItem(LS_PREFIX + 'poemas'));
        assert.deepEqual(estado.ordem.slice(0, 3), ['dataEscrita', 'estrutura', 'dataPublicacao']);
    });

    it('"down" troca de posição com o vizinho seguinte', () => {
        moverColuna('poemas', 'dataEscrita', 'down');
        const estado = JSON.parse(localStorage.getItem(LS_PREFIX + 'poemas'));
        assert.deepEqual(estado.ordem.slice(0, 2), ['dataPublicacao', 'dataEscrita']);
    });

    it('mover a primeira coluna pra "up" não faz nada (já está no topo)', () => {
        moverColuna('poemas', 'dataEscrita', 'up');
        const estado = JSON.parse(localStorage.getItem(LS_PREFIX + 'poemas'));
        assert.equal(estado, null, 'nem chega a salvar, porque a posição-alvo é inválida');
    });

    it('mover a última coluna pra "down" não faz nada (já está no fim)', () => {
        moverColuna('poemas', 'notas', 'down');
        assert.equal(localStorage.getItem(LS_PREFIX + 'poemas'), null);
    });

    it('key inexistente não quebra e não salva nada', () => {
        assert.doesNotThrow(() => moverColuna('poemas', 'coluna-fantasma', 'up'));
        assert.equal(localStorage.getItem(LS_PREFIX + 'poemas'), null);
    });

    it('tabela desconhecida não quebra', () => {
        assert.doesNotThrow(() => moverColuna('tabela-fantasma', 'x', 'up'));
    });

    it('mexe só na ORDEM, não na lista de ativas — coluna continua no mesmo estado ligado/desligado', () => {
        assert.equal(isColunaAtiva('poemas', 'elos'), false);
        moverColuna('poemas', 'elos', 'up');
        assert.equal(isColunaAtiva('poemas', 'elos'), false, 'mover não liga a coluna');
        assert.equal(isColunaAtiva('poemas', 'status'), true, 'nem desliga as outras');
    });

    it('dispara o evento "colunas:alteradas" quando o movimento é válido', () => {
        moverColuna('poemas', 'estrutura', 'up');
        assert.equal(window._eventos.length, 1);
        assert.equal(window._eventos[0].detail.tabela, 'poemas');
    });

    it('NÃO dispara evento quando o movimento é inválido (limite, key/tabela inexistente)', () => {
        moverColuna('poemas', 'dataEscrita', 'up'); // já está no topo
        moverColuna('poemas', 'coluna-fantasma', 'up');
        moverColuna('tabela-fantasma', 'x', 'up');
        assert.equal(window._eventos.length, 0);
    });
});
