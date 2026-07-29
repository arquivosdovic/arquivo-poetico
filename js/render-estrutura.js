// ============================================================
// render-estrutura.js — Aba "Estrutura": árvore completa do livro
// (Parte → Seção → Poema/Prosa/Elemento), com seleção múltipla
// (inclusive em cascata via Shift+clique), exportação da seleção,
// reordenação (▲▼) e o modal de "mover para outro nível".
//
// Extraído de render.js — ver render-listas.js (tabelas/grids das
// abas Livros/Partes/Seções/Poemas/Prosas/Elementos) e
// render-lightbox.js (capas + lightbox, não usados aqui: a árvore
// de Estrutura não mostra capas).
// ============================================================

import { db, save } from './db.js';
import {
    reordenarPosicao,
    seqOuNull,
    fecharEspaco,
    getIrmaosPorEscopo,
    escapeHtml,
    mostrarAviso,
} from './utils.js';

let livroEstruturaAtual = '';

// Chaves (`${tipo}-${id}`) dos <details> que o usuário fechou manualmente.
// Sobrevive a re-renders (causados por mover item, salvar etc.) pra não
// reabrir tudo que já tinha sido colapsado.
const _detailsColapsados = new Set();

// Guarda o que o usuário marcou na árvore: { tipo → Set de ids }
const selecaoEstrutura = {
    parte: new Set(),
    secao: new Set(),
    poema: new Set(),
    prosa: new Set(),
    elemento: new Set(),
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
        getDentroParteComTipos(id).forEach((f) =>
            _selecionarCascata(f.tipo, Number(f.dados.id), checked),
        );
    } else if (tipo === 'secao') {
        getDentroSecaoComTipos(id).forEach((f) =>
            _selecionarCascata(f.tipo, Number(f.dados.id), checked),
        );
    }
    // Poema, prosa e elemento são folhas — não têm filhos
}

export function marcarTodosEstrutura(marcar) {
    Object.values(selecaoEstrutura).forEach((s) => s.clear());
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
    const cont = document.getElementById('contador-estrutura');
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
        livros: db.livros.filter((l) => getIds('livro').includes(String(l.id))), // nunca selecionável, mas mantém compatibilidade
        partes: db.partes.filter((p) => getIds('parte').includes(String(p.id))),
        secoes: db.secoes.filter((s) => getIds('secao').includes(String(s.id))),
        poemas: db.poemas.filter((p) => getIds('poema').includes(String(p.id))),
        prosas: (db.prosas || []).filter((pr) => getIds('prosa').includes(String(pr.id))),
        elementos: (db.elementos || []).filter((e) => getIds('elemento').includes(String(e.id))),
        coletaneas: [],
        itensColetanea: [],
    };

    const total = Object.values(saida).flat().length;
    if (total === 0) {
        mostrarAviso('Nenhum item selecionado.');
        return;
    }

    const blob = new Blob([JSON.stringify(saida, null, 4)], {
        type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `selecao_estrutura_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
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
    return ordenarPorSeq(
        [
            ...db.partes
                .filter((p) => p.livroId == livroId)
                .map((p) => ({ tipo: 'parte', dados: p })),
            ...db.secoes
                .filter((s) => s.paiTipo === 'livro' && s.paiId == livroId)
                .map((s) => ({ tipo: 'secao', dados: s })),
            ...db.elementos
                .filter((e) => e.paiTipo === 'livro' && e.paiId == livroId)
                .map((e) => ({ tipo: 'elemento', dados: e })),
            ...db.poemas
                .filter((p) => p.paiTipo === 'livro' && p.paiId == livroId)
                .map((p) => ({ tipo: 'poema', dados: p })),
            ...db.prosas
                .filter((p) => p.paiTipo === 'livro' && p.paiId == livroId)
                .map((p) => ({ tipo: 'prosa', dados: p })),
        ].map((item) => ({ ...item, dados: item.dados })),
    );
}

function getDentroParteComTipos(parteId) {
    return ordenarPorSeq([
        ...db.secoes
            .filter((s) => s.paiTipo === 'parte' && s.paiId == parteId)
            .map((s) => ({ tipo: 'secao', dados: s })),
        ...db.elementos
            .filter((e) => e.paiTipo === 'parte' && e.paiId == parteId)
            .map((e) => ({ tipo: 'elemento', dados: e })),
        ...db.poemas
            .filter((p) => p.paiTipo === 'parte' && p.paiId == parteId)
            .map((p) => ({ tipo: 'poema', dados: p })),
        ...db.prosas
            .filter((p) => p.paiTipo === 'parte' && p.paiId == parteId)
            .map((p) => ({ tipo: 'prosa', dados: p })),
    ]);
}

function getDentroSecaoComTipos(secaoId) {
    return ordenarPorSeq([
        ...db.elementos
            .filter((e) => e.paiTipo === 'secao' && e.paiId == secaoId)
            .map((e) => ({ tipo: 'elemento', dados: e })),
        ...db.poemas
            .filter((p) => p.paiTipo === 'secao' && p.paiId == secaoId)
            .map((p) => ({ tipo: 'poema', dados: p })),
        ...db.prosas
            .filter((p) => (p.paiTipo === 'secao' && p.paiId == secaoId) || p.secaoId == secaoId)
            .map((p) => ({ tipo: 'prosa', dados: p })),
    ]);
}

const ICONE_TIPO = { parte: '📂', secao: '📁', poema: '📝', prosa: '📄', elemento: '🧩' };
const COR_TIPO = {
    parte: 'font-bold text-blue-800',
    secao: 'font-semibold text-indigo-600',
    poema: 'text-gray-600',
    prosa: 'text-emerald-700',
    elemento: 'text-amber-600 italic',
};

function renderNoEstrutura({ tipo, dados }, nivel) {
    const seq = dados.sequencia !== null && dados.sequencia !== undefined ? dados.sequencia : '—';

    // Elementos (Respiros etc) só têm "tipo" às vezes, sem título — mostra
    // "Tipo: Título" quando os dois existem, senão só o que tiver.
    let titulo = escapeHtml(dados.titulo) || '(sem título)';
    if (tipo === 'elemento') {
        const rotuloTipo = dados.tipo || 'Elemento';
        titulo = dados.titulo
            ? `${escapeHtml(rotuloTipo)}: ${escapeHtml(dados.titulo)}`
            : escapeHtml(rotuloTipo);
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
    const botaoMoverNivel =
        tipo !== 'parte'
            ? `<button onclick="event.stopPropagation(); event.preventDefault(); abrirModalMoverNivel('${tipo}', ${dados.id})"
                class="text-gray-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 px-1 text-xs" title="Mover para outro nível">↪</button>`
            : '';

    const botoesMover = `
        <span class="ml-auto flex gap-1">
            <button onclick="event.stopPropagation(); event.preventDefault(); moverItemEstrutura('${tipo}', ${dados.id}, 'up')"
                class="text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 px-1 text-xs" title="Subir">▲</button>
            <button onclick="event.stopPropagation(); event.preventDefault(); moverItemEstrutura('${tipo}', ${dados.id}, 'down')"
                class="text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 px-1 text-xs" title="Descer">▼</button>
            ${botaoMoverNivel}
        </span>`;

    // Parte e Seção: emoji varia com o estado open/closed do <details>
    if (tipo === 'parte' || tipo === 'secao') {
        const iconeAberto = tipo === 'parte' ? '📂' : '🗂️';
        const iconeFechado = tipo === 'parte' ? '📁' : '📁';
        const filhos =
            tipo === 'parte' ? getDentroParteComTipos(dados.id) : getDentroSecaoComTipos(dados.id);
        const filhosHtml = filhos.map((f) => renderNoEstrutura(f, nivel + 1)).join('');

        const conteudoLinha = `
            ${checkbox}
            <span class="text-[10px] font-mono bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded w-8 text-center inline-block">${seq}</span>
            <span class="icone-details">${iconeAberto}</span>
            <span class="${COR_TIPO[tipo] || ''}">${titulo}</span>
            <span class="text-[9px] uppercase text-gray-300 dark:text-slate-600 ml-2">${tipo}</span>
            ${botoesMover}`;

        return `
        <details open data-icone-aberto="${iconeAberto}" data-icone-fechado="${iconeFechado}"
            data-key="${tipo}-${dados.id}"
            style="margin-left:${nivel * 18}px" class="border-b border-gray-50 dark:border-slate-800 details-icone">
            <summary class="py-1.5 flex items-center gap-2 text-sm cursor-pointer list-none">${conteudoLinha}</summary>
            <div>${filhosHtml || '<p class="text-[10px] text-gray-300 dark:text-slate-600 italic pl-8 pb-1">(vazio)</p>'}</div>
        </details>`;
    }

    // Poema, Prosa, Elemento: linha simples, sem filhos
    const conteudoLinha = `
        ${checkbox}
        <span class="text-[10px] font-mono bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded w-8 text-center inline-block">${seq}</span>
        <span>${ICONE_TIPO[tipo] || '•'}</span>
        <span class="${COR_TIPO[tipo] || ''}">${titulo}</span>
        <span class="text-[9px] uppercase text-gray-300 dark:text-slate-600 ml-2">${tipo}</span>
        ${botoesMover}`;

    return `
        <div style="margin-left:${nivel * 18}px" class="py-1.5 flex items-center gap-2 text-sm border-b border-gray-50 dark:border-slate-800">
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
    const dados = colecoesMoviveis()[tipo]?.find((x) => x.id == id);
    if (!dados) return;

    const irmaos = obterEscopoDoItem(tipo, dados);
    const idx = irmaos.findIndex((f) => f.tipo === tipo && String(f.dados.id) === String(id));
    if (idx === -1) return;

    const alvoIdx = direcao === 'up' ? idx - 1 : idx + 1;
    if (alvoIdx < 0 || alvoIdx >= irmaos.length) return;

    const alvo = irmaos[alvoIdx].dados;
    const seqAtual = dados.sequencia;
    dados.sequencia = alvo.sequencia;
    alvo.sequencia = seqAtual;

    save();
}

function colecoesMoviveis() {
    return {
        secao: db.secoes,
        poema: db.poemas,
        prosa: db.prosas,
        elemento: db.elementos,
    };
}

function construirOpcoesDestinoMover(tipoOrigem, paiTipoAtual, paiIdAtual, livroId) {
    const aceitaSecaoComoDestino = tipoOrigem !== 'secao';
    const livro = db.livros.find((l) => l.id == livroId);

    const ehDestinoAtual = (tipo, id) =>
        tipoOrigem !== '' && tipo === paiTipoAtual && String(id) === String(paiIdAtual);

    let html = '';
    if (!ehDestinoAtual('livro', livroId)) {
        html += `<option value="livro:${livroId}">📖 ${escapeHtml(livro?.titulo) || ''} (o livro inteiro)</option>`;
    }

    const partesDoLivro = db.partes.filter((p) => String(p.livroId) === String(livroId));
    const secoesDiretas = db.secoes.filter(
        (s) => s.paiTipo === 'livro' && String(s.paiId) === String(livroId),
    );

    const topo = [
        ...partesDoLivro.map((item) => ({ tipo: 'parte', item })),
        ...secoesDiretas.map((item) => ({ tipo: 'secao', item })),
    ].sort((a, b) => (parseInt(a.item.sequencia) || 9999) - (parseInt(b.item.sequencia) || 9999));

    topo.forEach(({ tipo, item }) => {
        if (tipo === 'parte') {
            if (!ehDestinoAtual('parte', item.id)) {
                html += `<option value="parte:${item.id}">▸ ${escapeHtml(item.titulo)}</option>`;
            }
            if (aceitaSecaoComoDestino) {
                db.secoes
                    .filter((s) => s.paiTipo === 'parte' && String(s.paiId) === String(item.id))
                    .sort(
                        (a, b) => (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999),
                    )
                    .forEach((s) => {
                        if (!ehDestinoAtual('secao', s.id)) {
                            html += `<option value="secao:${s.id}">　↳ ${escapeHtml(s.titulo)}</option>`;
                        }
                    });
            }
        } else if (aceitaSecaoComoDestino && !ehDestinoAtual('secao', item.id)) {
            html += `<option value="secao:${item.id}">↳ ${escapeHtml(item.titulo)}</option>`;
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
    const dados = colecoesMoviveis()[tipo]?.find((x) => x.id == id);
    if (!dados || !livroEstruturaAtual) return;

    const overlay = _garantirModalMoverNivel();

    document.getElementById('mov-rotulo').textContent = ROTULO_TIPO_MOVER[tipo] || tipo;
    document.getElementById('mov-titulo').textContent = dados.titulo || '(sem título)';

    const selDestino = document.getElementById('mov-destino');
    selDestino.innerHTML = construirOpcoesDestinoMover(
        tipo,
        dados.paiTipo,
        dados.paiId,
        livroEstruturaAtual,
    );

    const inputPosicao = document.getElementById('mov-posicao');
    inputPosicao.value = '';

    document.getElementById('mov-cancelar').onclick = () => _fecharModalMoverNivel();
    document.getElementById('mov-confirmar').onclick = () => {
        const destino = selDestino.value;
        if (!destino) {
            _fecharModalMoverNivel();
            return;
        }
        executarMoverNivel(tipo, id, destino, inputPosicao.value);
        _fecharModalMoverNivel();
    };

    overlay.style.display = 'flex';
}

export function executarMoverNivel(tipo, id, destinoStr, posicaoStr) {
    const dados = colecoesMoviveis()[tipo]?.find((x) => x.id == id);
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
    const irmaosNovos = getIrmaosPorEscopo(db, novoPaiTipo, novoPaiId).filter(
        (it) => it.id != dados.id,
    );
    const posicaoDesejada = seqOuNull(posicaoStr);

    if (posicaoDesejada !== null) {
        reordenarPosicao([...irmaosNovos, dados], dados, posicaoDesejada, null);
    } else {
        const maxSeq = irmaosNovos.reduce(
            (max, it) => Math.max(max, parseInt(it.sequencia) || 0),
            0,
        );
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
    sel.innerHTML =
        '<option value="">-- Escolha um livro --</option>' +
        db.livros
            .filter((l) => l.tipo !== 'Coletânea')
            .map((l) => `<option value="${l.id}">${escapeHtml(l.titulo)}</option>`)
            .join('');
    if (Array.from(sel.options).some((o) => o.value === valorAtual)) sel.value = valorAtual;
}

export function setLivroEstrutura(livroId) {
    livroEstruturaAtual = livroId;
    _detailsColapsados.clear();
    renderEstrutura();
}

export function renderEstrutura() {
    const container = document.getElementById('estrutura-arvore');
    if (!container) return;

    if (!livroEstruturaAtual) {
        container.innerHTML =
            '<p class="text-gray-400 dark:text-slate-500 text-sm">Escolha um livro acima pra ver a árvore completa.</p>';
        return;
    }

    const topo = getTopoComTipos(livroEstruturaAtual);
    if (topo.length === 0) {
        container.innerHTML =
            '<p class="text-gray-400 dark:text-slate-500 text-sm">Esse livro ainda não tem conteúdo vinculado.</p>';
        return;
    }

    container.innerHTML = topo.map((no) => renderNoEstrutura(no, 0)).join('');

    // Re-renderizar reconstrói o HTML do zero (innerHTML), então todo
    // <details> nasce aberto de novo. Aqui reaplicamos o estado de
    // colapso que o usuário já tinha escolhido (rastreado em
    // _detailsColapsados via o listener de 'toggle' abaixo), pra que
    // mover um item (▲▼) não reabra tudo que estava fechado.
    container.querySelectorAll('details.details-icone[data-key]').forEach((det) => {
        if (_detailsColapsados.has(det.dataset.key)) {
            det.open = false;
            const icone = det.querySelector(':scope > summary .icone-details');
            if (icone) icone.textContent = det.dataset.iconeFechado;
        }
    });

    // Atualiza o emoji de pasta quando o usuário abre/fecha um <details>,
    // e memoriza o estado de colapso pra sobreviver ao próximo re-render.
    container.querySelectorAll('details.details-icone').forEach((det) => {
        det.addEventListener('toggle', () => {
            const icone = det.querySelector(':scope > summary .icone-details');
            if (icone) {
                icone.textContent = det.open ? det.dataset.iconeAberto : det.dataset.iconeFechado;
            }
            if (det.dataset.key) {
                if (det.open) _detailsColapsados.delete(det.dataset.key);
                else _detailsColapsados.add(det.dataset.key);
            }
        });
    });
}
