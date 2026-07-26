// ============================================================
// modais.js — Carregamento lazy de modais via fetch, com cache
// ============================================================

import { abrirModalConfirmacao } from './utils.js';

const PASTA_MODAIS = 'modais/';

// id do modal → { url, init, carregado, inicializado, promessa, rastreador }
const registro = {};

// rastreador (opcional): { estaSujo, marcarLimpo } — ver
// criarRastreadorDeAlteracoes em utils.js. Quando presente, fechar o
// modal com alterações não salvas pede confirmação antes (ver
// toggleModal abaixo). Modais sem formulário de texto longo (livro,
// parte, seção, elemento) podem ficar sem isso por enquanto.
export function registrarModal(id, arquivo, init, rastreador = null) {
    registro[id] = { url: PASTA_MODAIS + arquivo, init, carregado: false, inicializado: false, promessa: null, rastreador };
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

// id do modal → elemento que tinha o foco antes de abrir (pra devolver
// o foco a ele quando o modal fechar — importante pra quem navega por
// teclado não "perder o lugar" na página de trás).
const ultimoFocoPorModal = {};

const SELETOR_FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocaveis(container) {
    return Array.from(container.querySelectorAll(SELETOR_FOCAVEIS))
        .filter(el => el.offsetParent !== null); // ignora elementos ocultos (ex.: dentro de outro .hidden)
}

function abrirEFocar(id, el) {
    ultimoFocoPorModal[id] = document.activeElement;
    el.classList.remove('hidden');
    const foco = getFocaveis(el)[0] || el;
    foco.focus();
}

function fecharEDevolverFoco(id, el) {
    el.classList.add('hidden');
    const anterior = ultimoFocoPorModal[id];
    delete ultimoFocoPorModal[id];
    // só devolve se o elemento ainda existe na página (pode ter sumido
    // de uma re-renderização de lista enquanto o modal estava aberto)
    if (anterior && document.body.contains(anterior)) anterior.focus();
}

export async function toggleModal(id) {
    const entrada = registro[id];
    const el      = document.getElementById(id);
    const estaAberto = el && !el.classList.contains('hidden');

    // Fechando um modal com alterações não salvas: confirma antes,
    // em vez de descartar o texto direto (clique no X, Esc, ou o
    // form.onsubmit chamando isso depois de já ter salvo — nesse
    // último caso o handler já chamou marcarLimpo() antes, então
    // estaSujo() volta false e cai direto no fechamento normal).
    if (estaAberto && entrada?.rastreador?.estaSujo()) {
        abrirModalConfirmacao({
            titulo: 'Alterações não salvas',
            rotulo: 'Atenção',
            mensagem: 'Você tem alterações não salvas neste formulário. Deseja descartá-las?',
            textoConfirmar: 'Descartar',
            corConfirmar: '#dc2626',
            onConfirmar: () => {
                entrada.rastreador.marcarLimpo();
                fecharEDevolverFoco(id, el);
            },
        });
        return;
    }

    if (estaAberto) {
        fecharEDevolverFoco(id, el);
        return;
    }

    await garantirModal(id);
    const elCarregado = document.getElementById(id);
    if (elCarregado) abrirEFocar(id, elCarregado);
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

    // Focus trap: Tab não deixa o foco escapar do modal do topo pra
    // trás dele na página (que continua tecnicamente "visível" atrás
    // do backdrop, então sem isso o Tab vaza pros elementos de lá).
    if (e.key === 'Tab') {
        const focaveis = getFocaveis(topo);
        if (focaveis.length === 0) return;
        const primeiro = focaveis[0];
        const ultimo   = focaveis[focaveis.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) {
            e.preventDefault();
            ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
            e.preventDefault();
            primeiro.focus();
        }
    }
});
