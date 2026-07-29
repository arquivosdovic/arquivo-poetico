// ============================================================
// render-lightbox.js — Carregamento assíncrono de capas (IndexedDB)
// e o lightbox navegável (◀ ▶) usado por todas as listas com capa.
//
// Extraído de render.js (que tinha 1347 linhas fazendo renderização
// de listas, árvore de estrutura e lightbox tudo junto) — ver
// render-listas.js e render-estrutura.js pros outros pedaços.
//
// Único ponto de entrada usado por fora: preencherCapas(container),
// chamado pelos renderers de Livros/Partes/Seções em render-listas.js
// depois que o innerHTML com <img data-capa-id="..."> já está no DOM.
// ============================================================

import { lerCapa, revogarURL } from './capas.js';

// _lightboxUrls guarda todos os URLs das capas carregadas no container
// mais recente que chamou preencherCapas; _lightboxIdx é o índice atual.
// Isso permite navegar ◀ ▶ dentro do lightbox sem fechar e reabrir.

let _lightboxUrls = [];
let _lightboxIdx = 0;
let _lightboxTitulos = [];

// Carrega as capas do IndexedDB de forma assíncrona após o HTML já estar no DOM.
// Procura todos os <img data-capa-id="..."> dentro do container e preenche o src.
// As imagens começam com opacity-0 e aparecem com fade-in quando carregadas,
// evitando flicker de placeholder enquanto o blob é lido.
// Clique na imagem abre um lightbox navegável com ◀ ▶ e teclado ← →.
export async function preencherCapas(container) {
    const imgs = container.querySelectorAll('img[data-capa-id]');
    const entradas = await Promise.all(
        Array.from(imgs).map(async (img) => {
            const id = img.dataset.capaId;
            const url = await lerCapa(id);
            if (url) {
                if (img.src && img.src.startsWith('blob:')) revogarURL(img.src);
                img.src = url;
                img.style.cursor = 'zoom-in';
                img.title = 'Clique para ver a imagem completa';
                img.onload = () => img.classList.replace('opacity-0', 'opacity-100');
                img.onerror = () => {
                    img.style.display = 'none';
                };
                // Retorna url + título do card pai (para exibir no lightbox)
                const card = img.closest('[data-titulo]') || img.closest('div');
                const titulo = card?.querySelector('h4')?.textContent?.trim() || '';
                return { img, url, titulo };
            } else {
                img.style.display = 'none';
                return null;
            }
        }),
    );

    // Monta o array de capas visíveis desta seção, na ordem do DOM
    const visíveis = entradas.filter(Boolean);
    const urls = visíveis.map((e) => e.url);
    const titulos = visíveis.map((e) => e.titulo);

    // Liga cada imagem ao seu índice neste grupo
    visíveis.forEach(({ img }, idx) => {
        img.onclick = (e) => {
            e.stopPropagation();
            _lightboxUrls = urls;
            _lightboxTitulos = titulos;
            abrirLightbox(idx);
        };
    });
}

// Abre o lightbox navegável no índice `idx` do array _lightboxUrls.
// Fecha ao clicar no fundo/botão × ou Escape; ◀ ▶ e ← → navegam.
function abrirLightbox(idx) {
    _lightboxIdx = idx;

    // ── Criação do overlay (só uma vez) ───────────────────────
    let overlay = document.getElementById('capa-lightbox');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'capa-lightbox';
        overlay.style.cssText = `
            position:fixed; inset:0; z-index:9999;
            background:rgba(0,0,0,0.88);
            display:flex; flex-direction:column;
            align-items:center; justify-content:center;
            animation:fadeIn .15s ease-out;
        `;

        // Imagem central
        const img = document.createElement('img');
        img.id = 'capa-lightbox-img';
        img.alt = '';
        img.style.cssText = `
            max-width:82vw; max-height:82vh;
            object-fit:contain; border-radius:6px;
            box-shadow:0 8px 40px rgba(0,0,0,0.6);
            pointer-events:none; display:block;
        `;

        // Barra inferior: contador + título
        const barra = document.createElement('div');
        barra.id = 'capa-lightbox-barra';
        barra.style.cssText = `
            margin-top:14px; color:rgba(255,255,255,0.75);
            font-size:13px; font-family:sans-serif;
            text-align:center; max-width:80vw;
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        `;

        // Botão fechar (×)
        const btnFechar = document.createElement('button');
        btnFechar.textContent = '×';
        btnFechar.style.cssText = `
            position:absolute; top:16px; right:20px;
            background:none; border:none; color:#fff;
            font-size:32px; line-height:1; cursor:pointer;
            opacity:0.6; transition:opacity .15s;
        `;
        btnFechar.onmouseenter = () => (btnFechar.style.opacity = '1');
        btnFechar.onmouseleave = () => (btnFechar.style.opacity = '0.6');
        btnFechar.onclick = (e) => {
            e.stopPropagation();
            fecharLightbox();
        };

        // Botão anterior (◀)
        const btnPrev = document.createElement('button');
        btnPrev.id = 'capa-lightbox-prev';
        btnPrev.textContent = '❮';
        btnPrev.style.cssText = `
            position:absolute; left:16px; top:50%; transform:translateY(-50%);
            background:rgba(255,255,255,0.12); border:none; color:#fff;
            font-size:22px; width:44px; height:44px; border-radius:50%;
            cursor:pointer; opacity:0.7; transition:opacity .15s, background .15s;
            display:flex; align-items:center; justify-content:center;
        `;
        btnPrev.onmouseenter = () => {
            btnPrev.style.opacity = '1';
            btnPrev.style.background = 'rgba(255,255,255,0.22)';
        };
        btnPrev.onmouseleave = () => {
            btnPrev.style.opacity = '0.7';
            btnPrev.style.background = 'rgba(255,255,255,0.12)';
        };
        btnPrev.onclick = (e) => {
            e.stopPropagation();
            navegarLightbox(-1);
        };

        // Botão próximo (▶)
        const btnNext = document.createElement('button');
        btnNext.id = 'capa-lightbox-next';
        btnNext.textContent = '❯';
        btnNext.style.cssText = `
            position:absolute; right:16px; top:50%; transform:translateY(-50%);
            background:rgba(255,255,255,0.12); border:none; color:#fff;
            font-size:22px; width:44px; height:44px; border-radius:50%;
            cursor:pointer; opacity:0.7; transition:opacity .15s, background .15s;
            display:flex; align-items:center; justify-content:center;
        `;
        btnNext.onmouseenter = () => {
            btnNext.style.opacity = '1';
            btnNext.style.background = 'rgba(255,255,255,0.22)';
        };
        btnNext.onmouseleave = () => {
            btnNext.style.opacity = '0.7';
            btnNext.style.background = 'rgba(255,255,255,0.12)';
        };
        btnNext.onclick = (e) => {
            e.stopPropagation();
            navegarLightbox(+1);
        };

        overlay.appendChild(img);
        overlay.appendChild(barra);
        overlay.appendChild(btnFechar);
        overlay.appendChild(btnPrev);
        overlay.appendChild(btnNext);

        // Fechar ao clicar no fundo (não nos botões/imagem)
        overlay.onclick = (e) => {
            if (e.target === overlay) fecharLightbox();
        };
        document.body.appendChild(overlay);
        document.addEventListener('keydown', _lightboxTeclado);
    }

    _atualizarLightbox();
    overlay.style.display = 'flex';
}

function _atualizarLightbox() {
    const img = document.getElementById('capa-lightbox-img');
    const barra = document.getElementById('capa-lightbox-barra');
    const prev = document.getElementById('capa-lightbox-prev');
    const next = document.getElementById('capa-lightbox-next');
    if (!img) return;

    img.src = _lightboxUrls[_lightboxIdx] || '';

    const total = _lightboxUrls.length;
    const titulo = _lightboxTitulos[_lightboxIdx] || '';
    img.alt = titulo ? `Capa de ${titulo}` : 'Capa ampliada';
    if (barra) {
        barra.textContent =
            total > 1
                ? `${_lightboxIdx + 1} / ${total}${titulo ? ' · ' + titulo : ''}`
                : titulo || '';
    }

    // Esconde os botões se só há uma capa (sem sentido navegar)
    const mostrarNav = total > 1;
    if (prev) prev.style.display = mostrarNav ? 'flex' : 'none';
    if (next) next.style.display = mostrarNav ? 'flex' : 'none';
}

function navegarLightbox(delta) {
    const total = _lightboxUrls.length;
    if (total === 0) return;
    _lightboxIdx = (_lightboxIdx + delta + total) % total;
    _atualizarLightbox();
}

function fecharLightbox() {
    const overlay = document.getElementById('capa-lightbox');
    if (overlay) overlay.style.display = 'none';
}

function _lightboxTeclado(e) {
    const overlay = document.getElementById('capa-lightbox');
    if (!overlay || overlay.style.display === 'none') return;
    if (e.key === 'Escape') {
        fecharLightbox();
    }
    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navegarLightbox(-1);
    }
    if (e.key === 'ArrowRight') {
        e.preventDefault();
        navegarLightbox(+1);
    }
}
