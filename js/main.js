// ============================================================
// main.js — Ponto de entrada. Inicializa módulos e expõe
//           funções globais que o HTML chama via onclick="..."
// ============================================================

import {
    exportarJSON,
    importarDB,
    deleteItem,
    getUltimoBackup,
    getUsoStorage,
    migrarImagensLegadasParaIndexedDB,
} from './db.js';
import { mostrarAviso, avisarSalvo, debounce } from './utils.js';
import { listarSnapshots, baixarSnapshot } from './autobackup.js';
import {
    openTab,
    toggleModal,
    prepararNovo,
    toggleCamposIntroducao,
    sugerirSequencia,
    filtrarDestinoPoema,
    filtrarDestinoProsa,
    autoPreencherDataPublicacao,
    togglePainel,
} from './ui.js';
import { registrarModal } from './modais.js';
import { toggleColuna, moverColuna } from './colunas.js';
import { initTema, setTema } from './theme.js';
import { renderLists } from './render.js';
import {
    setFiltroPoemas,
    setFiltroProsas,
    setFiltroConteudoPoemas,
    setFiltroConteudoProsas,
    setCombinadorBuscaPoemas,
    setCombinadorBuscaProsas,
    getCombinadorBuscaPoemas,
    getCombinadorBuscaProsas,
    setFiltroLivroPoemas,
    setOrdenacaoPoemas,
    setStatusPoemas,
    setItensPorPagina,
    setPaginaPoemas,
    setPaginaProsas,
    toggleSelecaoPoema,
    toggleSelecaoTodosPoemas,
    limparSelecaoPoemas,
    excluirSelecaoPoemas,
    aplicarPessoaEmMassa,
    removerPessoaEmMassa,
    aplicarSinalEmMassa,
    removerSinalEmMassa,
    toggleSelecaoProsa,
    toggleSelecaoTodosProsas,
    limparSelecaoProsas,
    excluirSelecaoProsas,
    aplicarPessoaEmMassaProsa,
    removerPessoaEmMassaProsa,
    aplicarSinalEmMassaProsa,
    removerSinalEmMassaProsa,
    setFiltroLivroPartes,
    setFiltroLivroSecoes,
    setFiltroParteSecoes,
    setFiltroLivroElementos,
    setFiltroLivroProsa,
    moverLivro,
    setFiltroDataEscritaPoemas,
    setFiltroDataPublicacaoPoemas,
    setFiltroDataEscritaProsas,
    setFiltroDataPublicacaoProsas,
    setFiltroDataRapidoPoemasEscrita,
    setFiltroDataRapidoPoemasPublicacao,
    setFiltroDataRapidoProsasEscrita,
    setFiltroDataRapidoProsasPublicacao,
    limparFiltroDataPoemas,
    limparFiltroDataProsas,
} from './render-listas.js';
import {
    setLivroEstrutura,
    moverItemEstrutura,
    abrirModalMoverNivel,
    toggleSelecaoEstrutura,
    marcarTodosEstrutura,
    exportarSelecaoEstrutura,
} from './render-estrutura.js';
import {
    previsualizarExportacaoSeletiva,
    executarExportacaoSeletiva,
    popularSelecaoExportacao,
    exportarTudoAninhado,
    exportarLivroCompleto,
    exportarLivrosCompletos,
} from './exportar.js';
import { renderEstatisticas } from './estatisticas.js';
import {
    initEditor,
    adicionarTag,
    removerTag,
    applyStyle,
    wrapText,
    setAlign,
    adicionarPessoa,
    removerPessoa,
    atualizarDatalist,
    atualizarDatalistProsa,
    adicionarTagProsa,
    removerTagProsa,
    adicionarPessoaProsa,
    removerPessoaProsa,
} from './editor.js';
import {
    initFormLivro,
    editarLivro,
    initFormParte,
    editarParte,
    initFormSecao,
    editarSecao,
    initFormPoema,
    editarPoema,
    initFormProsa,
    editarProsa,
    initFormElemento,
    editarElemento,
    rastreadorPoema,
    rastreadorProsa,
} from './forms.js';
import {
    renderColetaneas,
    selecionarColetanea,
    prepararNovaParte,
    editarParteColetanea,
    deletarParteColetanea,
    prepararNovoItem,
    editarItem,
    deletarItemColetanea,
    moverItem,
    onChangeTipoItem,
    toggleOverride,
    initFormColParte,
    initFormColItem,
} from './coletaneas.js';

// ─── Registro dos modais (carregamento lazy via fetch) ───────
// Cada modal só é buscado em modais/<arquivo> e inicializado
// (onsubmit ligado etc.) na primeira vez que for aberto, seja
// por prepararNovo(tipo) ou por uma das funções editarX().
// modal-poema também carrega o editor de formatação (toolbar,
// tags, pessoas), que só existe dentro desse modal.

registrarModal('modal-livro', 'modal-livro.html', initFormLivro);
registrarModal('modal-parte', 'modal-parte.html', initFormParte);
registrarModal('modal-secao', 'modal-secao.html', initFormSecao);
registrarModal(
    'modal-poema',
    'modal-poema.html',
    () => {
        initFormPoema();
        initEditor();
    },
    rastreadorPoema,
);
registrarModal('modal-prosa', 'modal-prosa.html', initFormProsa, rastreadorProsa);
registrarModal('modal-elemento', 'modal-elemento.html', initFormElemento);
registrarModal('modal-col-parte', 'modal-col-parte.html', initFormColParte);
registrarModal('modal-col-item', 'modal-col-item.html', initFormColItem);

// ─── Listener delegado para as listas (render-listas.js) ─────
// render-listas.js gera botões/checkboxes com data-action + data-id/
// data-tipo/data-dir/data-pagina em vez de onclick="..." inline —
// isso tira ~20 onclick espalhados em template strings (Livros,
// Partes, Seções, Poemas, Prosas, Elementos, paginação e checkboxes
// de seleção em massa). Um único listener aqui, no <main> que
// engloba todas essas listas, substitui os handlers individuais;
// como as listas são recriadas via innerHTML a cada render, delegar
// no ancestral estável evita ter que re-ligar listeners depois de
// cada renderLists(). index.html (botões estáticos) e os modais
// continuam usando onclick por enquanto — ver conversa anterior.
const ACOES_LISTA = {
    'editar-livro': (el) => editarLivro(Number(el.dataset.id)),
    'editar-parte': (el) => editarParte(Number(el.dataset.id)),
    'editar-secao': (el) => editarSecao(Number(el.dataset.id)),
    'editar-poema': (el) => editarPoema(Number(el.dataset.id)),
    'editar-prosa': (el) => editarProsa(Number(el.dataset.id)),
    'editar-elemento': (el) => editarElemento(Number(el.dataset.id)),
    'excluir-item': (el) => deleteItem(el.dataset.tipo, Number(el.dataset.id)),
    'mover-livro': (el) => moverLivro(Number(el.dataset.id), el.dataset.dir),
    'pagina-poemas': (el) => setPaginaPoemas(Number(el.dataset.pagina)),
    'pagina-prosas': (el) => setPaginaProsas(Number(el.dataset.pagina)),
    'toggle-poema': (el) => toggleSelecaoPoema(el.checked, Number(el.dataset.id)),
    'toggle-prosa': (el) => toggleSelecaoProsa(el.checked, Number(el.dataset.id)),
    'toggle-todos-poemas': (el) => toggleSelecaoTodosPoemas(el.checked),
    'toggle-todos-prosas': (el) => toggleSelecaoTodosProsas(el.checked),
};

document.querySelector('main')?.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-action]');
    if (!alvo) return;
    const acao = ACOES_LISTA[alvo.dataset.action];
    if (acao) acao(alvo);
});

// ─── Inicialização ───────────────────────────────────────────
// Note que initEditor/initFormX não são mais chamados aqui — eles
// rodam sob demanda, depois que o fetch do modal correspondente
// resolve (ver registrarModal acima e modais.js).

document.addEventListener('DOMContentLoaded', async () => {
    // Migra imagens/capas salvas no formato antigo (base64 dentro do db)
    // antes do primeiro render — ver comentário em db.js. Roda uma vez;
    // depois disso não há mais pendentes e a função retorna na hora.
    await migrarImagensLegadasParaIndexedDB();

    initTema();
    renderColetaneas();
    renderLists();
    atualizarDatalist();
    atualizarDatalistProsa();
    popularSelecaoExportacao();
    atualizarIndicadorBackup();
    atualizarIndicadorStorage();
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
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

async function renderListaSnapshots() {
    const container = document.getElementById('lista-snapshots');
    if (!container) return;

    const snapshots = await listarSnapshots();
    if (snapshots.length === 0) {
        container.innerHTML =
            '<p class="text-gray-400 dark:text-slate-500">Nenhum snapshot automático ainda — aparece aqui depois de um tempinho de uso.</p>';
        return;
    }

    container.innerHTML = snapshots
        .map(
            (s, i) => `
        <div class="flex items-center justify-between bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5">
            <span class="text-gray-600 dark:text-slate-300">${formatarDataSnapshot(s.dataISO)}${i === 0 ? ' <span class="text-emerald-600 dark:text-emerald-400 font-bold">· mais recente</span>' : ''}</span>
            <button data-snapshot-id="${s.id}" onclick="baixarSnapshotPorId(this.dataset.snapshotId)"
                class="text-blue-600 dark:text-blue-400 hover:underline font-bold">baixar</button>
        </div>`,
        )
        .join('');
}
window.addEventListener('backup:feito', renderListaSnapshots);
window.addEventListener('snapshot:criado', renderListaSnapshots);

window.baixarSnapshotPorId = async function (id) {
    const snapshots = await listarSnapshots();
    const registro = snapshots.find((s) => s.id === id);
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
        el.className = 'text-xs font-medium text-red-500 dark:text-red-400';
        return;
    }

    const dias = Math.floor((Date.now() - ultimo.getTime()) / 86400000);
    let texto, cor;
    if (dias <= 0) {
        texto = 'Último backup: hoje';
        cor = 'text-emerald-600 dark:text-emerald-400';
    } else if (dias === 1) {
        texto = 'Último backup: ontem';
        cor = 'text-emerald-600 dark:text-emerald-400';
    } else if (dias <= 3) {
        texto = `Último backup: há ${dias} dias`;
        cor = 'text-gray-400 dark:text-slate-500';
    } else if (dias <= 7) {
        texto = `Último backup: há ${dias} dias`;
        cor = 'text-amber-600 dark:text-amber-400';
    } else {
        texto = `Último backup: há ${dias} dias`;
        cor = 'text-red-500 dark:text-red-400';
    }

    el.textContent = texto;
    el.className = `text-xs font-medium ${cor}`;
}
window.addEventListener('backup:feito', atualizarIndicadorBackup);

// ─── Indicador de uso do storage ───────────────────────────────
// Antecipa o erro de quota (ver try/catch em save()): mostra uma barra com
// a estimativa de uso do localStorage a cada salvamento, em vez de só
// reagir quando o navegador já recusou gravar. É estimativa (JSON.stringify
// não bate 1:1 com bytes reais), então a barra é só um sinal de alerta —
// os limiares (60/85%) têm folga de propósito.
let avisoStorageMostrado = false; // evita repetir o toast a cada save() na mesma sessão

function atualizarIndicadorStorage() {
    const barra = document.getElementById('barra-storage');
    const el = document.getElementById('indicador-storage');
    if (!barra || !el) return;

    const { bytes, percentual, limiteBytes } = getUsoStorage();
    const kb = Math.round(bytes / 1024).toLocaleString('pt-BR');
    const limiteMb = Math.round(limiteBytes / (1024 * 1024));

    let cor, corBarra;
    if (percentual < 60) {
        cor = 'text-gray-400 dark:text-slate-500';
        corBarra = 'bg-emerald-500';
    } else if (percentual < 85) {
        cor = 'text-amber-600 dark:text-amber-400';
        corBarra = 'bg-amber-500';
    } else {
        cor = 'text-red-500 dark:text-red-400';
        corBarra = 'bg-red-500';
    }

    barra.className = `h-full rounded-full transition-all ${corBarra}`;
    barra.style.width = `${Math.max(3, percentual)}%`; // largura mínima só pra barra não sumir com uso baixo

    el.textContent = `${percentual.toFixed(0)}% · ${kb} KB`;
    el.className = `text-xs font-medium ${cor}`;
    el.title = `Estimativa de uso do localStorage (limite real varia por navegador — usamos ~${limiteMb} MB como referência conservadora)`;

    if (percentual >= 85 && !avisoStorageMostrado) {
        avisoStorageMostrado = true;
        mostrarAviso(
            `⚠️ Armazenamento em ${percentual.toFixed(0)}% da estimativa — baixe um backup em JSON antes de continuar adicionando itens.`,
            'erro',
        );
    } else if (percentual < 85) {
        avisoStorageMostrado = false; // se a pessoa liberar espaço (ex: apagar itens), o aviso pode voltar a aparecer depois
    }
}
window.addEventListener('db:saved', atualizarIndicadorStorage);

// ─── Feedback de "salvo" ────────────────────────────────────────
// Sem backend, não existe "sincronizando..." — esse toast é o único
// jeito de saber que a ação realmente foi persistida no localStorage
// (ver avisarSalvo() em utils.js pro porquê de ele coalescer e nunca
// empilhar vários "✓ salvo" em sequências rápidas de ações).
window.addEventListener('db:saved', () => avisarSalvo());

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

window.openTab = openTab;
window.toggleModal = toggleModal;
window.prepararNovo = prepararNovo;
window.sugerirSequencia = sugerirSequencia;
window.filtrarDestinoPoema = filtrarDestinoPoema;
window.filtrarDestinoProsa = filtrarDestinoProsa;
window.autoPreencherDataPublicacao = autoPreencherDataPublicacao;

// editarLivro/Parte/Secao/Poema/Prosa/Elemento e deleteItem não
// precisam mais de window.X — só eram chamados via onclick gerado em
// render-listas.js, que agora usa data-action + o listener delegado
// acima. Continuam importados normalmente (uso local no ACOES_LISTA).

window.adicionarTag = adicionarTag;
window.removerTag = removerTag;
window.adicionarPessoa = adicionarPessoa;
window.removerPessoa = removerPessoa;
window.adicionarTagProsa = adicionarTagProsa;
window.removerTagProsa = removerTagProsa;
window.adicionarPessoaProsa = adicionarPessoaProsa;
window.removerPessoaProsa = removerPessoaProsa;
window.applyStyle = applyStyle;
window.wrapText = wrapText;
// Debounce de 200ms: cada tecla digitada dispara um renderPoemas()/
// renderProsas() completo (reconstrói a tabela via innerHTML), então
// sem isso a digitação rápida engasga conforme o acervo cresce.
window.setFiltroPoemas = debounce(setFiltroPoemas, 200);
window.setFiltroProsas = debounce(setFiltroProsas, 200);
window.setFiltroConteudoPoemas = debounce(setFiltroConteudoPoemas, 200);
window.setFiltroConteudoProsas = debounce(setFiltroConteudoProsas, 200);

// Alterna o botão E/OU entre os dois campos de busca (metadados +
// conteúdo) e atualiza o próprio rótulo do botão.
window.alternarCombinadorBuscaPoemas = (btn) => {
    const novo = getCombinadorBuscaPoemas() === 'ou' ? 'e' : 'ou';
    setCombinadorBuscaPoemas(novo);
    atualizarBotaoCombinador(btn, novo);
};
window.alternarCombinadorBuscaProsas = (btn) => {
    const novo = getCombinadorBuscaProsas() === 'ou' ? 'e' : 'ou';
    setCombinadorBuscaProsas(novo);
    atualizarBotaoCombinador(btn, novo);
};
function atualizarBotaoCombinador(btn, valor) {
    if (!btn) return;
    btn.textContent = valor === 'ou' ? 'OU' : 'E';
    btn.title =
        valor === 'ou'
            ? 'Basta bater em um dos dois campos (clique pra exigir os dois)'
            : 'Precisa bater nos dois campos (clique pra bastar um)';
}
window.setFiltroLivroProsa = setFiltroLivroProsa;
window.setFiltroLivroPoemas = setFiltroLivroPoemas;
window.setOrdenacaoPoemas = setOrdenacaoPoemas;
window.setStatusPoemas = setStatusPoemas;
window.setItensPorPagina = setItensPorPagina;
window.togglePainel = togglePainel;
window.toggleColuna = toggleColuna;
window.moverColuna = moverColuna;
window.setTema = setTema;
window.setFiltroDataEscritaPoemas = setFiltroDataEscritaPoemas;
window.setFiltroDataPublicacaoPoemas = setFiltroDataPublicacaoPoemas;
window.setFiltroDataEscritaProsas = setFiltroDataEscritaProsas;
window.setFiltroDataPublicacaoProsas = setFiltroDataPublicacaoProsas;
window.setFiltroDataRapidoPoemasEscrita = setFiltroDataRapidoPoemasEscrita;
window.setFiltroDataRapidoPoemasPublicacao = setFiltroDataRapidoPoemasPublicacao;
window.setFiltroDataRapidoProsasEscrita = setFiltroDataRapidoProsasEscrita;
window.setFiltroDataRapidoProsasPublicacao = setFiltroDataRapidoProsasPublicacao;
window.limparFiltroDataPoemas = limparFiltroDataPoemas;
window.limparFiltroDataProsas = limparFiltroDataProsas;
// toggleSelecaoTodosPoemas segue em window: index.html ainda tem um
// onclick estático nesse checkbox (fica pra quando migrarmos index.html).
window.toggleSelecaoTodosPoemas = toggleSelecaoTodosPoemas;
window.limparSelecaoPoemas = limparSelecaoPoemas;
window.excluirSelecaoPoemas = excluirSelecaoPoemas;
window.aplicarPessoaEmMassa = aplicarPessoaEmMassa;
window.removerPessoaEmMassa = removerPessoaEmMassa;
window.aplicarSinalEmMassa = aplicarSinalEmMassa;
window.removerSinalEmMassa = removerSinalEmMassa;
// idem: toggleSelecaoTodosProsas segue em window pelo mesmo motivo.
window.toggleSelecaoTodosProsas = toggleSelecaoTodosProsas;
window.limparSelecaoProsas = limparSelecaoProsas;
window.excluirSelecaoProsas = excluirSelecaoProsas;
window.aplicarPessoaEmMassaProsa = aplicarPessoaEmMassaProsa;
window.removerPessoaEmMassaProsa = removerPessoaEmMassaProsa;
window.aplicarSinalEmMassaProsa = aplicarSinalEmMassaProsa;
window.removerSinalEmMassaProsa = removerSinalEmMassaProsa;
window.setLivroEstrutura = setLivroEstrutura;
window.moverItemEstrutura = moverItemEstrutura;
window.abrirModalMoverNivel = abrirModalMoverNivel;
window.setFiltroLivroPartes = setFiltroLivroPartes;
window.setFiltroLivroSecoes = setFiltroLivroSecoes;
window.setFiltroParteSecoes = setFiltroParteSecoes;
window.setFiltroLivroElementos = setFiltroLivroElementos;
window.previsualizarExportacaoSeletiva = previsualizarExportacaoSeletiva;
window.executarExportacaoSeletiva = executarExportacaoSeletiva;
window.renderEstatisticas = renderEstatisticas;
window.exportarTudoAninhado = exportarTudoAninhado;
window.exportarLivroCompleto = exportarLivroCompleto;
window.exportarLivrosCompletos = exportarLivrosCompletos;

window.toggleSelecaoEstrutura = toggleSelecaoEstrutura;
window.marcarTodosEstrutura = marcarTodosEstrutura;
window.exportarSelecaoEstrutura = exportarSelecaoEstrutura;

window.toggleCamposIntroducao = toggleCamposIntroducao;

window.selecionarColetanea = selecionarColetanea;
window.prepararNovaParte = prepararNovaParte;
window.editarParteColetanea = editarParteColetanea;
window.deletarParteColetanea = deletarParteColetanea;
window.prepararNovoItem = prepararNovoItem;
window.editarItem = editarItem;
window.deletarItemColetanea = deletarItemColetanea;
window.moverItem = moverItem;
window.onChangeTipoItem = onChangeTipoItem;
window.toggleOverride = toggleOverride;
window.setAlign = setAlign;
