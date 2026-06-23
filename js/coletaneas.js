// ============================================================
// coletaneas.js — Lógica completa da aba Coletâneas
// Importado por: main.js
// ============================================================

import { db, save }        from './db.js';
import { toBase64, abrirModalExclusao } from './utils.js';
import { toggleModal, garantirModal } from './ui.js';

// ─── Estado local ─────────────────────────────────────────────

let coletaneaSelecionadaId = null;

// ─── Helpers ─────────────────────────────────────────────────

function getColetaneas() {
    return db.livros.filter(l => l.tipo === 'Coletânea')
        .sort((a, b) => (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999));
}

function getColetanea(id) {
    return db.livros.find(l => l.id == id && l.tipo === 'Coletânea');
}

function getPartesDeColetanea(livroId) {
    return db.partes
        .filter(p => p.livroId == livroId)
        .sort((a, b) => (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999));
}

function getItensDeColetanea(parteId) {
    return (db.itensColetanea || [])
        .filter(i => i.parteId == parteId)
        .sort((a, b) => (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999));
}

function resolverItem(item) {
    if (item.textoOverride) return { ...item, textoResolvido: item.textoOverride };
    if (item.refId && item.refTipo) {
        const colecao   = db[item.refTipo + 's'];
        const original  = colecao?.find(x => x.id == item.refId);
        return { ...item, textoResolvido: original?.texto || '', tituloResolvido: original?.titulo || item.titulo };
    }
    return item;
}

function origemLabel(item) {
    if (!item.refId) return 'exclusivo desta coletânea';
    const colecao  = db[item.refTipo + 's'];
    const original = colecao?.find(x => x.id == item.refId);
    if (!original) return 'referência não encontrada';

    let contexto = '';
    if (original.paiTipo === 'secao') {
        const sec   = db.secoes.find(s => s.id == original.paiId);
        const parte = sec?.paiTipo === 'parte' ? db.partes.find(p => p.id == sec.paiId) : null;
        const livro = parte
            ? db.livros.find(l => l.id == parte.livroId)
            : db.livros.find(l => l.id == sec?.paiId);
        contexto = [livro?.siglaOficial || livro?.titulo, parte?.titulo, sec?.titulo].filter(Boolean).join(' · ');
    } else if (original.paiTipo === 'parte') {
        const parte = db.partes.find(p => p.id == original.paiId);
        const livro = db.livros.find(l => l.id == parte?.livroId);
        contexto = [livro?.siglaOficial || livro?.titulo, parte?.titulo].filter(Boolean).join(' · ');
    } else if (original.paiTipo === 'livro') {
        const livro = db.livros.find(l => l.id == original.paiId);
        contexto = livro?.siglaOficial || livro?.titulo || '';
    }

    return contexto || 'origem desconhecida';
}

// ─── Renderização principal ───────────────────────────────────

export function renderColetaneas() {
    renderListaColetaneas();
    if (coletaneaSelecionadaId) {
        renderEditorColetanea(coletaneaSelecionadaId);
    } else {
        const lista = getColetaneas();
        if (lista.length > 0) selecionarColetanea(lista[0].id);
        else renderEditorVazio();
    }
}

function renderListaColetaneas() {
    const container = document.getElementById('lista-coletaneas');
    if (!container) return;

    const lista = getColetaneas();

    if (lista.length === 0) {
        container.innerHTML = `
            <p style="font-size:12px; color:var(--color-text-tertiary); line-height:1.5;">
                Nenhuma coletânea ainda. Cadastre um livro com tipo "Coletânea" na aba Livros.
            </p>`;
        return;
    }

    container.innerHTML = lista.map(col => {
        const partes     = getPartesDeColetanea(col.id);
        const totalItens = partes.reduce((acc, p) => acc + getItensDeColetanea(p.id).length, 0);
        const ativa      = col.id == coletaneaSelecionadaId;

        return `
        <div onclick="selecionarColetanea(${col.id})"
             style="cursor:pointer; padding:12px 14px; border-radius:var(--border-radius-lg);
                    border:0.5px solid ${ativa ? '#185FA5' : 'var(--color-border-tertiary)'};
                    background:${ativa ? '#E6F1FB' : 'var(--color-background-primary)'};
                    margin-bottom:8px;">
            <div style="font-size:13px; font-weight:500;
                        color:${ativa ? '#0C447C' : 'var(--color-text-primary)'};">
                ${col.titulo}
            </div>
            <div style="font-size:10px; margin-top:2px;
                        color:${ativa ? '#185FA5' : 'var(--color-text-tertiary)'};">
                SEQ ${col.sequencia || '—'} · ${totalItens} iten${totalItens !== 1 ? 's' : ''}
            </div>
        </div>`;
    }).join('');
}

function renderEditorVazio() {
    const editor = document.getElementById('editor-coletanea');
    if (!editor) return;
    editor.innerHTML = `
        <p style="font-size:13px; color:var(--color-text-tertiary); padding:2rem 0;">
            Selecione uma coletânea para editar.
        </p>`;
}

function renderEditorColetanea(livroId) {
    const editor = document.getElementById('editor-coletanea');
    if (!editor) return;

    const col    = getColetanea(livroId);
    if (!col) return;

    const partes = getPartesDeColetanea(livroId);

    editor.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
            <div>
                <div style="font-size:16px; font-weight:500; color:var(--color-text-primary);">${col.titulo}</div>
                <div style="font-size:11px; color:var(--color-text-tertiary); margin-top:2px;">Coletânea · SEQ ${col.sequencia || '—'}</div>
            </div>
            <button onclick="prepararNovaParte(${livroId})"
                    style="font-size:12px; padding:6px 14px; border:0.5px solid #185FA5;
                           border-radius:var(--border-radius-md); background:#185FA5;
                           color:#fff; cursor:pointer;">+ nova parte</button>
        </div>
        ${partes.length === 0
            ? `<p style="font-size:13px; color:var(--color-text-tertiary);">Nenhuma parte ainda. Adicione a primeira.</p>`
            : partes.map(p => renderParteColetanea(p)).join('')
        }`;
}

function renderParteColetanea(parte) {
    const itens = getItensDeColetanea(parte.id);

    const refLabel = parte.refId
        ? (() => {
            const original = db.partes.find(x => x.id == parte.refId);
            const livro    = original ? db.livros.find(l => l.id == original.livroId) : null;
            return `inspirada em: ${original?.titulo || '?'} · ${livro?.siglaOficial || livro?.titulo || '?'}`;
          })()
        : 'parte nova · exclusiva desta coletânea';

    const totalItens = itens.length;

    return `
    <div style="border:0.5px solid var(--color-border-tertiary); border-radius:var(--border-radius-lg);
                margin-bottom:12px; overflow:hidden;">
        <details open>
            <summary style="background:var(--color-background-secondary); padding:10px 14px;
                            display:flex; justify-content:space-between; align-items:center;
                            cursor:pointer; list-style:none; user-select:none;"
                     onclick="event.stopPropagation()">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:10px; color:var(--color-text-tertiary); transition:transform 0.15s;"
                          class="col-parte-chevron">▼</span>
                    <div>
                        <div style="font-size:12px; font-weight:500; color:var(--color-text-primary);">${parte.titulo}</div>
                        <div style="font-size:10px; color:var(--color-text-tertiary); margin-top:1px;">
                            ${refLabel} · ${totalItens} iten${totalItens !== 1 ? 's' : ''}
                        </div>
                    </div>
                </div>
                <div style="display:flex; gap:6px;" onclick="event.stopPropagation()">
                    <button onclick="editarParteColetanea(${parte.id})"
                            style="font-size:11px; padding:4px 10px; border:0.5px solid var(--color-border-secondary);
                                   border-radius:var(--border-radius-md); background:transparent;
                                   color:var(--color-text-secondary); cursor:pointer;">editar</button>
                    <button onclick="deletarParteColetanea(${parte.id})"
                            style="font-size:11px; padding:4px 10px; border:0.5px solid var(--color-border-danger);
                                   border-radius:var(--border-radius-md); background:transparent;
                                   color:var(--color-text-danger); cursor:pointer;">excluir</button>
                </div>
            </summary>
            <div>
                ${itens.map((item, idx) => renderItemLinha(item, idx, itens.length)).join('')}
                <div onclick="prepararNovoItem(${parte.id})"
                     style="padding:8px 14px; display:flex; align-items:center; gap:6px;
                            border-top:0.5px solid var(--color-border-tertiary); cursor:pointer;">
                    <span style="font-size:16px; color:var(--color-text-tertiary); line-height:1;">+</span>
                    <span style="font-size:11px; color:var(--color-text-tertiary);">adicionar poema, prosa ou inédito</span>
                </div>
            </div>
        </details>
    </div>`;
}

function renderItemLinha(item, idx, total) {
    const badges = {
        poema:  'background:#E6F1FB; color:#0C447C;',
        prosa:  'background:#E1F5EE; color:#085041;',
    };
    const badgeStyle = item.refId ? (badges[item.refTipo] || 'background:#F1EFE8; color:#444441;')
                                  : 'background:#FAEEDA; color:#633806;';
    const tipoLabel  = item.refId ? (item.refTipo || '?') : 'inédito';
    const origem     = origemLabel(item);
    const temOverride = !!item.textoOverride;

    return `
    <div style="padding:8px 14px; display:flex; align-items:center; gap:10px;
                border-top:0.5px solid var(--color-border-tertiary);">
        <span style="font-size:9px; font-weight:500; padding:2px 6px; border-radius:4px;
                     text-transform:uppercase; flex-shrink:0; ${badgeStyle}">${tipoLabel}</span>
        <span style="font-size:12px; color:var(--color-text-primary); flex:1; min-width:0;
                     overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${item.titulo}
            ${temOverride ? '<span style="font-size:9px; color:#BA7517; margin-left:4px;">[versão alternativa]</span>' : ''}
        </span>
        <span style="font-size:10px; color:var(--color-text-tertiary); flex-shrink:0;">${origem}</span>
        <div style="display:flex; gap:4px; flex-shrink:0;">
            ${idx > 0 ? `<button onclick="moverItem(${item.id},-1)"
                style="font-size:10px; padding:2px 6px; border:0.5px solid var(--color-border-tertiary);
                       border-radius:4px; background:transparent; color:var(--color-text-tertiary); cursor:pointer;">↑</button>` : ''}
            ${idx < total - 1 ? `<button onclick="moverItem(${item.id},1)"
                style="font-size:10px; padding:2px 6px; border:0.5px solid var(--color-border-tertiary);
                       border-radius:4px; background:transparent; color:var(--color-text-tertiary); cursor:pointer;">↓</button>` : ''}
            <button onclick="editarItem(${item.id})"
                style="font-size:10px; padding:2px 6px; border:0.5px solid var(--color-border-secondary);
                       border-radius:4px; background:transparent; color:var(--color-text-secondary); cursor:pointer;">editar</button>
            <button onclick="deletarItemColetanea(${item.id})"
                style="font-size:10px; padding:2px 6px; border:0.5px solid var(--color-border-danger);
                       border-radius:4px; background:transparent; color:var(--color-text-danger); cursor:pointer;">×</button>
        </div>
    </div>`;
}

// ─── Seleção ──────────────────────────────────────────────────

export function selecionarColetanea(id) {
    coletaneaSelecionadaId = id;
    renderColetaneas();
}

// ─── Partes ───────────────────────────────────────────────────

export async function prepararNovaParte(livroId) {
    coletaneaSelecionadaId = livroId;
    await garantirModal('modal-col-parte');
    document.getElementById('cp-edit-id').value    = '';
    document.getElementById('cp-livro-id').value   = livroId;
    document.getElementById('cp-titulo').value     = '';
    document.getElementById('cp-sequencia').value  = '';
    document.getElementById('cp-capa-desc').value  = '';
    document.getElementById('cp-abertura').value   = '';
    document.getElementById('cp-nota').value       = '';
    preencherSelectPartes('cp-ref');
    document.getElementById('cp-ref').value = '';
    document.getElementById('modal-col-parte-titulo').innerText = 'Nova parte da coletânea';
    toggleModal('modal-col-parte');
}

export async function editarParteColetanea(id) {
    const p = db.partes.find(x => x.id == id);
    if (!p) return;
    await garantirModal('modal-col-parte');
    document.getElementById('cp-edit-id').value    = p.id;
    document.getElementById('cp-livro-id').value   = p.livroId;
    document.getElementById('cp-titulo').value     = p.titulo;
    document.getElementById('cp-sequencia').value  = p.sequencia || '';
    document.getElementById('cp-capa-desc').value  = p.capaDesc || '';
    document.getElementById('cp-abertura').value   = p.abertura || '';
    document.getElementById('cp-nota').value       = p.nota || '';
    preencherSelectPartes('cp-ref');
    setTimeout(() => { document.getElementById('cp-ref').value = p.refId || ''; }, 0);
    document.getElementById('modal-col-parte-titulo').innerText = 'Editar parte';
    toggleModal('modal-col-parte');
}

export function deletarParteColetanea(id) {
    const parte  = db.partes.find(p => p.id == id);
    const titulo = parte?.titulo || `#${id}`;
    const total  = (db.itensColetanea || []).filter(i => i.parteId == id).length;
    const rotulo = total > 0 ? `Parte da coletânea · ${total} iten${total !== 1 ? 's' : ''} serão removidos` : 'Parte da coletânea';

    abrirModalExclusao(titulo, rotulo, () => {
        db.partes = db.partes.filter(p => p.id != id);
        if (!db.itensColetanea) db.itensColetanea = [];
        db.itensColetanea = db.itensColetanea.filter(i => i.parteId != id);
        save();
        renderEditorColetanea(coletaneaSelecionadaId);
    });
}

function preencherSelectPartes(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const partesOriginais = db.partes.filter(p => {
        const livro = db.livros.find(l => l.id == p.livroId);
        return livro && livro.tipo !== 'Coletânea';
    });
    sel.innerHTML = '<option value="">— Parte nova (sem referência) —</option>' +
        partesOriginais.map(p => {
            const livro = db.livros.find(l => l.id == p.livroId);
            return `<option value="${p.id}">${livro?.siglaOficial || livro?.titulo || '?'} · ${p.titulo}</option>`;
        }).join('');
}

export function initFormColParte() {
    const form = document.getElementById('form-col-parte');
    if (!form) return;
    form.onsubmit = async (e) => {
        e.preventDefault();
        const idInput = document.getElementById('cp-edit-id').value;
        const livroId = document.getElementById('cp-livro-id').value;
        const id      = idInput ? parseInt(idInput) : Date.now();
        const refIdRaw = document.getElementById('cp-ref').value;

        const capaFile = document.getElementById('cp-capa').files[0];
        const capaBase64 = capaFile ? await toBase64(capaFile) : (idInput ? db.partes.find(x => x.id == parseInt(idInput))?.capa || null : null);

        const dados = {
            id,
            livroId,
            titulo:    document.getElementById('cp-titulo').value,
            sequencia: parseInt(document.getElementById('cp-sequencia').value) || 0,
            capaDesc:  document.getElementById('cp-capa-desc').value.trim() || null,
            capa:      capaBase64,
            abertura:  document.getElementById('cp-abertura').value.trim() || null,
            nota:      document.getElementById('cp-nota').value,
            refId:     refIdRaw ? parseInt(refIdRaw) : null
        };

        if (idInput) {
            const idx = db.partes.findIndex(x => x.id == id);
            if (idx !== -1) db.partes[idx] = dados;
        } else {
            db.partes.push(dados);
        }

        save();
        toggleModal('modal-col-parte');
        renderEditorColetanea(coletaneaSelecionadaId);
    };
}

// ─── Itens ───────────────────────────────────────────────────

export async function prepararNovoItem(parteId) {
    await garantirModal('modal-col-item');
    document.getElementById('ci-edit-id').value          = '';
    document.getElementById('ci-parte-id').value         = parteId;
    document.getElementById('ci-titulo').value           = '';
    document.getElementById('ci-texto-override').value   = '';
    document.getElementById('ci-sequencia').value        = '';
    document.getElementById('ci-ref-tipo').value         = 'poema';
    document.getElementById('ci-override-area').classList.add('hidden');
    preencherSelectItens('poema');
    document.getElementById('modal-col-item-titulo').innerText = 'Adicionar item';
    toggleModal('modal-col-item');
}

export async function editarItem(id) {
    if (!db.itensColetanea) return;
    const item = db.itensColetanea.find(x => x.id == id);
    if (!item) return;
    await garantirModal('modal-col-item');

    document.getElementById('ci-edit-id').value        = item.id;
    document.getElementById('ci-parte-id').value       = item.parteId;
    document.getElementById('ci-titulo').value          = item.titulo;
    document.getElementById('ci-sequencia').value       = item.sequencia || '';
    document.getElementById('ci-texto-override').value  = item.textoOverride || '';
    document.getElementById('ci-ref-tipo').value        = item.refTipo || 'poema';
    document.getElementById('ci-override-area').classList.toggle('hidden', !item.textoOverride);

    preencherSelectItens(item.refTipo || 'poema');
    setTimeout(() => { document.getElementById('ci-ref-id').value = item.refId || ''; }, 0);

    document.getElementById('modal-col-item-titulo').innerText = 'Editar item';
    toggleModal('modal-col-item');
}

export function deletarItemColetanea(id) {
    if (!db.itensColetanea) return;
    const item   = db.itensColetanea.find(i => i.id == id);
    const titulo = item?.titulo || `#${id}`;

    abrirModalExclusao(titulo, 'Item da coletânea', () => {
        db.itensColetanea = db.itensColetanea.filter(i => i.id != id);
        save();
        renderEditorColetanea(coletaneaSelecionadaId);
    });
}

export function moverItem(id, direcao) {
    if (!db.itensColetanea) return;
    const item = db.itensColetanea.find(x => x.id == id);
    if (!item) return;

    const irmaos = db.itensColetanea
        .filter(i => i.parteId == item.parteId)
        .sort((a, b) => (parseInt(a.sequencia) || 0) - (parseInt(b.sequencia) || 0));

    const idx  = irmaos.findIndex(i => i.id == id);
    const alvo = irmaos[idx + direcao];
    if (!alvo) return;

    const seqTemp  = item.sequencia;
    item.sequencia = alvo.sequencia;
    alvo.sequencia = seqTemp;

    irmaos.sort((a, b) => (parseInt(a.sequencia) || 0) - (parseInt(b.sequencia) || 0));
    irmaos.forEach((i, n) => { i.sequencia = n + 1; });

    save();
    renderEditorColetanea(coletaneaSelecionadaId);
}

export function onChangeTipoItem() {
    const tipo = document.getElementById('ci-ref-tipo').value;
    preencherSelectItens(tipo);
}

export function toggleOverride() {
    const area = document.getElementById('ci-override-area');
    area.classList.toggle('hidden');
    if (!area.classList.contains('hidden')) {
        const refId   = document.getElementById('ci-ref-id').value;
        const tipo    = document.getElementById('ci-ref-tipo').value;
        const campo   = document.getElementById('ci-texto-override');
        if (!campo.value && refId) {
            const original = (db[tipo + 's'] || []).find(x => x.id == refId);
            if (original?.texto) campo.value = original.texto;
        }
    }
}

function preencherSelectItens(tipo) {
    const sel = document.getElementById('ci-ref-id');
    if (!sel) return;
    const colecao = db[tipo + 's'] || [];
    sel.innerHTML = '<option value="">— Inédito (sem referência) —</option>' +
        colecao.map(item => {
            const origem = origemLabel({ refId: item.id, refTipo: tipo });
            return `<option value="${item.id}">${item.titulo} · ${origem}</option>`;
        }).join('');
}

export function initFormColItem() {
    const form = document.getElementById('form-col-item');
    if (!form) return;
    form.onsubmit = (e) => {
        e.preventDefault();
        if (!db.itensColetanea) db.itensColetanea = [];

        const idInput  = document.getElementById('ci-edit-id').value;
        const id       = idInput ? parseInt(idInput) : Date.now();
        const parteId  = parseInt(document.getElementById('ci-parte-id').value);
        const refIdRaw = document.getElementById('ci-ref-id').value;
        const refTipo  = document.getElementById('ci-ref-tipo').value;
        const refId    = refIdRaw ? parseInt(refIdRaw) : null;
        const override = document.getElementById('ci-texto-override').value.trim();

        let titulo = document.getElementById('ci-titulo').value.trim();
        if (!titulo && refId) {
            const original = (db[refTipo + 's'] || []).find(x => x.id == refId);
            titulo = original?.titulo || '';
        }

        const irmaos = db.itensColetanea.filter(i => i.parteId == parteId && i.id != id);
        const maxSeq = irmaos.reduce((m, i) => Math.max(m, parseInt(i.sequencia) || 0), 0);

        const dados = {
            id,
            parteId,
            titulo,
            refId,
            refTipo:       refId ? refTipo : null,
            textoOverride: override || null,
            sequencia:     parseInt(document.getElementById('ci-sequencia').value) || maxSeq + 1
        };

        if (idInput) {
            const idx = db.itensColetanea.findIndex(x => x.id == id);
            if (idx !== -1) db.itensColetanea[idx] = dados;
        } else {
            db.itensColetanea.push(dados);
        }

        save();
        toggleModal('modal-col-item');
        renderEditorColetanea(coletaneaSelecionadaId);
    };
}

// ─── Consulta usada por fora (forms.js) ───────────────────────
// Pra mostrar, no modal de Poema/Prosa, em quais coletâneas (e em qual
// Parte de cada uma) aquele texto aparece — só leitura, a edição em si
// continua exclusivamente pela aba Coletâneas (ver itensColetanea).
export function getColetaneasDeItem(refTipo, refId) {
    if (!refId) return [];
    return (db.itensColetanea || [])
        .filter(i => i.refTipo === refTipo && i.refId == refId)
        .map(item => {
            const parte = db.partes.find(p => p.id == item.parteId);
            const col   = parte ? getColetanea(parte.livroId) : null;
            if (!col) return null;
            return { coletaneaId: col.id, coletaneaTitulo: col.titulo, parteTitulo: parte.titulo };
        })
        .filter(Boolean);
}

// ─── Exportação para nesting ──────────────────────────────────

export function exportarColetaneaResolvida(livroId) {
    const col = getColetanea(livroId);
    if (!col) return null;
    const partes = getPartesDeColetanea(livroId).map(parte => ({
        ...parte,
        itens: getItensDeColetanea(parte.id).map(item => resolverItem(item))
    }));
    return { ...col, partes };
}

// ─── Listener automático ─────────────────────────────────────
window.addEventListener('db:saved', renderColetaneas);

// ─── CSS para o chevron do toggle de partes ──────────────────
// Injeta uma vez só; o chevron gira quando o <details> está fechado.
(function injetarEstiloChevron() {
    if (document.getElementById('col-parte-chevron-style')) return;
    const style = document.createElement('style');
    style.id = 'col-parte-chevron-style';
    style.textContent = `
        details:not([open]) .col-parte-chevron { transform: rotate(-90deg); }
        details summary::-webkit-details-marker { display: none; }
    `;
    document.head.appendChild(style);
})();
