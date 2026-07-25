// ============================================================
// db.js — Estado central e persistência
// Importado por: todos os outros módulos
// Não importa nenhum módulo interno
// ============================================================

import { getElementHierarchy, getPosicaoElemento, fecharEspaco,
         getIrmaosTopoLivro, getIrmaosPorEscopo,
         abrirModalExclusao } from './utils.js';
import { deletarCapa, exportarTodasCapasBase64, importarCapasBase64 } from './capas.js';
import { tirarSnapshotSeNecessario } from './autobackup.js';

const DB_KEY = 'arquivoPoetico_v3';
// Guarda quando o último "Baixar JSON" foi de fato clicado — usado pra
// mostrar na UI há quanto tempo não se tira um backup manual (item 5
// da revisão: antes não havia nenhum indicativo disso).
const LS_KEY_ULTIMO_BACKUP = 'arquivoPoetico_ultimoBackup';

export let db = JSON.parse(localStorage.getItem(DB_KEY)) || {
    livros: [],
    partes: [],
    secoes: [],
    poemas: [],
    prosas: [],
    elementos: [],
    coletaneas: [],      // legado, não usado pela aba Coletâneas atual — mantido só por compatibilidade na importação de backups antigos
    itensColetanea: []   // itens de Coletânea de fato (ver coletaneas.js); cada item referencia uma Parte via parteId
};

// Garante que dados importados de versões antigas tenham o campo coletaneas
if (!db.coletaneas) db.coletaneas = [];

// ─── Ordenações ──────────────────────────────────────────────

function sortLivros() {
    db.livros.sort((a, b) =>
        (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999) || a.id - b.id
    );
}

function sortPartes() {
    db.partes.sort((a, b) => {
        const orderA = db.livros.findIndex(l => l.id == a.livroId);
        const orderB = db.livros.findIndex(l => l.id == b.livroId);
        if (orderA !== orderB) return orderA - orderB;
        return (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999);
    });
}

function sortSecoes() {
    db.secoes.sort((a, b) => {
        const getLivroId = (s) => {
            if (s.paiTipo === 'livro') return s.paiId;
            const parte = db.partes.find(p => p.id == s.paiId);
            return parte ? parte.livroId : 0;
        };
        const livroA = getLivroId(a), livroB = getLivroId(b);
        if (livroA !== livroB)
            return db.livros.findIndex(l => l.id == livroA) - db.livros.findIndex(l => l.id == livroB);

        // Posição dentro do livro: Seção direta no Livro usa a própria sequência
        // (senão sempre ia pro fim, perdendo pra qualquer Parte numerada).
        const posA = a.paiTipo === 'livro'
            ? (parseInt(a.sequencia) || 9999)
            : (parseInt(db.partes.find(p => p.id == a.paiId)?.sequencia) || 9999);
        const posB = b.paiTipo === 'livro'
            ? (parseInt(b.sequencia) || 9999)
            : (parseInt(db.partes.find(p => p.id == b.paiId)?.sequencia) || 9999);
        if (posA !== posB) return posA - posB;

        return (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999);
    });
}

function sortPoemas() {
    db.poemas.sort((a, b) => {
        const getPath = (p) => {
            let livroIdx = 999, parteIdx = 999, secaoIdx = 999;
            const pad = (n) => String(n + 1).padStart(3, '0');

            if (p.paiTipo === 'secao') {
                const s = db.secoes.find(x => x.id == p.paiId);
                if (s) {
                    secaoIdx = db.secoes.findIndex(x => x.id == s.id);
                    if (s.paiTipo === 'parte') {
                        parteIdx = db.partes.findIndex(x => x.id == s.paiId);
                        const pt = db.partes.find(x => x.id == s.paiId);
                        livroIdx = db.livros.findIndex(x => x.id == pt?.livroId);
                    } else {
                        livroIdx = db.livros.findIndex(x => x.id == s.paiId);
                    }
                }
            } else if (p.paiTipo === 'parte') {
                parteIdx = db.partes.findIndex(x => x.id == p.paiId);
                const pt = db.partes.find(x => x.id == p.paiId);
                livroIdx = db.livros.findIndex(x => x.id == pt?.livroId);
                secaoIdx = -1;
            } else if (p.paiTipo === 'livro') {
                livroIdx = db.livros.findIndex(x => x.id == p.paiId);
                parteIdx = -1;
                secaoIdx = -1;
            }

            return `${pad(livroIdx)}_${pad(parteIdx)}_${pad(secaoIdx)}`;
        };

        const pathA = getPath(a), pathB = getPath(b);
        if (pathA !== pathB) return pathA.localeCompare(pathB);
        return (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999);
    });
}

function sortElementos() {
    db.elementos.sort((a, b) => {
        const [lA, ppA, psA] = getPosicaoElemento(a, db);
        const [lB, ppB, psB] = getPosicaoElemento(b, db);
        if (lA !== lB) return lA - lB;
        if (ppA !== ppB) return ppA - ppB;
        if (psA !== psB) return psA - psB;
        return (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999);
    });
}

// ─── API pública ──────────────────────────────────────────────

// Importar renderLists de render.js causaria dependência circular.
// save() aceiona um CustomEvent que render.js escuta.
export function save() {
    sortLivros();
    sortPartes();
    sortSecoes();
    sortPoemas();
    db.prosas.sort((a, b) => (parseInt(a.sequencia) || 9999) - (parseInt(b.sequencia) || 9999));
    sortElementos();

    try {
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (err) {
        // Quota excedida (QuotaExceededError) ou modo privado sem espaço
        const isQuota = err.name === 'QuotaExceededError'
            || err.name === 'NS_ERROR_DOM_QUOTA_REACHED'  // Firefox
            || (err.code && err.code === 22);

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
    db.livros      = novoDb.livros      || [];
    db.partes      = novoDb.partes      || [];
    db.secoes      = novoDb.secoes      || [];
    db.poemas      = novoDb.poemas      || [];
    db.prosas      = novoDb.prosas      || [];
    db.elementos   = novoDb.elementos   || [];
    db.coletaneas  = novoDb.coletaneas  || [];
    db.itensColetanea = novoDb.itensColetanea || [];

    // Se o backup foi gerado com "incluir capas" marcado, ele traz um
    // _capasBase64 com as imagens embutidas — restaura pro IndexedDB
    // antes de salvar, senão as capas ficam referenciando IDs vazios.
    if (novoDb._capasBase64) {
        await importarCapasBase64(novoDb._capasBase64);
    }

    save();
}

/**
 * @param {boolean} incluirCapas — se true, embute todas as capas de
 *   Livro/Parte/Seção como base64 no próprio JSON (deixa o arquivo maior,
 *   mas o backup fica autocontido — sem isso, um backup restaurado num
 *   navegador zerado perde todas as imagens, só sobra o texto).
 */
export async function exportarJSON(incluirCapas = false) {
    const payload = incluirCapas
        ? { ...db, _capasBase64: await exportarTodasCapasBase64() }
        : db;

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", "arquivo_poetico_backup.json");
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

// ─── Exclusão de item ─────────────────────────────────────────

const ROTULOS_COL = {
    livros:    'Livro',
    partes:    'Parte',
    secoes:    'Seção',
    poemas:    'Poema',
    prosas:    'Prosa',
    elementos: 'Elemento',
    itensColetanea: 'Item de Coletânea',
    coletaneas: 'Coletânea',
};

function _executarExclusao(col, id) {
    const item = db[col].find(i => i.id == id);
    db[col] = db[col].filter(i => i.id != id);

    // Remove a capa do IndexedDB se houver (livros, partes e seções têm capa)
    if (item?.capa) deletarCapa(item.capa);

    // Limpeza em cascata ao apagar uma Coletânea:
    // remove as partes exclusivas dela e os itens dessas partes.
    // Não toca em poemas/prosas originais — os itens só guardam refId (ponteiro),
    // e as partes de livros normais referenciadas via parte.refId também ficam intactas.
    if (col === 'livros' && item?.tipo === 'Coletânea') {
        const partesIds = db.partes
            .filter(p => p.livroId == id)
            .map(p => p.id);

        // Remove capas das partes da coletânea antes de apagá-las
        db.partes
            .filter(p => partesIds.includes(p.id))
            .forEach(p => { if (p.capa) deletarCapa(p.capa); });

        db.partes         = db.partes.filter(p => !partesIds.includes(p.id));
        db.itensColetanea = (db.itensColetanea || []).filter(i => !partesIds.includes(i.parteId));
    }

    // Fecha o buraco deixado na numeração do grupo de onde o item saiu
    if (item) {
        const posicaoRemovida = item.sequencia ?? null;
        if (col === 'livros') {
            fecharEspaco(db.livros, posicaoRemovida);
        } else if (col === 'partes' && item.livroId) {
            fecharEspaco(getIrmaosTopoLivro(db, item.livroId), posicaoRemovida);
        } else if (['secoes', 'elementos', 'poemas', 'prosas'].includes(col) && item.paiTipo && item.paiId) {
            fecharEspaco(getIrmaosPorEscopo(db, item.paiTipo, item.paiId), posicaoRemovida);
        }
    }

    save();
}

export function deleteItem(col, id) {
    const item   = db[col]?.find(i => i.id == id);
    const titulo = item?.titulo || item?.tipo || `#${id}`;
    let rotulo   = ROTULOS_COL[col] || col;

    // Para coletâneas, informa quantas partes e itens serão removidos em cascata
    if (col === 'livros' && item?.tipo === 'Coletânea') {
        const partesIds  = db.partes.filter(p => p.livroId == id).map(p => p.id);
        const totalPartes = partesIds.length;
        const totalItens  = (db.itensColetanea || []).filter(i => partesIds.includes(i.parteId)).length;
        if (totalPartes > 0 || totalItens > 0) {
            rotulo = `Coletânea · ${totalPartes} parte${totalPartes !== 1 ? 's' : ''} e ${totalItens} iten${totalItens !== 1 ? 's' : ''} serão removidos`;
        } else {
            rotulo = 'Coletânea';
        }
    }

    abrirModalExclusao(titulo, rotulo, () => _executarExclusao(col, id));
}
