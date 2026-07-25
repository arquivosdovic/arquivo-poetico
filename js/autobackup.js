// ============================================================
// autobackup.js — Rede de segurança automática, além do backup
// manual ("Baixar JSON").
//
// Por quê: antes, o único jeito de ter uma cópia seria clicar em
// "Baixar JSON" manualmente (item 5 da revisão) — e além de fácil
// de esquecer, um backup manual só te protege contra o navegador
// zerar os dados, não contra um erro de edição/exclusão que só é
// percebido dias depois (quando já não dá pra desfazer).
//
// Este módulo tira um retrato do acervo inteiro (o mesmo objeto
// `db` que vai no "Baixar JSON") a cada vez que algo é salvo, mas
// no máximo uma vez a cada INTERVALO_MIN_MS — pra não gravar a
// cada tecla digitada. Guarda os últimos MAX_SNAPSHOTS no
// IndexedDB do navegador (não substitui o backup manual, que é a
// única cópia que sai do navegador de fato).
//
// Modelo:
//   IndexedDB "arquivoPoetico_snapshots", store "snapshots":
//   { id (timestamp ISO, keyPath), dataISO, dbJson (string) }
// ============================================================

const DB_NAME    = 'arquivoPoetico_snapshots';
const DB_VERSION = 1;
const STORE      = 'snapshots';

const MAX_SNAPSHOTS    = 10;
const INTERVALO_MIN_MS = 6 * 60 * 60 * 1000; // não tira 2 snapshots em menos de 6h

let _db = null;

function abrirDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(STORE, { keyPath: 'id' });
        };
        req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
        req.onerror   = (e) => reject(e.target.error);
    });
}

async function listarTudo() {
    const idb = await abrirDB();
    return new Promise((resolve, reject) => {
        const tx  = idb.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = (e) => resolve(e.target.result || []);
        req.onerror   = (e) => reject(e.target.error);
    });
}

async function apagar(id) {
    const idb = await abrirDB();
    return new Promise((resolve) => {
        const tx = idb.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = resolve;
        tx.onerror    = resolve;
    });
}

// Tira um snapshot se o último tiver mais de INTERVALO_MIN_MS,
// e descarta os mais antigos além de MAX_SNAPSHOTS. Roda em segundo
// plano — nunca bloqueia nem interrompe o save() principal.
export async function tirarSnapshotSeNecessario(db) {
    try {
        const existentes = (await listarTudo()).sort((a, b) => a.id.localeCompare(b.id));
        const ultimo = existentes[existentes.length - 1];

        if (ultimo && (Date.now() - new Date(ultimo.dataISO).getTime()) < INTERVALO_MIN_MS) {
            return; // ainda dentro do intervalo mínimo, não faz nada
        }

        const agora = new Date();
        const registro = {
            id: agora.toISOString(),
            dataISO: agora.toISOString(),
            dbJson: JSON.stringify(db)
        };

        const idb = await abrirDB();
        await new Promise((resolve, reject) => {
            const tx  = idb.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).put(registro);
            req.onsuccess = resolve;
            req.onerror   = (e) => reject(e.target.error);
        });

        // Poda os mais antigos além do limite
        const todos = existentes.concat([registro]).sort((a, b) => a.id.localeCompare(b.id));
        const excedente = todos.length - MAX_SNAPSHOTS;
        if (excedente > 0) {
            for (const antigo of todos.slice(0, excedente)) {
                await apagar(antigo.id);
            }
        }

        window.dispatchEvent(new CustomEvent('snapshot:criado'));
    } catch (err) {
        // Snapshot automático é best-effort — se o IndexedDB estiver
        // indisponível (modo privado etc.), não deve travar o app nem
        // incomodar com um alert. Só loga.
        console.warn('[autobackup.js] Não foi possível gravar o snapshot automático:', err);
    }
}

// Usado pela UI (main.js) pra listar os snapshots disponíveis,
// do mais recente pro mais antigo.
export async function listarSnapshots() {
    const todos = await listarTudo();
    return todos.sort((a, b) => b.id.localeCompare(a.id));
}

// Baixa um snapshot específico como .json, no mesmo formato do
// "Baixar JSON" manual — dá pra importar de volta pelo botão
// "Importar JSON" normalmente.
export function baixarSnapshot(registro) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(registro.dbJson);
    const a = document.createElement('a');
    const timestamp = registro.dataISO.replace(/[:.]/g, '-');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `arquivo_poetico_snapshot_${timestamp}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
}
