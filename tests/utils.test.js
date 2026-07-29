import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    gerarId,
    escapeHtml,
    sortBySeq,
    seqOuNull,
    reordenarPosicao,
    fecharEspaco,
    getIrmaosTopoLivro,
    getIrmaosDentroParte,
    getIrmaosDentroSecao,
    getIrmaosPorEscopo,
    getPosicaoElemento,
    getElementHierarchy,
    formatarDataParcial,
    anoDeDataParcial,
    itemBateFiltroData,
    itemFaltaDataParaFiltro,
    filtroDataVazio,
    parseFiltroDataRapido,
    extrairPessoasUnicas,
    extrairSinalizacoesUnicas,
    extrairFasesUnicas,
    filtrarTextos,
    debounce,
    criarRastreadorDeAlteracoes,
} from '../js/utils.js';

describe('gerarId', () => {
    it('nunca repete um id, mesmo em chamadas em rajada no mesmo milissegundo', () => {
        const ids = new Set();
        for (let i = 0; i < 5000; i++) ids.add(gerarId());
        assert.equal(ids.size, 5000, 'todos os ids gerados devem ser únicos');
    });

    it('é estritamente crescente', () => {
        let anterior = gerarId();
        for (let i = 0; i < 100; i++) {
            const atual = gerarId();
            assert.ok(atual > anterior, `${atual} deveria ser maior que ${anterior}`);
            anterior = atual;
        }
    });
});

describe('escapeHtml', () => {
    it('escapa os 5 caracteres perigosos', () => {
        assert.equal(
            escapeHtml(`<script>alert("x")&'y'</script>`),
            '&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;y&#39;&lt;/script&gt;',
        );
    });

    it('trata null/undefined como string vazia (não "null"/"undefined" literal)', () => {
        assert.equal(escapeHtml(null), '');
        assert.equal(escapeHtml(undefined), '');
    });

    it('converte números e outros tipos pra string antes de escapar', () => {
        assert.equal(escapeHtml(2024), '2024');
        assert.equal(escapeHtml(0), '0');
    });

    it('texto sem caracteres especiais passa direto', () => {
        assert.equal(escapeHtml('Fragmentos do Infinito'), 'Fragmentos do Infinito');
    });
});

describe('sortBySeq', () => {
    it('ordena por sequencia crescente', () => {
        const lista = [
            { id: 1, sequencia: 3 },
            { id: 2, sequencia: 1 },
            { id: 3, sequencia: 2 },
        ];
        assert.deepEqual(
            sortBySeq(lista).map((i) => i.id),
            [2, 3, 1],
        );
    });

    it('itens sem sequencia (null/undefined/inválida) vão pro fim, desempatando por id', () => {
        const lista = [
            { id: 5, sequencia: null },
            { id: 1, sequencia: 1 },
            { id: 3, sequencia: undefined },
        ];
        assert.deepEqual(
            sortBySeq(lista).map((i) => i.id),
            [1, 3, 5],
        );
    });

    it('não modifica o array original (retorna cópia)', () => {
        const lista = [
            { id: 2, sequencia: 2 },
            { id: 1, sequencia: 1 },
        ];
        const original = [...lista];
        sortBySeq(lista);
        assert.deepEqual(lista, original);
    });
});

describe('seqOuNull', () => {
    it('string vazia, null e undefined viram null', () => {
        assert.equal(seqOuNull(''), null);
        assert.equal(seqOuNull(null), null);
        assert.equal(seqOuNull(undefined), null);
    });

    it('string numérica válida vira inteiro', () => {
        assert.equal(seqOuNull('7'), 7);
        assert.equal(seqOuNull('07'), 7);
    });

    it('texto não numérico vira null', () => {
        assert.equal(seqOuNull('abc'), null);
    });

    it('zero é um valor de posição válido (não deve virar null)', () => {
        assert.equal(seqOuNull('0'), 0);
        assert.equal(seqOuNull(0), 0);
    });
});

describe('reordenarPosicao', () => {
    it('posicaoDesejada null limpa a sequência do item (não disputa posição)', () => {
        const item = { id: 1, sequencia: 3 };
        reordenarPosicao([item], item, null);
        assert.equal(item.sequencia, null);
    });

    it('inserção nova empurra pra frente quem já ocupava aquela posição em diante', () => {
        const a = { id: 1, sequencia: 1 };
        const b = { id: 2, sequencia: 2 };
        const c = { id: 3, sequencia: 3 };
        const novo = { id: 4, sequencia: null };
        const irmaos = [a, b, c, novo];

        reordenarPosicao(irmaos, novo, 2); // insere o novo na posição 2

        assert.equal(a.sequencia, 1, 'quem estava antes da posição não muda');
        assert.equal(b.sequencia, 3, 'empurrado uma casa pra frente');
        assert.equal(c.sequencia, 4, 'empurrado uma casa pra frente');
        assert.equal(novo.sequencia, 2);
    });

    it('mover pra uma posição DEPOIS da atual desloca só quem está entre elas pra trás', () => {
        // Posições: A=1, B=2, C=3, D=4. Move A da posição 1 pra posição 3.
        const A = { id: 1, sequencia: 1 };
        const B = { id: 2, sequencia: 2 };
        const C = { id: 3, sequencia: 3 };
        const D = { id: 4, sequencia: 4 };
        const irmaos = [A, B, C, D];

        reordenarPosicao(irmaos, A, 3, 1);

        assert.equal(B.sequencia, 1, 'B ocupa o lugar que A deixou');
        assert.equal(C.sequencia, 2, 'C anda uma casa pra trás');
        assert.equal(D.sequencia, 4, 'D está depois do destino, não se move');
        assert.equal(A.sequencia, 3);
    });

    it('mover pra uma posição ANTES da atual desloca só quem está entre elas pra frente', () => {
        // Posições: A=1, B=2, C=3, D=4. Move D da posição 4 pra posição 2.
        const A = { id: 1, sequencia: 1 };
        const B = { id: 2, sequencia: 2 };
        const C = { id: 3, sequencia: 3 };
        const D = { id: 4, sequencia: 4 };
        const irmaos = [A, B, C, D];

        reordenarPosicao(irmaos, D, 2, 4);

        assert.equal(A.sequencia, 1, 'A está antes do destino, não se move');
        assert.equal(B.sequencia, 3, 'B anda uma casa pra frente');
        assert.equal(C.sequencia, 4, 'C anda uma casa pra frente');
        assert.equal(D.sequencia, 2);
    });

    it('itens sem posição definida não são afetados pelo deslocamento', () => {
        const A = { id: 1, sequencia: 1 };
        const semPosicao = { id: 2, sequencia: null };
        const C = { id: 3, sequencia: 2 };
        const irmaos = [A, semPosicao, C];

        reordenarPosicao(irmaos, C, 1, 2);

        assert.equal(semPosicao.sequencia, null);
    });
});

describe('fecharEspaco', () => {
    it('fecha o buraco: quem estava depois da posição removida anda uma casa pra trás', () => {
        const lista = [
            { id: 1, sequencia: 1 },
            { id: 2, sequencia: 3 }, // era o 3º, o 2º (posição 2) foi removido
            { id: 3, sequencia: 4 },
        ];
        fecharEspaco(lista, 2);
        assert.deepEqual(
            lista.map((i) => i.sequencia),
            [1, 2, 3],
        );
    });

    it('não faz nada se a posição removida for null (item sem posição não deixa buraco)', () => {
        const lista = [
            { id: 1, sequencia: 1 },
            { id: 2, sequencia: 2 },
        ];
        fecharEspaco(lista, null);
        assert.deepEqual(
            lista.map((i) => i.sequencia),
            [1, 2],
        );
    });

    it('ignora itens sem sequência definida', () => {
        const lista = [
            { id: 1, sequencia: null },
            { id: 2, sequencia: 5 },
        ];
        fecharEspaco(lista, 3);
        assert.equal(lista[0].sequencia, null);
        assert.equal(lista[1].sequencia, 4);
    });
});

describe('getIrmaos* (quem compete por posição em cada nível)', () => {
    const db = {
        partes: [
            { id: 10, livroId: 1 },
            { id: 11, livroId: 2 },
        ],
        secoes: [
            { id: 20, paiTipo: 'livro', paiId: 1 },
            { id: 21, paiTipo: 'parte', paiId: 10 },
        ],
        elementos: [
            { id: 30, paiTipo: 'livro', paiId: 1 },
            { id: 31, paiTipo: 'parte', paiId: 10 },
            { id: 32, paiTipo: 'secao', paiId: 20 },
        ],
        poemas: [
            { id: 40, paiTipo: 'livro', paiId: 1 },
            { id: 41, paiTipo: 'secao', paiId: 20 },
        ],
        prosas: [
            { id: 50, paiTipo: 'livro', paiId: 1 },
            { id: 51, paiTipo: 'secao', paiId: 20 },
            // Prosa de acervo antigo: nunca teve paiTipo/paiId migrados pra
            // apontar pra Seção, só o campo legado secaoId (ver filtro em
            // getIrmaosDentroSecao — é o único helper com esse fallback OR).
            { id: 52, secaoId: 20 },
        ],
    };

    it('getIrmaosTopoLivro junta Partes + Seções/Elementos/Poemas/Prosas ligados direto ao livro', () => {
        const irmaos = getIrmaosTopoLivro(db, 1)
            .map((i) => i.id)
            .sort((a, b) => a - b);
        assert.deepEqual(irmaos, [10, 20, 30, 40, 50]);
    });

    it('getIrmaosDentroParte só pega quem está ligado àquela Parte específica', () => {
        const irmaos = getIrmaosDentroParte(db, 10)
            .map((i) => i.id)
            .sort((a, b) => a - b);
        assert.deepEqual(irmaos, [21, 31]);
    });

    it('getIrmaosDentroSecao junta Elementos/Poemas/Prosas ligados àquela Seção — inclui prosas antigas só com o campo legado secaoId, sem paiTipo/paiId', () => {
        const irmaos = getIrmaosDentroSecao(db, 20)
            .map((i) => i.id)
            .sort((a, b) => a - b);
        assert.deepEqual(irmaos, [32, 41, 51, 52]);
    });

    it('getIrmaosDentroSecao não pega itens de Partes/Livros nem de outra Seção', () => {
        assert.deepEqual(getIrmaosDentroSecao(db, 999), []);
        // Seção 21 (dentro da Parte 10) não tem nenhum filho — não deve
        // vazar nada da Seção 20 nem dos irmãos da Parte.
        assert.deepEqual(getIrmaosDentroSecao(db, 21), []);
    });

    it('getIrmaosPorEscopo delega pro helper certo conforme paiTipo', () => {
        const porId = (arr) => arr.map((i) => i.id).sort((a, b) => a - b);

        assert.deepEqual(
            porId(getIrmaosPorEscopo(db, 'livro', 1)),
            porId(getIrmaosTopoLivro(db, 1)),
        );
        assert.deepEqual(
            porId(getIrmaosPorEscopo(db, 'parte', 10)),
            porId(getIrmaosDentroParte(db, 10)),
        );
        assert.deepEqual(
            porId(getIrmaosPorEscopo(db, 'secao', 20)),
            porId(getIrmaosDentroSecao(db, 20)),
        );
        assert.equal(getIrmaosPorEscopo(db, 'tipo-inexistente', 1).length, 0);
    });
});

describe('getPosicaoElemento / getElementHierarchy', () => {
    const db = {
        livros: [{ id: 1, sequencia: 5 }],
        partes: [{ id: 10, livroId: 1, sequencia: 2 }],
        secoes: [{ id: 20, paiTipo: 'parte', paiId: 10, sequencia: 3 }],
    };

    it('elemento ligado direto a uma Seção carrega a sequência do Livro→Parte→Seção inteira', () => {
        const el = { paiTipo: 'secao', paiId: 20, sequencia: 1 };
        assert.deepEqual(getPosicaoElemento(el, db), [5, 2, 3]);
    });

    it('elemento sem vínculo válido (paiId inexistente) usa os valores-sentinela (9999)', () => {
        const el = { paiTipo: 'secao', paiId: 999, sequencia: 1 };
        assert.deepEqual(getPosicaoElemento(el, db), [9999, 9999, 9999]);
    });

    it('getElementHierarchy calcula o nível certo (1=livro, 2=parte, 3=seção)', () => {
        assert.equal(getElementHierarchy({ paiTipo: 'livro', paiId: 1 }, db)[1], 1);
        assert.equal(getElementHierarchy({ paiTipo: 'parte', paiId: 10 }, db)[1], 2);
        assert.equal(getElementHierarchy({ paiTipo: 'secao', paiId: 20 }, db)[1], 3);
    });
});

describe('formatarDataParcial', () => {
    it('data ausente vira travessão', () => {
        assert.equal(formatarDataParcial(null), '—');
        assert.equal(formatarDataParcial(undefined), '—');
    });

    it('só o ano', () => {
        assert.equal(formatarDataParcial({ ano: 2023 }), '2023');
    });

    it('dia/mês/ano completos, com padding de 2 dígitos', () => {
        assert.equal(formatarDataParcial({ dia: 5, mes: 3, ano: 2023 }), '05/03/2023');
    });

    it('inclui hora:minuto quando presente', () => {
        assert.equal(
            formatarDataParcial({ dia: 5, mes: 3, ano: 2023, hora: 9, minuto: 5 }),
            '05/03/2023 09:05',
        );
    });

    it('só hora, sem data (caso raro mas válido)', () => {
        assert.equal(formatarDataParcial({ hora: 14 }), '14:00');
    });
});

describe('anoDeDataParcial', () => {
    it('extrai o ano quando presente', () => {
        assert.equal(anoDeDataParcial({ ano: 1999 }), 1999);
    });
    it('retorna null quando não há data ou não há ano', () => {
        assert.equal(anoDeDataParcial(null), null);
        assert.equal(anoDeDataParcial({ mes: 3 }), null);
    });
});

describe('filtro de faixa de data (itemBateFiltroData / itemFaltaDataParaFiltro)', () => {
    it('sem filtro ativo, qualquer item bate (inclusive sem data)', () => {
        assert.equal(itemBateFiltroData(null, filtroDataVazio()), true);
        assert.equal(itemBateFiltroData({ ano: 2020 }, filtroDataVazio()), true);
    });

    it('com filtro ativo, item sem data cadastrada NÃO bate', () => {
        const filtro = { de: { ano: 2020 }, ate: {} };
        assert.equal(itemBateFiltroData(null, filtro), false);
    });

    it('item com só o ano bate num filtro por mês daquele ano (a faixa se sobrepõe)', () => {
        // Filtro: março/2023. Item: só "2023" (sem mês) — cobre o ano inteiro,
        // logo a faixa dele inclui março, então deve bater.
        const filtro = { de: { ano: 2023, mes: 3 }, ate: { ano: 2023, mes: 3 } };
        assert.equal(itemBateFiltroData({ ano: 2023 }, filtro), true);
    });

    it('item fora da faixa pedida não bate', () => {
        const filtro = { de: { ano: 2023 }, ate: { ano: 2023 } };
        assert.equal(itemBateFiltroData({ ano: 2022 }, filtro), false);
    });

    it('faixa aberta só de um lado (só "de", sem "até")', () => {
        const filtro = { de: { ano: 2020 }, ate: {} };
        assert.equal(itemBateFiltroData({ ano: 2025 }, filtro), true);
        assert.equal(itemBateFiltroData({ ano: 2019 }, filtro), false);
    });

    it('itemFaltaDataParaFiltro distingue "sem data" de "fora da faixa"', () => {
        const filtro = { de: { ano: 2023 }, ate: {} };
        assert.equal(
            itemFaltaDataParaFiltro(null, filtro),
            true,
            'sem data cadastrada, com filtro ativo',
        );
        assert.equal(
            itemFaltaDataParaFiltro({ ano: 2010 }, filtro),
            false,
            'tem data, só está fora da faixa',
        );
        assert.equal(
            itemFaltaDataParaFiltro(null, filtroDataVazio()),
            false,
            'sem filtro ativo, não conta como "faltando"',
        );
    });
});

describe('parseFiltroDataRapido', () => {
    it('reconhece um ano isolado como faixa de/até igual', () => {
        assert.deepEqual(parseFiltroDataRapido('2020'), {
            de: { ano: 2020 },
            ate: { ano: 2020 },
        });
    });

    it('reconhece um intervalo de anos "2020-2023"', () => {
        assert.deepEqual(parseFiltroDataRapido('2020-2023'), {
            de: { ano: 2020 },
            ate: { ano: 2023 },
        });
    });

    it('reconhece mês/ano "03/2020"', () => {
        assert.deepEqual(parseFiltroDataRapido('03/2020'), {
            de: { mes: 3, ano: 2020 },
            ate: { mes: 3, ano: 2020 },
        });
    });

    it('reconhece data completa "15/03/2020"', () => {
        assert.deepEqual(parseFiltroDataRapido('15/03/2020'), {
            de: { dia: 15, mes: 3, ano: 2020 },
            ate: { dia: 15, mes: 3, ano: 2020 },
        });
    });

    it('aceita dia e mês sem zero à esquerda ("5/3/2020")', () => {
        assert.deepEqual(parseFiltroDataRapido('5/3/2020'), {
            de: { dia: 5, mes: 3, ano: 2020 },
            ate: { dia: 5, mes: 3, ano: 2020 },
        });
    });

    it('ignora espaços nas pontas', () => {
        assert.deepEqual(parseFiltroDataRapido('  2020  '), {
            de: { ano: 2020 },
            ate: { ano: 2020 },
        });
    });

    it('texto vazio limpa o filtro (retorna filtroDataVazio)', () => {
        assert.deepEqual(parseFiltroDataRapido(''), filtroDataVazio());
        assert.deepEqual(parseFiltroDataRapido('   '), filtroDataVazio());
        assert.deepEqual(parseFiltroDataRapido(undefined), filtroDataVazio());
    });

    it('retorna null pra texto em formato não reconhecido', () => {
        assert.equal(parseFiltroDataRapido('março de 2020'), null);
        assert.equal(parseFiltroDataRapido('2020/03/15'), null);
        assert.equal(parseFiltroDataRapido('abc'), null);
    });

    it('retorna null pra valores fora da faixa válida', () => {
        assert.equal(parseFiltroDataRapido('32/01/2020'), null, 'dia inválido');
        assert.equal(parseFiltroDataRapido('15/13/2020'), null, 'mês inválido');
        assert.equal(parseFiltroDataRapido('15/03/1899'), null, 'ano abaixo do mínimo');
        assert.equal(parseFiltroDataRapido('13/2020'), null, 'mês inválido em mês/ano');
    });
});

describe('extrairPessoasUnicas / extrairSinalizacoesUnicas / extrairFasesUnicas', () => {
    it('extrai nomes únicos de campos "pessoas" em string separada por vírgula, ordenados', () => {
        const poemas = [
            { pessoas: 'Dalton, Dani' },
            { pessoas: 'Dani, Sarinha' },
            { pessoas: '' },
            {},
        ];
        assert.deepEqual(extrairPessoasUnicas(poemas), ['Dalton', 'Dani', 'Sarinha']);
    });

    it('também aceita o campo já como array', () => {
        const poemas = [{ pessoas: ['Gaby', 'Karina'] }, { pessoas: ['Karina'] }];
        assert.deepEqual(extrairPessoasUnicas(poemas), ['Gaby', 'Karina']);
    });

    it('extrai sinalizações únicas do mesmo jeito', () => {
        const poemas = [{ sinalizacoes: 'saudade, mar' }, { sinalizacoes: 'mar, chegada' }];
        assert.deepEqual(extrairSinalizacoesUnicas(poemas), ['chegada', 'mar', 'saudade']);
    });

    it('extrai fases de vida únicas de livros, ignorando vazias', () => {
        const livros = [
            { fase: 'Mongaguá' },
            { fase: '  ' },
            { fase: 'Santos' },
            { fase: 'Mongaguá' },
        ];
        assert.deepEqual(extrairFasesUnicas(livros), ['Mongaguá', 'Santos']);
    });
});

describe('filtrarTextos (busca com sintaxe estilo Google)', () => {
    const itens = [
        {
            id: 1,
            titulo: 'Beira do Mar',
            ano: 2023,
            sinalizacoes: 'saudade',
            pessoas: 'Dalton',
            notas: '',
            _livros: 'Fragmentos',
        },
        {
            id: 2,
            titulo: 'Rascunho Solto',
            ano: 2021,
            sinalizacoes: 'rascunho',
            pessoas: 'Dani',
            notas: '',
            _livros: '',
        },
        {
            id: 3,
            titulo: 'Chegada ao Mar',
            ano: 2023,
            sinalizacoes: '',
            pessoas: '',
            notas: 'nota sobre Dalton',
            _livros: '',
        },
    ];

    it('sem query, retorna a lista intacta', () => {
        assert.equal(filtrarTextos(itens, '').length, 3);
        assert.equal(filtrarTextos(itens, '   ').length, 3);
    });

    it('termo solto busca em todos os campos gerais (título, ano, etiquetas, pessoas, notas, livros)', () => {
        const r = filtrarTextos(itens, 'mar');
        assert.deepEqual(
            r.map((i) => i.id),
            [1, 3],
        );
    });

    it('múltiplos termos soltos exigem TODOS (E lógico)', () => {
        const r = filtrarTextos(itens, 'mar dalton');
        assert.deepEqual(
            r.map((i) => i.id),
            [1, 3],
        ); // ambos mencionam "Dalton" e "mar"
    });

    it('"-termo" exclui quem contém aquele termo', () => {
        const r = filtrarTextos(itens, '-rascunho');
        assert.deepEqual(
            r.map((i) => i.id),
            [1, 3],
        );
    });

    it('frase entre aspas busca a sequência exata, preservando espaços', () => {
        const r = filtrarTextos(itens, '"beira do mar"');
        assert.deepEqual(
            r.map((i) => i.id),
            [1],
        );
    });

    it('prefixo campo: restringe a busca àquele atributo', () => {
        assert.deepEqual(
            filtrarTextos(itens, 'pessoa:dalton').map((i) => i.id),
            [1],
        );
        assert.deepEqual(
            filtrarTextos(itens, 'etiqueta:rascunho').map((i) => i.id),
            [2],
        );
    });

    it('combina prefixo de campo com exclusão: -etiqueta:rascunho', () => {
        const r = filtrarTextos(itens, '-etiqueta:rascunho');
        assert.deepEqual(r.map((i) => i.id).sort(), [1, 3]);
    });

    it('busca é case-insensitive', () => {
        assert.deepEqual(
            filtrarTextos(itens, 'MAR').map((i) => i.id),
            [1, 3],
        );
    });

    it('campo desconhecido (não mapeado) não quebra — vira só um termo geral', () => {
        // "xyz:mar" — "xyz" não está em CAMPOS_ATRIBUTO, então cai como termo geral "xyz:mar" literal
        const r = filtrarTextos(itens, 'xyz:mar');
        assert.equal(r.length, 0); // nenhum item tem literalmente "xyz:mar" em algum campo
    });
});

// ─── debounce ────────────────────────────────────────────────────
// Usa mock.timers do node:test em vez de esperas reais — evita testes
// lentos e instáveis por causa de timing real.

describe('debounce', () => {
    it('só executa a função depois do tempo de espera sem novas chamadas', (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        let chamadas = 0;
        const fn = debounce(() => {
            chamadas++;
        }, 200);

        fn();
        assert.equal(chamadas, 0, 'não deve rodar antes do tempo passar');
        t.mock.timers.tick(199);
        assert.equal(chamadas, 0, 'ainda não deve ter rodado 1ms antes do prazo');
        t.mock.timers.tick(1);
        assert.equal(chamadas, 1, 'deve rodar exatamente quando o prazo se completa');
    });

    it('rajada de chamadas seguidas reinicia o temporizador — só a última conta', (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        let chamadas = 0;
        const fn = debounce(() => {
            chamadas++;
        }, 200);

        fn();
        t.mock.timers.tick(150);
        fn(); // reinicia o contador antes de completar os 200ms da 1ª chamada
        t.mock.timers.tick(150);
        assert.equal(
            chamadas,
            0,
            'a 1ª chamada foi cancelada pela 2ª, ainda não passou 200ms da 2ª',
        );
        t.mock.timers.tick(50);
        assert.equal(chamadas, 1, 'só executa uma vez, referente à última chamada da rajada');
    });

    it('repassa os argumentos da última chamada da rajada pra função original', (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        let recebido = null;
        const fn = debounce((...args) => {
            recebido = args;
        }, 200);

        fn('a', 1);
        fn('b', 2);
        fn('c', 3);
        t.mock.timers.tick(200);
        assert.deepEqual(recebido, ['c', 3]);
    });

    it('usa 200ms como espera padrão quando nenhum valor é passado', (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        let chamadas = 0;
        const fn = debounce(() => {
            chamadas++;
        });

        fn();
        t.mock.timers.tick(199);
        assert.equal(chamadas, 0);
        t.mock.timers.tick(1);
        assert.equal(chamadas, 1);
    });

    it('chamadas em janelas de tempo separadas (sem sobreposição) executam uma vez cada', (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        let chamadas = 0;
        const fn = debounce(() => {
            chamadas++;
        }, 200);

        fn();
        t.mock.timers.tick(200);
        assert.equal(chamadas, 1);

        fn();
        t.mock.timers.tick(200);
        assert.equal(chamadas, 2);
    });
});

// ─── criarRastreadorDeAlteracoes ──────────────────────────────────
// observar(form) usa form.addEventListener — simulamos um "form" com
// addEventListener guardando os callbacks, e disparamos manualmente,
// no mesmo espírito do dom-shim.js usado por outros testes: só o
// suficiente pra exercitar a lógica pura (o estado sujo/limpo), sem
// simular DOM de verdade.

function criarFormFalso() {
    const ouvintes = {};
    return {
        addEventListener(tipo, cb) {
            (ouvintes[tipo] = ouvintes[tipo] || []).push(cb);
        },
        disparar(tipo) {
            (ouvintes[tipo] || []).forEach((cb) => cb());
        },
    };
}

describe('criarRastreadorDeAlteracoes', () => {
    it('começa limpo (não sujo)', () => {
        const r = criarRastreadorDeAlteracoes();
        assert.equal(r.estaSujo(), false);
    });

    it('evento "input" no form observado marca como sujo', () => {
        const r = criarRastreadorDeAlteracoes();
        const form = criarFormFalso();
        r.observar(form);
        form.disparar('input');
        assert.equal(r.estaSujo(), true);
    });

    it('evento "change" no form observado também marca como sujo', () => {
        const r = criarRastreadorDeAlteracoes();
        const form = criarFormFalso();
        r.observar(form);
        form.disparar('change');
        assert.equal(r.estaSujo(), true);
    });

    it('marcarLimpo() volta o estado pra não-sujo', () => {
        const r = criarRastreadorDeAlteracoes();
        const form = criarFormFalso();
        r.observar(form);
        form.disparar('input');
        assert.equal(r.estaSujo(), true);
        r.marcarLimpo();
        assert.equal(r.estaSujo(), false);
    });

    it('observar(null) não quebra (ex.: modal ainda sem form carregado)', () => {
        const r = criarRastreadorDeAlteracoes();
        assert.doesNotThrow(() => r.observar(null));
        assert.equal(r.estaSujo(), false);
    });

    it('cada rastreador tem seu próprio estado, independente dos outros', () => {
        const r1 = criarRastreadorDeAlteracoes();
        const r2 = criarRastreadorDeAlteracoes();
        const form1 = criarFormFalso();
        r1.observar(form1);
        form1.disparar('input');
        assert.equal(r1.estaSujo(), true);
        assert.equal(r2.estaSujo(), false);
    });

    it(
        'eventos em formulários diferentes observados pelo mesmo rastreador ' +
            '(ex.: reaproveitado entre telas) todos marcam o mesmo estado sujo',
        () => {
            const r = criarRastreadorDeAlteracoes();
            const formA = criarFormFalso();
            const formB = criarFormFalso();
            r.observar(formA);
            r.observar(formB);
            formB.disparar('change');
            assert.equal(r.estaSujo(), true);
        },
    );
});
