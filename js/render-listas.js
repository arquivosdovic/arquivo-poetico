// ============================================================
// render-listas.js — Renderização das abas em lista/grid/tabela:
// Livros, Partes, Seções, Poemas e Prosas (ambas com seleção
// múltipla e ações em massa) e Elementos.
//
// Extraído de render.js — ver render-estrutura.js (árvore da aba
// "Estrutura") e render-lightbox.js (capas + lightbox, usado aqui
// via preencherCapas).
// ============================================================

import { db, save, deleteItemsEmMassa } from './db.js';
import {
    getElementHierarchy,
    getPosicaoElemento,
    filtrarTextos,
    filtrarPorConteudo,
    formatarDataParcial,
    escapeHtml,
    sanitizarTextoRico,
    abrirModalConfirmacao,
    itemBateFiltroData,
    filtroDataVazio,
    itemFaltaDataParaFiltro,
    parseFiltroDataRapido,
} from './utils.js';
import { preencherCapas } from './render-lightbox.js';
import { DEFINICAO_COLUNAS, getColunasAtivas, renderSeletorColunas } from './colunas.js';

// Sempre que uma coluna é ligada/desligada (ver colunas.js) a tabela
// correspondente precisa recalcular cabeçalho + linhas.
window.addEventListener('colunas:alteradas', (ev) => {
    if (ev.detail?.tabela === 'poemas') renderPoemas();
    if (ev.detail?.tabela === 'prosas') renderProsas();
});

// Ícones dos botões Editar/Excluir dos cards e tabelas abaixo. Ficam como
// string pronta (em vez de gerar via DOM) porque entram direto nas
// template strings dos cards, junto com o resto do HTML.
const ICONE_EDITAR = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 inline-block" aria-hidden="true"><path d="M12.5 3.5l4 4L6.5 17.5H2.5v-4L12.5 3.5Z"/><path d="M10.5 5.5l4 4"/></svg>`;
const ICONE_EXCLUIR = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 inline-block" aria-hidden="true"><path d="M4 6h12"/><path d="M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6"/><path d="M5.5 6l.6 9.5a1.5 1.5 0 0 0 1.5 1.4h4.8a1.5 1.5 0 0 0 1.5-1.4L14.5 6"/><path d="M8.5 9v5"/><path d="M11.5 9v5"/></svg>`;

let filtroPoemas = '';
let filtroProsas = '';
let filtroConteudoPoemas = '';
let filtroConteudoProsas = '';
let combinadorBuscaPoemas = 'e'; // 'e' (precisa bater nos dois campos) ou 'ou' (basta um)
let combinadorBuscaProsas = 'e';
let filtroLivroProsa = '';
let filtroLivroPoemas = '';

// Filtros de faixa de data (De/Até), independentes da busca por texto —
// ver itemBateFiltroData em utils.js pra semântica de sobreposição de
// faixas com datas parciais.
let filtroDataEscritaPoemas = filtroDataVazio();
let filtroDataPublicacaoPoemas = filtroDataVazio();
let filtroDataEscritaProsas = filtroDataVazio();
let filtroDataPublicacaoProsas = filtroDataVazio();
let ordenacaoPoemas = 'padrao';
let statusPoemas = 'todos';
let selecaoPoemas = new Set();
let selecaoProsas = new Set();
let filtroLivroPartes = '';
let filtroLivroSecoes = '';
let filtroParteSecoes = '';
let filtroLivroElementos = '';

// ─── Paginação (Poemas e Prosas) ────────────────────────────────
// "Itens por página" é uma preferência única, compartilhada entre as
// duas abas (persistida no navegador) — cada aba mantém sua própria
// página atual, já que dependem de filtros diferentes.
const LS_KEY_ITENS_POR_PAGINA = 'arquivoPoetico_itensPorPagina';
const OPCOES_ITENS_POR_PAGINA = [25, 50, 100, 200];

function lerItensPorPaginaSalvo() {
    const bruto = localStorage.getItem(LS_KEY_ITENS_POR_PAGINA);
    if (bruto === 'todos') return Infinity;
    const n = parseInt(bruto);
    return OPCOES_ITENS_POR_PAGINA.includes(n) ? n : 50;
}

let itensPorPagina = lerItensPorPaginaSalvo();
let paginaPoemas = 1;
let paginaProsas = 1;

// Quantos itens ficaram de fora da lista atual só por não terem a data
// cadastrada que o filtro de data (ativo) precisaria pra avaliar —
// distinto de estarem fora da faixa pedida. Atualizado a cada
// getListaVisivelPoemas()/getListaVisivelProsas() e lido por
// renderPoemas()/renderProsas() pra exibir o aviso na tela.
let semDataPoemas = 0;
let semDataProsas = 0;

export function setFiltroLivroPartes(valor) {
    filtroLivroPartes = valor;
    renderPartes();
}

export function setFiltroLivroSecoes(valor) {
    filtroLivroSecoes = valor;
    filtroParteSecoes = ''; // muda o livro, reseta o filtro de parte
    popularFiltroParteSecoes();
    renderSecoes();
}

export function setFiltroParteSecoes(valor) {
    filtroParteSecoes = valor;
    renderSecoes();
}

export function setFiltroLivroElementos(valor) {
    filtroLivroElementos = valor;
    renderElementos();
}

function popularFiltroLivro(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const valorAtual = sel.value;
    // Coletâneas excluídas: Partes, Seções, Elementos e Prosas pertencem
    // à hierarquia editorial, não à estrutura de curadoria das coletâneas.
    sel.innerHTML =
        '<option value="">-- Todos os livros --</option>' +
        db.livros
            .filter((l) => l.tipo !== 'Coletânea')
            .map((l) => `<option value="${l.id}">${escapeHtml(l.titulo)}</option>`)
            .join('');
    if (Array.from(sel.options).some((o) => o.value === valorAtual)) sel.value = valorAtual;
}

function popularFiltroParteSecoes() {
    const sel = document.getElementById('filtro-parte-secoes');
    if (!sel) return;
    const partes = filtroLivroSecoes
        ? db.partes.filter((p) => String(p.livroId) === String(filtroLivroSecoes))
        : db.partes;
    sel.innerHTML =
        '<option value="">-- Todas as partes --</option>' +
        partes.map((p) => `<option value="${p.id}">${escapeHtml(p.titulo)}</option>`).join('');
}

// Acha a qual Livro uma Seção pertence (direta ou via Parte)
function livroDaSecao(secao) {
    if (!secao) return null;
    if (secao.paiTipo === 'livro') return secao.paiId;
    const parte = db.partes.find((p) => p.id == secao.paiId);
    return parte ? parte.livroId : null;
}

// Acha a qual Livro um Elemento pertence, em qualquer dos 3 níveis
function livroDoElemento(el) {
    if (el.paiTipo === 'livro') return el.paiId;
    if (el.paiTipo === 'parte') {
        const p = db.partes.find((x) => x.id == el.paiId);
        return p ? p.livroId : null;
    }
    if (el.paiTipo === 'secao') {
        const s = db.secoes.find((x) => x.id == el.paiId);
        return s ? livroDaSecao(s) : null;
    }
    return null;
}

// Alias para prosas (mesma lógica)
const livroDaProsa = livroDoElemento;

// Resolve o livroId de um poema (direto, via parte ou via seção)
function livroDoPoema(p) {
    if (!p.paiTipo || !p.paiId) return null;
    if (p.paiTipo === 'livro') return p.paiId;
    if (p.paiTipo === 'parte') {
        const parte = db.partes.find((x) => x.id == p.paiId);
        return parte ? parte.livroId : null;
    }
    if (p.paiTipo === 'secao') {
        const s = db.secoes.find((x) => x.id == p.paiId);
        if (!s) return null;
        if (s.paiTipo === 'parte') {
            const pt = db.partes.find((x) => x.id == s.paiId);
            return pt ? pt.livroId : null;
        }
        return s.paiId;
    }
    return null;
}

// Combina o resultado da busca por metadados (filtrarTextos) com o da
// busca por conteúdo (filtrarPorConteudo). Só quando os dois campos têm
// algo digitado é que o combinador ('e' ou 'ou') realmente entra em jogo;
// com um só preenchido, o resultado é simplesmente o desse campo.
function combinarFiltrosBusca(decorada, filtroMeta, filtroConteudo, combinador) {
    const usaMeta = !!(filtroMeta && filtroMeta.trim());
    const usaConteudo = !!(filtroConteudo && filtroConteudo.trim());
    if (!usaMeta && !usaConteudo) return decorada;

    const idsMeta = usaMeta ? new Set(filtrarTextos(decorada, filtroMeta).map((p) => p.id)) : null;
    const idsConteudo = usaConteudo
        ? new Set(filtrarPorConteudo(decorada, filtroConteudo).map((p) => p.id))
        : null;

    return decorada.filter((p) => {
        if (usaMeta && usaConteudo) {
            const bateMeta = idsMeta.has(p.id);
            const bateConteudo = idsConteudo.has(p.id);
            return combinador === 'ou' ? bateMeta || bateConteudo : bateMeta && bateConteudo;
        }
        return usaMeta ? idsMeta.has(p.id) : idsConteudo.has(p.id);
    });
}

export function setFiltroPoemas(valor) {
    filtroPoemas = valor;
    paginaPoemas = 1;
    renderPoemas();
}

export function setFiltroProsas(valor) {
    filtroProsas = valor;
    paginaProsas = 1;
    renderProsas();
}

export function setFiltroConteudoPoemas(valor) {
    filtroConteudoPoemas = valor;
    paginaPoemas = 1;
    renderPoemas();
}

export function setFiltroConteudoProsas(valor) {
    filtroConteudoProsas = valor;
    paginaProsas = 1;
    renderProsas();
}

// Alterna entre 'e' (precisa bater nos dois campos de busca) e 'ou' (basta
// bater em um deles) — só faz diferença quando os dois campos têm algo
// digitado; com um só preenchido o resultado é o mesmo nos dois modos.
export function setCombinadorBuscaPoemas(valor) {
    combinadorBuscaPoemas = valor === 'ou' ? 'ou' : 'e';
    paginaPoemas = 1;
    renderPoemas();
}

export function setCombinadorBuscaProsas(valor) {
    combinadorBuscaProsas = valor === 'ou' ? 'ou' : 'e';
    paginaProsas = 1;
    renderProsas();
}

export function getCombinadorBuscaPoemas() {
    return combinadorBuscaPoemas;
}

export function getCombinadorBuscaProsas() {
    return combinadorBuscaProsas;
}

export function setFiltroLivroProsa(valor) {
    filtroLivroProsa = valor;
    paginaProsas = 1;
    renderProsas();
}

export function setFiltroLivroPoemas(valor) {
    filtroLivroPoemas = valor;
    paginaPoemas = 1;
    renderPoemas();
}

export function setOrdenacaoPoemas(valor) {
    ordenacaoPoemas = valor;
    paginaPoemas = 1;
    renderPoemas();
}

export function setStatusPoemas(valor) {
    statusPoemas = valor;
    paginaPoemas = 1;
    renderPoemas();
}

// Chamado pelo <select> de "itens por página" — vale pra Poemas e Prosas
// ao mesmo tempo, já que é uma preferência única.
export function setItensPorPagina(valor) {
    itensPorPagina = valor === 'todos' ? Infinity : parseInt(valor);
    localStorage.setItem(LS_KEY_ITENS_POR_PAGINA, valor);
    paginaPoemas = 1;
    paginaProsas = 1;
    renderPoemas();
    renderProsas();
}

export function setPaginaPoemas(pagina) {
    paginaPoemas = pagina;
    renderPoemas();
}

export function setPaginaProsas(pagina) {
    paginaProsas = pagina;
    renderProsas();
}

// ─── Filtros de faixa de data (Escrita / Publicação) ───────────
// ladoFaixa: 'de' | 'ate' — parte: 'dia' | 'mes' | 'ano'
// Campo vazio remove a restrição daquela parte (não trava em 0).
function aplicarValorFiltroData(filtro, ladoFaixa, parte, valor) {
    const n = parseInt(valor);
    if (valor === '' || valor == null || isNaN(n)) delete filtro[ladoFaixa][parte];
    else filtro[ladoFaixa][parte] = n;
}

export function setFiltroDataEscritaPoemas(ladoFaixa, parte, valor) {
    aplicarValorFiltroData(filtroDataEscritaPoemas, ladoFaixa, parte, valor);
    paginaPoemas = 1;
    renderPoemas();
}

export function setFiltroDataPublicacaoPoemas(ladoFaixa, parte, valor) {
    aplicarValorFiltroData(filtroDataPublicacaoPoemas, ladoFaixa, parte, valor);
    paginaPoemas = 1;
    renderPoemas();
}

export function setFiltroDataEscritaProsas(ladoFaixa, parte, valor) {
    aplicarValorFiltroData(filtroDataEscritaProsas, ladoFaixa, parte, valor);
    paginaProsas = 1;
    renderProsas();
}

export function setFiltroDataPublicacaoProsas(ladoFaixa, parte, valor) {
    aplicarValorFiltroData(filtroDataPublicacaoProsas, ladoFaixa, parte, valor);
    paginaProsas = 1;
    renderProsas();
}

// ─── Atalho de digitação (ver parseFiltroDataRapido em utils.js) ──────
// Cada função abaixo corresponde a um dos 4 painéis de filtro de data
// já existentes (Poemas/Prosas × Escrita/Publicação). Texto não
// reconhecido não faz nada — não some com o que já estava filtrado.

export function setFiltroDataRapidoPoemasEscrita(valor) {
    const resultado = parseFiltroDataRapido(valor);
    if (resultado === null) return;
    filtroDataEscritaPoemas = resultado;
    preencherCamposDataNaTela('filtro-pd-esc', resultado);
    paginaPoemas = 1;
    renderPoemas();
}

export function setFiltroDataRapidoPoemasPublicacao(valor) {
    const resultado = parseFiltroDataRapido(valor);
    if (resultado === null) return;
    filtroDataPublicacaoPoemas = resultado;
    preencherCamposDataNaTela('filtro-pd-pub', resultado);
    paginaPoemas = 1;
    renderPoemas();
}

export function setFiltroDataRapidoProsasEscrita(valor) {
    const resultado = parseFiltroDataRapido(valor);
    if (resultado === null) return;
    filtroDataEscritaProsas = resultado;
    preencherCamposDataNaTela('filtro-prd-esc', resultado);
    paginaProsas = 1;
    renderProsas();
}

export function setFiltroDataRapidoProsasPublicacao(valor) {
    const resultado = parseFiltroDataRapido(valor);
    if (resultado === null) return;
    filtroDataPublicacaoProsas = resultado;
    preencherCamposDataNaTela('filtro-prd-pub', resultado);
    paginaProsas = 1;
    renderProsas();
}

// Limpa os inputs de dia/mes/ano de um painel de filtro de data em tela
// (não mexe no estado — quem chama já reseta o objeto de filtro).
function limparCamposDataNaTela(prefixo) {
    ['de', 'ate'].forEach((ladoFaixa) => {
        ['dia', 'mes', 'ano'].forEach((parte) => {
            const el = document.getElementById(`${prefixo}-${ladoFaixa}-${parte}`);
            if (el) el.value = '';
        });
    });
}

// Preenche os inputs de dia/mes/ano de um painel de filtro de data em
// tela a partir de um objeto { de: {...}, ate: {...} } — usado pelo
// atalho de digitação (setFiltroDataRapido*) pra manter os campos
// avançados sincronizados com o que foi digitado, caso a pessoa abra o
// painel pra conferir ou ajustar manualmente depois.
function preencherCamposDataNaTela(prefixo, filtro) {
    ['de', 'ate'].forEach((ladoFaixa) => {
        ['dia', 'mes', 'ano'].forEach((parte) => {
            const el = document.getElementById(`${prefixo}-${ladoFaixa}-${parte}`);
            if (el) el.value = filtro[ladoFaixa][parte] ?? '';
        });
    });
}

// Mostra/esconde o avisinho de "N item(ns) fora só por falta de data"
// ao lado do botão "Filtrar por data" — fica visível mesmo com o painel
// de filtro recolhido, já que é justamente um alerta sobre um filtro
// que pode estar ativo sem estar visível na tela.
function atualizarAvisoSemData(elId, quantidade) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (quantidade > 0) {
        const item = quantidade === 1 ? 'item' : 'itens';
        const verbo = quantidade === 1 ? 'ficou' : 'ficaram';
        el.textContent = `⚠️ ${quantidade} ${item} ${verbo} de fora só por falta de data cadastrada`;
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}

export function limparFiltroDataPoemas() {
    filtroDataEscritaPoemas = filtroDataVazio();
    filtroDataPublicacaoPoemas = filtroDataVazio();
    limparCamposDataNaTela('filtro-pd-esc');
    limparCamposDataNaTela('filtro-pd-pub');
    ['filtro-pd-esc-rapido', 'filtro-pd-pub-rapido'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    paginaPoemas = 1;
    renderPoemas();
}

export function limparFiltroDataProsas() {
    filtroDataEscritaProsas = filtroDataVazio();
    filtroDataPublicacaoProsas = filtroDataVazio();
    limparCamposDataNaTela('filtro-prd-esc');
    limparCamposDataNaTela('filtro-prd-pub');
    ['filtro-prd-esc-rapido', 'filtro-prd-pub-rapido'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    paginaProsas = 1;
    renderProsas();
}

// Retorna os títulos dos livros vinculados a um poema (via livrosIds)
function nomesLivros(p) {
    return (p.livrosIds || [])
        .map((id) => db.livros.find((l) => l.id == id)?.titulo)
        .filter(Boolean)
        .join(', ');
}

// Deriva, a partir do vínculo estrutural do item (paiTipo/paiId), os
// campos auxiliares usados pelo filtro por atributo "livro:"/"parte:"/
// "secao:" em filtrarTextos (utils.js). extraLivros é usado só pra
// Poemas, que também podem estar vinculados a outros livros/coletâneas
// via livrosIds (ver nomesLivros acima).
function decorarCamposBusca(item, extraLivros = '') {
    let livroTitulo = '',
        parteTitulo = '',
        secaoTitulo = '';

    if (item.paiTipo === 'livro') {
        livroTitulo = db.livros.find((l) => l.id == item.paiId)?.titulo || '';
    } else if (item.paiTipo === 'parte') {
        const parte = db.partes.find((p) => p.id == item.paiId);
        parteTitulo = parte?.titulo || '';
        if (parte) livroTitulo = db.livros.find((l) => l.id == parte.livroId)?.titulo || '';
    } else if (item.paiTipo === 'secao') {
        const secao = db.secoes.find((s) => s.id == item.paiId);
        secaoTitulo = secao?.titulo || '';
        if (secao?.paiTipo === 'parte') {
            const parte = db.partes.find((p) => p.id == secao.paiId);
            parteTitulo = parte?.titulo || '';
            if (parte) livroTitulo = db.livros.find((l) => l.id == parte.livroId)?.titulo || '';
        } else if (secao) {
            livroTitulo = db.livros.find((l) => l.id == secao.paiId)?.titulo || '';
        }
    }

    return {
        ...item,
        _buscaLivro: [livroTitulo, extraLivros].filter(Boolean).join(' '),
        _buscaParte: parteTitulo,
        _buscaSecao: secaoTitulo,
    };
}

// ─── Colunas dinâmicas de Poemas/Prosas ────────────────────────

// Badges de etiqueta (reaproveitado nas colunas opcionais "Etiquetas" e
// "Gênero" — mesma lógica de string "a, b, c" → chips, cor customizável).
function badgesEtiquetas(
    sinalizacoes,
    corClasse = 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400',
) {
    if (!sinalizacoes) return '<span class="text-gray-300 dark:text-slate-600">—</span>';
    return (
        sinalizacoes
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .map(
                (t) =>
                    `<span class="text-[9px] ${corClasse} px-1.5 py-0.5 rounded mr-1 mb-1 inline-block">${escapeHtml(t)}</span>`,
            )
            .join('') || '<span class="text-gray-300 dark:text-slate-600">—</span>'
    );
}

// Títulos dos poemas referenciados por uma lista de IDs (Elos/Referências)
function titulosPoemasPorId(ids) {
    if (!ids || !ids.length) return '<span class="text-gray-300 dark:text-slate-600">—</span>';
    const titulos = ids.map((id) => db.poemas.find((p) => p.id == id)?.titulo).filter(Boolean);
    if (!titulos.length) return '<span class="text-gray-300 dark:text-slate-600">—</span>';
    return titulos.map((t) => escapeHtml(t)).join(', ');
}

function trechoNota(notas) {
    if (!notas) return '<span class="text-gray-300 dark:text-slate-600">—</span>';
    const limpo = notas.trim();
    const trecho = limpo.length > 80 ? limpo.slice(0, 80) + '…' : limpo;
    return `<span title="${escapeHtml(limpo)}">${escapeHtml(trecho)}</span>`;
}

// Monta o <thead> de Poemas ou Prosas de acordo com as colunas ativas.
// `celulaCheck`/`celulaTitulo`/`celulaAcoes` são o HTML fixo de início/fim
// (checkbox, título e Ações), que não passam pelo seletor de colunas.
// Monta a barra de paginação (itens por página + Anterior/Próxima) exibida
// abaixo da tabela. totalItens é o total já filtrado (não só o da página).
function montarPaginacao(totalItens, paginaAtual, acaoPagina) {
    if (totalItens === 0) return '';

    const porPagina = itensPorPagina === Infinity ? totalItens : itensPorPagina;
    const totalPaginas =
        itensPorPagina === Infinity ? 1 : Math.max(1, Math.ceil(totalItens / itensPorPagina));
    const inicio = (paginaAtual - 1) * porPagina + 1;
    const fim = Math.min(paginaAtual * porPagina, totalItens);

    const seletor = `
        <label class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
            Itens por página:
            <select onchange="setItensPorPagina(this.value)"
                class="border border-gray-300 dark:border-slate-600 dark:bg-slate-800 rounded px-1.5 py-1 text-xs">
                ${OPCOES_ITENS_POR_PAGINA.map((n) => `<option value="${n}" ${itensPorPagina === n ? 'selected' : ''}>${n}</option>`).join('')}
                <option value="todos" ${itensPorPagina === Infinity ? 'selected' : ''}>Todos</option>
            </select>
        </label>`;

    const navegacao =
        totalPaginas > 1
            ? `
        <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
            <button data-action="${acaoPagina}" data-pagina="${paginaAtual - 1}" ${paginaAtual <= 1 ? 'disabled' : ''}
                class="px-2 py-1 border border-gray-300 dark:border-slate-600 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700">‹ Anterior</button>
            <span>Página ${paginaAtual} de ${totalPaginas}</span>
            <button data-action="${acaoPagina}" data-pagina="${paginaAtual + 1}" ${paginaAtual >= totalPaginas ? 'disabled' : ''}
                class="px-2 py-1 border border-gray-300 dark:border-slate-600 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700">Próxima ›</button>
        </div>`
            : '<span></span>';

    return `
        <div class="flex flex-wrap items-center justify-between gap-3 mt-3 px-1">
            ${seletor}
            <span class="text-xs text-gray-400 dark:text-slate-500">${inicio}–${fim} de ${totalItens}</span>
            ${navegacao}
        </div>`;
}

function montarCabecalho(tabela, celulaCheck, celulaTitulo, celulaAcoes) {
    const ativas = getColunasAtivas(tabela);
    const def = DEFINICAO_COLUNAS[tabela];
    const meio = ativas
        .map((key) => def.find((c) => c.key === key))
        .filter(Boolean)
        .map(
            (c) => `<th class="p-4 border-b border-gray-200 dark:border-slate-700">${c.label}</th>`,
        )
        .join('');
    return celulaCheck + celulaTitulo + meio + celulaAcoes;
}

function atualizarPainelColunas(tabela, painelId) {
    const painel = document.getElementById(painelId);
    if (painel) painel.innerHTML = renderSeletorColunas(tabela);
}

// ─── Seleção múltipla de Poemas (ações em massa) ──────────────

// Retorna a lista de poemas atualmente visível, já com status, busca
// (incluindo nomes de livros) e ordenação aplicados — usada tanto pela
// renderização quanto pela seleção em massa, pra ficarem sempre coerentes.
function getListaVisivelPoemas() {
    let base = db.poemas;
    if (statusPoemas === 'publicados') base = base.filter((p) => p.publicado);
    else if (statusPoemas === 'rascunhos') base = base.filter((p) => !p.publicado);

    if (filtroLivroPoemas) {
        const livroSel = db.livros.find((l) => String(l.id) === String(filtroLivroPoemas));
        if (livroSel?.tipo === 'Coletânea') {
            // Poemas numa coletânea vivem em itensColetanea (via refId), não em paiId
            const partesIds = new Set(
                db.partes
                    .filter((p) => String(p.livroId) === String(filtroLivroPoemas))
                    .map((p) => String(p.id)),
            );
            const refIds = new Set(
                (db.itensColetanea || [])
                    .filter(
                        (i) => partesIds.has(String(i.parteId)) && i.refTipo === 'poema' && i.refId,
                    )
                    .map((i) => String(i.refId)),
            );
            base = base.filter((p) => refIds.has(String(p.id)));
        } else {
            base = base.filter((p) => String(livroDoPoema(p)) === String(filtroLivroPoemas));
        }
    }

    const decorada = base.map((p) => {
        const _livros = nomesLivros(p);
        return decorarCamposBusca({ ...p, _livros }, _livros);
    });
    let lista = combinarFiltrosBusca(
        decorada,
        filtroPoemas,
        filtroConteudoPoemas,
        combinadorBuscaPoemas,
    );

    semDataPoemas = lista.filter(
        (p) =>
            itemFaltaDataParaFiltro(p.dataEscrita, filtroDataEscritaPoemas) ||
            itemFaltaDataParaFiltro(p.dataPublicacao, filtroDataPublicacaoPoemas),
    ).length;

    lista = lista.filter(
        (p) =>
            itemBateFiltroData(p.dataEscrita, filtroDataEscritaPoemas) &&
            itemBateFiltroData(p.dataPublicacao, filtroDataPublicacaoPoemas),
    );

    if (ordenacaoPoemas === 'data-esc-desc' || ordenacaoPoemas === 'data-esc-asc') {
        const asc = ordenacaoPoemas === 'data-esc-asc';
        lista = [...lista].sort((a, b) => {
            const da = a.dataEscrita,
                db_ = b.dataEscrita;
            // Sem data vai pro fim independente da direção
            if (!da && !db_) return 0;
            if (!da) return 1;
            if (!db_) return -1;
            // Compara ano
            if (da.ano !== db_.ano) return asc ? da.ano - db_.ano : db_.ano - da.ano;
            // Mesmo ano: quem tem mês vem antes de quem não tem
            const mA = da.mes ?? Infinity,
                mB = db_.mes ?? Infinity;
            if (mA !== mB) return asc ? mA - mB : mB - mA;
            // Mesmo mês: quem tem dia vem antes de quem não tem
            const dA = da.dia ?? Infinity,
                dB = db_.dia ?? Infinity;
            if (dA !== dB) return asc ? dA - dB : dB - dA;
            return 0;
        });
    } else if (ordenacaoPoemas === 'titulo') {
        lista = [...lista].sort((a, b) => a.titulo.localeCompare(b.titulo));
    }
    return lista;
}

export function toggleSelecaoPoema(checked, id) {
    if (checked) selecaoPoemas.add(id);
    else selecaoPoemas.delete(id);
    atualizarBarraSelecao();
}

export function toggleSelecaoTodosPoemas(checked) {
    const visiveis = getListaVisivelPoemas().map((p) => p.id);
    if (checked) visiveis.forEach((id) => selecaoPoemas.add(id));
    else visiveis.forEach((id) => selecaoPoemas.delete(id));
    renderPoemas();
}

export function limparSelecaoPoemas() {
    selecaoPoemas.clear();
    renderPoemas();
}

function atualizarBarraSelecao() {
    const barra = document.getElementById('barra-acoes-poemas');
    const contador = document.getElementById('contador-selecao-poemas');
    if (!barra) return;
    if (selecaoPoemas.size > 0) {
        barra.classList.remove('hidden');
        if (contador) contador.innerText = `${selecaoPoemas.size} selecionado(s)`;
    } else {
        barra.classList.add('hidden');
    }
}

function adicionarValorEmCampo(poema, campo, valorNovo) {
    const atuais = poema[campo]
        ? poema[campo]
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
        : [];
    if (!atuais.includes(valorNovo)) atuais.push(valorNovo);
    poema[campo] = atuais.join(', ');
}

function removerValorDeCampo(poema, campo, valor) {
    if (!poema[campo]) return;
    const atuais = poema[campo]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    poema[campo] = atuais.filter((v) => v !== valor).join(', ');
}

export function aplicarPessoaEmMassa() {
    const input = document.getElementById('bulk-pessoa-input');
    const nome = (input?.value || '').trim();
    if (!nome || selecaoPoemas.size === 0) return;

    const n = selecaoPoemas.size;
    abrirModalConfirmacao({
        titulo: `Dedicar a "${nome}"`,
        rotulo: 'Ação em massa',
        mensagem: `Isso vai adicionar "${nome}" aos dedicados de ${n} poema${n !== 1 ? 's' : ''} selecionado${n !== 1 ? 's' : ''}.`,
        textoConfirmar: 'Aplicar',
        corConfirmar: '#e11d48',
        onConfirmar: () => {
            db.poemas.forEach((p) => {
                if (selecaoPoemas.has(p.id)) adicionarValorEmCampo(p, 'pessoas', nome);
            });
            if (input) input.value = '';
            selecaoPoemas.clear();
            save(); // dispara re-render via evento db:saved
        },
    });
}

export function removerPessoaEmMassa() {
    const input = document.getElementById('bulk-pessoa-input');
    const nome = (input?.value || '').trim();
    if (!nome || selecaoPoemas.size === 0) return;

    const n = selecaoPoemas.size;
    abrirModalConfirmacao({
        titulo: `Remover "${nome}"`,
        rotulo: 'Ação em massa',
        mensagem: `Isso vai remover "${nome}" dos dedicados de ${n} poema${n !== 1 ? 's' : ''} selecionado${n !== 1 ? 's' : ''}.`,
        textoConfirmar: 'Remover',
        corConfirmar: '#dc2626',
        onConfirmar: () => {
            db.poemas.forEach((p) => {
                if (selecaoPoemas.has(p.id)) removerValorDeCampo(p, 'pessoas', nome);
            });
            if (input) input.value = '';
            selecaoPoemas.clear();
            save();
        },
    });
}

export function aplicarSinalEmMassa() {
    const input = document.getElementById('bulk-sinal-input');
    const tag = (input?.value || '').trim();
    if (!tag || selecaoPoemas.size === 0) return;

    const n = selecaoPoemas.size;
    abrirModalConfirmacao({
        titulo: `Marcar "${tag}"`,
        rotulo: 'Ação em massa',
        mensagem: `Isso vai adicionar a sinalização "${tag}" a ${n} poema${n !== 1 ? 's' : ''} selecionado${n !== 1 ? 's' : ''}.`,
        textoConfirmar: 'Aplicar',
        corConfirmar: '#2563eb',
        onConfirmar: () => {
            db.poemas.forEach((p) => {
                if (selecaoPoemas.has(p.id)) adicionarValorEmCampo(p, 'sinalizacoes', tag);
            });
            if (input) input.value = '';
            selecaoPoemas.clear();
            save();
        },
    });
}

export function removerSinalEmMassa() {
    const input = document.getElementById('bulk-sinal-input');
    const tag = (input?.value || '').trim();
    if (!tag || selecaoPoemas.size === 0) return;

    const n = selecaoPoemas.size;
    abrirModalConfirmacao({
        titulo: `Remover "${tag}"`,
        rotulo: 'Ação em massa',
        mensagem: `Isso vai remover a sinalização "${tag}" de ${n} poema${n !== 1 ? 's' : ''} selecionado${n !== 1 ? 's' : ''}.`,
        textoConfirmar: 'Remover',
        corConfirmar: '#dc2626',
        onConfirmar: () => {
            db.poemas.forEach((p) => {
                if (selecaoPoemas.has(p.id)) removerValorDeCampo(p, 'sinalizacoes', tag);
            });
            if (input) input.value = '';
            selecaoPoemas.clear();
            save();
        },
    });
}

// Exclusão em massa dos poemas selecionados. A remoção de fato (e o
// "Desfazer" com um único toast pro lote inteiro) fica em
// deleteItemsEmMassa (db.js) — aqui só confirma com a pessoa e limpa a
// seleção depois. Não precisa re-renderizar manualmente: deleteItemsEmMassa
// chama save(), que dispara 'db:saved' -> renderLists() -> renderPoemas(),
// que já esconde a barra de seleção sozinho (ver atualizarBarraSelecao()).
export function excluirSelecaoPoemas() {
    if (selecaoPoemas.size === 0) return;
    const n = selecaoPoemas.size;
    abrirModalConfirmacao({
        titulo: `Excluir ${n} poema${n !== 1 ? 's' : ''}`,
        rotulo: 'Ação em massa',
        mensagem: `Isso vai excluir ${n} poema${n !== 1 ? 's' : ''} selecionado${n !== 1 ? 's' : ''}. Vai aparecer um "Desfazer" logo em seguida, caso mude de ideia.`,
        textoConfirmar: 'Excluir',
        corConfirmar: '#dc2626',
        onConfirmar: () => {
            deleteItemsEmMassa('poemas', [...selecaoPoemas]);
            selecaoPoemas.clear();
        },
    });
}

// ─── Seleção múltipla de Prosas (ações em massa) ──────────────
// Mesma lógica da seleção de Poemas acima, adaptada pra Prosas.

// Retorna a lista de prosas atualmente visível (livro/coletânea +
// busca já aplicados) — usada tanto pela renderização quanto pela
// seleção em massa, pra ficarem sempre coerentes.
function getListaVisivelProsas() {
    let base = db.prosas;
    if (filtroLivroProsa) {
        const livroSel = db.livros.find((l) => String(l.id) === String(filtroLivroProsa));
        if (livroSel?.tipo === 'Coletânea') {
            // Prosas numa coletânea vivem em itensColetanea (via refId), não em paiId
            const partesIds = new Set(
                db.partes
                    .filter((p) => String(p.livroId) === String(filtroLivroProsa))
                    .map((p) => String(p.id)),
            );
            const refIds = new Set(
                (db.itensColetanea || [])
                    .filter(
                        (i) => partesIds.has(String(i.parteId)) && i.refTipo === 'prosa' && i.refId,
                    )
                    .map((i) => String(i.refId)),
            );
            base = base.filter((pr) => refIds.has(String(pr.id)));
        } else {
            base = base.filter((pr) => String(livroDaProsa(pr)) === String(filtroLivroProsa));
        }
    }
    const decorada = base.map((pr) => decorarCamposBusca(pr));
    let lista = combinarFiltrosBusca(
        decorada,
        filtroProsas,
        filtroConteudoProsas,
        combinadorBuscaProsas,
    );

    semDataProsas = lista.filter(
        (pr) =>
            itemFaltaDataParaFiltro(pr.dataEscrita, filtroDataEscritaProsas) ||
            itemFaltaDataParaFiltro(pr.dataPublicacao, filtroDataPublicacaoProsas),
    ).length;

    lista = lista.filter(
        (pr) =>
            itemBateFiltroData(pr.dataEscrita, filtroDataEscritaProsas) &&
            itemBateFiltroData(pr.dataPublicacao, filtroDataPublicacaoProsas),
    );
    return lista;
}

export function toggleSelecaoProsa(checked, id) {
    if (checked) selecaoProsas.add(id);
    else selecaoProsas.delete(id);
    atualizarBarraSelecaoProsas();
}

export function toggleSelecaoTodosProsas(checked) {
    const visiveis = getListaVisivelProsas().map((pr) => pr.id);
    if (checked) visiveis.forEach((id) => selecaoProsas.add(id));
    else visiveis.forEach((id) => selecaoProsas.delete(id));
    renderProsas();
}

export function limparSelecaoProsas() {
    selecaoProsas.clear();
    renderProsas();
}

function atualizarBarraSelecaoProsas() {
    const barra = document.getElementById('barra-acoes-prosas');
    const contador = document.getElementById('contador-selecao-prosas');
    if (!barra) return;
    if (selecaoProsas.size > 0) {
        barra.classList.remove('hidden');
        if (contador) contador.innerText = `${selecaoProsas.size} selecionada(s)`;
    } else {
        barra.classList.add('hidden');
    }
}

export function aplicarPessoaEmMassaProsa() {
    const input = document.getElementById('bulk-pessoa-input-prosa');
    const nome = (input?.value || '').trim();
    if (!nome || selecaoProsas.size === 0) return;

    const n = selecaoProsas.size;
    abrirModalConfirmacao({
        titulo: `Dedicar a "${nome}"`,
        rotulo: 'Ação em massa',
        mensagem: `Isso vai adicionar "${nome}" aos dedicados de ${n} prosa${n !== 1 ? 's' : ''} selecionada${n !== 1 ? 's' : ''}.`,
        textoConfirmar: 'Aplicar',
        corConfirmar: '#e11d48',
        onConfirmar: () => {
            db.prosas.forEach((pr) => {
                if (selecaoProsas.has(pr.id)) adicionarValorEmCampo(pr, 'pessoas', nome);
            });
            if (input) input.value = '';
            selecaoProsas.clear();
            save(); // dispara re-render via evento db:saved
        },
    });
}

export function removerPessoaEmMassaProsa() {
    const input = document.getElementById('bulk-pessoa-input-prosa');
    const nome = (input?.value || '').trim();
    if (!nome || selecaoProsas.size === 0) return;

    const n = selecaoProsas.size;
    abrirModalConfirmacao({
        titulo: `Remover "${nome}"`,
        rotulo: 'Ação em massa',
        mensagem: `Isso vai remover "${nome}" dos dedicados de ${n} prosa${n !== 1 ? 's' : ''} selecionada${n !== 1 ? 's' : ''}.`,
        textoConfirmar: 'Remover',
        corConfirmar: '#dc2626',
        onConfirmar: () => {
            db.prosas.forEach((pr) => {
                if (selecaoProsas.has(pr.id)) removerValorDeCampo(pr, 'pessoas', nome);
            });
            if (input) input.value = '';
            selecaoProsas.clear();
            save();
        },
    });
}

export function aplicarSinalEmMassaProsa() {
    const input = document.getElementById('bulk-sinal-input-prosa');
    const tag = (input?.value || '').trim();
    if (!tag || selecaoProsas.size === 0) return;

    const n = selecaoProsas.size;
    abrirModalConfirmacao({
        titulo: `Marcar "${tag}"`,
        rotulo: 'Ação em massa',
        mensagem: `Isso vai adicionar a sinalização "${tag}" a ${n} prosa${n !== 1 ? 's' : ''} selecionada${n !== 1 ? 's' : ''}.`,
        textoConfirmar: 'Aplicar',
        corConfirmar: '#2563eb',
        onConfirmar: () => {
            db.prosas.forEach((pr) => {
                if (selecaoProsas.has(pr.id)) adicionarValorEmCampo(pr, 'sinalizacoes', tag);
            });
            if (input) input.value = '';
            selecaoProsas.clear();
            save();
        },
    });
}

export function removerSinalEmMassaProsa() {
    const input = document.getElementById('bulk-sinal-input-prosa');
    const tag = (input?.value || '').trim();
    if (!tag || selecaoProsas.size === 0) return;

    const n = selecaoProsas.size;
    abrirModalConfirmacao({
        titulo: `Remover "${tag}"`,
        rotulo: 'Ação em massa',
        mensagem: `Isso vai remover a sinalização "${tag}" de ${n} prosa${n !== 1 ? 's' : ''} selecionada${n !== 1 ? 's' : ''}.`,
        textoConfirmar: 'Remover',
        corConfirmar: '#dc2626',
        onConfirmar: () => {
            db.prosas.forEach((pr) => {
                if (selecaoProsas.has(pr.id)) removerValorDeCampo(pr, 'sinalizacoes', tag);
            });
            if (input) input.value = '';
            selecaoProsas.clear();
            save();
        },
    });
}

// Equivalente de excluirSelecaoPoemas() pra prosas — ver os comentários lá.
export function excluirSelecaoProsas() {
    if (selecaoProsas.size === 0) return;
    const n = selecaoProsas.size;
    abrirModalConfirmacao({
        titulo: `Excluir ${n} prosa${n !== 1 ? 's' : ''}`,
        rotulo: 'Ação em massa',
        mensagem: `Isso vai excluir ${n} prosa${n !== 1 ? 's' : ''} selecionada${n !== 1 ? 's' : ''}. Vai aparecer um "Desfazer" logo em seguida, caso mude de ideia.`,
        textoConfirmar: 'Excluir',
        corConfirmar: '#dc2626',
        onConfirmar: () => {
            deleteItemsEmMassa('prosas', [...selecaoProsas]);
            selecaoProsas.clear();
        },
    });
}

// ─── Livros ──────────────────────────────────────────────────

// Troca a sequência do livro com a de seu vizinho (acima/abaixo na
// lista já ordenada) — mesmo padrão de moverItemEstrutura(), pra não
// ser preciso abrir o modal e digitar um número só pra reordenar.
export function moverLivro(id, direcao) {
    const ordenados = [...db.livros].sort(
        (a, b) => (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999),
    );
    const idx = ordenados.findIndex((l) => l.id == id);
    if (idx === -1) return;

    const alvoIdx = direcao === 'up' ? idx - 1 : idx + 1;
    if (alvoIdx < 0 || alvoIdx >= ordenados.length) return;

    const atual = ordenados[idx];
    const alvo = ordenados[alvoIdx];
    const seqAtual = atual.sequencia;
    atual.sequencia = alvo.sequencia;
    alvo.sequencia = seqAtual;

    save();
}

export function renderLivros() {
    const container = document.getElementById('lista-livros');
    if (!container) return;

    const ordenados = [...db.livros].sort(
        (a, b) => (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999),
    );

    if (ordenados.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center text-gray-400 dark:text-slate-500 text-sm py-6">Nenhum livro encontrado.</div>`;
        return;
    }

    container.innerHTML = ordenados
        .map(
            (l) => `
        <div class="bg-white dark:bg-slate-900 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
            ${
                l.capa
                    ? `<img data-capa-id="${l.capa}" src="" alt="Capa de ${escapeHtml(l.titulo)}" class="w-full h-32 object-cover rounded mb-4 opacity-0 transition-opacity duration-200">`
                    : `<div class="h-32 bg-gray-100 dark:bg-slate-700 rounded mb-4"></div>`
            }
            <div class="flex justify-between items-start">
                <h4 class="font-bold text-blue-800 dark:text-blue-200">${escapeHtml(l.titulo)}</h4>
                <span class="text-[10px] bg-blue-50 dark:bg-blue-950 text-blue-500 dark:text-blue-400 px-2 py-0.5 rounded font-mono">SEQ: ${l.sequencia || '0'}</span>
            </div>
            <p class="text-xs font-mono text-gray-500 dark:text-slate-400">${escapeHtml(l.siglaOficial) || '---'} | ${l.data ? (typeof l.data === 'string' ? l.data : formatarDataParcial(l.data)) : 'S/D'}</p>
            <div class="flex justify-between items-center mt-4">
                <div class="flex gap-4">
                    <button data-action="editar-livro" data-id="${l.id}" title="Editar" aria-label="Editar" class="inline-flex items-center justify-center p-1.5 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40">${ICONE_EDITAR}</button>
                    <button data-action="excluir-item" data-tipo="livros" data-id="${l.id}" title="Excluir" aria-label="Excluir" class="inline-flex items-center justify-center p-1.5 rounded text-red-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40">${ICONE_EXCLUIR}</button>
                </div>
                <div class="flex gap-1">
                    <button data-action="mover-livro" data-id="${l.id}" data-dir="up" class="text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 px-1 text-xs" title="Subir">▲</button>
                    <button data-action="mover-livro" data-id="${l.id}" data-dir="down" class="text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 px-1 text-xs" title="Descer">▼</button>
                </div>
            </div>
        </div>`,
        )
        .join('');
    preencherCapas(container);
}

// ─── Partes ──────────────────────────────────────────────────

export function renderPartes() {
    const container = document.getElementById('lista-partes');
    if (!container) return;

    popularFiltroLivro('filtro-livro-partes');

    const ordenadas = [...db.partes]
        .filter((p) => {
            const livro = db.livros.find((l) => l.id == p.livroId);
            if (!livro || livro.tipo === 'Coletânea') return false;
            if (filtroLivroPartes && String(p.livroId) !== String(filtroLivroPartes)) return false;
            return true;
        })
        .sort((a, b) => {
            const livroIdxA = db.livros.findIndex((l) => l.id == a.livroId);
            const livroIdxB = db.livros.findIndex((l) => l.id == b.livroId);
            if (livroIdxA !== livroIdxB) return livroIdxA - livroIdxB;
            return (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999);
        });

    if (ordenadas.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center text-gray-400 dark:text-slate-500 text-sm py-6">Nenhuma parte encontrada.</div>`;
        return;
    }

    container.innerHTML = ordenadas
        .map((p) => {
            const livro = db.livros.find((l) => l.id == p.livroId);
            return `
        <div class="bg-white dark:bg-slate-900 p-4 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm flex justify-between items-center">
            ${p.capa ? `<img data-capa-id="${p.capa}" src="" alt="Capa de ${escapeHtml(p.titulo)}" class="w-16 h-16 object-cover rounded mr-3 flex-shrink-0 opacity-0 transition-opacity duration-200">` : ''}
            <div class="flex-1 min-w-0">
                <h4 class="font-bold text-gray-800 dark:text-slate-100">${escapeHtml(p.titulo)}</h4>
                <p class="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider">
                    ${livro ? escapeHtml(livro.titulo) : 'Sem livro'}
                </p>
                <p class="text-[10px] text-gray-400 dark:text-slate-500 font-mono">SEQ: ${p.sequencia || '0'}</p>
            </div>
            <div class="flex gap-3 flex-shrink-0">
                <button data-action="editar-parte" data-id="${p.id}" title="Editar" aria-label="Editar" class="inline-flex items-center justify-center p-1.5 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40">${ICONE_EDITAR}</button>
                <button data-action="excluir-item" data-tipo="partes" data-id="${p.id}" title="Excluir" aria-label="Excluir" class="inline-flex items-center justify-center p-1.5 rounded text-red-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40">${ICONE_EXCLUIR}</button>
            </div>
        </div>`;
        })
        .join('');
    preencherCapas(container);
}

// ─── Seções ──────────────────────────────────────────────────

export function renderSecoes() {
    const container = document.getElementById('lista-secoes');
    if (!container) return;

    popularFiltroLivro('filtro-livro-secoes');
    popularFiltroParteSecoes();

    const filtradas = db.secoes.filter((s) => {
        if (filtroParteSecoes) {
            return s.paiTipo === 'parte' && String(s.paiId) === String(filtroParteSecoes);
        }
        if (filtroLivroSecoes) {
            return String(livroDaSecao(s)) === String(filtroLivroSecoes);
        }
        return true;
    });

    const ordenadas = [...filtradas].sort((a, b) => {
        const hA = getElementHierarchy({ paiTipo: a.paiTipo, paiId: a.paiId }, db);
        const hB = getElementHierarchy({ paiTipo: b.paiTipo, paiId: b.paiId }, db);
        if (hA[0] !== hB[0]) return hA[0] - hB[0];

        // Posição dentro do livro: uma Seção ligada direto ao Livro (sem Parte)
        // usa a própria sequência pra competir de igual pra igual com as Partes
        // — antes ela sempre caía pro fim, porque herdava o valor "sem parte" (9999).
        const posA = a.paiTipo === 'livro' ? parseInt(a.sequencia) || 9999 : hA[2];
        const posB = b.paiTipo === 'livro' ? parseInt(b.sequencia) || 9999 : hB[2];
        if (posA !== posB) return posA - posB;

        return (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999);
    });

    if (ordenadas.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center text-gray-400 dark:text-slate-500 text-sm py-6">Nenhuma seção encontrada.</div>`;
        return;
    }

    container.innerHTML = ordenadas
        .map((s) => {
            const pai =
                s.paiTipo === 'livro'
                    ? db.livros.find((l) => l.id == s.paiId)
                    : db.partes.find((p) => p.id == s.paiId);
            return `
        <div class="bg-white dark:bg-slate-900 p-4 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm">
            ${
                s.capa
                    ? `<img data-capa-id="${s.capa}" src="" alt="Capa de ${escapeHtml(s.titulo)}" class="w-full h-24 object-cover rounded mb-3 border opacity-0 transition-opacity duration-200 border-gray-300 dark:border-slate-600">`
                    : `<div class="h-24 bg-gray-100 dark:bg-slate-700 rounded mb-3"></div>`
            }
            <div class="flex justify-between items-center">
                <div>
                    <h4 class="font-bold text-gray-800 dark:text-slate-100">${escapeHtml(s.titulo)}</h4>
                    <p class="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-bold tracking-wider">
                        ${s.paiTipo}: ${pai ? escapeHtml(pai.titulo) : '---'}
                    </p>
                    <p class="text-[10px] text-gray-400 dark:text-slate-500">POSIÇÃO: ${s.sequencia ?? '—'}</p>
                </div>
                <div class="flex gap-3">
                    <button data-action="editar-secao" data-id="${s.id}" title="Editar" aria-label="Editar" class="inline-flex items-center justify-center p-1.5 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40">${ICONE_EDITAR}</button>
                    <button data-action="excluir-item" data-tipo="secoes" data-id="${s.id}" title="Excluir" aria-label="Excluir" class="inline-flex items-center justify-center p-1.5 rounded text-red-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40">${ICONE_EXCLUIR}</button>
                </div>
            </div>
        </div>`;
        })
        .join('');
    preencherCapas(container);
}

// ─── Poemas ──────────────────────────────────────────────────

export function renderPoemas() {
    const container = document.getElementById('lista-poemas');
    if (!container) return;

    // Popula o filtro de livro/coletânea (todos os livros + coletâneas juntos)
    const filtroSel = document.getElementById('filtro-livro-poemas');
    if (filtroSel) {
        const valorAtual = filtroSel.value;
        const livrosComuns = db.livros.filter((l) => l.tipo !== 'Coletânea');
        const coletaneas = db.livros.filter((l) => l.tipo === 'Coletânea');
        filtroSel.innerHTML =
            '<option value="">-- Todos os livros --</option>' +
            (livrosComuns.length
                ? '<optgroup label="Livros">' +
                  livrosComuns
                      .map((l) => `<option value="${l.id}">${escapeHtml(l.titulo)}</option>`)
                      .join('') +
                  '</optgroup>'
                : '') +
            (coletaneas.length
                ? '<optgroup label="Coletâneas">' +
                  coletaneas
                      .map((c) => `<option value="${c.id}">${escapeHtml(c.titulo)}</option>`)
                      .join('') +
                  '</optgroup>'
                : '');
        if (Array.from(filtroSel.options).some((o) => o.value === valorAtual))
            filtroSel.value = valorAtual;
    }

    const listaFiltrada = getListaVisivelPoemas();
    atualizarAvisoSemData('aviso-sem-data-poemas', semDataPoemas);
    atualizarBarraSelecao();

    const colunasAtivas = getColunasAtivas('poemas');
    atualizarPainelColunas('poemas', 'painel-colunas-poemas');

    const cabecalho = document.getElementById('cabecalho-poemas');
    if (cabecalho) {
        cabecalho.innerHTML = montarCabecalho(
            'poemas',
            `<th class="p-4 border-b w-8 border-gray-200 dark:border-slate-700"><input type="checkbox" id="check-todos-poemas" data-action="toggle-todos-poemas"></th>`,
            `<th class="p-4 border-b border-gray-200 dark:border-slate-700">ID / Título</th>`,
            `<th class="p-4 border-b text-right border-gray-200 dark:border-slate-700">Ações</th>`,
        );
        // O checkbox mestre é recriado a cada render do cabeçalho — reaplica o estado
        const novoMaster = document.getElementById('check-todos-poemas');
        if (novoMaster)
            novoMaster.checked =
                listaFiltrada.length > 0 && listaFiltrada.every((p) => selecaoPoemas.has(p.id));
    }

    const paginacaoContainer = document.getElementById('paginacao-poemas');

    if (listaFiltrada.length === 0) {
        container.innerHTML = `<tr><td colspan="${colunasAtivas.length + 3}" class="p-6 text-center text-gray-400 dark:text-slate-500 text-sm">Nenhum poema encontrado.</td></tr>`;
        if (paginacaoContainer) paginacaoContainer.innerHTML = '';
        return;
    }

    // Clampa a página atual (o filtro pode ter reduzido o total de itens
    // desde a última renderização, ou "itens por página" pode ter mudado).
    const totalPaginas =
        itensPorPagina === Infinity
            ? 1
            : Math.max(1, Math.ceil(listaFiltrada.length / itensPorPagina));
    if (paginaPoemas > totalPaginas) paginaPoemas = totalPaginas;
    if (paginaPoemas < 1) paginaPoemas = 1;

    const listaPagina =
        itensPorPagina === Infinity
            ? listaFiltrada
            : listaFiltrada.slice(
                  (paginaPoemas - 1) * itensPorPagina,
                  paginaPoemas * itensPorPagina,
              );

    if (paginacaoContainer)
        paginacaoContainer.innerHTML = montarPaginacao(
            listaFiltrada.length,
            paginaPoemas,
            'pagina-poemas',
        );

    const CELULAS_POEMAS = {
        dataEscrita: (p) => {
            const aproximada = !!(p.dataEscrita && !p.dataEscrita.exata);
            const dicas = [];
            if (aproximada) dicas.push('Data aproximada — sem certeza de que é exatamente essa');
            if (p.dataPublicacao)
                dicas.push('Publicação: ' + formatarDataParcial(p.dataPublicacao));
            return `<td class="p-4 text-xs text-gray-400 dark:text-slate-500 font-mono" title="${dicas.join(' · ')}">${aproximada ? '<span class="text-amber-500 dark:text-amber-400">~</span> ' : ''}${p.dataEscrita ? formatarDataParcial(p.dataEscrita) : p.ano || '—'}</td>`;
        },
        estrutura: (p) => {
            const paiObjeto =
                p.paiTipo === 'secao'
                    ? db.secoes.find((s) => s.id == p.paiId)
                    : p.paiTipo === 'parte'
                      ? db.partes.find((pt) => pt.id == p.paiId)
                      : db.livros.find((l) => l.id == p.paiId);
            let infoPai = 'Avulso';
            if (paiObjeto) {
                const rotulo =
                    p.paiTipo === 'secao' ? 'SEC' : p.paiTipo === 'parte' ? 'PART' : 'LIVRO';
                infoPai = `${escapeHtml(paiObjeto.titulo)} [${rotulo}]`;
            }
            return `<td class="p-4 text-xs text-gray-400 dark:text-slate-500">${infoPai}</td>`;
        },
        status: (p) => `<td class="p-4">${p.publicado ? '🟢' : '⚪'}</td>`,
        dataPublicacao: (p) =>
            `<td class="p-4 text-xs text-gray-400 dark:text-slate-500 font-mono">${p.dataPublicacao ? formatarDataParcial(p.dataPublicacao) : '—'}</td>`,
        elos: (p) =>
            `<td class="p-4 text-xs text-gray-500 dark:text-slate-400">${titulosPoemasPorId(p.conceitos?.elos)}</td>`,
        referencias: (p) =>
            `<td class="p-4 text-xs text-gray-500 dark:text-slate-400">${titulosPoemasPorId(p.conceitos?.referencias)}</td>`,
        etiquetas: (p) => `<td class="p-4">${badgesEtiquetas(p.sinalizacoes)}</td>`,
        notas: (p) =>
            `<td class="p-4 text-xs text-gray-500 dark:text-slate-400 max-w-xs">${trechoNota(p.notas)}</td>`,
    };

    container.innerHTML = listaPagina
        .map((p) => {
            const celulasMeio = colunasAtivas
                .map((key) => (CELULAS_POEMAS[key] ? CELULAS_POEMAS[key](p) : ''))
                .join('');
            return `
        <tr class="border-b hover:bg-blue-50/50 dark:hover:bg-blue-950/50 border-gray-200 dark:border-slate-700">
            <td class="p-4">
                <input type="checkbox" class="check-poema" ${selecaoPoemas.has(p.id) ? 'checked' : ''}
                    data-action="toggle-poema" data-id="${p.id}">
            </td>
            <td class="p-4 font-bold text-gray-700 dark:text-slate-200">
                <span class="text-[10px] text-blue-400 mr-2">${p.sequencia ?? '—'}</span>
                ${escapeHtml(p.titulo)}
                ${p._livros ? `<div class="text-[10px] text-indigo-500 dark:text-indigo-400 font-normal mt-1">Livros: ${escapeHtml(p._livros)}</div>` : ''}
                ${p.pessoas ? `<div class="text-[10px] text-rose-500 dark:text-rose-400 font-normal mt-1">Dedicado a: ${escapeHtml(p.pessoas)}</div>` : ''}
            </td>
            ${celulasMeio}
            <td class="p-4 text-right space-x-2">
                <button data-action="editar-poema" data-id="${p.id}" title="Editar" aria-label="Editar" class="inline-flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 p-1.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800">${ICONE_EDITAR}</button>
                <button data-action="excluir-item" data-tipo="poemas" data-id="${p.id}" title="Excluir" aria-label="Excluir" class="inline-flex items-center justify-center p-1.5 rounded text-red-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40">${ICONE_EXCLUIR}</button>
            </td>
        </tr>`;
        })
        .join('');
}

// ─── Prosas ──────────────────────────────────────────────────

export function renderProsas() {
    const container = document.getElementById('lista-prosas');
    if (!container) return;

    // Popula o filtro com Livros e Coletâneas em grupos separados
    const filtroSelPr = document.getElementById('filtro-livro-prosas');
    if (filtroSelPr) {
        const valorAtual = filtroSelPr.value;
        const livrosComuns = db.livros.filter((l) => l.tipo !== 'Coletânea');
        const coletaneas = db.livros.filter((l) => l.tipo === 'Coletânea');
        filtroSelPr.innerHTML =
            '<option value="">-- Todos os livros --</option>' +
            (livrosComuns.length
                ? '<optgroup label="Livros">' +
                  livrosComuns
                      .map((l) => `<option value="${l.id}">${escapeHtml(l.titulo)}</option>`)
                      .join('') +
                  '</optgroup>'
                : '') +
            (coletaneas.length
                ? '<optgroup label="Coletâneas">' +
                  coletaneas
                      .map((c) => `<option value="${c.id}">${escapeHtml(c.titulo)}</option>`)
                      .join('') +
                  '</optgroup>'
                : '');
        if (Array.from(filtroSelPr.options).some((o) => o.value === valorAtual))
            filtroSelPr.value = valorAtual;
    }

    const listaFiltrada = getListaVisivelProsas();
    atualizarAvisoSemData('aviso-sem-data-prosas', semDataProsas);
    atualizarBarraSelecaoProsas();

    const colunasAtivas = getColunasAtivas('prosas');
    atualizarPainelColunas('prosas', 'painel-colunas-prosas');

    const cabecalho = document.getElementById('cabecalho-prosas');
    if (cabecalho) {
        cabecalho.innerHTML = montarCabecalho(
            'prosas',
            `<th class="p-4 border-b w-8 border-gray-200 dark:border-slate-700"><input type="checkbox" id="check-todos-prosas" data-action="toggle-todos-prosas"></th>`,
            `<th class="p-4 border-b border-gray-200 dark:border-slate-700">Título</th>`,
            `<th class="p-4 border-b text-right border-gray-200 dark:border-slate-700">Ações</th>`,
        );
        const novoMaster = document.getElementById('check-todos-prosas');
        if (novoMaster)
            novoMaster.checked =
                listaFiltrada.length > 0 && listaFiltrada.every((pr) => selecaoProsas.has(pr.id));
    }

    const paginacaoContainerPr = document.getElementById('paginacao-prosas');

    if (listaFiltrada.length === 0) {
        container.innerHTML = `<tr><td colspan="${colunasAtivas.length + 3}" class="p-6 text-center text-gray-400 dark:text-slate-500 text-sm">Nenhuma prosa encontrada.</td></tr>`;
        if (paginacaoContainerPr) paginacaoContainerPr.innerHTML = '';
        return;
    }

    const totalPaginasPr =
        itensPorPagina === Infinity
            ? 1
            : Math.max(1, Math.ceil(listaFiltrada.length / itensPorPagina));
    if (paginaProsas > totalPaginasPr) paginaProsas = totalPaginasPr;
    if (paginaProsas < 1) paginaProsas = 1;

    const listaPaginaPr =
        itensPorPagina === Infinity
            ? listaFiltrada
            : listaFiltrada.slice(
                  (paginaProsas - 1) * itensPorPagina,
                  paginaProsas * itensPorPagina,
              );

    if (paginacaoContainerPr)
        paginacaoContainerPr.innerHTML = montarPaginacao(
            listaFiltrada.length,
            paginaProsas,
            'pagina-prosas',
        );

    const CELULAS_PROSAS = {
        dataEscrita: (pr) => {
            const aproximada = !!(pr.dataEscrita && !pr.dataEscrita.exata);
            const dicas = [];
            if (aproximada) dicas.push('Data aproximada — sem certeza de que é exatamente essa');
            if (pr.dataPublicacao)
                dicas.push('Publicação: ' + formatarDataParcial(pr.dataPublicacao));
            return `<td class="p-4 text-xs text-gray-400 dark:text-slate-500 font-mono" title="${dicas.join(' · ')}">${aproximada ? '<span class="text-amber-500 dark:text-amber-400">~</span> ' : ''}${pr.dataEscrita ? formatarDataParcial(pr.dataEscrita) : pr.ano || '—'}</td>`;
        },
        vinculo: (pr) => {
            let paiObjeto = null,
                rotulo = 'Avulso';
            if (pr.paiTipo === 'secao') {
                paiObjeto = db.secoes.find((s) => s.id == pr.paiId);
                rotulo = 'SEC';
            } else if (pr.paiTipo === 'parte') {
                paiObjeto = db.partes.find((p) => p.id == pr.paiId);
                rotulo = 'PART';
            } else if (pr.paiTipo === 'livro') {
                paiObjeto = db.livros.find((l) => l.id == pr.paiId);
                rotulo = 'LIVRO';
            }
            const infoVinc = paiObjeto
                ? `${escapeHtml(paiObjeto.titulo)} [${rotulo}]`
                : 'Sem vínculo';
            return `<td class="p-4 text-xs text-gray-400 dark:text-slate-500">${infoVinc}</td>`;
        },
        dataPublicacao: (pr) =>
            `<td class="p-4 text-xs text-gray-400 dark:text-slate-500 font-mono">${pr.dataPublicacao ? formatarDataParcial(pr.dataPublicacao) : '—'}</td>`,
        etiquetas: (pr) => `<td class="p-4">${badgesEtiquetas(pr.sinalizacoes)}</td>`,
        genero: (pr) =>
            `<td class="p-4">${badgesEtiquetas(pr.genero, 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-400')}</td>`,
        notas: (pr) =>
            `<td class="p-4 text-xs text-gray-500 dark:text-slate-400 max-w-xs">${trechoNota(pr.notas)}</td>`,
    };

    container.innerHTML = listaPaginaPr
        .map((pr) => {
            const pubBadge = pr.publicado
                ? `<span class="text-[9px] bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-bold uppercase">pub</span>`
                : '';
            const pessoas = pr.pessoas
                ? pr.pessoas
                      .split(',')
                      .map((p) => p.trim())
                      .filter(Boolean)
                      .map(
                          (p) =>
                              `<span class="text-[9px] bg-rose-100 dark:bg-rose-900 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded">${escapeHtml(p)}</span>`,
                      )
                      .join('')
                : '';
            const celulasMeio = colunasAtivas
                .map((key) => (CELULAS_PROSAS[key] ? CELULAS_PROSAS[key](pr) : ''))
                .join('');

            return `
        <tr class="border-b hover:bg-blue-50/50 dark:hover:bg-blue-950/50 border-gray-200 dark:border-slate-700">
            <td class="p-4">
                <input type="checkbox" class="check-prosa" ${selecaoProsas.has(pr.id) ? 'checked' : ''}
                    data-action="toggle-prosa" data-id="${pr.id}">
            </td>
            <td class="p-4">
                <div class="font-bold text-gray-700 dark:text-slate-200 flex items-center gap-2">${escapeHtml(pr.titulo)} ${pubBadge}</div>
                ${pessoas ? `<div class="flex flex-wrap gap-1 mt-1">${pessoas}</div>` : ''}
            </td>
            ${celulasMeio}
            <td class="p-4 text-right space-x-2">
                <button data-action="editar-prosa" data-id="${pr.id}" title="Editar" aria-label="Editar" class="inline-flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 p-1.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800">${ICONE_EDITAR}</button>
                <button data-action="excluir-item" data-tipo="prosas" data-id="${pr.id}" title="Excluir" aria-label="Excluir" class="inline-flex items-center justify-center p-1.5 rounded text-red-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40">${ICONE_EXCLUIR}</button>
            </td>
        </tr>`;
        })
        .join('');
}

// ─── Elementos ───────────────────────────────────────────────

export function renderElementos() {
    const container = document.getElementById('lista-elementos');
    if (!container) return;

    popularFiltroLivro('filtro-livro-elementos');

    const filtrados = filtroLivroElementos
        ? db.elementos.filter((e) => String(livroDoElemento(e)) === String(filtroLivroElementos))
        : db.elementos;

    const ordenados = [...filtrados].sort((a, b) => {
        const [lA, ppA, psA] = getPosicaoElemento(a, db);
        const [lB, ppB, psB] = getPosicaoElemento(b, db);
        if (lA !== lB) return lA - lB;
        if (ppA !== ppB) return ppA - ppB;
        if (psA !== psB) return psA - psB;
        return (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999);
    });

    if (ordenados.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center text-gray-400 dark:text-slate-500 text-sm py-6">Nenhum elemento encontrado.</div>`;
        return;
    }

    container.innerHTML = ordenados
        .map((el) => {
            const pai =
                el.paiTipo === 'livro'
                    ? db.livros.find((l) => l.id == el.paiId)
                    : el.paiTipo === 'parte'
                      ? db.partes.find((p) => p.id == el.paiId)
                      : db.secoes.find((s) => s.id == el.paiId);

            return `
        <div class="bg-white dark:bg-slate-900 p-4 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col h-full">
            <div class="flex justify-between items-start mb-2">
                <span class="text-[10px] bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded uppercase font-bold text-gray-500 dark:text-slate-400">${el.tipo}</span>
                <div class="flex gap-2">
                    <button data-action="editar-elemento" data-id="${el.id}" title="Editar" aria-label="Editar" class="inline-flex items-center justify-center p-1.5 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40">${ICONE_EDITAR}</button>
                    <button data-action="excluir-item" data-tipo="elementos" data-id="${el.id}" title="Excluir" aria-label="Excluir" class="inline-flex items-center justify-center p-1.5 rounded text-red-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40">${ICONE_EXCLUIR}</button>
                </div>
            </div>
            ${el.titulo ? `<p class="text-sm font-semibold text-gray-700 dark:text-slate-200 mt-1 mb-1">${escapeHtml(el.titulo)}</p>` : ''}
            ${el.imagem ? `<img data-capa-id="${el.imagem}" src="" alt="${el.titulo ? 'Imagem de ' + escapeHtml(el.titulo) : 'Imagem do elemento'}" class="w-full h-24 object-cover rounded mb-2 border opacity-0 transition-opacity duration-200 border-gray-300 dark:border-slate-600">` : ''}
            <p class="text-sm text-gray-600 dark:text-slate-300 line-clamp-3 italic mb-auto" style="white-space: pre-line;">${el.texto ? sanitizarTextoRico(el.texto) : '(Sem texto)'}</p>
            ${
                el.notas
                    ? `
                <div class="mt-2 p-2 bg-amber-50 dark:bg-amber-950 border-l-2 border-amber-200 dark:border-amber-800 text-[10px] text-amber-700 dark:text-amber-300 italic">
                    <strong class="uppercase">Nota:</strong>
                    <span class="line-clamp-2">${escapeHtml(el.notas)}</span>
                </div>`
                    : ''
            }
            <div class="flex justify-between items-center mt-3 pt-2 border-t border-gray-50 dark:border-slate-800">
                <p class="text-[10px] text-blue-500 dark:text-blue-400 font-bold uppercase">Vínculo: ${pai ? escapeHtml(pai.titulo) : '---'}</p>
                <span class="text-[9px] font-mono text-gray-300 dark:text-slate-600">#${el.sequencia ?? '—'}</span>
            </div>
        </div>`;
        })
        .join('');
    preencherCapas(container);
}
