// ============================================================
// editor.js — Toolbar de formatação, tags/sinalizações, UX
// Importado por: main.js (inicialização)
// ============================================================

import { db } from './db.js';
import { extrairSinalizacoesUnicas, extrairPessoasUnicas } from './utils.js';

// ─── Estado local ─────────────────────────────────────────────

export let lastSelection = { start: 0, end: 0 };
export let tagsAtuais = [];
export let pessoasAtuais = [];
let alignAtual = null;

// ─── Tags/Pessoas para Prosa ──────────────────────────────────

let tagsProsa = [];
let pessoasProsa = [];

// ─── Formatação inline ───────────────────────────────────────

export function wrapText(before, after) {
    const textarea = document.getElementById('p-texto');
    if (!textarea) return;

    textarea.focus();
    const start = textarea.selectionStart;
    const end   = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const novo = before + selected + after;

    if (!document.execCommand('insertText', false, novo)) {
        textarea.value = textarea.value.substring(0, start) + novo + textarea.value.substring(end);
    }

    textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
}

export function applyStyle() {
    const colorInput = document.getElementById('toolHex')?.value || document.getElementById('toolColor')?.value;
    const fontInput  = document.getElementById('toolFont')?.value.trim();
    const sizeInput  = document.getElementById('toolSize')?.value.trim();

    const font  = fontInput  ? `'${fontInput}'`   : 'inherit';
    const size  = sizeInput  ? `${sizeInput}pt`   : 'inherit';
    let   color = colorInput || 'inherit';
    if (color !== 'inherit' && !color.startsWith('#')) color = '#' + color;

    const alignStyle = alignAtual ? ` text-align: ${alignAtual};` : '';

    wrapText(`<div style="color: ${color}; font-family: ${font}; font-size: ${size};${alignStyle} display: inline;">`, `</div>`);

    // reseta alinhamento após aplicar
    alignAtual = null;
    ['left', 'right'].forEach(a => {
        document.getElementById(`toolAlign-${a}`)?.classList.remove('bg-blue-100');
    });
}

export function setAlign(valor) {
    alignAtual = alignAtual === valor ? null : valor;
    ['left', 'right'].forEach(a => {
        document.getElementById(`toolAlign-${a}`)
            ?.classList.toggle('bg-blue-100', alignAtual === a);
    });
}

// ─── Tags (Sinalizações) ─────────────────────────────────────

export function atualizarDatalist() {
    const datalist = document.getElementById('sugestoes-sinais');
    if (datalist) {
        datalist.innerHTML = extrairSinalizacoesUnicas(db.poemas)
            .map(tag => `<option value="${tag}">`)
            .join('');
    }
    atualizarDatalistPessoas();
}

export function adicionarTag(valor = null) {
    const input = document.getElementById('p-sinal-input');
    const tag   = (valor || input?.value || '').trim();
    if (tag && !tagsAtuais.includes(tag)) {
        tagsAtuais.push(tag);
        renderizarTags();
    }
    if (input) input.value = '';
}

export function removerTag(tag) {
    tagsAtuais = tagsAtuais.filter(t => t !== tag);
    renderizarTags();
}

export function renderizarTags() {
    const container   = document.getElementById('p-tags-container');
    const inputOculto = document.getElementById('p-sinal');
    if (!container) return;

    container.innerHTML = tagsAtuais.map(t => `
        <span class="bg-blue-600 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
            ${t}
            <button type="button" onclick="removerTag('${t}')" class="hover:text-red-200 font-bold ml-1">×</button>
        </span>`).join('');

    if (inputOculto) inputOculto.value = tagsAtuais.join(', ');
}

export function resetTags() {
    tagsAtuais = [];
    renderizarTags();
}

export function carregarTags(sinalizacoesStr) {
    tagsAtuais = sinalizacoesStr
        ? sinalizacoesStr.split(',').map(s => s.trim()).filter(s => s)
        : [];
    renderizarTags();
}

// ─── Pessoas (Dedicado a) ──────────────────────────────────────
// Mesmo padrão das Sinalizações, mas em grupo separado: pessoas
// não são tema, são "a quem o texto se refere/é dedicado".

export function atualizarDatalistPessoas() {
    const datalist = document.getElementById('sugestoes-pessoas');
    if (!datalist) return;
    datalist.innerHTML = extrairPessoasUnicas(db.poemas)
        .map(nome => `<option value="${nome}">`)
        .join('');
}

export function adicionarPessoa(valor = null) {
    const input = document.getElementById('p-pessoa-input');
    const nome  = (valor || input?.value || '').trim();
    if (nome && !pessoasAtuais.includes(nome)) {
        pessoasAtuais.push(nome);
        renderizarPessoas();
    }
    if (input) input.value = '';
}

export function removerPessoa(nome) {
    pessoasAtuais = pessoasAtuais.filter(p => p !== nome);
    renderizarPessoas();
}

export function renderizarPessoas() {
    const container   = document.getElementById('p-pessoas-container');
    const inputOculto = document.getElementById('p-pessoas');
    if (!container) return;

    container.innerHTML = pessoasAtuais.map(nome => `
        <span class="bg-rose-500 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
            ${nome}
            <button type="button" onclick="removerPessoa('${nome}')" class="hover:text-red-200 font-bold ml-1">×</button>
        </span>`).join('');

    if (inputOculto) inputOculto.value = pessoasAtuais.join(', ');
}

export function resetPessoas() {
    pessoasAtuais = [];
    renderizarPessoas();
}

export function carregarPessoas(pessoasStr) {
    pessoasAtuais = pessoasStr
        ? pessoasStr.split(',').map(s => s.trim()).filter(s => s)
        : [];
    renderizarPessoas();
}

// ─── Inicialização dos listeners ─────────────────────────────


// ─── Tags/Pessoas: Prosa (espelha o padrão do Poema) ─────────

export function atualizarDatalistProsa() {
    const datalistSinais = document.getElementById('sugestoes-sinais-prosa');
    if (datalistSinais) {
        datalistSinais.innerHTML = extrairSinalizacoesUnicas([...db.poemas, ...(db.prosas||[])])
            .map(tag => `<option value="${tag}">`)
            .join('');
    }
    const datalistPessoas = document.getElementById('sugestoes-pessoas-prosa');
    if (datalistPessoas) {
        datalistPessoas.innerHTML = extrairPessoasUnicas([...db.poemas, ...(db.prosas||[])])
            .map(nome => `<option value="${nome}">`)
            .join('');
    }
}

export function adicionarTagProsa(valor = null) {
    const input = document.getElementById('pr-sinal-input');
    const tag   = (valor || input?.value || '').trim();
    if (tag && !tagsProsa.includes(tag)) {
        tagsProsa.push(tag);
        renderizarTagsProsa();
    }
    if (input) input.value = '';
}

export function removerTagProsa(tag) {
    tagsProsa = tagsProsa.filter(t => t !== tag);
    renderizarTagsProsa();
}

export function renderizarTagsProsa() {
    const container   = document.getElementById('pr-tags-container');
    const inputOculto = document.getElementById('pr-sinal');
    if (!container) return;
    container.innerHTML = tagsProsa.map(t => `
        <span class="bg-blue-600 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
            ${t}
            <button type="button" onclick="removerTagProsa('${t}')" class="hover:text-red-200 font-bold ml-1">×</button>
        </span>`).join('');
    if (inputOculto) inputOculto.value = tagsProsa.join(', ');
}

export function resetTagsProsa() {
    tagsProsa = [];
    renderizarTagsProsa();
}

export function carregarTagsProsa(sinalizacoesStr) {
    tagsProsa = sinalizacoesStr
        ? sinalizacoesStr.split(',').map(s => s.trim()).filter(s => s)
        : [];
    renderizarTagsProsa();
}

export function adicionarPessoaProsa(valor = null) {
    const input = document.getElementById('pr-pessoa-input');
    const nome  = (valor || input?.value || '').trim();
    if (nome && !pessoasProsa.includes(nome)) {
        pessoasProsa.push(nome);
        renderizarPessoasProsa();
    }
    if (input) input.value = '';
}

export function removerPessoaProsa(nome) {
    pessoasProsa = pessoasProsa.filter(p => p !== nome);
    renderizarPessoasProsa();
}

export function renderizarPessoasProsa() {
    const container   = document.getElementById('pr-pessoas-container');
    const inputOculto = document.getElementById('pr-pessoas');
    if (!container) return;
    container.innerHTML = pessoasProsa.map(nome => `
        <span class="bg-rose-500 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
            ${nome}
            <button type="button" onclick="removerPessoaProsa('${nome}')" class="hover:text-red-200 font-bold ml-1">×</button>
        </span>`).join('');
    if (inputOculto) inputOculto.value = pessoasProsa.join(', ');
}

export function resetPessoasProsa() {
    pessoasProsa = [];
    renderizarPessoasProsa();
}

export function carregarPessoasProsa(pessoasStr) {
    pessoasProsa = pessoasStr
        ? pessoasStr.split(',').map(s => s.trim()).filter(s => s)
        : [];
    renderizarPessoasProsa();
}

export function initEditor() {
    const textarea = document.getElementById('p-texto');
    const toolbar  = document.querySelector('.bg-slate-50.border-slate-200');

    // Sincroniza toolColor ↔ toolHex
    const toolColor = document.getElementById('toolColor');
    const toolHex   = document.getElementById('toolHex');

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
            if (e.key === 'Enter') { e.preventDefault(); applyStyle(); }
        });
    }

    if (!textarea) return;

    // Persiste a seleção enquanto o usuário interage com a toolbar
    const updateSelection = () => {
        lastSelection.start = textarea.selectionStart;
        lastSelection.end   = textarea.selectionEnd;
    };

    textarea.addEventListener('select',  updateSelection);
    textarea.addEventListener('mouseup', updateSelection);
    textarea.addEventListener('keyup',   updateSelection);

    if (toolbar) {
        const restore = () => {
            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(lastSelection.start, lastSelection.end);
            }, 0);
        };

        toolbar.addEventListener('pointerdown', (e) => {
            const tag  = e.target.tagName;
            const type = e.target.type;
            const isEditableInput = tag === 'INPUT' && (type === 'text' || type === 'number');
            if (isEditableInput) return;
            e.preventDefault();
            restore();
        });

        [toolHex, document.getElementById('toolFont'), toolSize].forEach(input => {
            if (!input) return;
            input.addEventListener('blur',    () => restore());
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { input.blur(); restore(); } });
        });
    }

    // Previne perda de seleção ao clicar nos inputs de ferramenta
    ['toolColor', 'toolHex', 'toolFont', 'toolSize'].forEach(id => {
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
            if (e.key === 'Enter') { e.preventDefault(); adicionarTag(); }
        });
    }

    // Enter no input de pessoas
    const inputPessoa = document.getElementById('p-pessoa-input');
    if (inputPessoa) {
        inputPessoa.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); adicionarPessoa(); }
        });
    }

    // Enter nos inputs de prosa (tags e pessoas)
    const inputSinalProsa = document.getElementById('pr-sinal-input');
    if (inputSinalProsa) {
        inputSinalProsa.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); adicionarTagProsa(); }
        });
    }
    const inputPessoaProsa = document.getElementById('pr-pessoa-input');
    if (inputPessoaProsa) {
        inputPessoaProsa.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); adicionarPessoaProsa(); }
        });
    }
}
