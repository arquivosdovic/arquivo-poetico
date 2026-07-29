import './helpers/localstorage-shim.js';
import './helpers/dom-shim.js';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../js/db.js';
import {
    calcularReordenacaoItem,
    removerParteEItens,
    getColetaneasDeItem,
    exportarColetaneaResolvida,
} from '../js/coletaneas.js';

// ─── calcularReordenacaoItem ──────────────────────────────────────

describe('calcularReordenacaoItem (mover item pra cima/baixo dentro da mesma Parte)', () => {
    it('mover pra baixo (+1) troca de lugar com o próximo e renumera 1..n', () => {
        const itens = [
            { id: 1, parteId: 10, sequencia: 1 },
            { id: 2, parteId: 10, sequencia: 2 },
            { id: 3, parteId: 10, sequencia: 3 },
        ];
        const moveu = calcularReordenacaoItem(itens, 1, 1);
        assert.equal(moveu, true);
        const porId = Object.fromEntries(itens.map((i) => [i.id, i.sequencia]));
        assert.deepEqual(porId, { 1: 2, 2: 1, 3: 3 });
    });

    it('mover pra cima (-1) troca de lugar com o anterior', () => {
        const itens = [
            { id: 1, parteId: 10, sequencia: 1 },
            { id: 2, parteId: 10, sequencia: 2 },
            { id: 3, parteId: 10, sequencia: 3 },
        ];
        const moveu = calcularReordenacaoItem(itens, 3, -1);
        assert.equal(moveu, true);
        const porId = Object.fromEntries(itens.map((i) => [i.id, i.sequencia]));
        assert.deepEqual(porId, { 1: 1, 2: 3, 3: 2 });
    });

    it('já está no topo: mover pra cima não faz nada e avisa (retorna false)', () => {
        const itens = [
            { id: 1, parteId: 10, sequencia: 1 },
            { id: 2, parteId: 10, sequencia: 2 },
        ];
        const moveu = calcularReordenacaoItem(itens, 1, -1);
        assert.equal(moveu, false);
        assert.deepEqual(
            itens.map((i) => i.sequencia),
            [1, 2],
        ); // intocado
    });

    it('já está no fim: mover pra baixo não faz nada', () => {
        const itens = [
            { id: 1, parteId: 10, sequencia: 1 },
            { id: 2, parteId: 10, sequencia: 2 },
        ];
        const moveu = calcularReordenacaoItem(itens, 2, 1);
        assert.equal(moveu, false);
        assert.deepEqual(
            itens.map((i) => i.sequencia),
            [1, 2],
        );
    });

    it('id inexistente não quebra, só retorna false', () => {
        const itens = [{ id: 1, parteId: 10, sequencia: 1 }];
        assert.equal(calcularReordenacaoItem(itens, 999, 1), false);
    });

    it('só compete com irmãos da MESMA Parte — item de outra Parte não interfere', () => {
        const itens = [
            { id: 1, parteId: 10, sequencia: 1 },
            { id: 2, parteId: 10, sequencia: 2 },
            { id: 3, parteId: 20, sequencia: 1 }, // outra Parte, não deveria contar
        ];
        // Mover o item 2 (último da Parte 10) pra baixo não deve achar vizinho,
        // mesmo existindo um item de sequencia maior só que em outra Parte.
        const moveu = calcularReordenacaoItem(itens, 2, 1);
        assert.equal(moveu, false);
        assert.equal(
            itens.find((i) => i.id === 3).sequencia,
            1,
            'item de outra parte não é tocado',
        );
    });

    it('sequência ausente/inválida é tratada como 0 (item some pro topo do grupo)', () => {
        const itens = [
            { id: 1, parteId: 10, sequencia: null },
            { id: 2, parteId: 10, sequencia: 1 },
        ];
        // Ambos tratados: null vira 0, então o item 1 já está "antes" do item 2.
        const moveu = calcularReordenacaoItem(itens, 2, -1);
        assert.equal(moveu, true);
        const porId = Object.fromEntries(itens.map((i) => [i.id, i.sequencia]));
        assert.deepEqual(porId, { 1: 2, 2: 1 });
    });

    it('renumera TODO o grupo pra 1..n mesmo se as sequências originais tinham buracos', () => {
        const itens = [
            { id: 1, parteId: 10, sequencia: 5 },
            { id: 2, parteId: 10, sequencia: 20 },
            { id: 3, parteId: 10, sequencia: 99 },
        ];
        calcularReordenacaoItem(itens, 2, -1);
        assert.deepEqual(
            itens.map((i) => i.sequencia).sort((a, b) => a - b),
            [1, 2, 3],
        );
    });
});

// ─── removerParteEItens ───────────────────────────────────────────

describe('removerParteEItens (exclusão em cascata: Parte apagada → itens dela somem)', () => {
    it('remove a Parte e só os itens que apontam pra ela', () => {
        const partes = [{ id: 100 }, { id: 101 }];
        const itens = [
            { id: 1, parteId: 100 },
            { id: 2, parteId: 100 },
            { id: 3, parteId: 101 },
        ];
        const resultado = removerParteEItens(partes, itens, 100);
        assert.deepEqual(
            resultado.partes.map((p) => p.id),
            [101],
        );
        assert.deepEqual(
            resultado.itensColetanea.map((i) => i.id),
            [3],
        );
    });

    it('não muta os arrays originais (retorna cópias filtradas)', () => {
        const partes = [{ id: 100 }];
        const itens = [{ id: 1, parteId: 100 }];
        removerParteEItens(partes, itens, 100);
        assert.equal(partes.length, 1, 'array original de partes preservado');
        assert.equal(itens.length, 1, 'array original de itens preservado');
    });

    it('funciona mesmo se itensColetanea vier undefined (backup antigo/estado zerado)', () => {
        const partes = [{ id: 100 }];
        const resultado = removerParteEItens(partes, undefined, 100);
        assert.deepEqual(resultado.partes, []);
        assert.deepEqual(resultado.itensColetanea, []);
    });

    it('Parte inexistente: nada é removido, mas não quebra', () => {
        const partes = [{ id: 100 }];
        const itens = [{ id: 1, parteId: 100 }];
        const resultado = removerParteEItens(partes, itens, 999);
        assert.deepEqual(
            resultado.partes.map((p) => p.id),
            [100],
        );
        assert.deepEqual(
            resultado.itensColetanea.map((i) => i.id),
            [1],
        );
    });
});

// ─── getColetaneasDeItem / exportarColetaneaResolvida ─────────────
// Essas duas já eram só-leitura; testamos direto no `db` do módulo.

describe('getColetaneasDeItem (em quais Coletâneas um Poema/Prosa aparece)', () => {
    beforeEach(() => {
        db.livros = [
            { id: 1, tipo: 'Coletânea', titulo: 'Seleta 2024' },
            { id: 2, tipo: 'Livro', titulo: 'Livro normal' },
        ];
        db.partes = [{ id: 100, livroId: 1, titulo: 'Parte A' }];
        db.itensColetanea = [
            { id: 1, parteId: 100, refTipo: 'poema', refId: 50 },
            { id: 2, parteId: 100, refTipo: 'prosa', refId: 50 }, // mesmo refId, tipo diferente
        ];
    });

    it('sem refId, retorna lista vazia (item ainda não foi salvo)', () => {
        assert.deepEqual(getColetaneasDeItem('poema', null), []);
    });

    it('encontra a Coletânea e a Parte certas pro refTipo+refId pedido', () => {
        const r = getColetaneasDeItem('poema', 50);
        assert.equal(r.length, 1);
        assert.equal(r[0].coletaneaTitulo, 'Seleta 2024');
        assert.equal(r[0].parteTitulo, 'Parte A');
    });

    it('não confunde refTipo — poema e prosa com mesmo refId não se misturam', () => {
        const r = getColetaneasDeItem('prosa', 50);
        assert.equal(r.length, 1);
        assert.equal(r[0].coletaneaId, 1);
    });

    it('ignora item cuja Parte não existe mais (referência quebrada)', () => {
        db.itensColetanea.push({ id: 3, parteId: 999, refTipo: 'poema', refId: 60 });
        assert.deepEqual(getColetaneasDeItem('poema', 60), []);
    });
});

describe('exportarColetaneaResolvida (monta a Coletânea inteira com os textos resolvidos)', () => {
    beforeEach(() => {
        db.livros = [{ id: 1, tipo: 'Coletânea', titulo: 'Seleta 2024', sequencia: 1 }];
        db.partes = [{ id: 100, livroId: 1, titulo: 'Parte A', sequencia: 1 }];
        db.poemas = [{ id: 50, titulo: 'Poema Original', texto: 'texto do poema' }];
        db.itensColetanea = [
            { id: 1, parteId: 100, titulo: 'Item 1', refTipo: 'poema', refId: 50, sequencia: 1 },
            {
                id: 2,
                parteId: 100,
                titulo: 'Inédito',
                textoOverride: 'texto exclusivo',
                sequencia: 2,
            },
        ];
    });

    it('retorna null se o livroId não for uma Coletânea existente', () => {
        assert.equal(exportarColetaneaResolvida(999), null);
    });

    it('resolve item com referência: puxa o texto do poema/prosa original', () => {
        const r = exportarColetaneaResolvida(1);
        const item1 = r.partes[0].itens.find((i) => i.id === 1);
        assert.equal(item1.textoResolvido, 'texto do poema');
    });

    it('resolve item com textoOverride: usa o texto próprio, ignora qualquer referência', () => {
        const r = exportarColetaneaResolvida(1);
        const item2 = r.partes[0].itens.find((i) => i.id === 2);
        assert.equal(item2.textoResolvido, 'texto exclusivo');
    });

    it('inclui todas as Partes e itens na ordem de sequência', () => {
        const r = exportarColetaneaResolvida(1);
        assert.equal(r.partes.length, 1);
        assert.equal(r.partes[0].itens.length, 2);
    });
});
