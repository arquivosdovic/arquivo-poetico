// ============================================================
// main.js — Ponto de entrada. Inicializa módulos e expõe
//           funções globais que o HTML chama via onclick="..."
// ============================================================

import { db, save, exportarJSON, importarDB, deleteItem, getUltimoBackup } from './db.js';
import { mostrarAviso, debounce } from './utils.js';
import { listarSnapshots, baixarSnapshot } from './autobackup.js';
import { openTab, toggleModal, prepararNovo,
         renderDropdowns, toggleCamposIntroducao,
         sugerirSequencia, filtrarDestinoPoema,
         filtrarDestinoProsa, autoPreencherDataPublicacao } from './ui.js';
import { registrarModal }                                   from './modais.js';
import { renderLists }                                      from './render.js';
import { setFiltroPoemas, setFiltroProsas,
         setFiltroLivroPoemas,
         setOrdenacaoPoemas, setStatusPoemas,
         toggleSelecaoPoema, toggleSelecaoTodosPoemas,
         limparSelecaoPoemas, aplicarPessoaEmMassa,
         removerPessoaEmMassa, aplicarSinalEmMassa,
         removerSinalEmMassa,
         setFiltroLivroPartes, setFiltroLivroSecoes,
         setFiltroParteSecoes, setFiltroLivroElementos,
         setFiltroLivroProsa, moverLivro }                     from './render-listas.js';
import { setLivroEstrutura,
         moverItemEstrutura, abrirModalMoverNivel,
         toggleSelecaoEstrutura, marcarTodosEstrutura,
         exportarSelecaoEstrutura }                           from './render-estrutura.js';
import { previsualizarExportacaoSeletiva,
         executarExportacaoSeletiva,
         popularSelecaoExportacao,
         exportarTudoAninhado,
         exportarLivroCompleto,
         exportarLivrosCompletos }                            from './exportar.js';
import { renderEstatisticas }                               from './estatisticas.js';
import { initEditor, adicionarTag, removerTag,
         applyStyle, wrapText, renderizarTags, setAlign,
         adicionarPessoa, removerPessoa, atualizarDatalist,
         adicionarTagProsa, removerTagProsa,
         adicionarPessoaProsa, removerPessoaProsa }  from './editor.js';
import { initFormLivro,   editarLivro,
         initFormParte,   editarParte,
         initFormSecao,   editarSecao,
         initFormPoema,   editarPoema,
         initFormProsa,   editarProsa,
         initFormElemento, editarElemento }               from './forms.js';
import { renderColetaneas, selecionarColetanea,
         prepararNovaParte, editarParteColetanea,
         deletarParteColetanea, prepararNovoItem,
         editarItem, deletarItemColetanea, moverItem,
         onChangeTipoItem, toggleOverride,
         initFormColParte, initFormColItem }              from './coletaneas.js';

// ─── Registro dos modais (carregamento lazy via fetch) ───────
// Cada modal só é buscado em modais/<arquivo> e inicializado
// (onsubmit ligado etc.) na primeira vez que for aberto, seja
// por prepararNovo(tipo) ou por uma das funções editarX().
// modal-poema também carrega o editor de formatação (toolbar,
// tags, pessoas), que só existe dentro desse modal.

registrarModal('modal-livro',     'modal-livro.html',     initFormLivro);
registrarModal('modal-parte',     'modal-parte.html',     initFormParte);
registrarModal('modal-secao',     'modal-secao.html',     initFormSecao);
registrarModal('modal-poema',     'modal-poema.html',     () => { initFormPoema(); initEditor(); });
registrarModal('modal-prosa',     'modal-prosa.html',     initFormProsa);
registrarModal('modal-elemento',  'modal-elemento.html',  initFormElemento);
registrarModal('modal-col-parte', 'modal-col-parte.html', initFormColParte);
registrarModal('modal-col-item',  'modal-col-item.html',  initFormColItem);

// ─── Inicialização ───────────────────────────────────────────
// Note que initEditor/initFormX não são mais chamados aqui — eles
// rodam sob demanda, depois que o fetch do modal correspondente
// resolve (ver registrarModal acima e modais.js).

document.addEventListener('DOMContentLoaded', () => {
    renderColetaneas();
    renderLists();
    atualizarDatalist();
    popularSelecaoExportacao();
    atualizarIndicadorBackup();
    renderListaSnapshots();

    // Lembra a última escolha de "incluir capas" no backup (padrão: marcado,
    // já que o botão "Baixar JSON" é o backup "de verdade" — melhor pecar
    // por incluir demais do que a pessoa esquecer de marcar e perder capas).
    const chkCapas = document.getElementById('chk-incluir-capas');
    const prefCapas = localStorage.getItem('arquivoPoetico_incluirCapasBackup');
    if (chkCapas && prefCapas !== null) chkCapas.checked = prefCapas === 'true';
});

// ─── Lista de backups automáticos (ver autobackup.js) ─────────
function formatarDataSnapshot(iso) {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

async function renderListaSnapshots() {
    const container = document.getElementById('lista-snapshots');
    if (!container) return;

    const snapshots = await listarSnapshots();
    if (snapshots.length === 0) {
        container.innerHTML = '<p class="text-gray-400">Nenhum snapshot automático ainda — aparece aqui depois de um tempinho de uso.</p>';
        return;
    }

    container.innerHTML = snapshots.map((s, i) => `
        <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <span class="text-gray-600">${formatarDataSnapshot(s.dataISO)}${i === 0 ? ' <span class="text-emerald-600 font-bold">· mais recente</span>' : ''}</span>
            <button data-snapshot-id="${s.id}" onclick="baixarSnapshotPorId(this.dataset.snapshotId)"
                class="text-blue-600 hover:underline font-bold">baixar</button>
        </div>`).join('');
}
window.addEventListener('backup:feito', renderListaSnapshots);
window.addEventListener('snapshot:criado', renderListaSnapshots);

window.baixarSnapshotPorId = async function (id) {
    const snapshots = await listarSnapshots();
    const registro = snapshots.find(s => s.id === id);
    if (registro) baixarSnapshot(registro);
};

// ─── Indicador de "último backup" ─────────────────────────────
// Item 5 da revisão: antes o único jeito de saber se o backup estava
// desatualizado era lembrar de cabeça. Mostra há quanto tempo o botão
// "Baixar JSON" foi clicado pela última vez, com cor de alerta crescente.
function atualizarIndicadorBackup() {
    const el = document.getElementById('indicador-backup');
    if (!el) return;

    const ultimo = getUltimoBackup();
    if (!ultimo) {
        el.textContent = 'Nenhum backup baixado ainda';
        el.className = 'text-xs font-medium text-red-500';
        return;
    }

    const dias = Math.floor((Date.now() - ultimo.getTime()) / 86400000);
    let texto, cor;
    if (dias <= 0)      { texto = 'Último backup: hoje';        cor = 'text-emerald-600'; }
    else if (dias === 1) { texto = 'Último backup: ontem';       cor = 'text-emerald-600'; }
    else if (dias <= 3)  { texto = `Último backup: há ${dias} dias`; cor = 'text-gray-400'; }
    else if (dias <= 7)  { texto = `Último backup: há ${dias} dias`; cor = 'text-amber-600'; }
    else                 { texto = `Último backup: há ${dias} dias`; cor = 'text-red-500'; }

    el.textContent = texto;
    el.className = `text-xs font-medium ${cor}`;
}
window.addEventListener('backup:feito', atualizarIndicadorBackup);

// ─── Importar / Exportar JSON ────────────────────────────────

window.exportarJSON = exportarJSON;

window.importarJSON = function (event) {
    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const novoDb = JSON.parse(e.target.result);
            await importarDB(novoDb);
            location.reload();
        } catch {
            mostrarAviso('Erro ao importar arquivo JSON.');
        }
    };
    reader.readAsText(event.target.files[0]);
};

// ─── Funções globais exigidas pelos onclick no HTML ──────────
// O HTML usa onclick="funcao()" inline, então precisam estar
// no escopo global (window). Com ES Modules isso é explícito.

window.openTab          = openTab;
window.toggleModal      = toggleModal;
window.prepararNovo     = prepararNovo;
window.sugerirSequencia = sugerirSequencia;
window.filtrarDestinoPoema = filtrarDestinoPoema;
window.filtrarDestinoProsa = filtrarDestinoProsa;
window.autoPreencherDataPublicacao = autoPreencherDataPublicacao;

window.editarLivro    = editarLivro;
window.editarParte    = editarParte;
window.editarSecao    = editarSecao;
window.editarPoema    = editarPoema;
window.editarProsa    = editarProsa;
window.editarElemento = editarElemento;

window.deleteItem     = deleteItem;

window.adicionarTag   = adicionarTag;
window.removerTag     = removerTag;
window.adicionarPessoa = adicionarPessoa;
window.removerPessoa   = removerPessoa;
window.adicionarTagProsa    = adicionarTagProsa;
window.removerTagProsa      = removerTagProsa;
window.adicionarPessoaProsa = adicionarPessoaProsa;
window.removerPessoaProsa   = removerPessoaProsa;
window.applyStyle     = applyStyle;
window.wrapText       = wrapText;
// Debounce de 200ms: cada tecla digitada dispara um renderPoemas()/
// renderProsas() completo (reconstrói a tabela via innerHTML), então
// sem isso a digitação rápida engasga conforme o acervo cresce.
window.setFiltroPoemas = debounce(setFiltroPoemas, 200);
window.setFiltroProsas = debounce(setFiltroProsas, 200);
window.setFiltroLivroProsa = setFiltroLivroProsa;
window.setFiltroLivroPoemas = setFiltroLivroPoemas;
window.setOrdenacaoPoemas = setOrdenacaoPoemas;
window.setStatusPoemas    = setStatusPoemas;
window.toggleSelecaoPoema      = toggleSelecaoPoema;
window.toggleSelecaoTodosPoemas = toggleSelecaoTodosPoemas;
window.limparSelecaoPoemas     = limparSelecaoPoemas;
window.aplicarPessoaEmMassa    = aplicarPessoaEmMassa;
window.removerPessoaEmMassa    = removerPessoaEmMassa;
window.aplicarSinalEmMassa     = aplicarSinalEmMassa;
window.removerSinalEmMassa     = removerSinalEmMassa;
window.setLivroEstrutura       = setLivroEstrutura;
window.moverItemEstrutura      = moverItemEstrutura;
window.moverLivro              = moverLivro;
window.abrirModalMoverNivel    = abrirModalMoverNivel;
window.setFiltroLivroPartes    = setFiltroLivroPartes;
window.setFiltroLivroSecoes    = setFiltroLivroSecoes;
window.setFiltroParteSecoes    = setFiltroParteSecoes;
window.setFiltroLivroElementos = setFiltroLivroElementos;
window.previsualizarExportacaoSeletiva = previsualizarExportacaoSeletiva;
window.executarExportacaoSeletiva      = executarExportacaoSeletiva;
window.renderEstatisticas              = renderEstatisticas;
window.exportarTudoAninhado            = exportarTudoAninhado;
window.exportarLivroCompleto           = exportarLivroCompleto;
window.exportarLivrosCompletos         = exportarLivrosCompletos;

window.toggleSelecaoEstrutura  = toggleSelecaoEstrutura;
window.marcarTodosEstrutura    = marcarTodosEstrutura;
window.exportarSelecaoEstrutura = exportarSelecaoEstrutura;

window.toggleCamposIntroducao = toggleCamposIntroducao;

window.selecionarColetanea    = selecionarColetanea;
window.prepararNovaParte      = prepararNovaParte;
window.editarParteColetanea   = editarParteColetanea;
window.deletarParteColetanea  = deletarParteColetanea;
window.prepararNovoItem       = prepararNovoItem;
window.editarItem             = editarItem;
window.deletarItemColetanea   = deletarItemColetanea;
window.moverItem              = moverItem;
window.onChangeTipoItem       = onChangeTipoItem;
window.toggleOverride         = toggleOverride;
window.setAlign = setAlign;