// ============================================================
// db.js — Estado central e persistência
// Importado por: todos os outros módulos
// Não importa nenhum módulo interno
// ============================================================

import {
    getPosicaoElemento,
    fecharEspaco,
    abrirEspaco,
    getIrmaosTopoLivro,
    getIrmaosPorEscopo,
    abrirModalExclusao,
    mostrarAvisoComAcao,
    fecharAviso,
} from './utils.js';
import {
    salvarCapa,
    deletarCapa,
    exportarTodasCapasBase64,
    importarCapasBase64,
    base64ParaBlob,
} from './capas.js';
import { tirarSnapshotSeNecessario } from './autobackup.js';

const DB_KEY = 'arquivoPoetico_v3';
// Guarda quando o último "Baixar JSON" foi de fato clicado — usado pra
// mostrar na UI há quanto tempo não se tira um backup manual (item 5
// da revisão: antes não havia nenhum indicativo disso).
const LS_KEY_ULTIMO_BACKUP = 'arquivoPoetico_ultimoBackup';

// Limite do localStorage varia por navegador (Chrome/Firefox costumam dar
// ~10 MB, Safari ~5 MB) e não tem como consultar o valor real de antemão —
// só descobrimos o teto de fato quando o QuotaExceededError dispara. Usamos
// 5 MB como estimativa conservadora só pra dar um alerta antecipado; é
// melhor "sobrar" barra do que a pessoa achar que tem folga e não ter.
const LIMITE_ESTIMADO_BYTES = 5 * 1024 * 1024;

export let db = JSON.parse(localStorage.getItem(DB_KEY)) || {
    livros: [],
    partes: [],
    secoes: [],
    poemas: [],
    prosas: [],
    elementos: [],
    coletaneas: [], // legado, não usado pela aba Coletâneas atual — mantido só por compatibilidade na importação de backups antigos
    itensColetanea: [], // itens de Coletânea de fato (ver coletaneas.js); cada item referencia uma Parte via parteId
};

// Garante que dados importados de versões antigas tenham o campo coletaneas
if (!db.coletaneas) db.coletaneas = [];

// ─── Ordenações ──────────────────────────────────────────────
// Recebem os arrays como parâmetro (em vez de fechar sobre o `db` do
// módulo) pra poderem ser testadas isoladamente, com dados de mentira,
// sem precisar de localStorage/DOM. Continuam ordenando in-place e
// retornam o próprio array — mesmo comportamento de antes, só exposto.

export function sortLivros(livros) {
    livros.sort(
        (a, b) => (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999) || a.id - b.id,
    );
    return livros;
}

export function sortPartes(partes, livros) {
    partes.sort((a, b) => {
        const orderA = livros.findIndex((l) => l.id == a.livroId);
        const orderB = livros.findIndex((l) => l.id == b.livroId);
        if (orderA !== orderB) return orderA - orderB;
        return (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999);
    });
    return partes;
}

export function sortSecoes(secoes, livros, partes) {
    secoes.sort((a, b) => {
        const getLivroId = (s) => {
            if (s.paiTipo === 'livro') return s.paiId;
            const parte = partes.find((p) => p.id == s.paiId);
            return parte ? parte.livroId : 0;
        };
        const livroA = getLivroId(a),
            livroB = getLivroId(b);
        if (livroA !== livroB)
            return (
                livros.findIndex((l) => l.id == livroA) - livros.findIndex((l) => l.id == livroB)
            );

        // Posição dentro do livro: Seção direta no Livro usa a própria sequência
        // (senão sempre ia pro fim, perdendo pra qualquer Parte numerada).
        const posA =
            a.paiTipo === 'livro'
                ? parseInt(a.sequencia) || 9999
                : parseInt(partes.find((p) => p.id == a.paiId)?.sequencia) || 9999;
        const posB =
            b.paiTipo === 'livro'
                ? parseInt(b.sequencia) || 9999
                : parseInt(partes.find((p) => p.id == b.paiId)?.sequencia) || 9999;
        if (posA !== posB) return posA - posB;

        return (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999);
    });
    return secoes;
}

export function sortPoemas(poemas, livros, partes, secoes) {
    poemas.sort((a, b) => {
        const getPath = (p) => {
            let livroIdx = 999,
                parteIdx = 999,
                secaoIdx = 999;
            const pad = (n) => String(n + 1).padStart(3, '0');

            if (p.paiTipo === 'secao') {
                const s = secoes.find((x) => x.id == p.paiId);
                if (s) {
                    secaoIdx = secoes.findIndex((x) => x.id == s.id);
                    if (s.paiTipo === 'parte') {
                        parteIdx = partes.findIndex((x) => x.id == s.paiId);
                        const pt = partes.find((x) => x.id == s.paiId);
                        livroIdx = livros.findIndex((x) => x.id == pt?.livroId);
                    } else {
                        livroIdx = livros.findIndex((x) => x.id == s.paiId);
                    }
                }
            } else if (p.paiTipo === 'parte') {
                parteIdx = partes.findIndex((x) => x.id == p.paiId);
                const pt = partes.find((x) => x.id == p.paiId);
                livroIdx = livros.findIndex((x) => x.id == pt?.livroId);
                secaoIdx = -1;
            } else if (p.paiTipo === 'livro') {
                livroIdx = livros.findIndex((x) => x.id == p.paiId);
                parteIdx = -1;
                secaoIdx = -1;
            }

            return `${pad(livroIdx)}_${pad(parteIdx)}_${pad(secaoIdx)}`;
        };

        const pathA = getPath(a),
            pathB = getPath(b);
        if (pathA !== pathB) return pathA.localeCompare(pathB);
        return (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999);
    });
    return poemas;
}

export function sortElementos(elementos, dbRef) {
    elementos.sort((a, b) => {
        const [lA, ppA, psA] = getPosicaoElemento(a, dbRef);
        const [lB, ppB, psB] = getPosicaoElemento(b, dbRef);
        if (lA !== lB) return lA - lB;
        if (ppA !== ppB) return ppA - ppB;
        if (psA !== psB) return psA - psB;
        return (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999);
    });
    return elementos;
}

// ─── API pública ──────────────────────────────────────────────

// Importar renderLists de render.js causaria dependência circular.
// save() aceiona um CustomEvent que render.js escuta.
export function save() {
    sortLivros(db.livros);
    sortPartes(db.partes, db.livros);
    sortSecoes(db.secoes, db.livros, db.partes);
    sortPoemas(db.poemas, db.livros, db.partes, db.secoes);
    db.prosas.sort((a, b) => (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999));
    sortElementos(db.elementos, db);

    try {
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (err) {
        // Quota excedida (QuotaExceededError) ou modo privado sem espaço
        const isQuota =
            err.name === 'QuotaExceededError' ||
            err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || // Firefox
            (err.code && err.code === 22);

        const mensagem = isQuota
            ? '⚠️ Armazenamento cheio\n\nO navegador não conseguiu salvar os dados — o localStorage atingiu o limite (geralmente ~5 MB de texto).\n\nO que fazer:\n• Exporte um backup em JSON agora (aba Exportar)\n• Considere dividir o acervo em instâncias separadas\n• Em modo anônimo/privado o limite é menor — use uma janela normal'
            : `⚠️ Erro ao salvar\n\nNão foi possível gravar no localStorage.\n\nDetalhes técnicos: ${err.message}`;

        console.error('[db.js] Falha ao salvar no localStorage:', err);
        // setTimeout evita bloquear a call stack atual — o alert aparece
        // mesmo que o código que chamou save() ainda esteja executando.
        setTimeout(() => alert(mensagem), 0);
        return; // não dispara db:saved se não salvou de verdade
    }
    // Best-effort, em segundo plano — não bloqueia o save() principal
    // nem precisa ser esperado (ver autobackup.js).
    tirarSnapshotSeNecessario(db);
    window.dispatchEvent(new CustomEvent('db:saved'));
}

export async function importarDB(novoDb) {
    db.livros = novoDb.livros || [];
    db.partes = novoDb.partes || [];
    db.secoes = novoDb.secoes || [];
    db.poemas = novoDb.poemas || [];
    db.prosas = novoDb.prosas || [];
    db.elementos = novoDb.elementos || [];
    db.coletaneas = novoDb.coletaneas || [];
    db.itensColetanea = novoDb.itensColetanea || [];

    // Se o backup foi gerado com "incluir capas" marcado, ele traz um
    // _capasBase64 com as imagens embutidas — restaura pro IndexedDB
    // antes de salvar, senão as capas ficam referenciando IDs vazios.
    if (novoDb._capasBase64) {
        await importarCapasBase64(novoDb._capasBase64);
    }

    await migrarImagensLegadasParaIndexedDB();
    save();
}

// Até esta correção, dois lugares guardavam imagem como base64 direto no
// `db`, em vez do ID no IndexedDB que Livro/Parte/Seção normalmente usam
// (ver capas.js):
//   • Elemento (`imagem`) — sempre foi assim, um esquecimento na migração
//     original pro IndexedDB.
//   • "Parte de Coletânea" (`partes[i].capa`, criada via modal-col-parte) —
//     usa o MESMO campo `capa` que uma Parte normal, então o campo tinha
//     dois formatos diferentes dependendo de qual modal criou o registro:
//     ID (Parte normal) ou base64 (Parte de Coletânea). Isso fazia a capa
//     de uma Parte de Coletânea nem aparecer (lerCapa procurava um ID que
//     não existia no IndexedDB).
// Base64 direto no `db` infla o localStorage a cada save(), duplica a
// imagem em cada snapshot automático, e vai sempre junto no "Baixar JSON"
// mesmo com "incluir capas" desmarcado. Esta função migra, uma vez, tudo
// que ainda estiver nesse formato antigo (string "data:...") para o
// IndexedDB, guardando só o ID no `db`. Roda no boot do app (main.js) e
// também depois de importar um backup antigo, pra não reintroduzir o
// problema.
export async function migrarImagensLegadasParaIndexedDB() {
    const legado = (valor) => typeof valor === 'string' && valor.startsWith('data:');
    const elementosPendentes = db.elementos.filter((el) => legado(el.imagem));
    const partesPendentes = db.partes.filter((p) => legado(p.capa));
    if (elementosPendentes.length === 0 && partesPendentes.length === 0) return;

    for (const el of elementosPendentes) {
        try {
            const blob = await base64ParaBlob(el.imagem);
            el.imagem = await salvarCapa(blob);
        } catch (err) {
            // Não deixa o base64 antigo preso no db — perde a imagem nesse
            // elemento específico, mas libera o espaço pros demais.
            console.warn(`[db.js] Não foi possível migrar a imagem do elemento ${el.id}:`, err);
            el.imagem = null;
        }
    }

    for (const p of partesPendentes) {
        try {
            const blob = await base64ParaBlob(p.capa);
            p.capa = await salvarCapa(blob);
        } catch (err) {
            console.warn(`[db.js] Não foi possível migrar a capa da parte ${p.id}:`, err);
            p.capa = null;
        }
    }

    // Persiste agora — sem isso a migração rodaria de novo (e de novo)
    // a cada carregamento, até algum outro save() acontecer por acaso.
    save();
}

/**
 * @param {boolean} incluirCapas — se true, embute todas as capas de
 *   Livro/Parte/Seção como base64 no próprio JSON (deixa o arquivo maior,
 *   mas o backup fica autocontido — sem isso, um backup restaurado num
 *   navegador zerado perde todas as imagens, só sobra o texto).
 */
export async function exportarJSON(incluirCapas = false) {
    const payload = incluirCapas ? { ...db, _capasBase64: await exportarTodasCapasBase64() } : db;

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', 'arquivo_poetico_backup.json');
    document.body.appendChild(a);
    a.click();
    a.remove();

    try {
        localStorage.setItem(LS_KEY_ULTIMO_BACKUP, new Date().toISOString());
    } catch (err) {
        // Se nem isso couber, o storage já está no limite — o alert de
        // quota do save() já vai avisar na próxima gravação normal.
        console.warn('[db.js] Não foi possível registrar a data do backup:', err);
    }
    window.dispatchEvent(new CustomEvent('backup:feito'));
}

// Usado pela UI (main.js) pra mostrar "Último backup: há X dias".
// Retorna null se nenhum backup foi baixado ainda nesse navegador.
export function getUltimoBackup() {
    const raw = localStorage.getItem(LS_KEY_ULTIMO_BACKUP);
    return raw ? new Date(raw) : null;
}

// ─── Indicador de uso do storage ───────────────────────────────
// Estimativa via JSON.stringify(db).length — não é o número exato de bytes
// gravados (caracteres acentuados/emoji pesam mais em UTF-16 do que 1 byte),
// mas serve como aproximação razoável pra dar um alerta ANTES do
// QuotaExceededError, e não só reagir a ele (ver try/catch em save()).
// Usado pela UI (main.js) pra desenhar a barra de uso no header.
export function getUsoStorage() {
    const bytes = JSON.stringify(db).length;
    const percentual = Math.min(100, (bytes / LIMITE_ESTIMADO_BYTES) * 100);
    return { bytes, percentual, limiteBytes: LIMITE_ESTIMADO_BYTES };
}

// ─── Exclusão de item ─────────────────────────────────────────

const ROTULOS_COL = {
    livros: 'Livro',
    partes: 'Parte',
    secoes: 'Seção',
    poemas: 'Poema',
    prosas: 'Prosa',
    elementos: 'Elemento',
    itensColetanea: 'Item de Coletânea',
    coletaneas: 'Coletânea',
};

// Plural + particípio com concordância de gênero certa pro toast de
// exclusão em massa ("3 prosas excluídas", não "excluídos"). Só cobre
// poemas/prosas (única exclusão em massa que existe hoje — ver
// excluirSelecaoPoemas/excluirSelecaoProsas em render-listas.js);
// deleteItemsEmMassa cai num fallback genérico (masculino) pra
// qualquer outra coluna que vier a ganhar seleção em massa no futuro.
const MASSA_COL_INFO = {
    poemas: { plural: 'poemas', participio: 'excluídos' },
    prosas: { plural: 'prosas', participio: 'excluídas' },
};

/**
 * Calcula o que seria afetado ao apagar o Livro `livroId`, SE ele for uma
 * Coletânea: as Partes exclusivas dela e os itens de Coletânea dessas Partes.
 * Função pura (só lê `dbRef`, não muda nada) — usada tanto pra montar a
 * mensagem de confirmação (deleteItem) quanto pra executar a remoção de
 * fato (_executarExclusao), garantindo que os dois nunca divirjam.
 *
 * Não toca em poemas/prosas originais — os itens só guardam refId (ponteiro),
 * e as partes de livros normais referenciadas via parte.refId também ficam intactas.
 */
export function calcularCascataColetanea(dbRef, livroId) {
    const partesIds = (dbRef.partes || []).filter((p) => p.livroId == livroId).map((p) => p.id);
    const itensIds = (dbRef.itensColetanea || [])
        .filter((i) => partesIds.includes(i.parteId))
        .map((i) => i.id);
    return { partesIds, itensIds };
}

// ─── Exclusão com "desfazer" ───────────────────────────────────
// Excluir um item some da lista na hora (e salva), mas a capa associada
// (se houver) só é apagada de verdade do IndexedDB depois de alguns
// segundos — é o único jeito de dar um "Desfazer" real sem correr o
// risco de restaurar o item com uma referência de capa apontando pro
// nada. Enquanto isso, o item removido fica guardado em memória
// (_pendingExclusao). Só existe um "desfazer" pendente por vez: uma
// nova exclusão confirma a anterior de vez (e fecha o toast dela) antes
// de seguir — senão o toast velho ficaria oferecendo um "Desfazer" que
// na prática desfaria a exclusão errada (a mais recente).
// _pendingExclusao.removidos é sempre um array — com 1 item numa
// exclusão simples (deleteItem) ou vários numa exclusão em massa
// (deleteItemsEmMassa), pra dar um único toast de "Desfazer" pro lote
// inteiro em vez de um por item.
let _pendingExclusao = null;

function _capasDoItem(item) {
    return item?.capa ? [item.capa] : [];
}

// Remove o item (e a cascata de Coletânea, se for o caso) dos arrays do
// db e fecha o buraco na numeração — mas NÃO apaga a capa do IndexedDB
// ainda, e NÃO salva (quem chama decide quando salvar — em exclusão em
// massa, várias chamadas daqui compartilham um único save() no final,
// em vez de uma gravação por item). Devolve tudo que _restaurar()
// precisa pra desfazer de verdade.
function _removerParaExclusao(col, id) {
    const index = db[col]?.findIndex((i) => i.id == id) ?? -1;
    if (index === -1) return null;

    const item = db[col][index];
    db[col].splice(index, 1);

    const capasParaDescartar = _capasDoItem(item);
    let partesRemovidas = [];
    let itensRemovidos = [];

    if (col === 'livros' && item?.tipo === 'Coletânea') {
        const { partesIds, itensIds } = calcularCascataColetanea(db, id);
        partesRemovidas = db.partes.filter((p) => partesIds.includes(p.id));
        itensRemovidos = (db.itensColetanea || []).filter((i) => itensIds.includes(i.id));
        partesRemovidas.forEach((p) => {
            if (p.capa) capasParaDescartar.push(p.capa);
        });

        db.partes = db.partes.filter((p) => !partesIds.includes(p.id));
        db.itensColetanea = (db.itensColetanea || []).filter((i) => !itensIds.includes(i.id));
    }

    // Fecha o buraco deixado na numeração do grupo de onde o item saiu
    // (mesma lógica de sempre — só guardamos os "irmãos" pra poder
    // reverter com abrirEspaco() se a exclusão for desfeita).
    const posicaoRemovida = item.sequencia ?? null;
    let irmaos = null;
    if (col === 'livros') {
        irmaos = db.livros;
    } else if (col === 'partes' && item.livroId) {
        irmaos = getIrmaosTopoLivro(db, item.livroId);
    } else if (
        ['secoes', 'elementos', 'poemas', 'prosas'].includes(col) &&
        item.paiTipo &&
        item.paiId
    ) {
        irmaos = getIrmaosPorEscopo(db, item.paiTipo, item.paiId);
    }
    if (irmaos) fecharEspaco(irmaos, posicaoRemovida);

    return { col, item, partesRemovidas, itensRemovidos, capasParaDescartar, posicaoRemovida, irmaos };
}

// Devolve o item (e cascata) pros arrays do db, reabrindo o espaço na
// numeração que fecharEspaco tinha fechado. Não salva sozinho — ver
// comentário em _removerParaExclusao.
function _restaurar(removido) {
    const { col, item, partesRemovidas, itensRemovidos, posicaoRemovida, irmaos } = removido;

    if (irmaos) abrirEspaco(irmaos, posicaoRemovida);

    db[col].push(item);
    if (partesRemovidas.length) db.partes.push(...partesRemovidas);
    if (itensRemovidos.length) {
        db.itensColetanea = [...(db.itensColetanea || []), ...itensRemovidos];
    }
}

// Confirma a exclusão pendente de vez: apaga a(s) capa(s) do IndexedDB.
// Depois disso não tem mais volta.
function _finalizarExclusaoPendente() {
    if (!_pendingExclusao) return;
    const { removidos, timeoutId, toast } = _pendingExclusao;
    clearTimeout(timeoutId);
    // Some com o toast de "Desfazer" dessa exclusão — se ficasse na tela,
    // clicar nele agora iria desfazer a exclusão SEGUINTE (a única que
    // ainda está pendente), não a que o toast prometia. Ver comentário
    // em _pendingExclusao acima.
    if (toast) fecharAviso(toast);
    removidos.forEach((removido) => removido.capasParaDescartar.forEach((id) => deletarCapa(id)));
    _pendingExclusao = null;
}

function _desfazerExclusaoPendente() {
    if (!_pendingExclusao) return;
    const { removidos, timeoutId } = _pendingExclusao;
    clearTimeout(timeoutId);
    _pendingExclusao = null;
    // Restaura na ordem inversa da remoção — cada abrirEspaco() espera
    // encontrar os irmãos no estado logo depois daquela remoção específica,
    // então desfazer precisa "rebobinar" na ordem contrária.
    for (let i = removidos.length - 1; i >= 0; i--) {
        _restaurar(removidos[i]);
    }
    save();
}

export function deleteItem(col, id) {
    const item = db[col]?.find((i) => i.id == id);
    const titulo = item?.titulo || item?.tipo || `#${id}`;
    let rotulo = ROTULOS_COL[col] || col;

    // Para coletâneas, informa quantas partes e itens serão removidos em cascata
    if (col === 'livros' && item?.tipo === 'Coletânea') {
        const { partesIds, itensIds } = calcularCascataColetanea(db, id);
        const totalPartes = partesIds.length;
        const totalItens = itensIds.length;
        if (totalPartes > 0 || totalItens > 0) {
            rotulo = `Coletânea · ${totalPartes} parte${totalPartes !== 1 ? 's' : ''} e ${totalItens} iten${totalItens !== 1 ? 's' : ''} serão removidos`;
        } else {
            rotulo = 'Coletânea';
        }
    }

    abrirModalExclusao(titulo, rotulo, () => {
        // Só um "desfazer" pendente por vez — uma nova exclusão confirma
        // a anterior de vez (apaga a capa dela) antes de continuar.
        _finalizarExclusaoPendente();

        const removido = _removerParaExclusao(col, id);
        if (!removido) return;
        save();

        const toast = mostrarAvisoComAcao(`Excluído: ${titulo}`, 'Desfazer', () =>
            _desfazerExclusaoPendente(),
        );
        const timeoutId = setTimeout(_finalizarExclusaoPendente, 6000);
        _pendingExclusao = { removidos: [removido], timeoutId, toast };
    });
}

// Exclusão em massa: mesma mecânica de deleteItem, mas pra vários ids de
// uma vez, com um ÚNICO save() e um único toast/"Desfazer" pro lote
// inteiro (bem diferente de chamar deleteItem em loop, que salvaria e
// mostraria um toast pra cada item). Quem chama já deve ter confirmado a
// ação com o usuário (ver excluirSelecaoPoemas/excluirSelecaoProsas em
// render-listas.js) — aqui só executa.
export function deleteItemsEmMassa(col, ids) {
    _finalizarExclusaoPendente();

    const removidos = [];
    ids.forEach((id) => {
        const removido = _removerParaExclusao(col, id);
        if (removido) removidos.push(removido);
    });
    if (!removidos.length) return;
    save();

    const n = removidos.length;
    const info = MASSA_COL_INFO[col] || {
        plural: `${(ROTULOS_COL[col] || col).toLowerCase()}s`,
        participio: 'excluídos',
    };
    const toast = mostrarAvisoComAcao(
        `${n} ${info.plural} ${info.participio}`,
        'Desfazer',
        () => _desfazerExclusaoPendente(),
    );
    const timeoutId = setTimeout(_finalizarExclusaoPendente, 6000);
    _pendingExclusao = { removidos, timeoutId, toast };
}
