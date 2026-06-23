// ============================================================
// ui.js — Controles de interface: tabs, modais, dropdowns
// Importado por: forms.js, render.js, index.html (main.js)
// ============================================================

import { db } from './db.js';
import { resetTags, resetPessoas, atualizarDatalist } from './editor.js';
import { extrairFasesUnicas } from './utils.js';
import { toggleModal, garantirModal } from './modais.js';

// Reexportados pra quem já importava toggleModal a partir de ui.js
// (forms.js, coletaneas.js, main.js) não precisar trocar o caminho.
export { toggleModal, garantirModal };

export function openTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active-tab'));
    const targetTab = document.getElementById(tabName);
    const targetBtn = document.getElementById('btn-' + tabName);
    if (targetTab) targetTab.classList.add('active');
    if (targetBtn) targetBtn.classList.add('active-tab');
}

// ─── Helpers de hierarquia (pra saber a qual Livro algo pertence) ──

function livroIdDaParte(parteId) {
    const parte = db.partes.find(p => p.id == parteId);
    return parte ? parte.livroId : null;
}

function livroIdDaSecao(secaoId) {
    const secao = db.secoes.find(s => s.id == secaoId);
    if (!secao) return null;
    return secao.paiTipo === 'parte' ? livroIdDaParte(secao.paiId) : secao.paiId;
}

// Exportada para uso de auto-preenchimento de data de publicação
export function livroIdDoDestino(destinoStr) {
    if (!destinoStr) return null;
    const [tipo, id] = destinoStr.split(':');
    if (tipo === 'livro')  return id;
    if (tipo === 'parte')  return livroIdDaParte(id);
    if (tipo === 'secao')  return livroIdDaSecao(id);
    return null;
}

// Monta a lista de Partes/Seções de um livro já na ORDEM da estrutura
// real do livro: Parte 1 (e suas Seções), Parte 2 (e suas Seções), e
// Seções soltas direto no Livro entram na posição certa pela sequência.
function construirEstruturaLivro(livroId) {
    const partesDoLivro = db.partes.filter(p => String(p.livroId) === String(livroId));
    const secoesDiretas = db.secoes.filter(s => s.paiTipo === 'livro' && String(s.paiId) === String(livroId));

    const topo = [
        ...partesDoLivro.map(item => ({ tipo: 'parte', item })),
        ...secoesDiretas.map(item => ({ tipo: 'secao', item }))
    ].sort((a, b) => (parseInt(a.item.sequencia) || 9999) - (parseInt(b.item.sequencia) || 9999));

    let html = '';
    topo.forEach(({ tipo, item }) => {
        if (tipo === 'parte') {
            html += `<option value="parte:${item.id}">▸ ${item.titulo}</option>`;
            db.secoes
                .filter(s => s.paiTipo === 'parte' && String(s.paiId) === String(item.id))
                .sort((a, b) => (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999))
                .forEach(s => { html += `<option value="secao:${s.id}">　↳ ${s.titulo}</option>`; });
        } else {
            html += `<option value="secao:${item.id}">↳ ${item.titulo}</option>`;
        }
    });
    return html;
}

// Monta as opções de destino de Poema/Prosa. Coletâneas são excluídas:
// o vínculo poema↔coletânea é gerido pela aba Coletâneas via itensColetanea.
// Sem filtro: grupos planos (Livros / Partes / Seções).
// Com livro filtrado: só aquele livro + sua estrutura interna ordenada.
function construirOptionsDestino(livroFiltroId, formatoSimples = true) {
    const livrosNormais   = db.livros.filter(l => l.tipo !== 'Coletânea');
    const livroIdsNormais = new Set(livrosNormais.map(l => String(l.id)));
    const partesNormais   = db.partes.filter(p => livroIdsNormais.has(String(p.livroId)));
    const secoesNormais   = db.secoes.filter(s => {
        if (s.paiTipo === 'livro') return livroIdsNormais.has(String(s.paiId));
        if (s.paiTipo === 'parte') {
            const pt = db.partes.find(p => p.id == s.paiId);
            return pt ? livroIdsNormais.has(String(pt.livroId)) : false;
        }
        return false;
    });

    if (!livroFiltroId) {
        if (formatoSimples) {
            return '<option value="">Poema Avulso (Sem Vínculo)</option>' +
                '<optgroup label="Livros">' +
                livrosNormais.map(l => `<option value="livro:${l.id}">${l.titulo}</option>`).join('') +
                '</optgroup>' +
                '<optgroup label="Partes">' +
                partesNormais.map(p => `<option value="parte:${p.id}">${p.titulo}</option>`).join('') +
                '</optgroup>' +
                '<optgroup label="Seções">' +
                secoesNormais.map(s => `<option value="secao:${s.id}">${s.titulo}</option>`).join('') +
                '</optgroup>';
        }
        const opcoes = [
            ...livrosNormais.map(l => ({ id: `livro:${l.id}`, texto: `[Livro] ${l.titulo}` })),
            ...partesNormais.map(p => ({ id: `parte:${p.id}`, texto: `[Parte] ${p.titulo}` })),
            ...secoesNormais.map(s => ({ id: `secao:${s.id}`, texto: `[Seção] ${s.titulo}` }))
        ];
        return '<option value="">-- Sem vínculo (Avulso) --</option>' +
            opcoes.map(o => `<option value="${o.id}">${o.texto}</option>`).join('');
    }

    const livro = db.livros.find(l => String(l.id) === String(livroFiltroId));
    const estrutura = construirEstruturaLivro(livroFiltroId);

    if (formatoSimples) {
        return '<option value="">Poema Avulso (Sem Vínculo)</option>' +
            `<option value="livro:${livroFiltroId}">📖 ${livro?.titulo || ''} (o livro inteiro)</option>` +
            `<optgroup label="Estrutura: ${livro?.titulo || ''}">${estrutura}</optgroup>`;
    }
    return '<option value="">-- Sem vínculo (Avulso) --</option>' +
        `<option value="livro:${livroFiltroId}">[Livro] ${livro?.titulo || ''}</option>` +
        estrutura;
}

function popularFiltroLivro(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    // Coletâneas excluídas: o filtro de destino é só para livros normais.
    sel.innerHTML = '<option value="">-- Todos os livros --</option>' +
        db.livros
            .filter(l => l.tipo !== 'Coletânea')
            .map(l => `<option value="${l.id}">${l.titulo}</option>`).join('');
}

// Reconstrói o select de Destino do Poema, filtrado pelo livro escolhido.
// Tenta preservar o valor atualmente selecionado, se ele ainda for válido.
export function filtrarDestinoPoema(livroId) {
    const sel = document.getElementById('p-destino');
    if (!sel) return;
    const valorAtual = sel.value;
    sel.innerHTML = construirOptionsDestino(livroId, true);
    const aindaExiste = Array.from(sel.options).some(o => o.value === valorAtual);
    if (aindaExiste) sel.value = valorAtual;
}

export function filtrarDestinoProsa(livroId) {
    const sel = document.getElementById('pr-destino');
    if (!sel) return;
    const valorAtual = sel.value;
    sel.innerHTML = construirOptionsDestino(livroId, false);
    const aindaExiste = Array.from(sel.options).some(o => o.value === valorAtual);
    if (aindaExiste) sel.value = valorAtual;
}

// Usado por forms.js ao abrir um Poema/Prosa existente para edição:
// pré-seleciona o filtro de livro de acordo com o destino atual,
// pra não esconder o vínculo que o item já tinha.
export function sincronizarFiltroDestino(filtroSelectId, destinoSelectId, destinoStr) {
    const livroId = livroIdDoDestino(destinoStr);
    const filtroSel = document.getElementById(filtroSelectId);
    if (filtroSel) filtroSel.value = livroId || '';

    if (destinoSelectId === 'p-destino') filtrarDestinoPoema(livroId || '');
    else filtrarDestinoProsa(livroId || '');

    const destinoSel = document.getElementById(destinoSelectId);
    if (destinoSel) destinoSel.value = destinoStr || '';
}

export function renderDropdowns() {
    // 0. Sugestões de "Fase de Vida" já usadas em outros livros
    const datalistFases = document.getElementById('sugestoes-fases');
    if (datalistFases) {
        datalistFases.innerHTML = extrairFasesUnicas(db.livros)
            .map(fase => `<option value="${fase}">`)
            .join('');
    }

    // 1. Livros → Modal de Partes (coletâneas excluídas: têm estrutura própria)
    const sPartLivro = document.getElementById('part-livro');
    if (sPartLivro)
        sPartLivro.innerHTML = db.livros
            .filter(l => l.tipo !== 'Coletânea')
            .map(l => `<option value="${l.id}">${l.titulo}</option>`).join('');

    // 2. Destino de Poemas (Livro, Parte ou Seção) — sem filtro por padrão
    const sPoemaDestino = document.getElementById('p-destino');
    if (sPoemaDestino) sPoemaDestino.innerHTML = construirOptionsDestino('', true);
    popularFiltroLivro('p-destino-filtro');

    // 3. Vínculo de Seções (Livro ou Parte) — coletâneas excluídas dos dois grupos:
    //    livros-coletânea não aceitam seções; partes-de-coletânea também não.
    const sSecVinculo = document.getElementById('sec-vinculo');
    if (sSecVinculo) {
        const livrosNormais = db.livros.filter(l => l.tipo !== 'Coletânea');
        const livroIdsNormais = new Set(livrosNormais.map(l => String(l.id)));
        const partesNormais  = db.partes.filter(p => livroIdsNormais.has(String(p.livroId)));
        sSecVinculo.innerHTML =
            '<optgroup label="Livros">' +
            livrosNormais.map(l => `<option value="livro:${l.id}">${l.titulo}</option>`).join('') +
            '</optgroup>' +
            '<optgroup label="Partes">' +
            partesNormais.map(p => `<option value="parte:${p.id}">${p.titulo}</option>`).join('') +
            '</optgroup>';
    }

    // 4. Vínculo de Elementos (Livro, Parte ou Seção) — coletâneas excluídas:
    //    elementos textuais pertencem à hierarquia editorial, não às coletâneas.
    const sElVinculo = document.getElementById('el-vinculo');
    if (sElVinculo) {
        const livrosNorm = db.livros.filter(l => l.tipo !== 'Coletânea');
        const livroIdsNorm = new Set(livrosNorm.map(l => String(l.id)));
        const partesNorm  = db.partes.filter(p => livroIdsNorm.has(String(p.livroId)));
        // Seções cujo pai é livro ou parte normal
        const secoesNorm  = db.secoes.filter(s => {
            if (s.paiTipo === 'livro')  return livroIdsNorm.has(String(s.paiId));
            if (s.paiTipo === 'parte') {
                const pt = db.partes.find(p => p.id == s.paiId);
                return pt ? livroIdsNorm.has(String(pt.livroId)) : false;
            }
            return false;
        });
        sElVinculo.innerHTML =
            '<optgroup label="Livros">' +
            livrosNorm.map(l => `<option value="livro:${l.id}">${l.titulo}</option>`).join('') +
            '</optgroup>' +
            '<optgroup label="Partes">' +
            partesNorm.map(p => `<option value="parte:${p.id}">${p.titulo}</option>`).join('') +
            '</optgroup>' +
            '<optgroup label="Seções">' +
            secoesNorm.map(s => `<option value="secao:${s.id}">${s.titulo}</option>`).join('') +
            '</optgroup>';
    }

    // 5. Livros múltiplos no Modal de Poemas — etiqueta editorial paralela;
    //    coletâneas excluídas: o vínculo poema↔coletânea já vive em itensColetanea.
    const sPoemaLivros = document.getElementById('p-livros');
    if (sPoemaLivros)
        sPoemaLivros.innerHTML = db.livros
            .filter(l => l.tipo !== 'Coletânea')
            .map(l => `<option value="${l.id}">${l.titulo}</option>`).join('');

    // 6. Elos e Referências entre poemas
    const sElos = document.getElementById('p-elos-select');
    const sRefs = document.getElementById('p-refs-select');
    if (sElos && sRefs) {
        const opcoes = [...db.poemas]
            .sort((a, b) => a.titulo.localeCompare(b.titulo))
            .map(p => `<option value="${p.id}">${p.titulo}</option>`)
            .join('');
        sElos.innerHTML = opcoes;
        sRefs.innerHTML = opcoes;
    }

    // 7. Destino de Prosas (Livro, Parte ou Seção) — sem filtro por padrão
    const destinoProsa = document.getElementById('pr-destino');
    if (destinoProsa) destinoProsa.innerHTML = construirOptionsDestino('', false);
    popularFiltroLivro('pr-destino-filtro');
}

// Quando o destino (Livro/Parte/Seção) escolhido pertence a um Livro que
// já tem Data de Publicação preenchida, sugere automaticamente a data de
// "Primeira Publicação" do poema/prosa — campo a campo, sem sobrescrever
// nada que o usuário já tenha preenchido manualmente.
export function autoPreencherDataPublicacao(destinoStr, prefixo) {
    const livroId = livroIdDoDestino(destinoStr);
    if (!livroId) return;

    const livro = db.livros.find(l => String(l.id) === String(livroId));
    if (!livro || !livro.data) return;

    // Compatibilidade: livros antigos podem ter `data` como texto livre.
    // Nesse caso, extraímos só o ano (4 dígitos) com segurança.
    const dataLivro = (typeof livro.data === 'string')
        ? { ano: parseInt((livro.data.match(/\d{4}/) || [])[0]) || null }
        : livro.data;
    if (!dataLivro) return;

    ['dia', 'mes', 'ano'].forEach(campo => {
        if (dataLivro[campo] == null) return;
        const el = document.getElementById(`${prefixo}-data-pub-${campo}`);
        if (el && !el.value) el.value = dataLivro[campo];
    });
}

export async function prepararNovo(tipo) {
    await garantirModal(`modal-${tipo}`);

    const form = document.getElementById(`form-${tipo}`);
    if (!form) return;
    form.reset();
    renderDropdowns();

    const idFields = {
        livro: 'l-edit-id', poema: 'p-edit-id', parte: 'part-edit-id',
        secao: 'sec-edit-id', prosa: 'pr-edit-id', elemento: 'el-edit-id',
        coletanea: 'col-edit-id'
    };

    const idField = document.getElementById(idFields[tipo]);
    if (idField) idField.value = '';

    if (tipo === 'poema') {
        resetTags();
        resetPessoas();
        atualizarDatalist();
        const infoP = document.getElementById('p-coletaneas-info');
        if (infoP) infoP.innerHTML = '';
    }

    if (tipo === 'prosa') {
        // resetTagsProsa e resetPessoasProsa são importadas dinamicamente
        // pra evitar ciclo de importação (editor → ui não existe)
        import('./editor.js').then(({ resetTagsProsa, resetPessoasProsa, atualizarDatalistProsa }) => {
            resetTagsProsa();
            resetPessoasProsa();
            atualizarDatalistProsa();
        });
        const infoPr = document.getElementById('pr-coletaneas-info');
        if (infoPr) infoPr.innerHTML = '';
    }

    const title = document.getElementById(`modal-${tipo}-titulo`);
    if (title) title.innerText = `Novo(a) ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`;

    toggleModal(`modal-${tipo}`);
}

export function toggleCamposIntroducao() {
    const tipo = document.getElementById('el-tipo')?.value;
    const box  = document.getElementById('campos-introducao');
    if (!box) return;
    box.classList.toggle('hidden', tipo !== 'Introdução');
}

export function sugerirSequencia() {
    const destino = document.getElementById('p-destino')?.value;
    const campo   = document.getElementById('p-sequencia');
    if (!destino || !campo) return;

    const [tipo, id] = destino.split(':');
    const textos = [
        ...db.poemas.filter(p => String(p.paiTipo) === tipo && String(p.paiId) === id),
        ...(db.prosas || []).filter(pr => String(pr.paiTipo) === tipo && String(pr.paiId) === id)
    ];

    if (textos.length === 0) {
        campo.value = 1;
    } else {
        const max = Math.max(...textos.map(t => parseInt(t.sequencia) || 0));
        campo.value = max + 1;
    }
}
