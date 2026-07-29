import './helpers/localstorage-shim.js';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    sortLivros,
    sortPartes,
    sortSecoes,
    sortPoemas,
    sortElementos,
    calcularCascataColetanea,
} from '../js/db.js';

// ─── sortSecoes ─────────────────────────────────────────────────

describe('sortSecoes (ordenação hierárquica: Livro → Parte/Livro → própria sequência)', () => {
    it('agrupa Seções pelo Livro a que pertencem, na ordem dos Livros', () => {
        const livros = [
            { id: 1, sequencia: 1 },
            { id: 2, sequencia: 2 },
        ];
        const partes = [];
        const secoes = [
            { id: 10, paiTipo: 'livro', paiId: 2, sequencia: 1 },
            { id: 11, paiTipo: 'livro', paiId: 1, sequencia: 1 },
        ];
        sortSecoes(secoes, livros, partes);
        assert.deepEqual(
            secoes.map((s) => s.id),
            [11, 10],
        );
    });

    it('Seção ligada a uma Parte usa a sequência da Parte pra se posicionar dentro do Livro', () => {
        const livros = [{ id: 1, sequencia: 1 }];
        const partes = [
            { id: 100, livroId: 1, sequencia: 1 },
            { id: 101, livroId: 1, sequencia: 2 },
        ];
        const secoes = [
            { id: 20, paiTipo: 'parte', paiId: 101, sequencia: 1 }, // dentro da Parte 2
            { id: 21, paiTipo: 'parte', paiId: 100, sequencia: 1 }, // dentro da Parte 1
        ];
        sortSecoes(secoes, livros, partes);
        assert.deepEqual(
            secoes.map((s) => s.id),
            [21, 20],
        );
    });

    it('Seção direta no Livro usa a própria sequência (senão sempre iria pro fim)', () => {
        // Regressão do bug descrito no comentário original: uma Seção presa
        // direto ao Livro (sem Parte) não pode perder pra qualquer Parte
        // numerada só por não ter `db.partes.find(...)` retornando algo.
        const livros = [{ id: 1, sequencia: 1 }];
        const partes = [{ id: 100, livroId: 1, sequencia: 2 }];
        const secoes = [
            { id: 30, paiTipo: 'parte', paiId: 100, sequencia: 1 },
            { id: 31, paiTipo: 'livro', paiId: 1, sequencia: 1 }, // deve vir antes da Parte 2
        ];
        sortSecoes(secoes, livros, partes);
        assert.deepEqual(
            secoes.map((s) => s.id),
            [31, 30],
        );
    });

    it('sequência ausente/inválida vai pro fim do grupo (cai no sentinela 9999)', () => {
        const livros = [{ id: 1, sequencia: 1 }];
        const partes = [];
        const secoes = [
            { id: 40, paiTipo: 'livro', paiId: 1, sequencia: null },
            { id: 41, paiTipo: 'livro', paiId: 1, sequencia: 1 },
        ];
        sortSecoes(secoes, livros, partes);
        assert.deepEqual(
            secoes.map((s) => s.id),
            [41, 40],
        );
    });

    it('Parte referenciada que não existe mais não quebra a ordenação (cai no sentinela)', () => {
        const livros = [{ id: 1, sequencia: 1 }];
        const partes = []; // paiId 999 não existe em nenhuma Parte
        const secoes = [
            { id: 50, paiTipo: 'parte', paiId: 999, sequencia: 1 },
            { id: 51, paiTipo: 'livro', paiId: 1, sequencia: 1 },
        ];
        assert.doesNotThrow(() => sortSecoes(secoes, livros, partes));
    });
});

// ─── sortPoemas ─────────────────────────────────────────────────

describe('sortPoemas (ordenação hierárquica: Livro → Parte → Seção → própria sequência)', () => {
    const livros = [
        { id: 1, sequencia: 1 },
        { id: 2, sequencia: 2 },
    ];
    const partes = [
        { id: 10, livroId: 1, sequencia: 1 },
        { id: 11, livroId: 1, sequencia: 2 },
    ];
    const secoes = [
        { id: 20, paiTipo: 'parte', paiId: 10, sequencia: 1 },
        { id: 21, paiTipo: 'livro', paiId: 1, sequencia: 2 },
    ];

    it('poema direto no Livro vem antes de poema dentro de uma Parte daquele Livro', () => {
        const poemas = [
            { id: 1, paiTipo: 'parte', paiId: 10, sequencia: 1 },
            { id: 2, paiTipo: 'livro', paiId: 1, sequencia: 1 },
        ];
        sortPoemas(poemas, livros, partes, secoes);
        assert.deepEqual(
            poemas.map((p) => p.id),
            [2, 1],
        );
    });

    it('poema dentro de uma Seção herda a posição da Parte/Livro da Seção', () => {
        const poemas = [
            { id: 1, paiTipo: 'secao', paiId: 20, sequencia: 1 }, // Seção dentro da Parte 1 (livro 1)
            { id: 2, paiTipo: 'parte', paiId: 11, sequencia: 1 }, // Parte 2 (livro 1) direto
        ];
        sortPoemas(poemas, livros, partes, secoes);
        // Poema 1 está na Seção 20, que está na Parte 10 (sequencia 1) — vem antes
        // da Parte 11 (sequencia 2).
        assert.deepEqual(
            poemas.map((p) => p.id),
            [1, 2],
        );
    });

    it('poemas de Livros diferentes respeitam a ordem dos Livros, não a ordem de criação', () => {
        const poemas = [
            { id: 1, paiTipo: 'livro', paiId: 2, sequencia: 1 },
            { id: 2, paiTipo: 'livro', paiId: 1, sequencia: 1 },
        ];
        sortPoemas(poemas, livros, partes, secoes);
        assert.deepEqual(
            poemas.map((p) => p.id),
            [2, 1],
        );
    });

    it('dentro do mesmo caminho hierárquico, desempata pela própria sequência', () => {
        const poemas = [
            { id: 1, paiTipo: 'livro', paiId: 1, sequencia: 3 },
            { id: 2, paiTipo: 'livro', paiId: 1, sequencia: 1 },
            { id: 3, paiTipo: 'livro', paiId: 1, sequencia: 2 },
        ];
        sortPoemas(poemas, livros, partes, secoes);
        assert.deepEqual(
            poemas.map((p) => p.id),
            [2, 3, 1],
        );
    });

    it('vínculo quebrado (paiId de Seção/Parte inexistente) não quebra a ordenação, só empurra pro fim', () => {
        const poemas = [
            { id: 1, paiTipo: 'secao', paiId: 999, sequencia: 1 },
            { id: 2, paiTipo: 'livro', paiId: 1, sequencia: 1 },
        ];
        assert.doesNotThrow(() => sortPoemas(poemas, livros, partes, secoes));
        assert.deepEqual(
            poemas.map((p) => p.id),
            [2, 1],
        );
    });
});

// ─── sortLivros / sortPartes / sortElementos (cobertura de regressão básica) ──

describe('sortLivros', () => {
    it('ordena por sequência e desempata por id', () => {
        const livros = [
            { id: 3, sequencia: 1 },
            { id: 1, sequencia: 1 },
            { id: 2, sequencia: null },
        ];
        sortLivros(livros);
        assert.deepEqual(
            livros.map((l) => l.id),
            [1, 3, 2],
        );
    });
});

describe('sortPartes', () => {
    it('agrupa por Livro, na ordem dos Livros, depois por sequência própria', () => {
        const livros = [
            { id: 1, sequencia: 1 },
            { id: 2, sequencia: 2 },
        ];
        const partes = [
            { id: 10, livroId: 2, sequencia: 1 },
            { id: 11, livroId: 1, sequencia: 2 },
            { id: 12, livroId: 1, sequencia: 1 },
        ];
        sortPartes(partes, livros);
        assert.deepEqual(
            partes.map((p) => p.id),
            [12, 11, 10],
        );
    });
});

describe('sortElementos', () => {
    it('usa getPosicaoElemento (via db completo) pra ordenar por Livro→Parte→Seção', () => {
        const db = {
            livros: [
                { id: 1, sequencia: 2 },
                { id: 2, sequencia: 1 },
            ],
            partes: [],
            secoes: [],
        };
        const elementos = [
            { id: 1, paiTipo: 'livro', paiId: 1, sequencia: 1 },
            { id: 2, paiTipo: 'livro', paiId: 2, sequencia: 1 },
        ];
        sortElementos(elementos, db);
        assert.deepEqual(
            elementos.map((e) => e.id),
            [2, 1],
        );
    });
});

// ─── calcularCascataColetanea ─────────────────────────────────────

describe('calcularCascataColetanea (o que seria apagado junto com uma Coletânea)', () => {
    it('encontra as Partes exclusivas da Coletânea e os itens dessas Partes', () => {
        const db = {
            partes: [
                { id: 100, livroId: 1 }, // pertence à coletânea 1
                { id: 101, livroId: 1 }, // pertence à coletânea 1
                { id: 102, livroId: 2 }, // pertence a outra coletânea/livro
            ],
            itensColetanea: [
                { id: 1, parteId: 100 },
                { id: 2, parteId: 101 },
                { id: 3, parteId: 102 },
            ],
        };
        const { partesIds, itensIds } = calcularCascataColetanea(db, 1);
        assert.deepEqual(partesIds.sort(), [100, 101]);
        assert.deepEqual(itensIds.sort(), [1, 2]);
    });

    it('Coletânea sem Partes ainda retorna listas vazias, sem quebrar', () => {
        const db = { partes: [], itensColetanea: [] };
        const { partesIds, itensIds } = calcularCascataColetanea(db, 1);
        assert.deepEqual(partesIds, []);
        assert.deepEqual(itensIds, []);
    });

    it('funciona mesmo se itensColetanea estiver ausente do db (backup antigo)', () => {
        const db = { partes: [{ id: 100, livroId: 1 }] };
        const { partesIds, itensIds } = calcularCascataColetanea(db, 1);
        assert.deepEqual(partesIds, [100]);
        assert.deepEqual(itensIds, []);
    });

    it('não confunde Partes de Livros diferentes: apagar a Coletânea 1 não pega Partes da 2', () => {
        const db = {
            partes: [
                { id: 100, livroId: 1 },
                { id: 200, livroId: 2 },
            ],
            itensColetanea: [
                { id: 1, parteId: 100 },
                { id: 2, parteId: 200 },
            ],
        };
        const { partesIds, itensIds } = calcularCascataColetanea(db, 2);
        assert.deepEqual(partesIds, [200]);
        assert.deepEqual(itensIds, [2]);
    });
});
