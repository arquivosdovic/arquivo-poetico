// ============================================================
// render.js — Orquestrador da renderização: chama, em ordem, os
// renderers de cada aba sempre que o db muda (evento 'db:saved').
//
// Até pouco tempo atrás este arquivo tinha ~1350 linhas com TUDO
// (listas, árvore de estrutura, lightbox de capas) misturado. Foi
// dividido em três módulos por domínio, mais fáceis de achar coisa
// e de não pisar um no outro:
//   - render-listas.js    → Livros/Partes/Seções/Poemas/Prosas/Elementos
//   - render-estrutura.js → aba "Estrutura" (árvore, seleção, mover nível)
//   - render-lightbox.js  → carregamento de capas + lightbox navegável
// Este arquivo só importa e orquestra; a lógica de cada aba vive
// nos módulos acima.
// ============================================================

import {
    renderLivros,
    renderPartes,
    renderSecoes,
    renderPoemas,
    renderProsas,
    renderElementos,
} from './render-listas.js';
import { popularSeletorEstrutura, renderEstrutura } from './render-estrutura.js';

export function renderLists() {
    renderLivros();
    renderPartes();
    renderSecoes();
    renderPoemas();
    renderProsas();
    renderElementos();
    popularSeletorEstrutura();
    renderEstrutura();
}

// ─── Listener automático ─────────────────────────────────────

window.addEventListener('db:saved', renderLists);
