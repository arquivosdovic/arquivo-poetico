import './helpers/localstorage-shim.js';
import './helpers/dom-shim.js';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../js/db.js';
import {
    contarPorAno,
    contarPorLivro,
    contarPorTema,
    contarPorPessoa,
    palavrasMaisFrequentes,
    resumoGeral,
    filtrarPorIntervalo,
} from '../js/estatisticas.js';

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

// ─── contarPorAno ───────────────────────────────────────────────

describe('contarPorAno', () => {
    beforeEach(resetarDb);

    it('acervo vazio retorna listas vazias', () => {
        assert.deepEqual(contarPorAno(), { labels: [], data: [] });
    });

    it('conta poemas e prosas juntos, agrupando por ano', () => {
        db.poemas = [{ ano: 2020 }, { ano: 2020 }, { ano: 2021 }];
        db.prosas = [{ ano: 2020 }];
        assert.deepEqual(contarPorAno(), { labels: ['2020', '2021'], data: [3, 1] });
    });

    it('anos vêm ordenados crescentemente, independente da ordem de inserção', () => {
        db.poemas = [{ ano: 2023 }, { ano: 2019 }, { ano: 2021 }];
        assert.deepEqual(contarPorAno().labels, ['2019', '2021', '2023']);
    });

    it('itens sem ano (null/undefined/0/string vazia) são ignorados', () => {
        db.poemas = [{ ano: null }, { ano: undefined }, { ano: '' }, { ano: 0 }, { ano: 2020 }];
        assert.deepEqual(contarPorAno(), { labels: ['2020'], data: [1] });
    });

    it('ano como string numérica é convertido corretamente', () => {
        db.poemas = [{ ano: '2020' }, { ano: '2020' }];
        assert.deepEqual(contarPorAno(), { labels: ['2020'], data: [2] });
    });
});

// ─── contarPorLivro ─────────────────────────────────────────────

describe('contarPorLivro', () => {
    beforeEach(resetarDb);

    it('agrupa por livro direto (paiTipo livro), usando sigla oficial > pessoal > título', () => {
        db.livros = [
            { id: 1, titulo: 'Livro Completo', siglaOficial: 'LC' },
            { id: 2, titulo: 'Livro Pessoal', siglaPessoal: 'LP' },
            { id: 3, titulo: 'Livro Sem Sigla' },
        ];
        db.poemas = [
            { paiTipo: 'livro', paiId: 1 },
            { paiTipo: 'livro', paiId: 1 },
            { paiTipo: 'livro', paiId: 2 },
            { paiTipo: 'livro', paiId: 3 },
        ];
        const { labels, data } = contarPorLivro();
        assert.deepEqual(labels, ['LC', 'LP', 'Livro Sem Sigla']);
        assert.deepEqual(data, [2, 1, 1]);
    });

    it('resolve item dentro de uma Parte até o livro dono', () => {
        db.livros = [{ id: 1, titulo: 'Livro A' }];
        db.partes = [{ id: 100, livroId: 1 }];
        db.poemas = [{ paiTipo: 'parte', paiId: 100 }];
        assert.deepEqual(contarPorLivro(), { labels: ['Livro A'], data: [1] });
    });

    it('resolve item dentro de uma Seção que está dentro de uma Parte', () => {
        db.livros = [{ id: 1, titulo: 'Livro A' }];
        db.partes = [{ id: 100, livroId: 1 }];
        db.secoes = [{ id: 200, paiTipo: 'parte', paiId: 100 }];
        db.poemas = [{ paiTipo: 'secao', paiId: 200 }];
        assert.deepEqual(contarPorLivro(), { labels: ['Livro A'], data: [1] });
    });

    it('resolve item dentro de uma Seção presa direto num livro', () => {
        db.livros = [{ id: 1, titulo: 'Livro A' }];
        db.secoes = [{ id: 200, paiTipo: 'livro', paiId: 1 }];
        db.poemas = [{ paiTipo: 'secao', paiId: 200 }];
        assert.deepEqual(contarPorLivro(), { labels: ['Livro A'], data: [1] });
    });

    it('item sem livro resolvível (pai órfão, ou paiTipo desconhecido) vira "Avulso"', () => {
        db.poemas = [
            { paiTipo: 'parte', paiId: 999 },
            { paiTipo: null, paiId: null },
        ];
        assert.deepEqual(contarPorLivro(), { labels: ['Avulso'], data: [2] });
    });

    it('coletâneas reais (db.livros com tipo Coletânea) contam via partes + itensColetanea', () => {
        db.livros = [{ id: 2, tipo: 'Coletânea', titulo: 'Seleta', siglaOficial: 'SEL' }];
        db.partes = [
            { id: 100, livroId: 2 },
            { id: 101, livroId: 2 },
        ];
        db.itensColetanea = [
            { id: 1, parteId: 100 },
            { id: 2, parteId: 100 },
            { id: 3, parteId: 101 },
        ];
        assert.deepEqual(contarPorLivro(), { labels: ['SEL'], data: [3] });
    });

    it('coletânea sem nenhum item não aparece no resultado', () => {
        db.livros = [{ id: 2, tipo: 'Coletânea', titulo: 'Vazia' }];
        assert.deepEqual(contarPorLivro(), { labels: [], data: [] });
    });

    it('resultado vem ordenado do mais frequente para o menos frequente', () => {
        db.livros = [
            { id: 1, titulo: 'A' },
            { id: 2, titulo: 'B' },
        ];
        db.poemas = [
            { paiTipo: 'livro', paiId: 2 },
            { paiTipo: 'livro', paiId: 1 },
            { paiTipo: 'livro', paiId: 1 },
            { paiTipo: 'livro', paiId: 1 },
        ];
        assert.deepEqual(contarPorLivro(), { labels: ['A', 'B'], data: [3, 1] });
    });
});

// ─── contarPorTema / contarPorPessoa ────────────────────────────

describe('contarPorTema', () => {
    beforeEach(resetarDb);

    it('separa a lista de temas por vírgula, ignorando espaços em volta', () => {
        db.poemas = [{ sinalizacoes: 'mar, noite' }, { sinalizacoes: 'mar' }];
        const { labels, data } = contarPorTema();
        assert.deepEqual(labels, ['mar', 'noite']);
        assert.deepEqual(data, [2, 1]);
    });

    it('item sem sinalizações não contribui em nada', () => {
        db.poemas = [{ sinalizacoes: '' }, { sinalizacoes: null }, { sinalizacoes: undefined }];
        assert.deepEqual(contarPorTema(), { labels: [], data: [] });
    });

    it('respeita o parâmetro `top`, cortando os menos frequentes', () => {
        db.poemas = [
            { sinalizacoes: 'a' },
            { sinalizacoes: 'a' },
            { sinalizacoes: 'a' },
            { sinalizacoes: 'b' },
            { sinalizacoes: 'b' },
            { sinalizacoes: 'c' },
        ];
        assert.deepEqual(contarPorTema(2), { labels: ['a', 'b'], data: [3, 2] });
    });

    it('valor padrão de `top` é 12', () => {
        db.poemas = Array.from({ length: 15 }, (_, i) => ({ sinalizacoes: `tema${i}` }));
        assert.equal(contarPorTema().labels.length, 12);
    });
});

describe('contarPorPessoa', () => {
    beforeEach(resetarDb);

    it('mesma lógica de contarPorTema, aplicada ao campo pessoas', () => {
        db.poemas = [{ pessoas: 'Dalton, Dani' }, { pessoas: 'Dalton' }];
        assert.deepEqual(contarPorPessoa(), { labels: ['Dalton', 'Dani'], data: [2, 1] });
    });
});

// ─── palavrasMaisFrequentes ─────────────────────────────────────

describe('palavrasMaisFrequentes', () => {
    beforeEach(resetarDb);

    it('ignora palavras com menos de 3 letras', () => {
        db.poemas = [{ texto: 'eu vi um sol lá' }];
        // "eu", "vi", "um", "lá" ficam de fora por tamanho (e "eu"/"um" também são stopword)
        const resultado = palavrasMaisFrequentes();
        assert.ok(resultado.some(([p]) => p === 'sol'));
        assert.ok(!resultado.some(([p]) => p === 'vi'));
    });

    it('ignora stopwords mesmo com 3+ letras', () => {
        db.poemas = [{ texto: 'para com sobre o mar' }];
        const resultado = palavrasMaisFrequentes();
        assert.deepEqual(
            resultado.map(([p]) => p),
            ['mar'],
        );
    });

    it('remove tags HTML antes de tokenizar', () => {
        db.poemas = [{ texto: '<p>oceano</p><div>oceano</div>' }];
        assert.deepEqual(palavrasMaisFrequentes(), [['oceano', 2]]);
    });

    it('é case-insensitive e conta acentuadas corretamente', () => {
        db.poemas = [{ texto: 'Coração coração CORAÇÃO' }];
        assert.deepEqual(palavrasMaisFrequentes(), [['coração', 3]]);
    });

    it('sem filtro de livro, considera poemas e prosas de todo o acervo', () => {
        db.poemas = [{ texto: 'oceano' }];
        db.prosas = [{ texto: 'oceano' }];
        assert.deepEqual(palavrasMaisFrequentes(), [['oceano', 2]]);
    });

    it('respeita o parâmetro `top`', () => {
        db.poemas = [{ texto: 'alfa beta gama' }];
        assert.equal(palavrasMaisFrequentes('', 2).length, 2);
    });

    it('filtro por livro comum: só conta palavras dos textos daquele livro', () => {
        db.livros = [
            { id: 1, titulo: 'Livro A' },
            { id: 2, titulo: 'Livro B' },
        ];
        db.poemas = [
            { paiTipo: 'livro', paiId: 1, texto: 'oceano' },
            { paiTipo: 'livro', paiId: 2, texto: 'montanha' },
        ];
        assert.deepEqual(palavrasMaisFrequentes('1'), [['oceano', 1]]);
    });

    it('filtro por coletânea: busca texto via refId/refTipo apontando pra poema/prosa', () => {
        db.livros = [{ id: 2, tipo: 'Coletânea', titulo: 'Seleta' }];
        db.partes = [{ id: 100, livroId: 2 }];
        db.poemas = [{ id: 10, texto: 'oceano profundo' }];
        db.itensColetanea = [{ id: 1, parteId: 100, refId: 10, refTipo: 'poema' }];
        assert.deepEqual(
            palavrasMaisFrequentes('2')
                .map(([p]) => p)
                .sort(),
            ['oceano', 'profundo'],
        );
    });

    it(
        'BUG CORRIGIDO: item "inédito" de coletânea (só textoOverride, sem refId/refTipo) ' +
            'entra na análise de palavras. Antes, o filtro de refs exigia refId && refTipo ' +
            'antes mesmo de olhar pro textoOverride, então um item inédito (caso suportado e ' +
            'exibido com o badge "inédito" em coletaneas.js, onde !item.refId é esperado) ' +
            'era descartado silenciosamente — divergindo de coletaneas.js (que resolve ' +
            'textoOverride PRIMEIRO, com refId só como fallback) e de exportar.js (que já ' +
            'incluía esses itens inteiros na exportação seletiva). Corrigido pra seguir a ' +
            'mesma prioridade de coletaneas.js.',
        () => {
            db.livros = [{ id: 2, tipo: 'Coletânea', titulo: 'Seleta' }];
            db.partes = [{ id: 100, livroId: 2 }];
            db.itensColetanea = [
                { id: 1, parteId: 100, textoOverride: 'texto avulso da coletânea' },
            ];
            const resultado = palavrasMaisFrequentes('2').map(([p]) => p);
            assert.ok(resultado.includes('avulso'));
        },
    );

    it(
        'filtro por coletânea: item COM refId/refTipo e também textoOverride usa o texto próprio ' +
            '(override vence sobre o texto original)',
        () => {
            db.livros = [{ id: 2, tipo: 'Coletânea', titulo: 'Seleta' }];
            db.partes = [{ id: 100, livroId: 2 }];
            db.poemas = [{ id: 10, texto: 'texto original ignorado' }];
            db.itensColetanea = [
                {
                    id: 1,
                    parteId: 100,
                    refId: 10,
                    refTipo: 'poema',
                    textoOverride: 'texto avulso vencedor',
                },
            ];
            const resultado = palavrasMaisFrequentes('2')
                .map(([p]) => p)
                .sort();
            assert.deepEqual(resultado, ['avulso', 'texto', 'vencedor']);
        },
    );

    it('livroId inexistente cai no ramo de livro comum e não quebra (retorna vazio)', () => {
        db.poemas = [{ paiTipo: 'livro', paiId: 1, texto: 'oceano' }];
        assert.deepEqual(palavrasMaisFrequentes('999'), []);
    });
});

// ─── resumoGeral ─────────────────────────────────────────────────

describe('resumoGeral', () => {
    beforeEach(resetarDb);

    it('acervo vazio retorna valores neutros, sem quebrar', () => {
        assert.deepEqual(resumoGeral(), {
            totalPoemas: 0,
            totalProsas: 0,
            totalPalavras: 0,
            mediaPalavras: 0,
            anoMaisProdutivo: '—',
            livroComMais: '—',
        });
    });

    it('conta totalPoemas e totalProsas separadamente', () => {
        db.poemas = [{ texto: '' }, { texto: '' }];
        db.prosas = [{ texto: '' }];
        const r = resumoGeral();
        assert.equal(r.totalPoemas, 2);
        assert.equal(r.totalProsas, 1);
    });

    it('soma o total de palavras tokenizadas de poemas e prosas', () => {
        db.poemas = [{ texto: 'uma frase com cinco palavras' }]; // "uma" e "com" são stopword, mas ainda contam como token pro total
        db.prosas = [{ texto: 'outra frase' }];
        const r = resumoGeral();
        // tokenizar não filtra stopword/tamanho — isso só acontece em palavrasMaisFrequentes
        assert.equal(r.totalPalavras, 5 + 2);
    });

    it('mediaPalavras é a média arredondada de palavras por texto', () => {
        db.poemas = [{ texto: 'um dois tres quatro' }, { texto: 'um' }];
        const r = resumoGeral();
        assert.equal(r.mediaPalavras, Math.round((4 + 1) / 2));
    });

    it('anoMaisProdutivo aponta o ano com mais textos', () => {
        db.poemas = [
            { texto: '', ano: 2020 },
            { texto: '', ano: 2021 },
            { texto: '', ano: 2021 },
        ];
        assert.equal(resumoGeral().anoMaisProdutivo, '2021');
    });

    it('livroComMais aponta o livro (ou coletânea) com mais textos', () => {
        db.livros = [
            { id: 1, titulo: 'Livro A' },
            { id: 2, titulo: 'Livro B' },
        ];
        db.poemas = [
            { texto: '', paiTipo: 'livro', paiId: 1 },
            { texto: '', paiTipo: 'livro', paiId: 2 },
            { texto: '', paiTipo: 'livro', paiId: 2 },
        ];
        assert.equal(resumoGeral().livroComMais, 'Livro B');
    });
});

// ─── filtrarPorIntervalo ─────────────────────────────────────────

describe('filtrarPorIntervalo (recorte de min/max usado nos gráficos)', () => {
    const base = { labels: ['a', 'b', 'c'], data: [1, 5, 10] };

    it('sem min nem max, retorna a lista intacta', () => {
        assert.deepEqual(filtrarPorIntervalo(base, '', ''), base);
        assert.deepEqual(filtrarPorIntervalo(base, null, null), base);
    });

    it('só min: mantém valores >= min', () => {
        assert.deepEqual(filtrarPorIntervalo(base, 5, ''), { labels: ['b', 'c'], data: [5, 10] });
    });

    it('só max: mantém valores <= max', () => {
        assert.deepEqual(filtrarPorIntervalo(base, '', 5), { labels: ['a', 'b'], data: [1, 5] });
    });

    it('min e max juntos: mantém só o que está no intervalo fechado', () => {
        assert.deepEqual(filtrarPorIntervalo(base, 2, 9), { labels: ['b'], data: [5] });
    });

    it('min/max não numéricos são tratados como ausentes (sem quebrar)', () => {
        assert.deepEqual(filtrarPorIntervalo(base, 'abc', ''), base);
    });

    it('intervalo que não bate em nada retorna listas vazias', () => {
        assert.deepEqual(filtrarPorIntervalo(base, 100, 200), { labels: [], data: [] });
    });
});
