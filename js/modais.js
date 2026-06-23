// ============================================================
// modais.js — Carregamento lazy de modais via fetch, com cache
// ============================================================

const PASTA_MODAIS = 'modais/';

// id do modal → { url, init, carregado, inicializado, promessa }
const registro = {};

export function registrarModal(id, arquivo, init) {
    registro[id] = { url: PASTA_MODAIS + arquivo, init, carregado: false, inicializado: false, promessa: null };
}

async function carregarHTML(id) {
    const entrada = registro[id];
    if (!entrada) {
        console.error(`Modal "${id}" não foi registrado (veja registrarModal em main.js).`);
        return null;
    }

    if (entrada.carregado) return entrada;

    if (entrada.promessa) return entrada.promessa;

    entrada.promessa = (async () => {
        const resp = await fetch(entrada.url, { cache: 'no-cache' });
        if (!resp.ok) {
            console.error(`Falha ao carregar ${entrada.url}: HTTP ${resp.status}`);
            entrada.promessa = null;
            return null;
        }

        // Remove scripts injetados por dev servers (Five Server, Live Server)
        const html = (await resp.text())
            .replace(/<script[^>]*data-id="five-server"[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<!--\s*Code injected by[\s\S]*?-->/gi, '');

        const container = document.getElementById('modais-container');
        if (!container) {
            console.error('Elemento #modais-container não encontrado no index.html.');
            return null;
        }
        container.insertAdjacentHTML('beforeend', html);

        // Garante que o modal começa fechado via classe CSS (definida em style.css).
        // Não usamos style.display porque o Five Server reseta inline styles via live reload.
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('hidden');
            el.removeAttribute('style');
        }

        entrada.carregado = true;
        return entrada;
    })();

    return entrada.promessa;
}

export async function garantirModal(id) {
    const entrada = await carregarHTML(id);
    if (entrada && entrada.carregado && !entrada.inicializado) {
        entrada.init?.();
        entrada.inicializado = true;
    }
}

export async function toggleModal(id) {
    await garantirModal(id);
    document.getElementById(id)?.classList.toggle('hidden');
}

// ─── Atalhos de teclado globais ──────────────────────────────

document.addEventListener('keydown', (e) => {
    const abertos = Array.from(document.querySelectorAll('.fixed[id^="modal-"]:not(.hidden)'));
    if (abertos.length === 0) return;
    const topo = abertos[abertos.length - 1];

    if (e.key === 'Escape') {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        toggleModal(topo.id);
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        const form = topo.querySelector('form');
        if (form) form.requestSubmit();
    }
});
