// ============================================================
// render.js — Renderização de todas as listas/tabelas da UI
// Escuta o evento 'db:saved' e re-renderiza automaticamente
// ============================================================

import { db, save } from './db.js';
import { getElementHierarchy, getPosicaoElemento, filtrarTextos, formatarDataParcial,
         reordenarPosicao, seqOuNull, fecharEspaco, getIrmaosPorEscopo } from './utils.js';
import { lerCapa, revogarURL } from './capas.js';

let filtroPoemas = '';
let filtroProsas = '';
let filtroLivroProsa = '';
let filtroLivroPoemas = '';
let ordenacaoPoemas = 'padrao';
let statusPoemas = 'todos';
let selecaoPoemas = new Set();
let filtroLivroPartes = '';
let filtroLivroSecoes = '';
let filtroParteSecoes = '';
let filtroLivroElementos = '';

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
    sel.innerHTML = '<option value="">-- Todos os livros --</option>' +
        db.livros
            .filter(l => l.tipo !== 'Coletânea')
            .map(l => `<option value="${l.id}">${l.titulo}</option>`).join('');
    if (Array.from(sel.options).some(o => o.value === valorAtual)) sel.value = valorAtual;
}

function popularFiltroParteSecoes() {
    const sel = document.getElementById('filtro-parte-secoes');
    if (!sel) return;
    const partes = filtroLivroSecoes
        ? db.partes.filter(p => String(p.livroId) === String(filtroLivroSecoes))
        : db.partes;
    sel.innerHTML = '<option value="">-- Todas as partes --</option>' +
        partes.map(p => `<option value="${p.id}">${p.titulo}</option>`).join('');
}

// Acha a qual Livro uma Seção pertence (direta ou via Parte)
function livroDaSecao(secao) {
    if (!secao) return null;
    if (secao.paiTipo === 'livro') return secao.paiId;
    const parte = db.partes.find(p => p.id == secao.paiId);
    return parte ? parte.livroId : null;
}

// Acha a qual Livro um Elemento pertence, em qualquer dos 3 níveis
function livroDoElemento(el) {
    if (el.paiTipo === 'livro') return el.paiId;
    if (el.paiTipo === 'parte') {
        const p = db.partes.find(x => x.id == el.paiId);
        return p ? p.livroId : null;
    }
    if (el.paiTipo === 'secao') {
        const s = db.secoes.find(x => x.id == el.paiId);
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
        const parte = db.partes.find(x => x.id == p.paiId);
        return parte ? parte.livroId : null;
    }
    if (p.paiTipo === 'secao') {
        const s = db.secoes.find(x => x.id == p.paiId);
        if (!s) return null;
        if (s.paiTipo === 'parte') {
            const pt = db.partes.find(x => x.id == s.paiId);
            return pt ? pt.livroId : null;
        }
        return s.paiId;
    }
    return null;
}

export function setFiltroPoemas(valor) {
    filtroPoemas = valor;
    renderPoemas();
}

export function setFiltroProsas(valor) {
    filtroProsas = valor;
    renderProsas();
}

export function setFiltroLivroProsa(valor) {
    filtroLivroProsa = valor;
    renderProsas();
}

export function setFiltroLivroPoemas(valor) {
    filtroLivroPoemas = valor;
    renderPoemas();
}

export function setOrdenacaoPoemas(valor) {
    ordenacaoPoemas = valor;
    renderPoemas();
}

export function setStatusPoemas(valor) {
    statusPoemas = valor;
    renderPoemas();
}

// Retorna os títulos dos livros vinculados a um poema (via livrosIds)
function nomesLivros(p) {
    return (p.livrosIds || [])
        .map(id => db.livros.find(l => l.id == id)?.titulo)
        .filter(Boolean)
        .join(', ');
}

// ─── Seleção múltipla de Poemas (ações em massa) ──────────────

// Retorna a lista de poemas atualmente visível, já com status, busca
// (incluindo nomes de livros) e ordenação aplicados — usada tanto pela
// renderização quanto pela seleção em massa, pra ficarem sempre coerentes.
function getListaVisivelPoemas() {
    let base = db.poemas;
    if (statusPoemas === 'publicados') base = base.filter(p => p.publicado);
    else if (statusPoemas === 'rascunhos') base = base.filter(p => !p.publicado);

    if (filtroLivroPoemas) {
        const livroSel = db.livros.find(l => String(l.id) === String(filtroLivroPoemas));
        if (livroSel?.tipo === 'Coletânea') {
            // Poemas numa coletânea vivem em itensColetanea (via refId), não em paiId
            const partesIds = new Set(
                db.partes.filter(p => String(p.livroId) === String(filtroLivroPoemas)).map(p => String(p.id))
            );
            const refIds = new Set(
                (db.itensColetanea || [])
                    .filter(i => partesIds.has(String(i.parteId)) && i.refTipo === 'poema' && i.refId)
                    .map(i => String(i.refId))
            );
            base = base.filter(p => refIds.has(String(p.id)));
        } else {
            base = base.filter(p => String(livroDoPoema(p)) === String(filtroLivroPoemas));
        }
    }

    const decorada = base.map(p => ({ ...p, _livros: nomesLivros(p) }));
    let lista = filtrarTextos(decorada, filtroPoemas);

    if (ordenacaoPoemas === 'data-esc-desc' || ordenacaoPoemas === 'data-esc-asc') {
        const asc = ordenacaoPoemas === 'data-esc-asc';
        lista = [...lista].sort((a, b) => {
            const da = a.dataEscrita, db_ = b.dataEscrita;
            // Sem data vai pro fim independente da direção
            if (!da && !db_) return 0;
            if (!da) return 1;
            if (!db_) return -1;
            // Compara ano
            if (da.ano !== db_.ano) return asc ? da.ano - db_.ano : db_.ano - da.ano;
            // Mesmo ano: quem tem mês vem antes de quem não tem
            const mA = da.mes ?? Infinity, mB = db_.mes ?? Infinity;
            if (mA !== mB) return asc ? mA - mB : mB - mA;
            // Mesmo mês: quem tem dia vem antes de quem não tem
            const dA = da.dia ?? Infinity, dB = db_.dia ?? Infinity;
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
    const visiveis = getListaVisivelPoemas().map(p => p.id);
    if (checked) visiveis.forEach(id => selecaoPoemas.add(id));
    else visiveis.forEach(id => selecaoPoemas.delete(id));
    renderPoemas();
}

export function limparSelecaoPoemas() {
    selecaoPoemas.clear();
    renderPoemas();
}

function atualizarBarraSelecao() {
    const barra    = document.getElementById('barra-acoes-poemas');
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
        ? poema[campo].split(',').map(s => s.trim()).filter(Boolean)
        : [];
    if (!atuais.includes(valorNovo)) atuais.push(valorNovo);
    poema[campo] = atuais.join(', ');
}

function removerValorDeCampo(poema, campo, valor) {
    if (!poema[campo]) return;
    const atuais = poema[campo].split(',').map(s => s.trim()).filter(Boolean);
    poema[campo] = atuais.filter(v => v !== valor).join(', ');
}

export function aplicarPessoaEmMassa() {
    const input = document.getElementById('bulk-pessoa-input');
    const nome  = (input?.value || '').trim();
    if (!nome || selecaoPoemas.size === 0) return;

    db.poemas.forEach(p => {
        if (selecaoPoemas.has(p.id)) adicionarValorEmCampo(p, 'pessoas', nome);
    });

    if (input) input.value = '';
    selecaoPoemas.clear();
    save(); // dispara re-render via evento db:saved
}

export function removerPessoaEmMassa() {
    const input = document.getElementById('bulk-pessoa-input');
    const nome  = (input?.value || '').trim();
    if (!nome || selecaoPoemas.size === 0) return;

    db.poemas.forEach(p => {
        if (selecaoPoemas.has(p.id)) removerValorDeCampo(p, 'pessoas', nome);
    });

    if (input) input.value = '';
    selecaoPoemas.clear();
    save();
}

export function aplicarSinalEmMassa() {
    const input = document.getElementById('bulk-sinal-input');
    const tag   = (input?.value || '').trim();
    if (!tag || selecaoPoemas.size === 0) return;

    db.poemas.forEach(p => {
        if (selecaoPoemas.has(p.id)) adicionarValorEmCampo(p, 'sinalizacoes', tag);
    });

    if (input) input.value = '';
    selecaoPoemas.clear();
    save();
}

export function removerSinalEmMassa() {
    const input = document.getElementById('bulk-sinal-input');
    const tag   = (input?.value || '').trim();
    if (!tag || selecaoPoemas.size === 0) return;

    db.poemas.forEach(p => {
        if (selecaoPoemas.has(p.id)) removerValorDeCampo(p, 'sinalizacoes', tag);
    });

    if (input) input.value = '';
    selecaoPoemas.clear();
    save();
}

// ─── Aba "Estrutura": árvore completa + seleção para exportação pontual ──

let livroEstruturaAtual = '';

// Chaves (`${tipo}-${id}`) dos <details> que o usuário fechou manualmente.
// Sobrevive a re-renders (causados por mover item, salvar etc.) pra não
// reabrir tudo que já tinha sido colapsado.
const _detailsColapsados = new Set();

// Guarda o que o usuário marcou na árvore: { tipo → Set de ids }
const selecaoEstrutura = {
    parte: new Set(), secao: new Set(), poema: new Set(),
    prosa: new Set(), elemento: new Set()
};

export function toggleSelecaoEstrutura(tipo, id, checked, comShift) {
    if (comShift) {
        // Shift+clique: aplica ao item e a tudo dentro dele recursivamente
        _selecionarCascata(tipo, Number(id), checked);
    } else {
        if (checked) selecaoEstrutura[tipo].add(Number(id));
        else selecaoEstrutura[tipo].delete(Number(id));
    }
    atualizarBarraEstrutura();
}

// Aplica checked recursivamente a um nó e todos os seus descendentes
function _selecionarCascata(tipo, id, checked) {
    if (selecaoEstrutura[tipo]) {
        if (checked) selecaoEstrutura[tipo].add(id);
        else selecaoEstrutura[tipo].delete(id);
    }
    // Desce nos filhos, se houver
    if (tipo === 'parte') {
        getDentroParteComTipos(id).forEach(f => _selecionarCascata(f.tipo, Number(f.dados.id), checked));
    } else if (tipo === 'secao') {
        getDentroSecaoComTipos(id).forEach(f => _selecionarCascata(f.tipo, Number(f.dados.id), checked));
    }
    // Poema, prosa e elemento são folhas — não têm filhos
}

export function marcarTodosEstrutura(marcar) {
    Object.values(selecaoEstrutura).forEach(s => s.clear());
    if (marcar && livroEstruturaAtual) {
        const topo = getTopoComTipos(livroEstruturaAtual);
        coletarIdsRecursivos(topo);
    }
    renderEstrutura();
    atualizarBarraEstrutura();
}

function coletarIdsRecursivos(nos) {
    nos.forEach(({ tipo, dados }) => {
        selecaoEstrutura[tipo]?.add(Number(dados.id));
        if (tipo === 'parte') coletarIdsRecursivos(getDentroParteComTipos(dados.id));
        if (tipo === 'secao') coletarIdsRecursivos(getDentroSecaoComTipos(dados.id));
    });
}

function atualizarBarraEstrutura() {
    const barra = document.getElementById('barra-acoes-estrutura');
    const cont  = document.getElementById('contador-estrutura');
    if (!barra) return;
    const total = Object.values(selecaoEstrutura).reduce((s, set) => s + set.size, 0);
    if (total > 0) {
        barra.classList.remove('hidden');
        if (cont) cont.innerText = `${total} item(ns) selecionado(s)`;
    } else {
        barra.classList.add('hidden');
    }
}

export function exportarSelecaoEstrutura() {
    const getIds = (tipo) => Array.from(selecaoEstrutura[tipo] || []).map(String);

    const saida = {
        livros:   db.livros.filter(l => getIds('livro').includes(String(l.id))),   // nunca selecionável, mas mantém compatibilidade
        partes:   db.partes.filter(p => getIds('parte').includes(String(p.id))),
        secoes:   db.secoes.filter(s => getIds('secao').includes(String(s.id))),
        poemas:   db.poemas.filter(p => getIds('poema').includes(String(p.id))),
        prosas:   (db.prosas || []).filter(pr => getIds('prosa').includes(String(pr.id))),
        elementos:(db.elementos || []).filter(e => getIds('elemento').includes(String(e.id))),
        coletaneas: [],
        itensColetanea: []
    };

    const total = Object.values(saida).flat().length;
    if (total === 0) { alert('Nenhum item selecionado.'); return; }

    const blob = new Blob([JSON.stringify(saida, null, 4)], { type: 'application/json;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `selecao_estrutura_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

function ordenarPorSeq(lista) {
    // Itens aqui vêm embrulhados como { tipo, dados } (ver getTopoComTipos,
    // getDentroParteComTipos, getDentroSecaoComTipos) — a sequência real
    // está em item.dados.sequencia, não em item.sequencia. Antes essa função
    // lia item.sequencia (sempre undefined), então todo item caía no
    // fallback 9999 e a ordenação virava um no-op: os itens ficavam só na
    // ordem de inserção (Partes, depois Seções, depois Elementos...),
    // ignorando completamente o campo de sequência.
    return [...lista].sort((a, b) => {
        const seqA = a.dados ? a.dados.sequencia : a.sequencia;
        const seqB = b.dados ? b.dados.sequencia : b.sequencia;
        return (parseInt(seqA) || 9999) - (parseInt(seqB) || 9999);
    });
}

function getTopoComTipos(livroId) {
    return ordenarPorSeq([
        ...db.partes.filter(p => p.livroId == livroId).map(p => ({ tipo: 'parte', dados: p })),
        ...db.secoes.filter(s => s.paiTipo === 'livro' && s.paiId == livroId).map(s => ({ tipo: 'secao', dados: s })),
        ...db.elementos.filter(e => e.paiTipo === 'livro' && e.paiId == livroId).map(e => ({ tipo: 'elemento', dados: e })),
        ...db.poemas.filter(p => p.paiTipo === 'livro' && p.paiId == livroId).map(p => ({ tipo: 'poema', dados: p })),
        ...db.prosas.filter(p => p.paiTipo === 'livro' && p.paiId == livroId).map(p => ({ tipo: 'prosa', dados: p }))
    ].map(item => ({ ...item, dados: item.dados })));
}

function getDentroParteComTipos(parteId) {
    return ordenarPorSeq([
        ...db.secoes.filter(s => s.paiTipo === 'parte' && s.paiId == parteId).map(s => ({ tipo: 'secao', dados: s })),
        ...db.elementos.filter(e => e.paiTipo === 'parte' && e.paiId == parteId).map(e => ({ tipo: 'elemento', dados: e })),
        ...db.poemas.filter(p => p.paiTipo === 'parte' && p.paiId == parteId).map(p => ({ tipo: 'poema', dados: p })),
        ...db.prosas.filter(p => p.paiTipo === 'parte' && p.paiId == parteId).map(p => ({ tipo: 'prosa', dados: p }))
    ]);
}

function getDentroSecaoComTipos(secaoId) {
    return ordenarPorSeq([
        ...db.elementos.filter(e => e.paiTipo === 'secao' && e.paiId == secaoId).map(e => ({ tipo: 'elemento', dados: e })),
        ...db.poemas.filter(p => p.paiTipo === 'secao' && p.paiId == secaoId).map(p => ({ tipo: 'poema', dados: p })),
        ...db.prosas.filter(p => (p.paiTipo === 'secao' && p.paiId == secaoId) || p.secaoId == secaoId).map(p => ({ tipo: 'prosa', dados: p }))
    ]);
}

const ICONE_TIPO = { parte: '📂', secao: '📁', poema: '📝', prosa: '📄', elemento: '🧩' };
const COR_TIPO = {
    parte: 'font-bold text-blue-800', secao: 'font-semibold text-indigo-600',
    poema: 'text-gray-600', prosa: 'text-emerald-700', elemento: 'text-amber-600 italic'
};

function renderNoEstrutura({ tipo, dados }, nivel) {
    const seq = (dados.sequencia !== null && dados.sequencia !== undefined) ? dados.sequencia : '—';

    // Elementos (Respiros etc) só têm "tipo" às vezes, sem título — mostra
    // "Tipo: Título" quando os dois existem, senão só o que tiver.
    let titulo = dados.titulo || '(sem título)';
    if (tipo === 'elemento') {
        const rotuloTipo = dados.tipo || 'Elemento';
        titulo = dados.titulo ? `${rotuloTipo}: ${dados.titulo}` : rotuloTipo;
    }

    const estaMarcado = selecaoEstrutura[tipo]?.has(Number(dados.id)) ? 'checked' : '';

    // Shift+clique → cascata; clique normal → só o item
    const checkbox = `<input type="checkbox" ${estaMarcado}
        onclick="event.stopPropagation(); toggleSelecaoEstrutura('${tipo}', ${dados.id}, this.checked, event.shiftKey)"
        class="flex-shrink-0" title="Clique normal: só este item. Shift+clique: este item e tudo dentro."
        style="width:14px;height:14px;cursor:pointer;">`;

    // "Mover" (mudar de nível) só existe pra quem pode mudar de pai:
    // Seção, Poema, Prosa, Elemento. Parte nunca aparece aqui pois
    // tipo === 'parte' não tem botão de mover nível (Partes só existem
    // diretamente no Livro).
    const botaoMoverNivel = tipo !== 'parte'
        ? `<button onclick="event.stopPropagation(); event.preventDefault(); abrirModalMoverNivel('${tipo}', ${dados.id})"
                class="text-gray-400 hover:text-emerald-600 px-1 text-xs" title="Mover para outro nível">↪</button>`
        : '';

    const botoesMover = `
        <span class="ml-auto flex gap-1">
            <button onclick="event.stopPropagation(); event.preventDefault(); moverItemEstrutura('${tipo}', ${dados.id}, 'up')"
                class="text-gray-400 hover:text-blue-600 px-1 text-xs" title="Subir">▲</button>
            <button onclick="event.stopPropagation(); event.preventDefault(); moverItemEstrutura('${tipo}', ${dados.id}, 'down')"
                class="text-gray-400 hover:text-blue-600 px-1 text-xs" title="Descer">▼</button>
            ${botaoMoverNivel}
        </span>`;

    // Parte e Seção: emoji varia com o estado open/closed do <details>
    if (tipo === 'parte' || tipo === 'secao') {
        const iconeAberto  = tipo === 'parte' ? '📂' : '🗂️';
        const iconeFechado = tipo === 'parte' ? '📁' : '📁';
        const filhos = tipo === 'parte' ? getDentroParteComTipos(dados.id) : getDentroSecaoComTipos(dados.id);
        const filhosHtml = filhos.map(f => renderNoEstrutura(f, nivel + 1)).join('');

        const conteudoLinha = `
            ${checkbox}
            <span class="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded w-8 text-center inline-block">${seq}</span>
            <span class="icone-details">${iconeAberto}</span>
            <span class="${COR_TIPO[tipo] || ''}">${titulo}</span>
            <span class="text-[9px] uppercase text-gray-300 ml-2">${tipo}</span>
            ${botoesMover}`;

        return `
        <details open data-icone-aberto="${iconeAberto}" data-icone-fechado="${iconeFechado}"
            data-key="${tipo}-${dados.id}"
            style="margin-left:${nivel * 18}px" class="border-b border-gray-50 details-icone">
            <summary class="py-1.5 flex items-center gap-2 text-sm cursor-pointer list-none">${conteudoLinha}</summary>
            <div>${filhosHtml || '<p class="text-[10px] text-gray-300 italic pl-8 pb-1">(vazio)</p>'}</div>
        </details>`;
    }

    // Poema, Prosa, Elemento: linha simples, sem filhos
    const conteudoLinha = `
        ${checkbox}
        <span class="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded w-8 text-center inline-block">${seq}</span>
        <span>${ICONE_TIPO[tipo] || '•'}</span>
        <span class="${COR_TIPO[tipo] || ''}">${titulo}</span>
        <span class="text-[9px] uppercase text-gray-300 ml-2">${tipo}</span>
        ${botoesMover}`;

    return `
        <div style="margin-left:${nivel * 18}px" class="py-1.5 flex items-center gap-2 text-sm border-b border-gray-50">
            ${conteudoLinha}
        </div>`;
}

// Acha o grupo de irmãos (mesmo "andar") de um item da árvore, pra
// poder trocar a sequência dele com o vizinho ao mover pra cima/baixo.
function obterEscopoDoItem(tipo, dados) {
    if (tipo === 'parte') return getTopoComTipos(dados.livroId);
    if (dados.paiTipo === 'parte') return getDentroParteComTipos(dados.paiId);
    if (dados.paiTipo === 'secao') return getDentroSecaoComTipos(dados.paiId);
    if (dados.paiTipo === 'livro') return getTopoComTipos(dados.paiId);
    return [];
}

export function moverItemEstrutura(tipo, id, direcao) {
    const colecoes = { parte: db.partes, secao: db.secoes, elemento: db.elementos, poema: db.poemas, prosa: db.prosas };
    const dados = colecoes[tipo]?.find(x => x.id == id);
    if (!dados) return;

    const irmaos = obterEscopoDoItem(tipo, dados);
    const idx = irmaos.findIndex(it => it.tipo === tipo && it.dados.id == id);
    if (idx === -1) return;

    const vizinhoIdx = direcao === 'up' ? idx - 1 : idx + 1;
    if (vizinhoIdx < 0 || vizinhoIdx >= irmaos.length) return; // já está na ponta

    const vizinho = irmaos[vizinhoIdx].dados;
    const temp = dados.sequencia;
    dados.sequencia = vizinho.sequencia;
    vizinho.sequencia = temp;

    save();
}

// ─── Mover de nível (mudar paiTipo/paiId na árvore) ───────────
//
// Quem pode mudar de nível: Seção, Poema, Prosa, Elemento.
// Parte nunca muda — só existe direto no Livro.
//
// Destinos possíveis:
//   Seção            → Livro, ou qualquer Parte do mesmo livro
//   Poema/Prosa/Elem. → Livro, qualquer Parte, ou qualquer Seção do mesmo livro
// O destino atual do item é sempre excluído da lista (não faz
// sentido "mover para onde já está").

function colecoesMoviveis() {
    return { secao: db.secoes, poema: db.poemas, prosa: db.prosas, elemento: db.elementos };
}

// Monta as <option> de destino na ordem real da estrutura do livro:
// Livro direto, depois cada Parte (e, se o tipo de origem aceitar
// Seção como destino, as Seções daquela Parte), depois Seções diretas no Livro.
function construirOpcoesDestinoMover(tipoOrigem, paiTipoAtual, paiIdAtual, livroId) {
    const aceitaSecaoComoDestino = tipoOrigem !== 'secao';
    const livro = db.livros.find(l => l.id == livroId);

    const ehDestinoAtual = (tipo, id) => tipoOrigem !== '' && tipo === paiTipoAtual && String(id) === String(paiIdAtual);

    let html = '';
    if (!ehDestinoAtual('livro', livroId)) {
        html += `<option value="livro:${livroId}">📖 ${livro?.titulo || ''} (o livro inteiro)</option>`;
    }

    const partesDoLivro = db.partes.filter(p => String(p.livroId) === String(livroId));
    const secoesDiretas = db.secoes.filter(s => s.paiTipo === 'livro' && String(s.paiId) === String(livroId));

    const topo = [
        ...partesDoLivro.map(item => ({ tipo: 'parte', item })),
        ...secoesDiretas.map(item => ({ tipo: 'secao', item }))
    ].sort((a, b) => (parseInt(a.item.sequencia) || 9999) - (parseInt(b.item.sequencia) || 9999));

    topo.forEach(({ tipo, item }) => {
        if (tipo === 'parte') {
            if (!ehDestinoAtual('parte', item.id)) {
                html += `<option value="parte:${item.id}">▸ ${item.titulo}</option>`;
            }
            if (aceitaSecaoComoDestino) {
                db.secoes
                    .filter(s => s.paiTipo === 'parte' && String(s.paiId) === String(item.id))
                    .sort((a, b) => (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999))
                    .forEach(s => {
                        if (!ehDestinoAtual('secao', s.id)) {
                            html += `<option value="secao:${s.id}">　↳ ${s.titulo}</option>`;
                        }
                    });
            }
        } else if (aceitaSecaoComoDestino && !ehDestinoAtual('secao', item.id)) {
            html += `<option value="secao:${item.id}">↳ ${item.titulo}</option>`;
        }
    });

    return html;
}

function _garantirModalMoverNivel() {
    let overlay = document.getElementById('modal-mover-nivel');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'modal-mover-nivel';
    overlay.style.cssText = `
        position:fixed; inset:0; z-index:10000;
        background:rgba(0,0,0,0.5);
        display:none; align-items:center; justify-content:center;
        animation:fadeIn .15s ease-out;
    `;

    const caixa = document.createElement('div');
    caixa.style.cssText = `
        background:#fff; border-radius:12px;
        padding:28px 32px; max-width:420px; width:90%;
        box-shadow:0 8px 40px rgba(0,0,0,0.18);
        font-family:sans-serif;
    `;

    caixa.innerHTML = `
        <p style="margin:0 0 6px; font-size:11px; font-weight:700;
                  text-transform:uppercase; letter-spacing:.06em; color:#9ca3af;"
           id="mov-rotulo"></p>
        <h3 style="margin:0 0 20px; font-size:16px; font-weight:700;
                   color:#111827; line-height:1.4; word-break:break-word;"
            id="mov-titulo"></h3>

        <label class="form-label" style="margin-bottom:4px;">Mover para</label>
        <select id="mov-destino" style="margin-bottom:16px;"></select>

        <label class="form-label" style="margin-bottom:4px;">Posição (opcional)</label>
        <input id="mov-posicao" type="number" min="1" placeholder="fim" style="margin-bottom:20px;">

        <div style="display:flex; gap:10px; justify-content:flex-end;">
            <button id="mov-cancelar"
                style="padding:8px 18px; border-radius:8px; border:1px solid #e5e7eb;
                       background:#fff; color:#374151; font-size:13px; font-weight:600;
                       cursor:pointer;">
                Cancelar
            </button>
            <button id="mov-confirmar"
                style="padding:8px 18px; border-radius:8px; border:none;
                       background:#1d4ed8; color:#fff; font-size:13px; font-weight:600;
                       cursor:pointer;">
                Mover
            </button>
        </div>
    `;

    overlay.appendChild(caixa);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) _fecharModalMoverNivel();
    });

    return overlay;
}

function _fecharModalMoverNivel() {
    const overlay = document.getElementById('modal-mover-nivel');
    if (overlay) overlay.style.display = 'none';
}

const ROTULO_TIPO_MOVER = { secao: 'Seção', poema: 'Poema', prosa: 'Prosa', elemento: 'Elemento' };

export function abrirModalMoverNivel(tipo, id) {
    const dados = colecoesMoviveis()[tipo]?.find(x => x.id == id);
    if (!dados || !livroEstruturaAtual) return;

    const overlay = _garantirModalMoverNivel();

    document.getElementById('mov-rotulo').textContent = ROTULO_TIPO_MOVER[tipo] || tipo;
    document.getElementById('mov-titulo').textContent = dados.titulo || '(sem título)';

    const selDestino = document.getElementById('mov-destino');
    selDestino.innerHTML = construirOpcoesDestinoMover(tipo, dados.paiTipo, dados.paiId, livroEstruturaAtual);

    const inputPosicao = document.getElementById('mov-posicao');
    inputPosicao.value = '';

    const btnCancelar  = document.getElementById('mov-cancelar');
    const btnConfirmar = document.getElementById('mov-confirmar');
    btnCancelar.onclick = _fecharModalMoverNivel;
    btnConfirmar.onclick = () => {
        const destino = selDestino.value;
        if (!destino) { _fecharModalMoverNivel(); return; }
        executarMoverNivel(tipo, id, destino, inputPosicao.value);
        _fecharModalMoverNivel();
    };

    overlay.style.display = 'flex';
}

export function executarMoverNivel(tipo, id, destinoStr, posicaoStr) {
    const dados = colecoesMoviveis()[tipo]?.find(x => x.id == id);
    if (!dados) return;

    const [novoPaiTipo, novoPaiIdStr] = destinoStr.split(':');
    const novoPaiId = novoPaiIdStr;

    // Nada a fazer se o destino escolhido é igual ao pai atual
    if (dados.paiTipo === novoPaiTipo && String(dados.paiId) === String(novoPaiId)) return;

    // Fecha o buraco que o item deixa no grupo antigo
    const irmaosAntigos = getIrmaosPorEscopo(db, dados.paiTipo, dados.paiId);
    const posicaoAntiga = dados.sequencia ?? null;

    dados.paiTipo = novoPaiTipo;
    dados.paiId = novoPaiId;

    fecharEspaco(irmaosAntigos, posicaoAntiga);

    // Posiciona no grupo novo: posição escolhida ou fim por padrão
    const irmaosNovos = getIrmaosPorEscopo(db, novoPaiTipo, novoPaiId).filter(it => it.id != dados.id);
    const posicaoDesejada = seqOuNull(posicaoStr);

    if (posicaoDesejada !== null) {
        reordenarPosicao([...irmaosNovos, dados], dados, posicaoDesejada, null);
    } else {
        const maxSeq = irmaosNovos.reduce((max, it) => Math.max(max, parseInt(it.sequencia) || 0), 0);
        dados.sequencia = maxSeq + 1;
    }

    save();
}

export function popularSeletorEstrutura() {
    const sel = document.getElementById('estrutura-livro-select');
    if (!sel) return;
    const valorAtual = sel.value;
    // Coletâneas não entram aqui: sua estrutura (Partes → Itens em
    // db.itensColetanea) é diferente da árvore Livro→Parte→Seção→Poema
    // que esta aba percorre. Coletâneas têm sua própria aba dedicada.
    sel.innerHTML = '<option value="">-- Escolha um livro --</option>' +
        db.livros.filter(l => l.tipo !== 'Coletânea')
            .map(l => `<option value="${l.id}">${l.titulo}</option>`).join('');
    if (Array.from(sel.options).some(o => o.value === valorAtual)) sel.value = valorAtual;
}

export function setLivroEstrutura(livroId) {
    livroEstruturaAtual = livroId;
    _detailsColapsados.clear();
    renderEstrutura();
}

function renderEstrutura() {
    const container = document.getElementById('estrutura-arvore');
    if (!container) return;

    if (!livroEstruturaAtual) {
        container.innerHTML = '<p class="text-gray-400 text-sm">Escolha um livro acima pra ver a árvore completa.</p>';
        return;
    }

    const topo = getTopoComTipos(livroEstruturaAtual);
    if (topo.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm">Esse livro ainda não tem conteúdo vinculado.</p>';
        return;
    }

    container.innerHTML = topo.map(no => renderNoEstrutura(no, 0)).join('');

    // Re-renderizar reconstrói o HTML do zero (innerHTML), então todo
    // <details> nasce aberto de novo. Aqui reaplicamos o estado de
    // colapso que o usuário já tinha escolhido (rastreado em
    // _detailsColapsados via o listener de 'toggle' abaixo), pra que
    // mover um item (▲▼) não reabra tudo que estava fechado.
    container.querySelectorAll('details.details-icone[data-key]').forEach(det => {
        if (_detailsColapsados.has(det.dataset.key)) {
            det.open = false;
            const icone = det.querySelector(':scope > summary .icone-details');
            if (icone) icone.textContent = det.dataset.iconeFechado;
        }
    });

    // Atualiza o emoji de pasta quando o usuário abre/fecha um <details>,
    // e memoriza o estado de colapso pra sobreviver ao próximo re-render.
    container.querySelectorAll('details.details-icone').forEach(det => {
        det.addEventListener('toggle', () => {
            const icone = det.querySelector(':scope > summary .icone-details');
            if (icone) {
                icone.textContent = det.open
                    ? det.dataset.iconeAberto
                    : det.dataset.iconeFechado;
            }
            if (det.dataset.key) {
                if (det.open) _detailsColapsados.delete(det.dataset.key);
                else _detailsColapsados.add(det.dataset.key);
            }
        });
    });
}

// ─── Lightbox com navegação ───────────────────────────────────
// _lightboxUrls guarda todos os URLs das capas carregadas no container
// mais recente que chamou preencherCapas; _lightboxIdx é o índice atual.
// Isso permite navegar ◀ ▶ dentro do lightbox sem fechar e reabrir.

let _lightboxUrls  = [];
let _lightboxIdx   = 0;
let _lightboxTitulos = [];

// Carrega as capas do IndexedDB de forma assíncrona após o HTML já estar no DOM.
// Procura todos os <img data-capa-id="..."> dentro do container e preenche o src.
// As imagens começam com opacity-0 e aparecem com fade-in quando carregadas,
// evitando flicker de placeholder enquanto o blob é lido.
// Clique na imagem abre um lightbox navegável com ◀ ▶ e teclado ← →.
async function preencherCapas(container) {
    const imgs = container.querySelectorAll('img[data-capa-id]');
    const entradas = await Promise.all(Array.from(imgs).map(async (img) => {
        const id  = img.dataset.capaId;
        const url = await lerCapa(id);
        if (url) {
            if (img.src && img.src.startsWith('blob:')) revogarURL(img.src);
            img.src = url;
            img.style.cursor = 'zoom-in';
            img.title = 'Clique para ver a imagem completa';
            img.onload = () => img.classList.replace('opacity-0', 'opacity-100');
            img.onerror = () => { img.style.display = 'none'; };
            // Retorna url + título do card pai (para exibir no lightbox)
            const card = img.closest('[data-titulo]') || img.closest('div');
            const titulo = card?.querySelector('h4')?.textContent?.trim() || '';
            return { img, url, titulo };
        } else {
            img.style.display = 'none';
            return null;
        }
    }));

    // Monta o array de capas visíveis desta seção, na ordem do DOM
    const visíveis = entradas.filter(Boolean);
    const urls    = visíveis.map(e => e.url);
    const titulos = visíveis.map(e => e.titulo);

    // Liga cada imagem ao seu índice neste grupo
    visíveis.forEach(({ img, url }, idx) => {
        img.onclick = (e) => {
            e.stopPropagation();
            _lightboxUrls   = urls;
            _lightboxTitulos = titulos;
            abrirLightbox(idx);
        };
    });
}

// Abre o lightbox navegável no índice `idx` do array _lightboxUrls.
// Fecha ao clicar no fundo/botão × ou Escape; ◀ ▶ e ← → navegam.
function abrirLightbox(idx) {
    _lightboxIdx = idx;

    // ── Criação do overlay (só uma vez) ───────────────────────
    let overlay = document.getElementById('capa-lightbox');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'capa-lightbox';
        overlay.style.cssText = `
            position:fixed; inset:0; z-index:9999;
            background:rgba(0,0,0,0.88);
            display:flex; flex-direction:column;
            align-items:center; justify-content:center;
            animation:fadeIn .15s ease-out;
        `;

        // Imagem central
        const img = document.createElement('img');
        img.id = 'capa-lightbox-img';
        img.style.cssText = `
            max-width:82vw; max-height:82vh;
            object-fit:contain; border-radius:6px;
            box-shadow:0 8px 40px rgba(0,0,0,0.6);
            pointer-events:none; display:block;
        `;

        // Barra inferior: contador + título
        const barra = document.createElement('div');
        barra.id = 'capa-lightbox-barra';
        barra.style.cssText = `
            margin-top:14px; color:rgba(255,255,255,0.75);
            font-size:13px; font-family:sans-serif;
            text-align:center; max-width:80vw;
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        `;

        // Botão fechar (×)
        const btnFechar = document.createElement('button');
        btnFechar.textContent = '×';
        btnFechar.style.cssText = `
            position:absolute; top:16px; right:20px;
            background:none; border:none; color:#fff;
            font-size:32px; line-height:1; cursor:pointer;
            opacity:0.6; transition:opacity .15s;
        `;
        btnFechar.onmouseenter = () => btnFechar.style.opacity = '1';
        btnFechar.onmouseleave = () => btnFechar.style.opacity = '0.6';
        btnFechar.onclick = (e) => { e.stopPropagation(); fecharLightbox(); };

        // Botão anterior (◀)
        const btnPrev = document.createElement('button');
        btnPrev.id = 'capa-lightbox-prev';
        btnPrev.textContent = '❮';
        btnPrev.style.cssText = `
            position:absolute; left:16px; top:50%; transform:translateY(-50%);
            background:rgba(255,255,255,0.12); border:none; color:#fff;
            font-size:22px; width:44px; height:44px; border-radius:50%;
            cursor:pointer; opacity:0.7; transition:opacity .15s, background .15s;
            display:flex; align-items:center; justify-content:center;
        `;
        btnPrev.onmouseenter = () => { btnPrev.style.opacity='1'; btnPrev.style.background='rgba(255,255,255,0.22)'; };
        btnPrev.onmouseleave = () => { btnPrev.style.opacity='0.7'; btnPrev.style.background='rgba(255,255,255,0.12)'; };
        btnPrev.onclick = (e) => { e.stopPropagation(); navegarLightbox(-1); };

        // Botão próximo (▶)
        const btnNext = document.createElement('button');
        btnNext.id = 'capa-lightbox-next';
        btnNext.textContent = '❯';
        btnNext.style.cssText = `
            position:absolute; right:16px; top:50%; transform:translateY(-50%);
            background:rgba(255,255,255,0.12); border:none; color:#fff;
            font-size:22px; width:44px; height:44px; border-radius:50%;
            cursor:pointer; opacity:0.7; transition:opacity .15s, background .15s;
            display:flex; align-items:center; justify-content:center;
        `;
        btnNext.onmouseenter = () => { btnNext.style.opacity='1'; btnNext.style.background='rgba(255,255,255,0.22)'; };
        btnNext.onmouseleave = () => { btnNext.style.opacity='0.7'; btnNext.style.background='rgba(255,255,255,0.12)'; };
        btnNext.onclick = (e) => { e.stopPropagation(); navegarLightbox(+1); };

        overlay.appendChild(img);
        overlay.appendChild(barra);
        overlay.appendChild(btnFechar);
        overlay.appendChild(btnPrev);
        overlay.appendChild(btnNext);

        // Fechar ao clicar no fundo (não nos botões/imagem)
        overlay.onclick = (e) => { if (e.target === overlay) fecharLightbox(); };
        document.body.appendChild(overlay);
        document.addEventListener('keydown', _lightboxTeclado);
    }

    _atualizarLightbox();
    overlay.style.display = 'flex';
}

function _atualizarLightbox() {
    const img   = document.getElementById('capa-lightbox-img');
    const barra = document.getElementById('capa-lightbox-barra');
    const prev  = document.getElementById('capa-lightbox-prev');
    const next  = document.getElementById('capa-lightbox-next');
    if (!img) return;

    img.src = _lightboxUrls[_lightboxIdx] || '';

    const total = _lightboxUrls.length;
    const titulo = _lightboxTitulos[_lightboxIdx] || '';
    if (barra) {
        barra.textContent = total > 1
            ? `${_lightboxIdx + 1} / ${total}${titulo ? ' · ' + titulo : ''}`
            : titulo || '';
    }

    // Esconde os botões se só há uma capa (sem sentido navegar)
    const mostrarNav = total > 1;
    if (prev) prev.style.display = mostrarNav ? 'flex' : 'none';
    if (next) next.style.display = mostrarNav ? 'flex' : 'none';
}

function navegarLightbox(delta) {
    const total = _lightboxUrls.length;
    if (total === 0) return;
    _lightboxIdx = (_lightboxIdx + delta + total) % total;
    _atualizarLightbox();
}

function fecharLightbox() {
    const overlay = document.getElementById('capa-lightbox');
    if (overlay) overlay.style.display = 'none';
}

function _lightboxTeclado(e) {
    const overlay = document.getElementById('capa-lightbox');
    if (!overlay || overlay.style.display === 'none') return;
    if (e.key === 'Escape')     { fecharLightbox(); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); navegarLightbox(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); navegarLightbox(+1); }
}

export function renderLists() {
    renderLivros();
    renderPartes();
    renderSecoes();
    renderPoemas();
    renderProsas();
    renderElementos();
    popularSeletorEstrutura();
    renderEstrutura();
}

// ─── Livros ──────────────────────────────────────────────────

function renderLivros() {
    const container = document.getElementById('lista-livros');
    if (!container) return;

    const ordenados = [...db.livros].sort(
        (a, b) => (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999)
    );

    container.innerHTML = ordenados.map(l => `
        <div class="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            ${l.capa
                ? `<img data-capa-id="${l.capa}" src="" class="w-full h-32 object-cover rounded mb-4 opacity-0 transition-opacity duration-200">`
                : `<div class="h-32 bg-gray-100 rounded mb-4"></div>`}
            <div class="flex justify-between items-start">
                <h4 class="font-bold text-blue-800">${l.titulo}</h4>
                <span class="text-[10px] bg-blue-50 text-blue-500 px-2 py-0.5 rounded font-mono">SEQ: ${l.sequencia || '0'}</span>
            </div>
            <p class="text-xs font-mono text-gray-500">${l.siglaOficial || '---'} | ${l.data ? (typeof l.data === 'string' ? l.data : formatarDataParcial(l.data)) : 'S/D'}</p>
            <div class="flex gap-4 mt-4">
                <button onclick="editarLivro(${l.id})" class="text-blue-600 text-xs font-bold uppercase">Editar</button>
                <button onclick="deleteItem('livros', ${l.id})" class="text-red-400 text-xs uppercase">Excluir</button>
            </div>
        </div>`).join('');
    preencherCapas(container);
}

// ─── Partes ──────────────────────────────────────────────────

function renderPartes() {
    const container = document.getElementById('lista-partes');
    if (!container) return;

    popularFiltroLivro('filtro-livro-partes');

    const ordenadas = [...db.partes].filter(p => {
        const livro = db.livros.find(l => l.id == p.livroId);
        if (!livro || livro.tipo === 'Coletânea') return false;
        if (filtroLivroPartes && String(p.livroId) !== String(filtroLivroPartes)) return false;
        return true;
    }).sort((a, b) => {
        const livroIdxA = db.livros.findIndex(l => l.id == a.livroId);
        const livroIdxB = db.livros.findIndex(l => l.id == b.livroId);
        if (livroIdxA !== livroIdxB) return livroIdxA - livroIdxB;
        return (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999);
    });

    container.innerHTML = ordenadas.map(p => {
        const livro = db.livros.find(l => l.id == p.livroId);
        return `
        <div class="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex justify-between items-center">
            ${p.capa ? `<img data-capa-id="${p.capa}" src="" class="w-16 h-16 object-cover rounded mr-3 flex-shrink-0 opacity-0 transition-opacity duration-200">` : ''}
            <div class="flex-1 min-w-0">
                <h4 class="font-bold text-gray-800">${p.titulo}</h4>
                <p class="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                    ${livro ? livro.titulo : 'Sem livro'}
                </p>
                <p class="text-[10px] text-gray-400 font-mono">SEQ: ${p.sequencia || '0'}</p>
            </div>
            <div class="flex gap-3 flex-shrink-0">
                <button onclick="editarParte(${p.id})" class="text-blue-600 text-xs uppercase font-bold">Editar</button>
                <button onclick="deleteItem('partes', ${p.id})" class="text-red-400 text-xs uppercase">Excluir</button>
            </div>
        </div>`;
    }).join('');
    preencherCapas(container);
}

// ─── Seções ──────────────────────────────────────────────────

function renderSecoes() {
    const container = document.getElementById('lista-secoes');
    if (!container) return;

    popularFiltroLivro('filtro-livro-secoes');
    popularFiltroParteSecoes();

    const filtradas = db.secoes.filter(s => {
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
        const posA = a.paiTipo === 'livro' ? (parseInt(a.sequencia) || 9999) : hA[2];
        const posB = b.paiTipo === 'livro' ? (parseInt(b.sequencia) || 9999) : hB[2];
        if (posA !== posB) return posA - posB;

        return (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999);
    });

    container.innerHTML = ordenadas.map(s => {
        const pai = s.paiTipo === 'livro'
            ? db.livros.find(l => l.id == s.paiId)
            : db.partes.find(p => p.id == s.paiId);
        return `
        <div class="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            ${s.capa ? `<img data-capa-id="${s.capa}" src="" class="w-full h-24 object-cover rounded mb-3 border opacity-0 transition-opacity duration-200">` : ''}
            <div class="flex justify-between items-center">
                <div>
                    <h4 class="font-bold text-gray-800">${s.titulo}</h4>
                    <p class="text-[10px] text-blue-600 uppercase font-bold tracking-wider">
                        ${s.paiTipo}: ${pai ? pai.titulo : '---'}
                    </p>
                    <p class="text-[10px] text-gray-400">POSIÇÃO: ${s.sequencia ?? '—'}</p>
                </div>
                <div class="flex gap-3">
                    <button onclick="editarSecao(${s.id})" class="text-blue-600 text-xs uppercase font-bold">Editar</button>
                    <button onclick="deleteItem('secoes', ${s.id})" class="text-red-400 text-xs uppercase">Excluir</button>
                </div>
            </div>
        </div>`;
    }).join('');
    preencherCapas(container);
}

// ─── Poemas ──────────────────────────────────────────────────

function renderPoemas() {
    const container = document.getElementById('lista-poemas');
    if (!container) return;

    // Popula o filtro de livro/coletânea (todos os livros + coletâneas juntos)
    const filtroSel = document.getElementById('filtro-livro-poemas');
    if (filtroSel) {
        const valorAtual = filtroSel.value;
        const livrosComuns = db.livros.filter(l => l.tipo !== 'Coletânea');
        const coletaneas = db.livros.filter(l => l.tipo === 'Coletânea');
        filtroSel.innerHTML =
            '<option value="">-- Todos os livros --</option>' +
            (livrosComuns.length ? '<optgroup label="Livros">' + livrosComuns.map(l => `<option value="${l.id}">${l.titulo}</option>`).join('') + '</optgroup>' : '') +
            (coletaneas.length ? '<optgroup label="Coletâneas">' + coletaneas.map(c => `<option value="${c.id}">${c.titulo}</option>`).join('') + '</optgroup>' : '');
        if (Array.from(filtroSel.options).some(o => o.value === valorAtual)) filtroSel.value = valorAtual;
    }

    const listaFiltrada = getListaVisivelPoemas();

    const masterCheckbox = document.getElementById('check-todos-poemas');
    if (masterCheckbox) {
        masterCheckbox.checked = listaFiltrada.length > 0 && listaFiltrada.every(p => selecaoPoemas.has(p.id));
    }
    atualizarBarraSelecao();

    if (listaFiltrada.length === 0) {
        container.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-400 text-sm">Nenhum poema encontrado.</td></tr>`;
        return;
    }

    container.innerHTML = listaFiltrada.map(p => {
        const paiObjeto = p.paiTipo === 'secao'
            ? db.secoes.find(s => s.id == p.paiId)
            : p.paiTipo === 'parte'
                ? db.partes.find(pt => pt.id == p.paiId)
                : db.livros.find(l => l.id == p.paiId);

        let infoPai = "Avulso";
        if (paiObjeto) {
            const rotulo = p.paiTipo === 'secao' ? 'SEC' : p.paiTipo === 'parte' ? 'PART' : 'LIVRO';
            infoPai = `${paiObjeto.titulo} [${rotulo}]`;
        }

        return `
        <tr class="border-b hover:bg-blue-50/50">
            <td class="p-4">
                <input type="checkbox" class="check-poema" ${selecaoPoemas.has(p.id) ? 'checked' : ''}
                    onclick="toggleSelecaoPoema(this.checked, ${p.id})">
            </td>
            <td class="p-4 font-bold text-gray-700">
                <span class="text-[10px] text-blue-400 mr-2">${p.sequencia ?? '—'}</span>
                ${p.titulo}
                ${p._livros ? `<div class="text-[10px] text-indigo-500 font-normal mt-1">Livros: ${p._livros}</div>` : ''}
                ${p.pessoas ? `<div class="text-[10px] text-rose-500 font-normal mt-1">Dedicado a: ${p.pessoas}</div>` : ''}
            </td>
            <td class="p-4 text-xs text-gray-400 font-mono" title="${p.dataPublicacao ? 'Publicação: ' + formatarDataParcial(p.dataPublicacao) : ''}">${p.dataEscrita ? formatarDataParcial(p.dataEscrita) : (p.ano || '—')}</td>
            <td class="p-4 text-xs text-gray-400">${infoPai}</td>
            <td class="p-4">${p.publicado ? '🟢' : '⚪'}</td>
            <td class="p-4 text-right space-x-2">
                <button onclick="editarPoema(${p.id})" class="bg-blue-100 text-blue-700 px-3 py-1 rounded text-xs font-bold uppercase hover:bg-blue-200">Editar</button>
                <button onclick="deleteItem('poemas', ${p.id})" class="text-red-400 text-xs uppercase hover:text-red-600">Excluir</button>
            </td>
        </tr>`;
    }).join('');
}

// ─── Prosas ──────────────────────────────────────────────────

function renderProsas() {
    const container = document.getElementById('lista-prosas');
    if (!container) return;

    // Popula o filtro com Livros e Coletâneas em grupos separados
    const filtroSelPr = document.getElementById('filtro-livro-prosas');
    if (filtroSelPr) {
        const valorAtual = filtroSelPr.value;
        const livrosComuns = db.livros.filter(l => l.tipo !== 'Coletânea');
        const coletaneas   = db.livros.filter(l => l.tipo === 'Coletânea');
        filtroSelPr.innerHTML =
            '<option value="">-- Todos os livros --</option>' +
            (livrosComuns.length ? '<optgroup label="Livros">' + livrosComuns.map(l => `<option value="${l.id}">${l.titulo}</option>`).join('') + '</optgroup>' : '') +
            (coletaneas.length   ? '<optgroup label="Coletâneas">' + coletaneas.map(c => `<option value="${c.id}">${c.titulo}</option>`).join('') + '</optgroup>' : '');
        if (Array.from(filtroSelPr.options).some(o => o.value === valorAtual)) filtroSelPr.value = valorAtual;
    }

    let lista = db.prosas;
    if (filtroLivroProsa) {
        const livroSel = db.livros.find(l => String(l.id) === String(filtroLivroProsa));
        if (livroSel?.tipo === 'Coletânea') {
            // Prosas numa coletânea vivem em itensColetanea (via refId), não em paiId
            const partesIds = new Set(
                db.partes.filter(p => String(p.livroId) === String(filtroLivroProsa)).map(p => String(p.id))
            );
            const refIds = new Set(
                (db.itensColetanea || [])
                    .filter(i => partesIds.has(String(i.parteId)) && i.refTipo === 'prosa' && i.refId)
                    .map(i => String(i.refId))
            );
            lista = lista.filter(pr => refIds.has(String(pr.id)));
        } else {
            lista = lista.filter(pr => String(livroDaProsa(pr)) === String(filtroLivroProsa));
        }
    }
    const listaFiltrada = filtrarTextos(lista, filtroProsas);

    if (listaFiltrada.length === 0) {
        container.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-400 text-sm">Nenhuma prosa encontrada.</td></tr>`;
        return;
    }

    container.innerHTML = listaFiltrada.map(pr => {
        let paiObjeto = null, rotulo = 'Avulso';
        if (pr.paiTipo === 'secao')       { paiObjeto = db.secoes.find(s => s.id == pr.paiId); rotulo = 'SEC'; }
        else if (pr.paiTipo === 'parte')  { paiObjeto = db.partes.find(p => p.id == pr.paiId); rotulo = 'PART'; }
        else if (pr.paiTipo === 'livro')  { paiObjeto = db.livros.find(l => l.id == pr.paiId); rotulo = 'LIVRO'; }

        const infoVinc = paiObjeto ? `${paiObjeto.titulo} [${rotulo}]` : 'Sem vínculo';
        const pubBadge = pr.publicado
            ? `<span class="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase">pub</span>`
            : '';
        const tags = pr.sinalizacoes
            ? pr.sinalizacoes.split(',').map(t => t.trim()).filter(Boolean)
                .map(t => `<span class="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">${t}</span>`).join('')
            : '';
        const pessoas = pr.pessoas
            ? pr.pessoas.split(',').map(p => p.trim()).filter(Boolean)
                .map(p => `<span class="text-[9px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded">${p}</span>`).join('')
            : '';

        return `
        <tr class="border-b hover:bg-blue-50/50">
            <td class="p-4">
                <div class="font-bold text-gray-700 flex items-center gap-2">${pr.titulo} ${pubBadge}</div>
                <div class="flex flex-wrap gap-1 mt-1">${tags}${pessoas}</div>
            </td>
            <td class="p-4 text-xs text-gray-400 font-mono" title="${pr.dataPublicacao ? 'Publicação: ' + formatarDataParcial(pr.dataPublicacao) : ''}">${pr.dataEscrita ? formatarDataParcial(pr.dataEscrita) : (pr.ano || '—')}</td>
            <td class="p-4 text-xs text-gray-400">${infoVinc}</td>
            <td class="p-4 text-right space-x-2">
                <button onclick="editarProsa(${pr.id})" class="bg-blue-100 text-blue-700 px-3 py-1 rounded text-xs font-bold uppercase hover:bg-blue-200">Editar</button>
                <button onclick="deleteItem('prosas', ${pr.id})" class="text-red-400 text-xs uppercase hover:text-red-600">Excluir</button>
            </td>
        </tr>`;
    }).join('');
}

// ─── Elementos ───────────────────────────────────────────────

function renderElementos() {
    const container = document.getElementById('lista-elementos');
    if (!container) return;

    popularFiltroLivro('filtro-livro-elementos');

    const filtrados = filtroLivroElementos
        ? db.elementos.filter(e => String(livroDoElemento(e)) === String(filtroLivroElementos))
        : db.elementos;

    const ordenados = [...filtrados].sort((a, b) => {
        const [lA, ppA, psA] = getPosicaoElemento(a, db);
        const [lB, ppB, psB] = getPosicaoElemento(b, db);
        if (lA !== lB) return lA - lB;
        if (ppA !== ppB) return ppA - ppB;
        if (psA !== psB) return psA - psB;
        return (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999);
    });

    container.innerHTML = ordenados.map(el => {
        const pai = el.paiTipo === 'livro' ? db.livros.find(l => l.id == el.paiId)
            : el.paiTipo === 'parte' ? db.partes.find(p => p.id == el.paiId)
            : db.secoes.find(s => s.id == el.paiId);

        return `
        <div class="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col h-full">
            <div class="flex justify-between items-start mb-2">
                <span class="text-[10px] bg-gray-100 px-2 py-1 rounded uppercase font-bold text-gray-500">${el.tipo}</span>
                <div class="flex gap-2">
                    <button onclick="editarElemento(${el.id})" class="text-blue-600 text-xs">Editar</button>
                    <button onclick="deleteItem('elementos', ${el.id})" class="text-red-400 text-xs">Excluir</button>
                </div>
            </div>
            ${el.titulo ? `<p class="text-sm font-semibold text-gray-700 mt-1 mb-1">${el.titulo}</p>` : ''}
            ${el.imagem ? `<img src="${el.imagem}" class="w-full h-24 object-cover rounded mb-2 border">` : ''}
            <p class="text-sm text-gray-600 line-clamp-3 italic mb-auto" style="white-space: pre-line;">${el.texto || '(Sem texto)'}</p>
            ${el.notas ? `
                <div class="mt-2 p-2 bg-amber-50 border-l-2 border-amber-200 text-[10px] text-amber-700 italic">
                    <strong class="uppercase">Nota:</strong>
                    <span class="line-clamp-2">${el.notas}</span>
                </div>` : ''}
            <div class="flex justify-between items-center mt-3 pt-2 border-t border-gray-50">
                <p class="text-[10px] text-blue-500 font-bold uppercase">Vínculo: ${pai ? pai.titulo : '---'}</p>
                <span class="text-[9px] font-mono text-gray-300">#${el.sequencia ?? '—'}</span>
            </div>
        </div>`;
    }).join('');
}

// ─── Listener automático ─────────────────────────────────────

window.addEventListener('db:saved', renderLists);
