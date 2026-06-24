// ============================================================
// main.js — Ponto de entrada. Inicializa módulos e expõe
//           funções globais que o HTML chama via onclick="..."
// ============================================================

import { db, save, exportarJSON, importarDB, deleteItem } from './db.js';
import { openTab, toggleModal, prepararNovo,
         renderDropdowns, toggleCamposIntroducao,
         sugerirSequencia, filtrarDestinoPoema,
         filtrarDestinoProsa, autoPreencherDataPublicacao } from './ui.js';
import { registrarModal }                                   from './modais.js';
import { renderLists, setFiltroPoemas, setFiltroProsas,
         setFiltroLivroPoemas,
         setOrdenacaoPoemas, setStatusPoemas,
         toggleSelecaoPoema, toggleSelecaoTodosPoemas,
         limparSelecaoPoemas, aplicarPessoaEmMassa,
         removerPessoaEmMassa, aplicarSinalEmMassa,
         removerSinalEmMassa, setLivroEstrutura,
         moverItemEstrutura, abrirModalMoverNivel,
         setFiltroLivroPartes, setFiltroLivroSecoes,
         setFiltroParteSecoes, setFiltroLivroElementos,
         setFiltroLivroProsa,
         toggleSelecaoEstrutura, marcarTodosEstrutura,
         exportarSelecaoEstrutura }                          from './render.js';
import { previsualizarExportacaoFiltrada,
         executarExportacaoFiltrada,
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
});

// ─── Importar / Exportar JSON ────────────────────────────────

window.exportarJSON = exportarJSON;

window.importarJSON = function (event) {
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const novoDb = JSON.parse(e.target.result);
            importarDB(novoDb);
            location.reload();
        } catch {
            alert('Erro ao importar arquivo JSON.');
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
window.setFiltroPoemas = setFiltroPoemas;
window.setFiltroProsas = setFiltroProsas;
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
window.abrirModalMoverNivel    = abrirModalMoverNivel;
window.setFiltroLivroPartes    = setFiltroLivroPartes;
window.setFiltroLivroSecoes    = setFiltroLivroSecoes;
window.setFiltroParteSecoes    = setFiltroParteSecoes;
window.setFiltroLivroElementos = setFiltroLivroElementos;
window.previsualizarExportacaoFiltrada = previsualizarExportacaoFiltrada;
window.executarExportacaoFiltrada      = executarExportacaoFiltrada;
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