// ============================================================
// forms.js — Submit handlers e funções de edição por entidade
// ============================================================

import { db, save } from './db.js';
import {
    reordenarPosicao,
    fecharEspaco,
    getIrmaosTopoLivro,
    getIrmaosPorEscopo,
    lerDataParcial,
    preencherDataParcial,
    seqOuNull,
    gerarId,
    escapeHtml,
    mostrarAviso,
    criarRastreadorDeAlteracoes,
} from './utils.js';

// Rastreadores de alterações não salvas dos formulários de texto longo
// (ver toggleModal em modais.js — confirma antes de fechar se sujo).
// Instanciados aqui (não em utils.js) porque quem sabe quando salvar
// terminou — e portanto quando "limpar" — é o submit handler de cada
// formulário, que mora neste módulo.
export const rastreadorPoema = criarRastreadorDeAlteracoes();
export const rastreadorProsa = criarRastreadorDeAlteracoes();
import { salvarCapa, deletarCapa } from './capas.js';
import { getColetaneasDeItem } from './coletaneas.js';
import { toggleModal, garantirModal, renderDropdowns, sincronizarFiltroDestino } from './ui.js';
import {
    carregarTags,
    atualizarDatalist,
    carregarPessoas,
    resetTagsProsa,
    carregarTagsProsa,
    resetPessoasProsa,
    carregarPessoasProsa,
    resetGeneroProsa,
    carregarGeneroProsa,
    atualizarDatalistProsa,
} from './editor.js';

// ─── Preenchimento declarativo de formulário de edição ──────────────
// Substitui a lista repetitiva de "document.getElementById(id).value =
// objeto.campo || ''" que cada editarX (Livro/Parte/Seção/Poema/Prosa/
// Elemento) tinha, uma linha por campo simples do formulário — por um
// mapa campo → input e uma única chamada. Cada entrada do mapa aceita:
//   'input-id'                          → objeto[campo] ?? ''
//   ['input-id', padrao]                → objeto[campo] ?? padrao
//   ['input-id', padrao, transformar]   → transformar(objeto[campo] ?? padrao)
// Checkbox (input.type === 'checkbox') é detectado automaticamente e
// preenchido via .checked em vez de .value. Input ausente no DOM (ex:
// campo condicional) é simplesmente ignorado.
// Fica de fora do mapa qualquer campo composto ou com lógica própria —
// data parcial (preencherDataParcial), vínculo (paiTipo:paiId), select
// múltiplo, tags — que já não se repetia entre os seis, então não
// precisa dessa abstração.
function preencherCampos(objeto, mapa) {
    for (const [campo, spec] of Object.entries(mapa)) {
        const [inputId, padrao = '', transformar] = Array.isArray(spec) ? spec : [spec];
        const el = document.getElementById(inputId);
        if (!el) continue;
        if (el.type === 'checkbox') {
            el.checked = !!objeto[campo];
            continue;
        }
        const valor = objeto[campo] ?? padrao;
        el.value = transformar ? transformar(valor) : valor;
    }
}

// ─── Indicador somente-leitura "Aparece em: Coletânea X › Parte Y" ──
// Usado no modal de Poema e de Prosa. A edição em si (a qual coletânea,
// qual parte, sequência, override) continua só pela aba Coletâneas —
// isso aqui é só pra não esconder do usuário que o vínculo existe.
function renderColetaneasInfo(containerId, refTipo, refId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const lista = getColetaneasDeItem(refTipo, refId);
    el.innerHTML = lista.length
        ? `<div class="text-[11px] bg-indigo-50 dark:bg-indigo-950 border border-indigo-100 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-lg px-3 py-2 mt-1">
              📚 Aparece em: ${lista.map((c) => `<strong>${escapeHtml(c.coletaneaTitulo)}</strong> › ${escapeHtml(c.parteTitulo)}`).join(' &nbsp;·&nbsp; ')}
           </div>`
        : '';
}

// ─── Livro ───────────────────────────────────────────────────

export function initFormLivro() {
    const form = document.getElementById('form-livro');
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('l-edit-id').value;
        const capaFile = document.getElementById('l-capa').files[0];
        const removerCapa = document.getElementById('l-remover-capa').checked;
        const capaAtual = id ? db.livros.find((x) => x.id == id)?.capa : null;
        // "Remover capa" tem prioridade sobre um arquivo eventualmente selecionado —
        // se a pessoa marcou a caixa, a intenção é ficar sem capa, ponto final.
        let capaFinal;
        if (removerCapa) {
            await deletarCapa(capaAtual);
            capaFinal = null;
        } else {
            // salvarCapa retorna o novo ID (e descarta o antigo) se houver arquivo novo,
            // ou null se não houver — nesse caso mantemos o ID já existente.
            const novoCapaId = capaFile ? await salvarCapa(capaFile, capaAtual) : null;
            capaFinal = novoCapaId ?? capaAtual;
        }

        const dados = {
            id: id ? parseInt(id) : gerarId(),
            titulo: document.getElementById('l-titulo').value,
            sequencia: seqOuNull(document.getElementById('l-sequencia').value),
            siglaOficial: document.getElementById('l-sigla-oficial').value,
            siglaPessoal: document.getElementById('l-sigla-pessoal').value,
            data: lerDataParcial('l-data'),
            tipo: document.getElementById('l-tipo').value,
            fase: document.getElementById('l-fase').value,
            abertura: document.getElementById('l-abertura').value,
            sinopse: document.getElementById('l-sinopse').value,
            capaDesc: document.getElementById('l-capa-desc').value,
            fraseCapa: document.getElementById('l-frase-capa').value,
            orelha1: document.getElementById('l-orelha-1').value,
            orelha2: document.getElementById('l-orelha-2').value,
            contracapa: document.getElementById('l-contracapa').value,
            capa: capaFinal,
        };

        const posicaoAntiga = id ? (db.livros.find((x) => x.id == id)?.sequencia ?? null) : null;

        if (id) db.livros[db.livros.findIndex((x) => x.id == id)] = dados;
        else db.livros.push(dados);

        reordenarPosicao(db.livros, dados, dados.sequencia, posicaoAntiga);

        save();
        toggleModal('modal-livro');
    };
}

const MAPA_LIVRO = {
    id: 'l-edit-id',
    titulo: 'l-titulo',
    sequencia: 'l-sequencia',
    siglaOficial: 'l-sigla-oficial',
    siglaPessoal: 'l-sigla-pessoal',
    tipo: ['l-tipo', 'Inéditos'],
    fase: 'l-fase',
    abertura: 'l-abertura',
    sinopse: 'l-sinopse',
    capaDesc: 'l-capa-desc',
    fraseCapa: 'l-frase-capa',
    orelha1: 'l-orelha-1',
    orelha2: 'l-orelha-2',
    contracapa: 'l-contracapa',
};

export async function editarLivro(id) {
    const l = db.livros.find((x) => x.id == id);
    if (!l) return;
    await garantirModal('modal-livro');
    renderDropdowns();

    preencherCampos(l, MAPA_LIVRO);
    preencherDataParcial('l-data', l.data);
    document.getElementById('l-remover-capa').checked = false;
    document.getElementById('modal-livro-titulo').innerText = 'Editar Livro';
    toggleModal('modal-livro');
}

// ─── Parte ───────────────────────────────────────────────────

export function initFormParte() {
    const form = document.getElementById('form-parte');
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('part-edit-id').value;
        const capaFile = document.getElementById('part-capa').files[0];
        const removerCapa = document.getElementById('part-remover-capa').checked;
        const capaAtual = id ? db.partes.find((x) => x.id == id)?.capa : null;
        let capaFinal;
        if (removerCapa) {
            await deletarCapa(capaAtual);
            capaFinal = null;
        } else {
            const novoCapaId = capaFile ? await salvarCapa(capaFile, capaAtual) : null;
            capaFinal = novoCapaId ?? capaAtual;
        }

        const dados = {
            id: id ? parseInt(id) : gerarId(),
            titulo: document.getElementById('part-titulo').value,
            livroId: document.getElementById('part-livro').value,
            sequencia: seqOuNull(document.getElementById('part-sequencia').value),
            capaDesc: document.getElementById('part-capa-desc').value,
            abertura: document.getElementById('part-abertura').value,
            capa: capaFinal,
        };

        const anterior = id ? db.partes.find((x) => x.id == id) : null;
        const posicaoAntiga =
            anterior && String(anterior.livroId) === String(dados.livroId)
                ? (anterior.sequencia ?? null)
                : null;

        if (id) db.partes[db.partes.findIndex((x) => x.id == id)] = dados;
        else db.partes.push(dados);

        // Se mudou de livro, fecha o buraco que deixou no livro antigo
        if (anterior && String(anterior.livroId) !== String(dados.livroId)) {
            fecharEspaco(getIrmaosTopoLivro(db, anterior.livroId), anterior.sequencia ?? null);
        }

        reordenarPosicao(
            getIrmaosTopoLivro(db, dados.livroId),
            dados,
            dados.sequencia,
            posicaoAntiga,
        );

        save();
        toggleModal('modal-parte');
    };
}

const MAPA_PARTE = {
    id: 'part-edit-id',
    titulo: 'part-titulo',
    livroId: 'part-livro',
    sequencia: 'part-sequencia',
    capaDesc: 'part-capa-desc',
    abertura: 'part-abertura',
};

export async function editarParte(id) {
    const p = db.partes.find((x) => x.id == id);
    if (!p) return;
    await garantirModal('modal-parte');
    renderDropdowns();

    preencherCampos(p, MAPA_PARTE);
    document.getElementById('part-capa').value = ''; // limpa seleção anterior — sem arquivo novo, preserva capa atual
    document.getElementById('part-remover-capa').checked = false;
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
        if (!vinculo) return mostrarAviso('Selecione um vínculo para a seção!');

        const [tipo, idPai] = vinculo.split(':');
        const id = idInput ? parseInt(idInput) : gerarId();
        const capaFile = document.getElementById('sec-capa').files[0];
        const removerCapa = document.getElementById('sec-remover-capa').checked;
        const capaAtual = idInput ? db.secoes.find((x) => x.id == id)?.capa : null;
        let capaFinal;
        if (removerCapa) {
            await deletarCapa(capaAtual);
            capaFinal = null;
        } else {
            const novoCapaId = capaFile ? await salvarCapa(capaFile, capaAtual) : null;
            capaFinal = novoCapaId ?? capaAtual;
        }

        const dados = {
            id,
            titulo: document.getElementById('sec-titulo').value,
            paiTipo: tipo,
            paiId: idPai,
            abertura: document.getElementById('sec-abertura').value,
            sequencia: seqOuNull(document.getElementById('sec-sequencia')?.value),
            capaDesc: document.getElementById('sec-capa-desc').value,
            capa: capaFinal,
        };

        const anterior = idInput ? db.secoes.find((x) => x.id == id) : null;
        const mesmoEscopo =
            anterior &&
            anterior.paiTipo === dados.paiTipo &&
            String(anterior.paiId) === String(dados.paiId);
        const posicaoAntiga = mesmoEscopo ? (anterior.sequencia ?? null) : null;

        if (idInput) {
            const idx = db.secoes.findIndex((x) => x.id == id);
            if (idx !== -1) db.secoes[idx] = dados;
        } else {
            db.secoes.push(dados);
        }

        if (anterior && !mesmoEscopo) {
            fecharEspaco(
                getIrmaosPorEscopo(db, anterior.paiTipo, anterior.paiId),
                anterior.sequencia ?? null,
            );
        }
        reordenarPosicao(
            getIrmaosPorEscopo(db, dados.paiTipo, dados.paiId),
            dados,
            dados.sequencia,
            posicaoAntiga,
        );

        save();
        toggleModal('modal-secao');
    };
}

const MAPA_SECAO = {
    id: 'sec-edit-id',
    titulo: 'sec-titulo',
    sequencia: 'sec-sequencia',
    abertura: 'sec-abertura',
    capaDesc: 'sec-capa-desc',
};

export async function editarSecao(id) {
    const s = db.secoes.find((x) => x.id == id);
    if (!s) return;
    await garantirModal('modal-secao');
    renderDropdowns();

    preencherCampos(s, MAPA_SECAO);
    document.getElementById('sec-vinculo').value = `${s.paiTipo}:${s.paiId}`;
    document.getElementById('sec-capa').value = '';
    document.getElementById('sec-remover-capa').checked = false;
    document.getElementById('modal-secao-titulo').innerText = 'Editar Seção';
    toggleModal('modal-secao');
}

// ─── Poema ───────────────────────────────────────────────────

export function initFormPoema() {
    const form = document.getElementById('form-poema');
    if (!form) return;

    rastreadorPoema.observar(form);

    form.onsubmit = (e) => {
        e.preventDefault();

        const idInput = document.getElementById('p-edit-id').value;
        const id = idInput ? parseInt(idInput) : gerarId();
        const destino = document.getElementById('p-destino').value;

        let paiTipo = null,
            paiId = null;
        if (destino) {
            const partes = destino.split(':');
            paiTipo = partes[0];
            paiId = parseInt(partes[1]);
        }

        const dataEscrita = lerDataParcial('p-data-esc');
        const dataPublicacao = lerDataParcial('p-data-pub');
        // Metadados de arquivo (Word etc.) frequentemente dão só uma data
        // aproximada, ou selecionada por contexto — a maioria do acervo
        // é assim, por isso o padrão é "não exata" (ver colunas.js/render-listas.js).
        if (dataEscrita) dataEscrita.exata = document.getElementById('p-data-esc-exata').checked;

        const dados = {
            id,
            titulo: document.getElementById('p-titulo').value,
            texto: document.getElementById('p-texto').value,
            paiTipo,
            paiId,
            sequencia: seqOuNull(document.getElementById('p-sequencia').value),
            dataEscrita,
            dataPublicacao,
            ano: dataEscrita?.ano || '', // mantido por compatibilidade (ordenação/estatísticas/exportação)
            livrosIds: Array.from(document.getElementById('p-livros').selectedOptions).map((o) =>
                parseInt(o.value),
            ),
            conceitos: {
                elos: Array.from(document.getElementById('p-elos-select').selectedOptions).map(
                    (o) => parseInt(o.value),
                ),
                referencias: Array.from(
                    document.getElementById('p-refs-select').selectedOptions,
                ).map((o) => parseInt(o.value)),
            },
            notas: document.getElementById('p-notas').value,
            sinalizacoes: document.getElementById('p-sinal').value,
            pessoas: document.getElementById('p-pessoas').value,
            publicado: document.getElementById('p-pub').checked,
        };

        const anterior = idInput ? db.poemas.find((x) => x.id == id) : null;
        const mesmoEscopo =
            anterior &&
            anterior.paiTipo === dados.paiTipo &&
            String(anterior.paiId) === String(dados.paiId);
        const posicaoAntiga = mesmoEscopo ? (anterior.sequencia ?? null) : null;

        if (idInput) {
            const idx = db.poemas.findIndex((x) => x.id == id);
            if (idx !== -1) db.poemas[idx] = dados;
        } else {
            db.poemas.push(dados);
        }

        // Poema avulso (sem destino) não disputa posição com nada
        if (anterior && !mesmoEscopo && anterior.paiTipo && anterior.paiId) {
            fecharEspaco(
                getIrmaosPorEscopo(db, anterior.paiTipo, anterior.paiId),
                anterior.sequencia ?? null,
            );
        }
        if (dados.paiTipo && dados.paiId) {
            reordenarPosicao(
                getIrmaosPorEscopo(db, dados.paiTipo, dados.paiId),
                dados,
                dados.sequencia,
                posicaoAntiga,
            );
        }

        save();
        rastreadorPoema.marcarLimpo();
        toggleModal('modal-poema');
    };
}

const MAPA_POEMA = {
    id: 'p-edit-id',
    titulo: 'p-titulo',
    texto: 'p-texto',
    sequencia: 'p-sequencia',
    notas: 'p-notas',
    publicado: 'p-pub', // checkbox — detectado automaticamente por preencherCampos
};

export async function editarPoema(id) {
    const p = db.poemas.find((x) => x.id == id);
    if (!p) return;
    await garantirModal('modal-poema');

    renderDropdowns();
    atualizarDatalist();

    preencherCampos(p, MAPA_POEMA);
    preencherDataParcial('p-data-esc', p.dataEscrita);
    preencherDataParcial('p-data-pub', p.dataPublicacao);
    document.getElementById('p-data-esc-exata').checked = !!p.dataEscrita?.exata;
    sincronizarFiltroDestino(
        'p-destino-filtro',
        'p-destino',
        p.paiTipo && p.paiId ? `${p.paiTipo}:${p.paiId}` : '',
    );

    const setM = (elId, vals) => {
        const el = document.getElementById(elId);
        if (!el) return;
        const arr = Array.isArray(vals) ? vals.map(String) : [];
        Array.from(el.options).forEach((opt) => {
            opt.selected = arr.includes(String(opt.value));
        });
    };

    setM('p-livros', p.livrosIds || []);
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

    rastreadorProsa.observar(form);

    form.onsubmit = (e) => {
        e.preventDefault();

        const idInput = document.getElementById('pr-edit-id').value;
        const id = idInput ? parseInt(idInput) : gerarId();
        const destino = document.getElementById('pr-destino').value;

        let paiTipo = null,
            paiId = null;
        if (destino && destino.includes(':')) {
            const partes = destino.split(':');
            paiTipo = partes[0];
            paiId = parseInt(partes[1]);
        }

        const dataEscrita = lerDataParcial('pr-data-esc');
        const dataPublicacao = lerDataParcial('pr-data-pub');
        if (dataEscrita) dataEscrita.exata = document.getElementById('pr-data-esc-exata').checked;

        const dados = {
            id,
            titulo: document.getElementById('pr-titulo').value,
            texto: document.getElementById('pr-texto').value,
            sequencia: seqOuNull(document.getElementById('pr-sequencia').value),
            dataEscrita,
            dataPublicacao,
            ano: dataEscrita?.ano || '', // mantido por compatibilidade (ordenação/estatísticas/exportação)
            paiTipo,
            paiId,
            notas: document.getElementById('pr-notas').value,
            sinalizacoes: document.getElementById('pr-sinal').value,
            pessoas: document.getElementById('pr-pessoas').value,
            genero: document.getElementById('pr-genero').value,
            publicado: document.getElementById('pr-pub').checked,
        };

        const anterior = idInput ? db.prosas.find((x) => x.id == id) : null;
        const mesmoEscopo =
            anterior &&
            anterior.paiTipo === dados.paiTipo &&
            String(anterior.paiId) === String(dados.paiId);
        const posicaoAntiga = mesmoEscopo ? (anterior.sequencia ?? null) : null;

        if (idInput) {
            const idx = db.prosas.findIndex((x) => x.id == id);
            if (idx !== -1) db.prosas[idx] = dados;
            else db.prosas.push(dados);
        } else {
            db.prosas.push(dados);
        }

        if (anterior && !mesmoEscopo && anterior.paiTipo && anterior.paiId) {
            fecharEspaco(
                getIrmaosPorEscopo(db, anterior.paiTipo, anterior.paiId),
                anterior.sequencia ?? null,
            );
        }
        if (dados.paiTipo && dados.paiId) {
            reordenarPosicao(
                getIrmaosPorEscopo(db, dados.paiTipo, dados.paiId),
                dados,
                dados.sequencia,
                posicaoAntiga,
            );
        }

        save();
        rastreadorProsa.marcarLimpo();
        toggleModal('modal-prosa');
        resetTagsProsa();
        resetPessoasProsa();
        resetGeneroProsa();
        form.reset();
    };
}

const MAPA_PROSA = {
    id: 'pr-edit-id',
    titulo: 'pr-titulo',
    texto: 'pr-texto',
    sequencia: ['pr-sequencia', 0],
    notas: 'pr-notas',
    publicado: 'pr-pub',
};

export async function editarProsa(id) {
    const pr = db.prosas.find((x) => x.id == id);
    if (!pr) return;
    await garantirModal('modal-prosa');
    renderDropdowns();

    preencherCampos(pr, MAPA_PROSA);
    preencherDataParcial('pr-data-esc', pr.dataEscrita);
    preencherDataParcial('pr-data-pub', pr.dataPublicacao);
    document.getElementById('pr-data-esc-exata').checked = !!pr.dataEscrita?.exata;

    const destinoStr =
        pr.paiTipo && pr.paiId
            ? `${pr.paiTipo}:${pr.paiId}`
            : pr.secaoId
              ? `secao:${pr.secaoId}`
              : ''; // compatibilidade: prosas salvas antes da remoção do campo legado
    sincronizarFiltroDestino('pr-destino-filtro', 'pr-destino', destinoStr);

    carregarTagsProsa(pr.sinalizacoes);
    carregarPessoasProsa(pr.pessoas);
    carregarGeneroProsa(pr.genero);
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
        const id = idInput ? parseInt(idInput) : gerarId();
        const vinculo = document.getElementById('el-vinculo').value;
        if (!vinculo) return mostrarAviso('Selecione um vínculo.');

        const [tipoPai, idPaiStr] = vinculo.split(':');
        const idPai = parseInt(idPaiStr);
        const fileEl = document.getElementById('el-img');
        const capaFile = fileEl && fileEl.files.length > 0 ? fileEl.files[0] : null;
        const removerImagem = document.getElementById('el-remover-imagem').checked;
        const capaAtual = idInput ? db.elementos.find((x) => x.id == id)?.imagem : null;
        let imagemFinal;
        if (removerImagem) {
            await deletarCapa(capaAtual);
            imagemFinal = null;
        } else {
            const novaImagemId = capaFile ? await salvarCapa(capaFile, capaAtual) : null;
            imagemFinal = novaImagemId ?? capaAtual;
        }

        const dados = {
            id,
            tipo: document.getElementById('el-tipo').value,
            titulo: document.getElementById('el-titulo')?.value || '',
            texto: document.getElementById('el-texto').value,
            notas: document.getElementById('el-notas').value,
            paiTipo: tipoPai,
            paiId: idPai,
            sequencia: seqOuNull(document.getElementById('el-sequencia')?.value),
            avisoConteudo: document.getElementById('el-aviso').value,
            versosPosIntroducao: document.getElementById('el-pos-versos').value,
            imagem: imagemFinal,
        };

        const anterior = idInput ? db.elementos.find((x) => x.id == id) : null;
        const mesmoEscopo =
            anterior &&
            anterior.paiTipo === dados.paiTipo &&
            String(anterior.paiId) === String(dados.paiId);
        const posicaoAntiga = mesmoEscopo ? (anterior.sequencia ?? null) : null;

        if (idInput) {
            const idx = db.elementos.findIndex((x) => x.id == id);
            if (idx !== -1) db.elementos[idx] = dados;
        } else {
            db.elementos.push(dados);
        }

        if (anterior && !mesmoEscopo) {
            fecharEspaco(
                getIrmaosPorEscopo(db, anterior.paiTipo, anterior.paiId),
                anterior.sequencia ?? null,
            );
        }
        reordenarPosicao(
            getIrmaosPorEscopo(db, dados.paiTipo, dados.paiId),
            dados,
            dados.sequencia,
            posicaoAntiga,
        );

        save();
        toggleModal('modal-elemento');
        form.reset();
    };
}

const MAPA_ELEMENTO = {
    id: 'el-edit-id',
    sequencia: 'el-sequencia',
    tipo: ['el-tipo', '', (v) => (v === 'Comentário' ? 'Conteúdo Multimídia' : v)],
    titulo: 'el-titulo',
    texto: 'el-texto',
    notas: 'el-notas',
    avisoConteudo: 'el-aviso',
    versosPosIntroducao: 'el-pos-versos',
};

export async function editarElemento(id) {
    const el = db.elementos.find((x) => x.id == id);
    if (!el) return;
    await garantirModal('modal-elemento');
    renderDropdowns();

    preencherCampos(el, MAPA_ELEMENTO);
    document.getElementById('el-vinculo').value = `${el.paiTipo}:${el.paiId}`;
    document.getElementById('el-remover-imagem').checked = false;

    // Importa toggleCamposIntroducao dinamicamente para evitar circular
    import('./ui.js').then(({ toggleCamposIntroducao }) => toggleCamposIntroducao());
    document.getElementById('modal-elemento-titulo').innerText = 'Editar Elemento';
    toggleModal('modal-elemento');
}
