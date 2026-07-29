import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildNesting,
    buildNestingLivro,
    getSecoes,
    flattenLivroAninhado,
    pareceLivroAninhado,
} from '../js/nesting.js';

function dbVazio() {
    return { livros: [], partes: [], secoes: [], poemas: [], prosas: [], elementos: [] };
}

// ─── buildNesting ────────────────────────────────────────────────

describe('buildNesting (monta a árvore Livro → Parte/Seção → Poema/Prosa)', () => {
    it('acervo vazio retorna estrutura íntegra, sem quebrar', () => {
        const r = buildNesting(dbVazio());
        assert.equal(r.export_format, 'deep_nesting');
        assert.deepEqual(r.data, []);
        assert.deepEqual(r.avulsos, { poemas: [], prosas: [] });
    });

    it('resolve conteúdo direto de um livro: elementos, poemas e prosas', () => {
        const db = dbVazio();
        db.livros = [{ id: 1, titulo: 'Livro A' }];
        db.elementos = [{ id: 5, paiId: 1, paiTipo: 'livro' }];
        db.poemas = [{ id: 10, paiId: 1, paiTipo: 'livro' }];
        db.prosas = [{ id: 20, paiId: 1, paiTipo: 'livro' }];

        const [livro] = buildNesting(db).data;
        assert.equal(livro.conteudo_elementos.length, 1);
        assert.equal(livro.conteudo_poemas_diretos.length, 1);
        assert.equal(livro.conteudo_prosas_diretas.length, 1);
        assert.equal(livro.conteudo_poemas_diretos[0].id, 10);
    });

    it('resolve conteúdo de uma Parte (elementos, poemas, prosas, seções)', () => {
        const db = dbVazio();
        db.livros = [{ id: 1, titulo: 'Livro A' }];
        db.partes = [{ id: 100, livroId: 1, titulo: 'Parte I' }];
        db.elementos = [{ id: 5, paiId: 100, paiTipo: 'parte' }];
        db.poemas = [{ id: 10, paiId: 100, paiTipo: 'parte' }];
        db.prosas = [{ id: 20, paiId: 100, paiTipo: 'parte' }];
        db.secoes = [{ id: 200, paiId: 100, paiTipo: 'parte', titulo: 'Seção X' }];

        const [livro] = buildNesting(db).data;
        assert.equal(livro.conteudo_partes.length, 1);
        const [parte] = livro.conteudo_partes;
        assert.equal(parte.conteudo_elementos.length, 1);
        assert.equal(parte.conteudo_poemas_diretos.length, 1);
        assert.equal(parte.conteudo_prosas_diretas.length, 1);
        assert.equal(parte.conteudo_secoes.length, 1);
        assert.equal(parte.conteudo_secoes[0].titulo, 'Seção X');
    });

    it('resolve seções presas direto no livro (sem passar por Parte)', () => {
        const db = dbVazio();
        db.livros = [{ id: 1, titulo: 'Livro A' }];
        db.secoes = [{ id: 200, paiId: 1, paiTipo: 'livro' }];

        const [livro] = buildNesting(db).data;
        assert.equal(livro.conteudo_secoes_diretas.length, 1);
    });

    it('partes de OUTRO livro não vazam pra dentro deste', () => {
        const db = dbVazio();
        db.livros = [
            { id: 1, titulo: 'Livro A' },
            { id: 2, titulo: 'Livro B' },
        ];
        db.partes = [
            { id: 100, livroId: 1 },
            { id: 101, livroId: 2 },
        ];

        const [livroA, livroB] = buildNesting(db).data;
        assert.deepEqual(
            livroA.conteudo_partes.map((p) => p.id),
            [100],
        );
        assert.deepEqual(
            livroB.conteudo_partes.map((p) => p.id),
            [101],
        );
    });

    it(
        'poemas/prosas sem paiTipo/paiId (avulsos) não entram em nenhum livro, ' +
            'e aparecem à parte em `avulsos`',
        () => {
            const db = dbVazio();
            db.livros = [{ id: 1, titulo: 'Livro A' }];
            db.poemas = [
                { id: 10, paiTipo: 'livro', paiId: 1 },
                { id: 11, paiTipo: null, paiId: null },
                { id: 12 }, // sem os campos nem definidos
            ];
            db.prosas = [{ id: 20, paiTipo: undefined, paiId: undefined }];

            const r = buildNesting(db);
            assert.equal(r.data[0].conteudo_poemas_diretos.length, 1);
            assert.deepEqual(
                r.avulsos.poemas.map((p) => p.id),
                [11, 12],
            );
            assert.deepEqual(
                r.avulsos.prosas.map((p) => p.id),
                [20],
            );
        },
    );

    it('não quebra quando os arrays opcionais (elementos, prosas) estão ausentes do db', () => {
        const db = { livros: [{ id: 1, titulo: 'Livro A' }], partes: [], secoes: [], poemas: [] };
        assert.doesNotThrow(() => buildNesting(db));
    });

    it('campos originais do livro (título, sinopse etc.) são preservados na árvore', () => {
        const db = dbVazio();
        db.livros = [{ id: 1, titulo: 'Livro A', sinopse: 'uma sinopse' }];
        const [livro] = buildNesting(db).data;
        assert.equal(livro.titulo, 'Livro A');
        assert.equal(livro.sinopse, 'uma sinopse');
    });
});

// ─── buildNestingLivro ───────────────────────────────────────────

describe('buildNestingLivro (mesma árvore, recortada pra um único livro)', () => {
    it('devolve só o livro pedido, com o conteúdo já aninhado', () => {
        const db = dbVazio();
        db.livros = [
            { id: 1, titulo: 'Livro A' },
            { id: 2, titulo: 'Livro B' },
        ];
        db.poemas = [{ id: 10, paiId: 2, paiTipo: 'livro' }];

        const livro = buildNestingLivro(db, 2);
        assert.equal(livro.titulo, 'Livro B');
        assert.equal(livro.conteudo_poemas_diretos.length, 1);
    });

    it('livroId inexistente retorna null, sem quebrar', () => {
        const db = dbVazio();
        db.livros = [{ id: 1, titulo: 'Livro A' }];
        assert.equal(buildNestingLivro(db, 999), null);
    });

    it('compara livroId por String — funciona tanto passando número quanto string', () => {
        const db = dbVazio();
        db.livros = [{ id: 1, titulo: 'Livro A' }];
        assert.equal(buildNestingLivro(db, 1).titulo, 'Livro A');
        assert.equal(buildNestingLivro(db, '1').titulo, 'Livro A');
    });
});

// ─── getSecoes ───────────────────────────────────────────────────

describe('getSecoes (resolve seções de um pai — livro ou parte — com seu conteúdo)', () => {
    it('filtra seções pelo paiId E paiTipo combinados (não só paiId)', () => {
        const db = dbVazio();
        db.secoes = [
            { id: 200, paiId: 1, paiTipo: 'livro' },
            { id: 201, paiId: 1, paiTipo: 'parte' }, // mesmo paiId, tipo diferente
        ];
        assert.deepEqual(
            getSecoes(1, 'livro', db).map((s) => s.id),
            [200],
        );
        assert.deepEqual(
            getSecoes(1, 'parte', db).map((s) => s.id),
            [201],
        );
    });

    it('resolve elementos, poemas e prosas de dentro da seção', () => {
        const db = dbVazio();
        db.secoes = [{ id: 200, paiId: 1, paiTipo: 'livro' }];
        db.elementos = [{ id: 5, paiId: 200, paiTipo: 'secao' }];
        db.poemas = [{ id: 10, paiId: 200, paiTipo: 'secao' }];
        db.prosas = [{ id: 20, paiId: 200, paiTipo: 'secao' }];

        const [secao] = getSecoes(1, 'livro', db);
        assert.equal(secao.conteudo_elementos.length, 1);
        assert.equal(secao.conteudo_poemas.length, 1);
        assert.equal(secao.conteudo_prosas.length, 1);
    });

    it('nenhuma seção correspondente retorna lista vazia', () => {
        assert.deepEqual(getSecoes(999, 'livro', dbVazio()), []);
    });
});

// ─── pareceLivroAninhado ─────────────────────────────────────────

describe('pareceLivroAninhado (detecta se um objeto é um Livro já aninhado)', () => {
    it('reconhece objeto com qualquer uma das chaves de conteúdo aninhado', () => {
        assert.equal(pareceLivroAninhado({ conteudo_partes: [] }), true);
        assert.equal(pareceLivroAninhado({ conteudo_poemas_diretos: [] }), true);
        assert.equal(pareceLivroAninhado({ conteudo_secoes_diretas: [] }), true);
    });

    it('rejeita null/undefined e objetos comuns sem essas chaves', () => {
        assert.equal(pareceLivroAninhado(null), false);
        assert.equal(pareceLivroAninhado(undefined), false);
        assert.equal(pareceLivroAninhado({ id: 1, titulo: 'Livro A' }), false);
    });

    it('reconhece um livro de verdade gerado por buildNesting', () => {
        const db = dbVazio();
        db.livros = [{ id: 1, titulo: 'Livro A' }];
        const [livro] = buildNesting(db).data;
        assert.equal(pareceLivroAninhado(livro), true);
    });
});

// ─── flattenLivroAninhado ────────────────────────────────────────

describe('flattenLivroAninhado (desmonta a árvore de volta pra lista plana, com contexto)', () => {
    it('poema/prosa direto do livro ganha contexto {livro, parte: null, secao: null}', () => {
        const livro = {
            titulo: 'Livro A',
            conteudo_poemas_diretos: [{ id: 10 }],
            conteudo_prosas_diretas: [{ id: 20 }],
        };
        const poemas = [],
            prosas = [];
        flattenLivroAninhado(livro, poemas, prosas);

        assert.deepEqual(poemas[0].contexto, { livro: 'Livro A', parte: null, secao: null });
        assert.deepEqual(prosas[0].contexto, { livro: 'Livro A', parte: null, secao: null });
    });

    it('poema dentro de uma seção direta do livro ganha contexto com `secao` preenchido e `parte` nulo', () => {
        const livro = {
            titulo: 'Livro A',
            conteudo_secoes_diretas: [{ titulo: 'Seção X', conteudo_poemas: [{ id: 10 }] }],
        };
        const poemas = [];
        flattenLivroAninhado(livro, poemas, []);
        assert.deepEqual(poemas[0].contexto, { livro: 'Livro A', parte: null, secao: 'Seção X' });
    });

    it('poema direto de uma Parte ganha contexto com `parte` preenchido e `secao` nulo', () => {
        const livro = {
            titulo: 'Livro A',
            conteudo_partes: [{ titulo: 'Parte I', conteudo_poemas_diretos: [{ id: 10 }] }],
        };
        const poemas = [];
        flattenLivroAninhado(livro, poemas, []);
        assert.deepEqual(poemas[0].contexto, { livro: 'Livro A', parte: 'Parte I', secao: null });
    });

    it('poema dentro de uma seção dentro de uma Parte ganha os três níveis de contexto', () => {
        const livro = {
            titulo: 'Livro A',
            conteudo_partes: [
                {
                    titulo: 'Parte I',
                    conteudo_secoes: [{ titulo: 'Seção X', conteudo_poemas: [{ id: 10 }] }],
                },
            ],
        };
        const poemas = [];
        flattenLivroAninhado(livro, poemas, []);
        assert.deepEqual(poemas[0].contexto, {
            livro: 'Livro A',
            parte: 'Parte I',
            secao: 'Seção X',
        });
    });

    it('nome do livro no contexto prioriza siglaOficial > siglaPessoal > titulo', () => {
        const comSigla = {
            siglaOficial: 'LA',
            titulo: 'Livro A',
            conteudo_poemas_diretos: [{ id: 1 }],
        };
        let poemas = [];
        flattenLivroAninhado(comSigla, poemas, []);
        assert.equal(poemas[0].contexto.livro, 'LA');

        const comSiglaPessoal = {
            siglaPessoal: 'lvA',
            titulo: 'Livro A',
            conteudo_poemas_diretos: [{ id: 1 }],
        };
        poemas = [];
        flattenLivroAninhado(comSiglaPessoal, poemas, []);
        assert.equal(poemas[0].contexto.livro, 'lvA');

        const semSigla = { titulo: 'Livro A', conteudo_poemas_diretos: [{ id: 1 }] };
        poemas = [];
        flattenLivroAninhado(semSigla, poemas, []);
        assert.equal(poemas[0].contexto.livro, 'Livro A');
    });

    it('parte/seção sem título vira `null` no contexto (não string vazia)', () => {
        const livro = {
            titulo: 'Livro A',
            conteudo_partes: [{ conteudo_poemas_diretos: [{ id: 10 }] }],
        };
        const poemas = [];
        flattenLivroAninhado(livro, poemas, []);
        assert.equal(poemas[0].contexto.parte, null);
    });

    it('livro sem nenhuma chave de conteúdo (todas ausentes) não quebra e não adiciona nada', () => {
        const poemas = [],
            prosas = [];
        assert.doesNotThrow(() => flattenLivroAninhado({ titulo: 'Livro A' }, poemas, prosas));
        assert.deepEqual(poemas, []);
        assert.deepEqual(prosas, []);
    });

    it('preserva os campos originais do item (não só o id) ao lado do contexto', () => {
        const livro = {
            titulo: 'Livro A',
            conteudo_poemas_diretos: [{ id: 10, texto: 'um poema qualquer', ano: 2023 }],
        };
        const poemas = [];
        flattenLivroAninhado(livro, poemas, []);
        assert.equal(poemas[0].texto, 'um poema qualquer');
        assert.equal(poemas[0].ano, 2023);
    });

    it('acumula em arrays já existentes (não reinicia a lista a cada chamada)', () => {
        const livro1 = { titulo: 'Livro A', conteudo_poemas_diretos: [{ id: 10 }] };
        const livro2 = { titulo: 'Livro B', conteudo_poemas_diretos: [{ id: 11 }] };
        const poemas = [];
        flattenLivroAninhado(livro1, poemas, []);
        flattenLivroAninhado(livro2, poemas, []);
        assert.deepEqual(
            poemas.map((p) => p.id),
            [10, 11],
        );
    });
});

// ─── Ida e volta: buildNesting → flattenLivroAninhado ────────────
// buildNesting monta a árvore e flattenLivroAninhado desmonta de volta;
// são inversas uma da outra (é o mesmo par usado por exportarTudoAninhado
// e por filtrar.html ao carregar um JSON aninhado). Este teste garante
// que o contrato de nomes de campo entre as duas pontas continua batendo.

describe('buildNesting + flattenLivroAninhado (ida e volta preserva os itens e o contexto)', () => {
    it('reconstrói corretamente uma estrutura com livro, parte, seção e avulsos misturados', () => {
        const db = dbVazio();
        db.livros = [{ id: 1, titulo: 'Livro A', siglaOficial: 'LA' }];
        db.partes = [{ id: 100, livroId: 1, titulo: 'Parte I' }];
        db.secoes = [
            { id: 200, paiId: 1, paiTipo: 'livro', titulo: 'Seção Direta' },
            { id: 201, paiId: 100, paiTipo: 'parte', titulo: 'Seção Da Parte' },
        ];
        db.poemas = [
            { id: 10, paiId: 1, paiTipo: 'livro' }, // direto do livro
            { id: 11, paiId: 200, paiTipo: 'secao' }, // dentro da seção direta
            { id: 12, paiId: 100, paiTipo: 'parte' }, // direto da parte
            { id: 13, paiId: 201, paiTipo: 'secao' }, // dentro da seção da parte
        ];

        const livroAninhado = buildNestingLivro(db, 1);
        assert.equal(pareceLivroAninhado(livroAninhado), true);

        const poemas = [],
            prosas = [];
        flattenLivroAninhado(livroAninhado, poemas, prosas);

        const porId = Object.fromEntries(poemas.map((p) => [p.id, p.contexto]));
        assert.deepEqual(porId[10], { livro: 'LA', parte: null, secao: null });
        assert.deepEqual(porId[11], { livro: 'LA', parte: null, secao: 'Seção Direta' });
        assert.deepEqual(porId[12], { livro: 'LA', parte: 'Parte I', secao: null });
        assert.deepEqual(porId[13], { livro: 'LA', parte: 'Parte I', secao: 'Seção Da Parte' });
        assert.equal(poemas.length, 4);
    });
});
