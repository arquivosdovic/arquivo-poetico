import './helpers/dom-real.js';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// main.js registra o listener de clique delegado em
// document.querySelector('main') já na importação — por isso o esqueleto
// mínimo de DOM (containers que os renderers preenchem via innerHTML)
// precisa existir ANTES do import. Structure baseada no index.html real
// (ver ids), só reduzida ao que os renderers usados aqui realmente tocam.
document.body.innerHTML = `
    <main>
        <div id="lista-livros"></div>

        <div id="barra-acoes-poemas" class="hidden">
            <span id="contador-selecao-poemas"></span>
        </div>
        <div id="painel-colunas-poemas"></div>
        <select id="filtro-livro-poemas"></select>
        <table>
            <thead><tr id="cabecalho-poemas"></tr></thead>
            <tbody id="lista-poemas"></tbody>
        </table>
        <div id="paginacao-poemas"></div>
    </main>
`;

const { db } = await import('../js/db.js');
const { renderLivros, renderPoemas, toggleSelecaoPoema } = await import('../js/render-listas.js');
await import('../js/main.js');

function limparDb() {
    db.livros.length = 0;
    db.poemas.length = 0;
    document.getElementById('modal-confirmar-exclusao')?.remove();
    document.getElementById('avisos-toast')?.remove();
}

describe('Livros — renderização + exclusão (DOM real via happy-dom)', () => {
    beforeEach(limparDb);

    it('renderiza um card com data-action/data-id certos no botão Excluir', () => {
        db.livros.push({ id: 42, titulo: 'Meu Livro', sequencia: 1 });
        renderLivros();

        const btn = document.querySelector('[data-action="excluir-item"]');
        assert.ok(btn, 'botão de excluir deveria existir no DOM');
        assert.equal(btn.dataset.tipo, 'livros');
        assert.equal(btn.dataset.id, '42');
    });

    it('mostra "Nenhum livro encontrado" quando não há livros', () => {
        renderLivros();
        assert.match(
            document.getElementById('lista-livros').textContent,
            /Nenhum livro encontrado/,
        );
    });

    it('clicar em "Excluir" abre o modal de confirmação; confirmar remove o item de verdade', () => {
        db.livros.push({ id: 7, titulo: 'Livro Alvo', sequencia: 1 });
        renderLivros();

        document.querySelector('[data-action="excluir-item"][data-id="7"]').click();

        const overlay = document.getElementById('modal-confirmar-exclusao');
        assert.ok(overlay, 'abrirModalExclusao deveria ter criado o overlay do modal');
        assert.equal(overlay.style.display, 'flex');
        assert.equal(document.getElementById('excl-titulo').textContent, 'Livro Alvo');

        // Integração completa: clique -> deleteItem -> abrirModalExclusao ->
        // onConfirmar -> remoção real do array db.livros.
        document.getElementById('excl-confirmar').click();
        assert.equal(db.livros.length, 0);
    });
});

describe('Poemas — exclusão em massa (DOM real via happy-dom)', () => {
    beforeEach(limparDb);

    it('selecionar 2 poemas e clicar em "Excluir selecionados" remove só os selecionados, com 1 confirmação só', () => {
        db.poemas.push(
            { id: 1, titulo: 'Poema A', sequencia: 1, paiTipo: 'livro', paiId: 999 },
            { id: 2, titulo: 'Poema B', sequencia: 2, paiTipo: 'livro', paiId: 999 },
            { id: 3, titulo: 'Poema C', sequencia: 3, paiTipo: 'livro', paiId: 999 },
        );
        renderPoemas();

        // Seleciona A e B via a mesma função que o checkbox chama (o
        // checkbox em si é só um <input> gerado por template string, sem
        // benefício extra em simular o clique nele especificamente).
        toggleSelecaoPoema(true, 1);
        toggleSelecaoPoema(true, 2);

        excluirSelecaoPoemasGlobal();

        // A ação em massa abre confirmação (mesmo componente de
        // abrirModalConfirmacao usado pelo excluir de item único).
        const overlay = document.getElementById('modal-confirmar-exclusao');
        assert.ok(overlay);
        assert.match(document.getElementById('excl-titulo').textContent, /Excluir 2 poemas/);

        document.getElementById('excl-confirmar').click();

        const idsRestantes = db.poemas.map((p) => p.id);
        assert.deepEqual(idsRestantes, [3], 'só o poema C (não selecionado) deveria sobrar');
    });
});

function excluirSelecaoPoemasGlobal() {
    // window.excluirSelecaoPoemas é exposto por main.js (ver window.X no
    // final do arquivo) — mesma função que o botão da barra chama via
    // onclick="excluirSelecaoPoemas()" no index.html.
    window.excluirSelecaoPoemas();
}
