// ============================================================
// capas.js — Armazenamento de capas via IndexedDB
//
// Por que IndexedDB e não localStorage:
//   localStorage tem limite de ~5–10 MB e armazena tudo em texto
//   (base64 infla binários em ~33%). IndexedDB aceita Blob/File
//   diretamente, sem limite prático para uso local, e não pesa
//   no JSON de backup (db.livros/partes/secoes guardam só o ID).
//
// Modelo:
//   db.livros[n].capa  → string ID  ex: "capa_1748123456789"  ou null
//   db.partes[n].capa  → idem
//   db.secoes[n].capa  → idem
//   IndexedDB store "capas": { id (string, keyPath), blob (Blob) }
//
// API pública:
//   salvarCapa(file)  → Promise<string|null>   id gerado, ou null se sem arquivo
//   lerCapa(id)       → Promise<string|null>   object URL, ou null se não existir
//   deletarCapa(id)   → Promise<void>
//   revogarURL(url)   → void                   libera object URL da memória
// ============================================================

const DB_NAME    = 'arquivoPoetico_capas';
const DB_VERSION = 1;
const STORE      = 'capas';

// Limites aplicados antes de salvar
const MAX_LADO_PX  = 1200;   // lado maior redimensionado para no máximo isso
const QUALIDADE    = 0.85;   // compressão JPEG
const MAX_BYTES_IN = 2 * 1024 * 1024;  // 2 MB — rejeita arquivo bruto acima disso

// ─── Abertura do banco ────────────────────────────────────────

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

// ─── Redimensionamento e compressão via Canvas ────────────────

function processarImagem(file) {
    return new Promise((resolve, reject) => {
        if (file.size > MAX_BYTES_IN) {
            reject(new Error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite: 2 MB.`));
            return;
        }

        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url);

            let { width, height } = img;

            // Redimensiona apenas se ultrapassar o limite
            if (width > MAX_LADO_PX || height > MAX_LADO_PX) {
                if (width >= height) {
                    height = Math.round(height * MAX_LADO_PX / width);
                    width  = MAX_LADO_PX;
                } else {
                    width  = Math.round(width * MAX_LADO_PX / height);
                    height = MAX_LADO_PX;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width  = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (!blob) { reject(new Error('Falha ao processar imagem.')); return; }
                    resolve(blob);
                },
                'image/jpeg',
                QUALIDADE
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Arquivo inválido ou formato não suportado.'));
        };

        img.src = url;
    });
}

// ─── API pública ──────────────────────────────────────────────

/**
 * Processa e salva um arquivo de imagem no IndexedDB.
 * Redimensiona para no máximo 1200px e comprime em JPEG 0.85.
 * @param {File|null} file  — arquivo do <input type="file">
 * @param {string|null} idExistente  — se estiver editando, o ID atual (para substituir)
 * @returns {Promise<string|null>}  — novo ID gerado, ou null se file for falsy
 */
export async function salvarCapa(file, idExistente = null) {
    if (!file) return null;

    let blob;
    try {
        blob = await processarImagem(file);
    } catch (err) {
        alert(`Erro ao processar capa: ${err.message}`);
        return null;
    }

    // Remove a capa antiga se estiver substituindo
    if (idExistente) await deletarCapa(idExistente);

    const id = `capa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const idb = await abrirDB();

    return new Promise((resolve, reject) => {
        const tx  = idb.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).put({ id, blob });
        req.onsuccess = () => resolve(id);
        req.onerror   = (e) => reject(e.target.error);
    });
}

/**
 * Retorna um object URL para exibir a capa numa <img>.
 * Lembre de chamar revogarURL() quando a imagem sair do DOM.
 * @param {string|null} id
 * @returns {Promise<string|null>}
 */
export async function lerCapa(id) {
    if (!id) return null;
    const idb = await abrirDB();

    return new Promise((resolve) => {
        const tx  = idb.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = (e) => {
            const registro = e.target.result;
            resolve(registro ? URL.createObjectURL(registro.blob) : null);
        };
        req.onerror = () => resolve(null);
    });
}

/**
 * Remove uma capa do IndexedDB.
 * @param {string|null} id
 */
export async function deletarCapa(id) {
    if (!id) return;
    const idb = await abrirDB();
    return new Promise((resolve) => {
        const tx = idb.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = resolve;
        tx.onerror    = resolve; // silencia — se não existia, tudo bem
    });
}

/**
 * Libera um object URL criado por lerCapa(), evitando vazamento de memória.
 * Chame quando o elemento <img> for removido do DOM.
 * @param {string|null} url
 */
export function revogarURL(url) {
    if (url) URL.revokeObjectURL(url);
}
