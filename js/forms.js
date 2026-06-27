// ============================================================
// forms.js — Submit handlers e funções de edição por entidade
// ============================================================

import { db, save }           from './db.js';
import { toBase64, reordenarPosicao, fecharEspaco,
         getIrmaosTopoLivro, getIrmaosPorEscopo,
         lerDataParcial, preencherDataParcial,
         seqOuNull } from './utils.js';
import { salvarCapa, deletarCapa } from './capas.js';
import { getColetaneasDeItem } from './coletaneas.js';
import { toggleModal, garantirModal,
         renderDropdowns,
         sincronizarFiltroDestino }    from './ui.js';
import { resetTags,
         carregarTags,
         atualizarDatalist,
         resetPessoas,
         carregarPessoas,
         resetTagsProsa,
         carregarTagsProsa,
         resetPessoasProsa,
         carregarPessoasProsa,
         atualizarDatalistProsa }    from './editor.js';

// ─── Indicador somente-leitura "Aparece em: Coletânea X › Parte Y" ──
// Usado no modal de Poema e de Prosa. A edição em si (a qual coletânea,
// qual parte, sequência, override) continua só pela aba Coletâneas —
// isso aqui é só pra não esconder do usuário que o vínculo existe.
function renderColetaneasInfo(containerId, refTipo, refId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const lista = getColetaneasDeItem(refTipo, refId);
    el.innerHTML = lista.length
        ? `<div class="text-[11px] bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg px-3 py-2 mt-1">
              📚 Aparece em: ${lista.map(c => `<strong>${c.coletaneaTitulo}</strong> › ${c.parteTitulo}`).join(' &nbsp;·&nbsp; ')}
           </div>`
        : '';
}

// ─── Livro ───────────────────────────────────────────────────

export function initFormLivro() {
    const form = document.getElementById('form-livro');
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const id        = document.getElementById('l-edit-id').value;
        const capaFile  = document.getElementById('l-capa').files[0];
        const capaAtual = id ? db.livros.find(x => x.id == id)?.capa : null;
        // salvarCapa retorna o novo ID (e descarta o antigo) se houver arquivo novo,
        // ou null se não houver — nesse caso mantemos o ID já existente.
        const novoCapaId = capaFile ? await salvarCapa(capaFile, capaAtual) : null;

        const dados = {
            id: id ? parseInt(id) : Date.now(),
            titulo:       document.getElementById('l-titulo').value,
            sequencia:    seqOuNull(document.getElementById('l-sequencia').value),
            siglaOficial: document.getElementById('l-sigla-oficial').value,
            siglaPessoal: document.getElementById('l-sigla-pessoal').value,
            data:         lerDataParcial('l-data'),
            tipo:         document.getElementById('l-tipo').value,
            fase:         document.getElementById('l-fase').value,
            abertura:     document.getElementById('l-abertura').value,
            sinopse:      document.getElementById('l-sinopse').value,
            capaDesc:     document.getElementById('l-capa-desc').value,
            fraseCapa:    document.getElementById('l-frase-capa').value,
            orelha1:      document.getElementById('l-orelha-1').value,
            orelha2:      document.getElementById('l-orelha-2').value,
            contracapa:   document.getElementById('l-contracapa').value,
            capa: novoCapaId ?? capaAtual
        };

        const posicaoAntiga = id ? (db.livros.find(x => x.id == id)?.sequencia ?? null) : null;

        if (id) db.livros[db.livros.findIndex(x => x.id == id)] = dados;
        else    db.livros.push(dados);

        reordenarPosicao(db.livros, dados, dados.sequencia, posicaoAntiga);

        save();
        toggleModal('modal-livro');
    };
}

export async function editarLivro(id) {
    const l = db.livros.find(x => x.id == id);
    if (!l) return;
    await garantirModal('modal-livro');
    renderDropdowns();

    document.getElementById('l-edit-id').value        = l.id;
    document.getElementById('l-titulo').value         = l.titulo;
    document.getElementById('l-sequencia').value      = l.sequencia || '';
    document.getElementById('l-sigla-oficial').value  = l.siglaOficial || '';
    document.getElementById('l-sigla-pessoal').value  = l.siglaPessoal || '';
    preencherDataParcial('l-data', l.data);
    document.getElementById('l-tipo').value           = l.tipo || 'Inéditos';
    document.getElementById('l-fase').value           = l.fase || '';
    document.getElementById('l-abertura').value       = l.abertura || '';
    document.getElementById('l-sinopse').value        = l.sinopse || '';
    document.getElementById('l-capa-desc').value      = l.capaDesc || '';
    document.getElementById('l-frase-capa').value     = l.fraseCapa || '';
    document.getElementById('l-orelha-1').value       = l.orelha1 || '';
    document.getElementById('l-orelha-2').value       = l.orelha2 || '';
    document.getElementById('l-contracapa').value     = l.contracapa || '';
    document.getElementById('modal-livro-titulo').innerText = 'Editar Livro';
    toggleModal('modal-livro');
}

// ─── Parte ───────────────────────────────────────────────────

export function initFormParte() {
    const form = document.getElementById('form-parte');
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const id        = document.getElementById('part-edit-id').value;
        const capaFile  = document.getElementById('part-capa').files[0];
        const capaAtual = id ? db.partes.find(x => x.id == id)?.capa : null;
        const novoCapaId = capaFile ? await salvarCapa(capaFile, capaAtual) : null;

        const dados = {
            id: id ? parseInt(id) : Date.now(),
            titulo:    document.getElementById('part-titulo').value,
            livroId:   document.getElementById('part-livro').value,
            sequencia: seqOuNull(document.getElementById('part-sequencia').value),
            capaDesc:  document.getElementById('part-capa-desc').value,
            abertura:  document.getElementById('part-abertura').value,
            capa: novoCapaId ?? capaAtual
        };

        const anterior = id ? db.partes.find(x => x.id == id) : null;
        const posicaoAntiga = (anterior && String(anterior.livroId) === String(dados.livroId))
            ? (anterior.sequencia ?? null) : null;

        if (id) db.partes[db.partes.findIndex(x => x.id == id)] = dados;
        else    db.partes.push(dados);

        // Se mudou de livro, fecha o buraco que deixou no livro antigo
        if (anterior && String(anterior.livroId) !== String(dados.livroId)) {
            fecharEspaco(getIrmaosTopoLivro(db, anterior.livroId), anterior.sequencia ?? null);
        }

        reordenarPosicao(getIrmaosTopoLivro(db, dados.livroId), dados, dados.sequencia, posicaoAntiga);

        save();
        toggleModal('modal-parte');
    };
}

export async function editarParte(id) {
    const p = db.partes.find(x => x.id == id);
    if (!p) return;
    await garantirModal('modal-parte');
    renderDropdowns();

    document.getElementById('part-edit-id').value      = p.id;
    document.getElementById('part-titulo').value        = p.titulo;
    document.getElementById('part-livro').value         = p.livroId;
    document.getElementById('part-sequencia').value     = p.sequencia || '';
    document.getElementById('part-capa-desc').value     = p.capaDesc || '';
    document.getElementById('part-abertura').value      = p.abertura || '';
    document.getElementById('part-capa').value          = ''; // limpa seleção anterior — sem arquivo novo, preserva capa atual
    document.getElementById('modal-parte-titulo').innerText = 'Editar Parte';
    toggleModal('modal-parte');
}

// ─── Seção ───────────────────────────────────────────────────

export function initFormSecao() {
    const form = document.getElementById('form-secao');
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const idInput = document.getElementById('sec-edit-id').value;
        const vinculo = document.getElementById('sec-vinculo').value;
        if (!vinculo) return alert('Selecione um vínculo para a seção!');

        const [tipo, idPai] = vinculo.split(':');
        const id        = idInput ? parseInt(idInput) : Date.now();
        const capaFile  = document.getElementById('sec-capa').files[0];
        const capaAtual = idInput ? db.secoes.find(x => x.id == id)?.capa : null;
        const novoCapaId = capaFile ? await salvarCapa(capaFile, capaAtual) : null;

        const dados = {
            id,
            titulo:    document.getElementById('sec-titulo').value,
            paiTipo:   tipo,
            paiId:     idPai,
            abertura:  document.getElementById('sec-abertura').value,
            sequencia: seqOuNull(document.getElementById('sec-sequencia')?.value),
            capaDesc:  document.getElementById('sec-capa-desc').value,
            capa: novoCapaId ?? capaAtual
        };

        const anterior = idInput ? db.secoes.find(x => x.id == id) : null;
        const mesmoEscopo = anterior && anterior.paiTipo === dados.paiTipo && String(anterior.paiId) === String(dados.paiId);
        const posicaoAntiga = mesmoEscopo ? (anterior.sequencia ?? null) : null;

        if (idInput) {
            const idx = db.secoes.findIndex(x => x.id == id);
            if (idx !== -1) db.secoes[idx] = dados;
        } else {
            db.secoes.push(dados);
        }

        if (anterior && !mesmoEscopo) {
            fecharEspaco(getIrmaosPorEscopo(db, anterior.paiTipo, anterior.paiId), anterior.sequencia ?? null);
        }
        reordenarPosicao(getIrmaosPorEscopo(db, dados.paiTipo, dados.paiId), dados, dados.sequencia, posicaoAntiga);

        save();
        toggleModal('modal-secao');
    };
}

export async function editarSecao(id) {
    const s = db.secoes.find(x => x.id == id);
    if (!s) return;
    await garantirModal('modal-secao');
    renderDropdowns();

    document.getElementById('sec-edit-id').value       = s.id;
    document.getElementById('sec-titulo').value         = s.titulo;
    document.getElementById('sec-vinculo').value        = `${s.paiTipo}:${s.paiId}`;
    document.getElementById('sec-sequencia').value      = s.sequencia || '';
    document.getElementById('sec-abertura').value       = s.abertura || '';
    document.getElementById('sec-capa-desc').value      = s.capaDesc || '';
    document.getElementById('sec-capa').value           = '';
    document.getElementById('modal-secao-titulo').innerText = 'Editar Seção';
    toggleModal('modal-secao');
}

// ─── Poema ───────────────────────────────────────────────────

export function initFormPoema() {
    const form = document.getElementById('form-poema');
    if (!form) return;

    form.onsubmit = (e) => {
        e.preventDefault();

        const idInput = document.getElementById('p-edit-id').value;
        const id      = idInput ? parseInt(idInput) : Date.now();
        const destino = document.getElementById('p-destino').value;

        let paiTipo = null, paiId = null;
        if (destino) {
            const partes = destino.split(':');
            paiTipo = partes[0];
            paiId   = parseInt(partes[1]);
        }

        const dataEscrita    = lerDataParcial('p-data-esc');
        const dataPublicacao = lerDataParcial('p-data-pub');

        const dados = {
            id,
            titulo:    document.getElementById('p-titulo').value,
            texto:     document.getElementById('p-texto').value,
            paiTipo,
            paiId,
            sequencia: seqOuNull(document.getElementById('p-sequencia').value),
            dataEscrita,
            dataPublicacao,
            ano:       dataEscrita?.ano || '', // mantido por compatibilidade (ordenação/estatísticas/exportação)
            livrosIds: Array.from(document.getElementById('p-livros').selectedOptions).map(o => parseInt(o.value)),
            conceitos: {
                elos:        Array.from(document.getElementById('p-elos-select').selectedOptions).map(o => parseInt(o.value)),
                referencias: Array.from(document.getElementById('p-refs-select').selectedOptions).map(o => parseInt(o.value))
            },
            notas:        document.getElementById('p-notas').value,
            sinalizacoes: document.getElementById('p-sinal').value,
            pessoas:      document.getElementById('p-pessoas').value,
            publicado:    document.getElementById('p-pub').checked
        };

        const anterior = idInput ? db.poemas.find(x => x.id == id) : null;
        const mesmoEscopo = anterior && anterior.paiTipo === dados.paiTipo && String(anterior.paiId) === String(dados.paiId);
        const posicaoAntiga = mesmoEscopo ? (anterior.sequencia ?? null) : null;

        if (idInput) {
            const idx = db.poemas.findIndex(x => x.id == id);
            if (idx !== -1) db.poemas[idx] = dados;
        } else {
            db.poemas.push(dados);
        }

        // Poema avulso (sem destino) não disputa posição com nada
        if (anterior && !mesmoEscopo && anterior.paiTipo && anterior.paiId) {
            fecharEspaco(getIrmaosPorEscopo(db, anterior.paiTipo, anterior.paiId), anterior.sequencia ?? null);
        }
        if (dados.paiTipo && dados.paiId) {
            reordenarPosicao(getIrmaosPorEscopo(db, dados.paiTipo, dados.paiId), dados, dados.sequencia, posicaoAntiga);
        }

        save();
        toggleModal('modal-poema');
    };
}

export async function editarPoema(id) {
    const p = db.poemas.find(x => x.id == id);
    if (!p) return;
    await garantirModal('modal-poema');

    renderDropdowns();
    atualizarDatalist();

    document.getElementById('p-edit-id').value    = p.id;
    document.getElementById('p-titulo').value      = p.titulo;
    document.getElementById('p-texto').value       = p.texto || '';
    document.getElementById('p-sequencia').value   = p.sequencia || '';
    preencherDataParcial('p-data-esc', p.dataEscrita);
    preencherDataParcial('p-data-pub', p.dataPublicacao);
    document.getElementById('p-notas').value       = p.notas || '';
    sincronizarFiltroDestino('p-destino-filtro', 'p-destino',
        (p.paiTipo && p.paiId) ? `${p.paiTipo}:${p.paiId}` : '');
    document.getElementById('p-pub').checked        = !!p.publicado;

    const setM = (elId, vals) => {
        const el = document.getElementById(elId);
        if (!el) return;
        const arr = Array.isArray(vals) ? vals.map(String) : [];
        Array.from(el.options).forEach(opt => { opt.selected = arr.includes(String(opt.value)); });
    };

    setM('p-livros',      p.livrosIds || []);
    setM('p-elos-select', p.conceitos?.elos || []);
    setM('p-refs-select', p.conceitos?.referencias || []);

    carregarTags(p.sinalizacoes);
    carregarPessoas(p.pessoas);
    renderColetaneasInfo('p-coletaneas-info', 'poema', p.id);
    document.getElementById('modal-poema-titulo').innerText = 'Editar Poema';
    toggleModal('modal-poema');
}

// ─── Prosa ───────────────────────────────────────────────────

export function initFormProsa() {
    const form = document.getElementById('form-prosa');
    if (!form) return;

    form.onsubmit = (e) => {
        e.preventDefault();

        const idInput = document.getElementById('pr-edit-id').value;
        const id      = idInput ? parseInt(idInput) : Date.now();
        const destino = document.getElementById('pr-destino').value;

        let paiTipo = null, paiId = null;
        if (destino && destino.includes(':')) {
            const partes = destino.split(':');
            paiTipo = partes[0];
            paiId   = parseInt(partes[1]);
        }

        const dataEscrita    = lerDataParcial('pr-data-esc');
        const dataPublicacao = lerDataParcial('pr-data-pub');

        const dados = {
            id,
            titulo:    document.getElementById('pr-titulo').value,
            texto:     document.getElementById('pr-texto').value,
            sequencia: seqOuNull(document.getElementById('pr-sequencia').value),
            dataEscrita,
            dataPublicacao,
            ano:       dataEscrita?.ano || '', // mantido por compatibilidade (ordenação/estatísticas/exportação)
            paiTipo,
            paiId,
            notas:        document.getElementById('pr-notas').value,
            sinalizacoes: document.getElementById('pr-sinal').value,
            pessoas:      document.getElementById('pr-pessoas').value,
            publicado:    document.getElementById('pr-pub').checked
        };

        const anterior = idInput ? db.prosas.find(x => x.id == id) : null;
        const mesmoEscopo = anterior && anterior.paiTipo === dados.paiTipo && String(anterior.paiId) === String(dados.paiId);
        const posicaoAntiga = mesmoEscopo ? (anterior.sequencia ?? null) : null;

        if (idInput) {
            const idx = db.prosas.findIndex(x => x.id == id);
            if (idx !== -1) db.prosas[idx] = dados;
            else            db.prosas.push(dados);
        } else {
            db.prosas.push(dados);
        }

        if (anterior && !mesmoEscopo && anterior.paiTipo && anterior.paiId) {
            fecharEspaco(getIrmaosPorEscopo(db, anterior.paiTipo, anterior.paiId), anterior.sequencia ?? null);
        }
        if (dados.paiTipo && dados.paiId) {
            reordenarPosicao(getIrmaosPorEscopo(db, dados.paiTipo, dados.paiId), dados, dados.sequencia, posicaoAntiga);
        }

        save();
        toggleModal('modal-prosa');
        resetTagsProsa();
        resetPessoasProsa();
        form.reset();
    };
}

export async function editarProsa(id) {
    const pr = db.prosas.find(x => x.id == id);
    if (!pr) return;
    await garantirModal('modal-prosa');
    renderDropdowns();

    document.getElementById('pr-edit-id').value    = pr.id;
    document.getElementById('pr-titulo').value      = pr.titulo;
    document.getElementById('pr-texto').value       = pr.texto || '';
    document.getElementById('pr-sequencia').value   = pr.sequencia || 0;
    preencherDataParcial('pr-data-esc', pr.dataEscrita);
    preencherDataParcial('pr-data-pub', pr.dataPublicacao);

    const destinoStr = (pr.paiTipo && pr.paiId)
        ? `${pr.paiTipo}:${pr.paiId}`
        : (pr.secaoId ? `secao:${pr.secaoId}` : ''); // compatibilidade: prosas salvas antes da remoção do campo legado
    sincronizarFiltroDestino('pr-destino-filtro', 'pr-destino', destinoStr);

    document.getElementById('pr-notas').value  = pr.notas || '';
    document.getElementById('pr-pub').checked  = !!pr.publicado;
    carregarTagsProsa(pr.sinalizacoes);
    carregarPessoasProsa(pr.pessoas);
    atualizarDatalistProsa();
    renderColetaneasInfo('pr-coletaneas-info', 'prosa', pr.id);
    document.getElementById('modal-prosa-titulo').innerText = 'Editar Prosa';
    toggleModal('modal-prosa');
}

// ─── Elemento ────────────────────────────────────────────────

export function initFormElemento() {
    const form = document.getElementById('form-elemento');
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();

        const idInput = document.getElementById('el-edit-id').value;
        const id      = idInput ? parseInt(idInput) : Date.now();
        const vinculo = document.getElementById('el-vinculo').value;
        if (!vinculo) return alert('Selecione um vínculo.');

        const [tipoPai, idPaiStr] = vinculo.split(':');
        const idPai = parseInt(idPaiStr);
        const fileEl = document.getElementById('el-img');
        const imgBase64 = (fileEl && fileEl.files.length > 0)
            ? await toBase64(fileEl.files[0])
            : null;

        const dados = {
            id,
            tipo:                 document.getElementById('el-tipo').value,
            titulo:               document.getElementById('el-titulo')?.value || '',
            texto:                document.getElementById('el-texto').value,
            notas:                document.getElementById('el-notas').value,
            paiTipo:              tipoPai,
            paiId:                idPai,
            sequencia:            seqOuNull(document.getElementById('el-sequencia')?.value),
            avisoConteudo:        document.getElementById('el-aviso').value,
            versosPosIntroducao:  document.getElementById('el-pos-versos').value,
            imagem: imgBase64 || (idInput ? db.elementos.find(x => x.id == id)?.imagem : null)
        };

        const anterior = idInput ? db.elementos.find(x => x.id == id) : null;
        const mesmoEscopo = anterior && anterior.paiTipo === dados.paiTipo && String(anterior.paiId) === String(dados.paiId);
        const posicaoAntiga = mesmoEscopo ? (anterior.sequencia ?? null) : null;

        if (idInput) {
            const idx = db.elementos.findIndex(x => x.id == id);
            if (idx !== -1) db.elementos[idx] = dados;
        } else {
            db.elementos.push(dados);
        }

        if (anterior && !mesmoEscopo) {
            fecharEspaco(getIrmaosPorEscopo(db, anterior.paiTipo, anterior.paiId), anterior.sequencia ?? null);
        }
        reordenarPosicao(getIrmaosPorEscopo(db, dados.paiTipo, dados.paiId), dados, dados.sequencia, posicaoAntiga);

        save();
        toggleModal('modal-elemento');
        form.reset();
    };
}

export async function editarElemento(id) {
    const el = db.elementos.find(x => x.id == id);
    if (!el) return;
    await garantirModal('modal-elemento');
    renderDropdowns();

    document.getElementById('el-edit-id').value    = el.id;
    document.getElementById('el-sequencia').value   = el.sequencia ?? '';
    document.getElementById('el-tipo').value        = el.tipo === 'Comentário' ? 'Conteúdo Multimídia' : el.tipo;
    const elTituloInput = document.getElementById('el-titulo');
    if (elTituloInput) elTituloInput.value = el.titulo || '';
    document.getElementById('el-texto').value       = el.texto || '';
    document.getElementById('el-notas').value       = el.notas || '';
    document.getElementById('el-vinculo').value     = `${el.paiTipo}:${el.paiId}`;
    document.getElementById('el-aviso').value       = el.avisoConteudo || '';
    document.getElementById('el-pos-versos').value  = el.versosPosIntroducao || '';

    // Importa toggleCamposIntroducao dinamicamente para evitar circular
    import('./ui.js').then(({ toggleCamposIntroducao }) => toggleCamposIntroducao());
    document.getElementById('modal-elemento-titulo').innerText = 'Editar Elemento';
    toggleModal('modal-elemento');
}
