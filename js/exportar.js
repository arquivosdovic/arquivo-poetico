// ============================================================
// exportar.js — Exportação filtrada (por pessoa, tema, ano, status)
// Gera um JSON "flat enriquecido": cada item já vem com o contexto
// (Livro/Parte/Seção) resolvido inline, pra não exigir que quem for
// processar precise cruzar IDs com outras partes do arquivo.
// ============================================================

import { db } from './db.js';
import { exportarColetaneaResolvida } from './coletaneas.js';

function listaDeCampo(valor) {
    if (!valor) return [];
    return valor.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

// Preenche os checkboxes de Livros e Coletâneas na aba de exportação.
// Coletâneas vivem numa coleção própria (db.coletaneas), separada dos Livros.
export function popularSelecaoExportacao() {
    const livrosContainer = document.getElementById('exp-livros-checks');
    if (livrosContainer) {
        const livros = db.livros.filter(l => l.tipo !== 'Coletânea');
        livrosContainer.innerHTML = livros.length
            ? livros.map(l => `
                <label class="flex items-center gap-1.5">
                    <input type="checkbox" class="exp-livro-check" value="${l.id}" style="width:auto;margin:0;">
                    ${l.titulo}
                </label>`).join('')
            : '<span class="text-gray-400 text-xs">Nenhum livro cadastrado.</span>';
    }

    const coletaneasContainer = document.getElementById('exp-coletaneas-checks');
    if (coletaneasContainer) {
        const coletaneas = db.livros.filter(l => l.tipo === 'Coletânea');
        coletaneasContainer.innerHTML = coletaneas.length
            ? coletaneas.map(c => `
                <label class="flex items-center gap-1.5">
                    <input type="checkbox" class="exp-coletanea-check" value="${c.id}" style="width:auto;margin:0;">
                    ${c.titulo}
                </label>`).join('')
            : '<span class="text-gray-400 text-xs">Nenhuma coletânea cadastrada.</span>';
    }
}

function idsMarcados(classeCheckbox) {
    return Array.from(document.querySelectorAll(`.${classeCheckbox}:checked`)).map(el => el.value);
}

function lerDataFiltro(prefixo) {
    const dia = parseInt(document.getElementById(`${prefixo}-dia`)?.value) || null;
    const mes = parseInt(document.getElementById(`${prefixo}-mes`)?.value) || null;
    const ano = parseInt(document.getElementById(`${prefixo}-ano`)?.value) || null;
    if (!ano && !mes && !dia) return null;
    return { dia, mes, ano };
}

function lerFiltrosDoFormulario() {
    return {
        tipos: [
            ...(document.getElementById('exp-tipo-poema')?.checked ? ['poema'] : []),
            ...(document.getElementById('exp-tipo-prosa')?.checked ? ['prosa'] : [])
        ],
        pessoasIncluir: listaDeCampo(document.getElementById('exp-pessoas-incluir')?.value),
        temasIncluir:   listaDeCampo(document.getElementById('exp-temas-incluir')?.value),
        temasExcluir:   listaDeCampo(document.getElementById('exp-temas-excluir')?.value),
        dataDe:  lerDataFiltro('exp-data-de'),
        dataAte: lerDataFiltro('exp-data-ate'),
        status: document.getElementById('exp-status')?.value || 'todos',
        livrosIncluir: idsMarcados('exp-livro-check'),
        coletaneasIncluir: idsMarcados('exp-coletanea-check')
    };
}

// ─── Comparação de datas parciais ────────────────────────────────────────────
// Converte { dia, mes, ano } num número comparável, preenchendo campos
// ausentes com o valor mínimo (início) ou máximo (fim) do período.
// Ex: { mes: 3, ano: 2026 } como limite inferior → 20260301
//     { mes: 3, ano: 2026 } como limite superior → 20260331
function ultimoDiaDoMes(mes, ano) {
    return new Date(ano, mes, 0).getDate(); // JS: mês 0 do próximo = último dia do atual
}

function dataParaNumero(d, comoInicio) {
    if (!d || !d.ano) return comoInicio ? -Infinity : Infinity;
    const mes = d.mes || (comoInicio ? 1 : 12);
    const dia = d.dia || (comoInicio ? 1 : ultimoDiaDoMes(mes, d.ano));
    return d.ano * 10000 + mes * 100 + dia;
}

// Precisão do filtro: quantos campos foram preenchidos (dia > mês > ano).
// Usamos isso pra saber se um mês parcial nas pontas precisa de dia ou não.
function precisaoFiltro(d) {
    if (!d) return 0;
    if (d.dia) return 3; // dia+mês+ano
    if (d.mes) return 2; // mês+ano
    return 1;            // só ano
}

// Verifica se o mês inicial do filtro está totalmente coberto
// (filtro começa no dia 1, ou não tem dia — só mês+ano ou só ano).
function mesInicialCoberto(dataDe) {
    return !dataDe || !dataDe.dia || dataDe.dia === 1;
}

// Verifica se o mês final do filtro está totalmente coberto
// (filtro termina no último dia do mês, ou não tem dia).
function mesFinalCoberto(dataAte) {
    if (!dataAte || !dataAte.dia) return true;
    if (!dataAte.mes || !dataAte.ano) return true;
    return dataAte.dia >= ultimoDiaDoMes(dataAte.mes, dataAte.ano);
}

// Compara a dataEscrita de um item com o intervalo [dataDe, dataAte].
// Retorna true se o item está dentro do intervalo, respeitando
// a lógica de meses do meio sempre cobertos.
function dataEstaNoIntervalo(dataItem, dataDe, dataAte) {
    // Sem filtro de data → passa tudo
    if (!dataDe && !dataAte) return true;
    // Item sem nenhuma data → não passa filtro de data
    if (!dataItem || !dataItem.ano) return false;

    const precFiltro = Math.max(precisaoFiltro(dataDe), precisaoFiltro(dataAte));
    const precItem   = dataItem.dia ? 3 : dataItem.mes ? 2 : 1;

    // Se o filtro tem mais precisão que o item, só inclui se o mês
    // do item for "mês do meio" (totalmente coberto pelos dois extremos).
    if (precItem < precFiltro) {
        // Mês+ano do item como número: anoMes = ano*100 + mes (ou ano*100 se sem mês)
        const itemMes = dataItem.mes || 0;
        const itemAnoMes = dataItem.ano * 100 + itemMes;

        const deMes  = dataDe  ? (dataDe.ano  * 100 + (dataDe.mes  || 1))  : -Infinity;
        const ateMes = dataAte ? (dataAte.ano * 100 + (dataAte.mes || 12)) : Infinity;

        // Mês do meio: estritamente entre as pontas
        const ehMeioEstrito = itemAnoMes > deMes && itemAnoMes < ateMes;
        if (ehMeioEstrito) return true;

        // Ponta inicial: só inclui se o mês inicial estiver totalmente coberto
        if (itemAnoMes === deMes && mesInicialCoberto(dataDe)) return true;

        // Ponta final: só inclui se o mês final estiver totalmente coberto
        if (itemAnoMes === ateMes && mesFinalCoberto(dataAte)) return true;

        return false;
    }

    // Item tem precisão suficiente: comparação numérica direta
    const itemNum = dataParaNumero(dataItem, true);
    const deNum   = dataParaNumero(dataDe,   true);
    const ateNum  = dataParaNumero(dataAte,  false);

    return itemNum >= deNum && itemNum <= ateNum;
}

function correspondeFiltro(item, opcoes) {
    if (opcoes.livrosIncluir.length) {
        const livroId = livroIdDoItem(item, db);
        if (!livroId || !opcoes.livrosIncluir.includes(String(livroId))) return false;
    }
    if (opcoes.pessoasIncluir.length) {
        const pessoasItem = listaDeCampo(item.pessoas);
        if (!opcoes.pessoasIncluir.some(p => pessoasItem.includes(p))) return false;
    }
    if (opcoes.temasIncluir.length) {
        const temasItem = listaDeCampo(item.sinalizacoes);
        if (!opcoes.temasIncluir.some(t => temasItem.includes(t))) return false;
    }
    if (opcoes.temasExcluir.length) {
        const temasItem = listaDeCampo(item.sinalizacoes);
        if (opcoes.temasExcluir.some(t => temasItem.includes(t))) return false;
    }
    if (!dataEstaNoIntervalo(item.dataEscrita, opcoes.dataDe, opcoes.dataAte)) return false;
    if (opcoes.status === 'publicados' && !item.publicado) return false;
    if (opcoes.status === 'rascunhos'  &&  item.publicado) return false;
    return true;
}

// Acha a qual Livro um Poema/Prosa pertence, em qualquer dos 3 níveis
function livroIdDoItem(item, db) {
    if (item.paiTipo === 'livro') return item.paiId;
    if (item.paiTipo === 'parte') {
        const p = db.partes.find(x => x.id == item.paiId);
        return p ? p.livroId : null;
    }
    if (item.paiTipo === 'secao') {
        const s = db.secoes.find(x => x.id == item.paiId);
        if (!s) return null;
        if (s.paiTipo === 'parte') {
            const p = db.partes.find(x => x.id == s.paiId);
            return p ? p.livroId : null;
        }
        return s.paiId;
    }
    return null;
}

// Resolve o contexto (títulos de Livro/Parte/Seção) de um item,
// pra que cada registro exportado seja autoexplicativo por si só.
function resolverContexto(item) {
    let livro = null, parte = null, secao = null;

    if (item.paiTipo === 'livro') {
        livro = db.livros.find(l => l.id == item.paiId);
    } else if (item.paiTipo === 'parte') {
        parte = db.partes.find(p => p.id == item.paiId);
        if (parte) livro = db.livros.find(l => l.id == parte.livroId);
    } else if (item.paiTipo === 'secao') {
        secao = db.secoes.find(s => s.id == item.paiId);
        if (secao) {
            if (secao.paiTipo === 'parte') {
                parte = db.partes.find(p => p.id == secao.paiId);
                if (parte) livro = db.livros.find(l => l.id == parte.livroId);
            } else {
                livro = db.livros.find(l => l.id == secao.paiId);
            }
        }
    }

    return {
        livro: livro?.titulo || null,
        parte: parte?.titulo || null,
        secao: secao?.titulo || null
    };
}

function montarRegistro(tipo, item) {
    return {
        tipo,
        id: item.id,
        titulo: item.titulo,
        texto: item.texto,
        ano: item.ano || null,
        dataEscrita: item.dataEscrita || null,
        dataPublicacao: item.dataPublicacao || null,
        sinalizacoes: item.sinalizacoes || '',
        pessoas: item.pessoas || '',
        publicado: !!item.publicado,
        contexto: resolverContexto(item)
    };
}

export function gerarExportacaoFiltrada(opcoes) {
    const itens = [];
    if (opcoes.tipos.includes('poema')) {
        db.poemas.filter(p => correspondeFiltro(p, opcoes)).forEach(p => itens.push(montarRegistro('poema', p)));
    }
    if (opcoes.tipos.includes('prosa')) {
        db.prosas.filter(p => correspondeFiltro(p, opcoes)).forEach(p => itens.push(montarRegistro('prosa', p)));
    }

    // Coletâneas selecionadas entram com o conteúdo completo já resolvido
    // (sem passar pelos filtros de ano/pessoa/tema acima — são incluídas inteiras).
    // Usa exportarColetaneaResolvida (de coletaneas.js), que monta Partes + Itens
    // (db.itensColetanea) com cada item já resolvido pro texto original (refId)
    // ou pro texto exclusivo (textoOverride) — é o mesmo modelo de dados que a
    // aba Coletâneas usa, diferente da árvore Livro→Parte→Seção→Poema normal.
    const coletaneas = (opcoes.coletaneasIncluir || [])
        .map(colId => exportarColetaneaResolvida(colId))
        .filter(Boolean);

    return { itens, coletaneas };
}

export function previsualizarExportacaoFiltrada() {
    const opcoes = lerFiltrosDoFormulario();
    const { itens, coletaneas } = gerarExportacaoFiltrada(opcoes);
    const span = document.getElementById('exp-resultado');
    if (span) {
        span.innerText = `${itens.length} poema(s)/prosa(s)` +
            (coletaneas.length ? ` + ${coletaneas.length} coletânea(s)` : '') + ' encontrado(s).';
    }
}

export function executarExportacaoFiltrada() {
    const opcoes = lerFiltrosDoFormulario();
    const { itens, coletaneas } = gerarExportacaoFiltrada(opcoes);

    if (itens.length === 0 && coletaneas.length === 0) {
        const span = document.getElementById('exp-resultado');
        if (span) span.innerText = 'Nenhum item encontrado com esses filtros — nada pra baixar.';
        return;
    }

    const saida = { itens, coletaneas };
    const blob = new Blob([JSON.stringify(saida, null, 4)], { type: 'application/json;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `exportacao_filtrada_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);

    const span = document.getElementById('exp-resultado');
    if (span) {
        span.innerText = `${itens.length} item(ns) + ${coletaneas.length} coletânea(s) exportado(s).`;
    }
}

// Mantém os checkboxes de Livros/Coletâneas atualizados conforme o banco muda
window.addEventListener('db:saved', popularSelecaoExportacao);

// ─── Exportar Tudo Aninhado (absorvido do encadeia.html) ─────────────────────
// Gera a mesma estrutura profunda (Livro → Parte → Seção → Poema) que o
// encadeia.html produzia, mas sem precisar sair do app principal.
export function exportarTudoAninhado() {
    Promise.all([import('./nesting.js'), import('./coletaneas.js')])
        .then(([{ buildNesting }, { exportarColetaneaResolvida }]) => {
            const nesting = buildNesting(db);

            // Coletâneas vivem em db.livros (tipo === 'Coletânea'), com Partes
            // (db.partes) e Itens (db.itensColetanea) — não em db.coletaneas
            // (campo legado, nunca preenchido pela aba Coletâneas atual).
            const coletaneas = db.livros
                .filter(l => l.tipo === 'Coletânea')
                .map(col => exportarColetaneaResolvida(col.id))
                .filter(Boolean);

            const saida = { ...nesting, coletaneas };

            const blob = new Blob([JSON.stringify(saida, null, 4)], { type: 'application/json;charset=utf-8' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `arquivo_poetico_aninhado_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);

            const span = document.getElementById('exp-resultado');
            if (span) {
                const totalTextos = (db.poemas?.length || 0) + (db.prosas?.length || 0);
                span.innerText = `Estrutura completa aninhada exportada (${db.livros?.length || 0} livro(s), ${totalTextos} texto(s)).`;
            }
        });
}
