// ============================================================
// editor.js — Toolbar de formatação, tags/sinalizações, UX
// Importado por: main.js (inicialização)
// ============================================================

import { db } from './db.js';
import { extrairSinalizacoesUnicas, extrairPessoasUnicas, escapeHtml } from './utils.js';

// ─── Estado local ─────────────────────────────────────────────

export let lastSelection = { start: 0, end: 0 };
let alignAtual = null;

// ─── Formatação inline ───────────────────────────────────────

export function wrapText(before, after) {
    const textarea = document.getElementById('p-texto');
    if (!textarea) return;

    textarea.focus();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const novo = before + selected + after;

    if (!document.execCommand('insertText', false, novo)) {
        textarea.value = textarea.value.substring(0, start) + novo + textarea.value.substring(end);
    }

    textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
}

export function applyStyle() {
    const colorInput =
        document.getElementById('toolHex')?.value || document.getElementById('toolColor')?.value;
    const fontInput = document.getElementById('toolFont')?.value.trim();
    const sizeInput = document.getElementById('toolSize')?.value.trim();

    const font = fontInput ? `'${fontInput}'` : 'inherit';
    const size = sizeInput ? `${sizeInput}pt` : 'inherit';
    let color = colorInput || 'inherit';
    if (color !== 'inherit' && !color.startsWith('#')) color = '#' + color;

    const alignStyle = alignAtual ? ` text-align: ${alignAtual};` : '';

    wrapText(
        `<div style="color: ${color}; font-family: ${font}; font-size: ${size};${alignStyle} display: inline;">`,
        `</div>`,
    );

    // reseta alinhamento após aplicar
    alignAtual = null;
    ['left', 'right'].forEach((a) => {
        document.getElementById(`toolAlign-${a}`)?.classList.remove('bg-blue-100');
    });
}

export function setAlign(valor) {
    alignAtual = alignAtual === valor ? null : valor;
    ['left', 'right'].forEach((a) => {
        document
            .getElementById(`toolAlign-${a}`)
            ?.classList.toggle('bg-blue-100', alignAtual === a);
    });
}

// ─── Fábrica de grupos de tags/pessoas ────────────────────────
// Poema/Tags, Poema/Pessoas, Prosa/Tags, Prosa/Pessoas são o mesmo
// comportamento (adicionar, remover, renderizar como chips, resetar,
// carregar a partir de uma string "a, b, c") variando só os IDs do
// DOM e a cor do badge. Em vez de 4 cópias, uma única implementação
// parametrizada; cada grupo guarda seu próprio array em closure —
// sem estado global compartilhado entre Poema e Prosa.
function criarGrupoDeTags({ inputId, containerId, hiddenInputId, corClasse, nomeFuncaoRemover }) {
    let itens = [];

    function adicionar(valor = null) {
        const input = document.getElementById(inputId);
        const item = (valor ?? input?.value ?? '').trim();
        if (item && !itens.includes(item)) {
            itens.push(item);
            renderizar();
        }
        if (input) input.value = '';
    }

    function remover(item) {
        itens = itens.filter((i) => i !== item);
        renderizar();
    }

    function renderizar() {
        const container = document.getElementById(containerId);
        const inputOculto = document.getElementById(hiddenInputId);
        if (!container) return;

        container.innerHTML = itens
            .map(
                (i) => `
            <span class="${corClasse} text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
                ${escapeHtml(i)}
                <button type="button" data-valor="${escapeHtml(i)}" onclick="${nomeFuncaoRemover}(this.dataset.valor)" class="hover:text-red-200 font-bold ml-1">×</button>
            </span>`,
            )
            .join('');

        if (inputOculto) inputOculto.value = itens.join(', ');
    }

    function reset() {
        itens = [];
        renderizar();
    }

    function carregar(valorStr) {
        itens = valorStr
            ? valorStr
                  .split(',')
                  .map((s) => s.trim())
                  .filter((s) => s)
            : [];
        renderizar();
    }

    return { adicionar, remover, renderizar, reset, carregar };
}

const grupoTagsPoema = criarGrupoDeTags({
    inputId: 'p-sinal-input',
    containerId: 'p-tags-container',
    hiddenInputId: 'p-sinal',
    corClasse: 'bg-blue-600',
    nomeFuncaoRemover: 'removerTag',
});
const grupoPessoasPoema = criarGrupoDeTags({
    inputId: 'p-pessoa-input',
    containerId: 'p-pessoas-container',
    hiddenInputId: 'p-pessoas',
    corClasse: 'bg-rose-500',
    nomeFuncaoRemover: 'removerPessoa',
});
const grupoTagsProsa = criarGrupoDeTags({
    inputId: 'pr-sinal-input',
    containerId: 'pr-tags-container',
    hiddenInputId: 'pr-sinal',
    corClasse: 'bg-blue-600',
    nomeFuncaoRemover: 'removerTagProsa',
});
const grupoPessoasProsa = criarGrupoDeTags({
    inputId: 'pr-pessoa-input',
    containerId: 'pr-pessoas-container',
    hiddenInputId: 'pr-pessoas',
    corClasse: 'bg-rose-500',
    nomeFuncaoRemover: 'removerPessoaProsa',
});

// ─── Tags (Sinalizações) ─────────────────────────────────────

export function atualizarDatalist() {
    const datalist = document.getElementById('sugestoes-sinais');
    if (datalist) {
        datalist.innerHTML = extrairSinalizacoesUnicas(db.poemas)
            .map((tag) => `<option value="${escapeHtml(tag)}">`)
            .join('');
    }
    atualizarDatalistPessoas();
}

export function adicionarTag(valor = null) {
    grupoTagsPoema.adicionar(valor);
}
export function removerTag(tag) {
    grupoTagsPoema.remover(tag);
}
export function renderizarTags() {
    grupoTagsPoema.renderizar();
}
export function resetTags() {
    grupoTagsPoema.reset();
}
export function carregarTags(sinalizacoesStr) {
    grupoTagsPoema.carregar(sinalizacoesStr);
}

// ─── Pessoas (Dedicado a) ──────────────────────────────────────
// Mesmo padrão das Sinalizações, mas em grupo separado: pessoas
// não são tema, são "a quem o texto se refere/é dedicado".

export function atualizarDatalistPessoas() {
    const datalist = document.getElementById('sugestoes-pessoas');
    if (!datalist) return;
    datalist.innerHTML = extrairPessoasUnicas(db.poemas)
        .map((nome) => `<option value="${escapeHtml(nome)}">`)
        .join('');
}

export function adicionarPessoa(valor = null) {
    grupoPessoasPoema.adicionar(valor);
}
export function removerPessoa(nome) {
    grupoPessoasPoema.remover(nome);
}
export function renderizarPessoas() {
    grupoPessoasPoema.renderizar();
}
export function resetPessoas() {
    grupoPessoasPoema.reset();
}
export function carregarPessoas(pessoasStr) {
    grupoPessoasPoema.carregar(pessoasStr);
}

// ─── Inicialização dos listeners ─────────────────────────────

// ─── Tags/Pessoas: Prosa (espelha o padrão do Poema) ─────────

export function atualizarDatalistProsa() {
    const sinaisUnicos = extrairSinalizacoesUnicas([...db.poemas, ...(db.prosas || [])]);
    const pessoasUnicas = extrairPessoasUnicas([...db.poemas, ...(db.prosas || [])]);

    // Datalists dentro do modal de Prosa (só existem depois que o modal
    // é carregado ao menos uma vez — ver modal-prosa.html / modais.js)
    const datalistSinais = document.getElementById('sugestoes-sinais-prosa');
    if (datalistSinais) {
        datalistSinais.innerHTML = sinaisUnicos
            .map((tag) => `<option value="${escapeHtml(tag)}">`)
            .join('');
    }
    const datalistPessoas = document.getElementById('sugestoes-pessoas-prosa');
    if (datalistPessoas) {
        datalistPessoas.innerHTML = pessoasUnicas
            .map((nome) => `<option value="${escapeHtml(nome)}">`)
            .join('');
    }

    // Datalists sempre presentes no index.html, usados pela barra de
    // edição em massa da aba Prosas (independem do modal ter sido aberto)
    const datalistSinaisBulk = document.getElementById('sugestoes-sinais-bulk-prosa');
    if (datalistSinaisBulk) {
        datalistSinaisBulk.innerHTML = sinaisUnicos
            .map((tag) => `<option value="${escapeHtml(tag)}">`)
            .join('');
    }
    const datalistPessoasBulk = document.getElementById('sugestoes-pessoas-bulk-prosa');
    if (datalistPessoasBulk) {
        datalistPessoasBulk.innerHTML = pessoasUnicas
            .map((nome) => `<option value="${escapeHtml(nome)}">`)
            .join('');
    }
}

export function adicionarTagProsa(valor = null) {
    grupoTagsProsa.adicionar(valor);
}
export function removerTagProsa(tag) {
    grupoTagsProsa.remover(tag);
}
export function renderizarTagsProsa() {
    grupoTagsProsa.renderizar();
}
export function resetTagsProsa() {
    grupoTagsProsa.reset();
}
export function carregarTagsProsa(sinalizacoesStr) {
    grupoTagsProsa.carregar(sinalizacoesStr);
}

export function adicionarPessoaProsa(valor = null) {
    grupoPessoasProsa.adicionar(valor);
}
export function removerPessoaProsa(nome) {
    grupoPessoasProsa.remover(nome);
}
export function renderizarPessoasProsa() {
    grupoPessoasProsa.renderizar();
}
export function resetPessoasProsa() {
    grupoPessoasProsa.reset();
}
export function carregarPessoasProsa(pessoasStr) {
    grupoPessoasProsa.carregar(pessoasStr);
}

export function initEditor() {
    const textarea = document.getElementById('p-texto');
    const toolbar = document.querySelector('.bg-slate-50.border-slate-200');

    // Sincroniza toolColor ↔ toolHex
    const toolColor = document.getElementById('toolColor');
    const toolHex = document.getElementById('toolHex');

    if (toolColor && toolHex) {
        toolColor.addEventListener('input', (e) => {
            toolHex.value = e.target.value.toUpperCase();
        });
        toolHex.addEventListener('change', (e) => {
            let hex = e.target.value;
            if (!hex.startsWith('#')) hex = '#' + hex;
            if (/^#[0-9A-F]{6}$/i.test(hex)) toolColor.value = hex;
        });
    }

    // toolSize → applyStyle ao pressionar Enter
    const toolSize = document.getElementById('toolSize');
    if (toolSize) {
        toolSize.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyStyle();
            }
        });
    }

    if (!textarea) return;

    // Persiste a seleção enquanto o usuário interage com a toolbar
    const updateSelection = () => {
        lastSelection.start = textarea.selectionStart;
        lastSelection.end = textarea.selectionEnd;
    };

    textarea.addEventListener('select', updateSelection);
    textarea.addEventListener('mouseup', updateSelection);
    textarea.addEventListener('keyup', updateSelection);

    if (toolbar) {
        const restore = () => {
            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(lastSelection.start, lastSelection.end);
            }, 0);
        };

        toolbar.addEventListener('pointerdown', (e) => {
            const tag = e.target.tagName;
            const type = e.target.type;
            const isEditableInput = tag === 'INPUT' && (type === 'text' || type === 'number');
            if (isEditableInput) return;
            e.preventDefault();
            restore();
        });

        [toolHex, document.getElementById('toolFont'), toolSize].forEach((input) => {
            if (!input) return;
            input.addEventListener('blur', () => restore());
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    input.blur();
                    restore();
                }
            });
        });
    }

    // Previne perda de seleção ao clicar nos inputs de ferramenta
    ['toolColor', 'toolHex', 'toolFont', 'toolSize'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('mousedown', () => {
                const s = textarea.selectionStart;
                const e_sel = textarea.selectionEnd;
                setTimeout(() => textarea.setSelectionRange(s, e_sel), 10);
            });
        }
    });

    // Enter no input de tags
    const inputSinal = document.getElementById('p-sinal-input');
    if (inputSinal) {
        inputSinal.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                adicionarTag();
            }
        });
    }

    // Enter no input de pessoas
    const inputPessoa = document.getElementById('p-pessoa-input');
    if (inputPessoa) {
        inputPessoa.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                adicionarPessoa();
            }
        });
    }

    // Enter nos inputs de prosa (tags e pessoas)
    const inputSinalProsa = document.getElementById('pr-sinal-input');
    if (inputSinalProsa) {
        inputSinalProsa.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                adicionarTagProsa();
            }
        });
    }
    const inputPessoaProsa = document.getElementById('pr-pessoa-input');
    if (inputPessoaProsa) {
        inputPessoaProsa.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                adicionarPessoaProsa();
            }
        });
    }
}
