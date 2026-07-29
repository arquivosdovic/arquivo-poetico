import './helpers/localstorage-shim.js';
import './helpers/dom-shim.js';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../js/db.js';
import { dataEstaNoIntervalo, correspondeFiltro, gerarExportacaoSeletiva } from '../js/exportar.js';

function resetarDb() {
    db.livros = [];
    db.partes = [];
    db.secoes = [];
    db.poemas = [];
    db.prosas = [];
    db.elementos = [];
    db.coletaneas = [];
    db.itensColetanea = [];
}

// ─── dataEstaNoIntervalo ────────────────────────────────────────
// Nota: existe uma função parecida em js/utils.js (itemBateFiltroData,
// testada em tests/utils.test.js) que trata precisão mista de forma
// DIFERENTE — lá, um item só-com-ano bate num filtro de um mês
// específico do mesmo ano; aqui em exportar.js, não bate (ver teste
// abaixo). Deixo isso documentado nos testes porque as duas funções
// tratam a mesma situação de formas diferentes — vale confirmar com
// quem mantém o projeto se é intencional ou uma divergência a unificar.

describe('dataEstaNoIntervalo (filtro de exportação seletiva por período)', () => {
    it('sem filtro de data (De e Até nulos), qualquer item passa — mesmo sem data', () => {
        assert.equal(dataEstaNoIntervalo({ ano: 2023 }, null, null), true);
        assert.equal(dataEstaNoIntervalo(null, null, null), true);
    });

    it('com filtro ativo, item sem nenhuma data cadastrada não passa', () => {
        assert.equal(dataEstaNoIntervalo(null, { ano: 2020 }, null), false);
    });

    it('filtro só por ano (De/Até): item com apenas o ano é comparado diretamente', () => {
        assert.equal(dataEstaNoIntervalo({ ano: 2022 }, { ano: 2020 }, { ano: 2024 }), true);
        assert.equal(dataEstaNoIntervalo({ ano: 2025 }, { ano: 2020 }, { ano: 2024 }), false);
    });

    it('faixa aberta de um lado só (De sem Até, ou Até sem De)', () => {
        assert.equal(dataEstaNoIntervalo({ ano: 2025 }, { ano: 2020 }, null), true);
        assert.equal(dataEstaNoIntervalo({ ano: 2015 }, { ano: 2020 }, null), false);
        assert.equal(dataEstaNoIntervalo({ ano: 2019 }, null, { ano: 2020 }), true);
    });

    it('item com data completa (dia/mês/ano) dentro de um filtro de mês exato bate', () => {
        const de = { ano: 2023, mes: 3 },
            ate = { ano: 2023, mes: 3 };
        assert.equal(dataEstaNoIntervalo({ dia: 15, mes: 3, ano: 2023 }, de, ate), true);
        assert.equal(dataEstaNoIntervalo({ dia: 15, mes: 4, ano: 2023 }, de, ate), false);
    });

    it(
        'item com só o ano NÃO bate num filtro restrito a um mês específico daquele ano ' +
            '(comportamento atual — diferente do itemBateFiltroData de utils.js)',
        () => {
            const de = { ano: 2023, mes: 3 },
                ate = { ano: 2023, mes: 3 };
            assert.equal(dataEstaNoIntervalo({ ano: 2023 }, de, ate), false);
        },
    );

    it('item com ano no meio de uma faixa mês-a-mês que atravessa anos diferentes bate', () => {
        // Filtro: dez/2022 até jan/2024. Item só com "2023" cai estritamente no meio.
        const r = dataEstaNoIntervalo({ ano: 2023 }, { ano: 2022, mes: 12 }, { ano: 2024, mes: 1 });
        assert.equal(r, true);
    });

    it(
        'item com mês+ano (sem dia) não bate num filtro restrito a dias específicos ' +
            'daquele mesmo mês — não dá pra confirmar que o dia bate',
        () => {
            const de = { ano: 2023, mes: 3, dia: 10 },
                ate = { ano: 2023, mes: 3, dia: 20 };
            assert.equal(dataEstaNoIntervalo({ mes: 3, ano: 2023 }, de, ate), false);
        },
    );

    it('filtro de mês completo (dia 1 até o último dia do mês): item com só mês+ano bate', () => {
        const de = { ano: 2023, mes: 3, dia: 1 },
            ate = { ano: 2023, mes: 3, dia: 31 };
        assert.equal(dataEstaNoIntervalo({ mes: 3, ano: 2023 }, de, ate), true);
    });
});

// ─── correspondeFiltro ──────────────────────────────────────────

describe('correspondeFiltro (filtro combinado: livro, pessoa, tema, data, status)', () => {
    beforeEach(() => {
        resetarDb();
        db.livros = [
            { id: 1, titulo: 'Livro A' },
            { id: 2, titulo: 'Livro B' },
        ];
    });

    const opcoesBase = () => ({
        tipos: ['poema'],
        pessoasIncluir: [],
        temasIncluir: [],
        temasExcluir: [],
        dataDe: null,
        dataAte: null,
        status: 'todos',
        livrosIncluir: [],
        coletaneasIncluir: [],
    });

    it('sem nenhum filtro ativo, qualquer item passa', () => {
        const item = { paiTipo: 'livro', paiId: 1 };
        assert.equal(correspondeFiltro(item, opcoesBase()), true);
    });

    it('filtro por Livro: só passa quem pertence a um dos livros marcados', () => {
        const opcoes = { ...opcoesBase(), livrosIncluir: ['1'] };
        assert.equal(correspondeFiltro({ paiTipo: 'livro', paiId: 1 }, opcoes), true);
        assert.equal(correspondeFiltro({ paiTipo: 'livro', paiId: 2 }, opcoes), false);
    });

    it('filtro por pessoa: basta UMA das pessoas marcadas bater', () => {
        const opcoes = { ...opcoesBase(), pessoasIncluir: ['dalton', 'dani'] };
        assert.equal(correspondeFiltro({ pessoas: 'Dalton' }, opcoes), true);
        assert.equal(correspondeFiltro({ pessoas: 'Sarinha' }, opcoes), false);
    });

    it('tema a incluir E tema a excluir ao mesmo tempo: exclusão vence', () => {
        const opcoes = { ...opcoesBase(), temasIncluir: ['mar'], temasExcluir: ['rascunho'] };
        assert.equal(correspondeFiltro({ sinalizacoes: 'mar' }, opcoes), true);
        assert.equal(correspondeFiltro({ sinalizacoes: 'mar, rascunho' }, opcoes), false);
    });

    it('status "publicados" exclui rascunhos, e vice-versa', () => {
        const publicados = { ...opcoesBase(), status: 'publicados' };
        const rascunhos = { ...opcoesBase(), status: 'rascunhos' };
        assert.equal(correspondeFiltro({ publicado: true }, publicados), true);
        assert.equal(correspondeFiltro({ publicado: false }, publicados), false);
        assert.equal(correspondeFiltro({ publicado: false }, rascunhos), true);
        assert.equal(correspondeFiltro({ publicado: true }, rascunhos), false);
    });

    it('combina filtro de livro + data: os dois precisam bater', () => {
        const opcoes = {
            ...opcoesBase(),
            livrosIncluir: ['1'],
            dataDe: { ano: 2023 },
            dataAte: { ano: 2023 },
        };
        assert.equal(
            correspondeFiltro({ paiTipo: 'livro', paiId: 1, dataEscrita: { ano: 2023 } }, opcoes),
            true,
        );
        assert.equal(
            correspondeFiltro({ paiTipo: 'livro', paiId: 2, dataEscrita: { ano: 2023 } }, opcoes),
            false,
            'livro errado',
        );
        assert.equal(
            correspondeFiltro({ paiTipo: 'livro', paiId: 1, dataEscrita: { ano: 2020 } }, opcoes),
            false,
            'ano errado',
        );
    });
});

// ─── gerarExportacaoSeletiva ────────────────────────────────────

describe('gerarExportacaoSeletiva (monta o payload final: itens + coletâneas)', () => {
    beforeEach(() => {
        resetarDb();
        db.livros = [{ id: 1, titulo: 'Livro A' }];
        db.poemas = [
            { id: 10, titulo: 'Poema 1', paiTipo: 'livro', paiId: 1, sinalizacoes: 'mar' },
            { id: 11, titulo: 'Poema 2', paiTipo: 'livro', paiId: 1, sinalizacoes: 'terra' },
        ];
        db.prosas = [{ id: 20, titulo: 'Prosa 1', paiTipo: 'livro', paiId: 1 }];
    });

    const opcoesBase = () => ({
        tipos: ['poema'],
        pessoasIncluir: [],
        temasIncluir: [],
        temasExcluir: [],
        dataDe: null,
        dataAte: null,
        status: 'todos',
        livrosIncluir: [],
        coletaneasIncluir: [],
    });

    it('respeita os `tipos` marcados — só poema, ou só prosa, ou os dois', () => {
        assert.equal(gerarExportacaoSeletiva(opcoesBase()).itens.length, 2);
        assert.equal(
            gerarExportacaoSeletiva({ ...opcoesBase(), tipos: ['prosa'] }).itens.length,
            1,
        );
        assert.equal(
            gerarExportacaoSeletiva({ ...opcoesBase(), tipos: ['poema', 'prosa'] }).itens.length,
            3,
        );
        assert.equal(gerarExportacaoSeletiva({ ...opcoesBase(), tipos: [] }).itens.length, 0);
    });

    it('cada registro sai com `tipo` e `contexto` (Livro/Parte/Seção) resolvidos', () => {
        const { itens } = gerarExportacaoSeletiva(opcoesBase());
        const poema1 = itens.find((i) => i.id === 10);
        assert.equal(poema1.tipo, 'poema');
        assert.equal(poema1.contexto.livro, 'Livro A');
    });

    it('filtro de tema aplicado dentro da exportação', () => {
        const { itens } = gerarExportacaoSeletiva({ ...opcoesBase(), temasIncluir: ['mar'] });
        assert.deepEqual(
            itens.map((i) => i.id),
            [10],
        );
    });

    it('Coletâneas marcadas entram inteiras, sem passar pelos filtros de tema/data', () => {
        db.livros.push({ id: 2, tipo: 'Coletânea', titulo: 'Seleta', sequencia: 1 });
        db.partes = [{ id: 100, livroId: 2, titulo: 'Parte A', sequencia: 1 }];
        db.itensColetanea = [
            { id: 1, parteId: 100, titulo: 'Item', textoOverride: 'texto', sequencia: 1 },
        ];

        const opcoes = {
            ...opcoesBase(),
            temasIncluir: ['tema-que-ninguem-tem'],
            coletaneasIncluir: ['2'],
        };
        const { itens, coletaneas } = gerarExportacaoSeletiva(opcoes);
        assert.equal(itens.length, 0, 'filtro de tema ainda restringe os poemas/prosas normais');
        assert.equal(
            coletaneas.length,
            1,
            'coletânea marcada entra mesmo sem bater no filtro de tema',
        );
        assert.equal(coletaneas[0].titulo, 'Seleta');
    });

    it('coletaneaId inexistente é ignorado silenciosamente (sem quebrar)', () => {
        const { coletaneas } = gerarExportacaoSeletiva({
            ...opcoesBase(),
            coletaneasIncluir: ['999'],
        });
        assert.deepEqual(coletaneas, []);
    });
});
