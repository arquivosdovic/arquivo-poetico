// ============================================================
// theme.js — Modo claro / escuro / automático.
// Preferência ('auto' | 'claro' | 'escuro') salva no localStorage.
// No modo 'auto', segue prefers-color-scheme do sistema e reage
// se o usuário trocar o tema do SO enquanto a página está aberta.
// A aplicação inicial (evitar flash) acontece num script inline
// no <head> do index.html — este módulo cuida do resto: botão,
// popover, e reaplicar quando o SO muda em modo automático.
// Importado por: main.js (expõe setTema no window)
// ============================================================

const LS_CHAVE = 'arquivoPoetico_tema';
const rotulos = { auto: 'Automático', claro: 'Claro', escuro: 'Escuro' };
const icones  = { auto: '🌓', claro: '☀️', escuro: '🌙' };

function getPreferencia() {
    return localStorage.getItem(LS_CHAVE) || 'auto';
}

function temaEfetivo(pref) {
    if (pref === 'auto') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
    }
    return pref;
}

// Aplica a classe no <html> e atualiza o botão/popover, sem mexer
// na preferência salva (usado tanto no load quanto na resposta ao
// SO mudar de tema em modo automático).
function aplicar(pref) {
    document.documentElement.classList.toggle('dark', temaEfetivo(pref) === 'escuro');

    const botao = document.getElementById('btn-tema');
    if (botao) botao.textContent = `${icones[pref]} Tema`;

    document.querySelectorAll('#painel-tema [data-tema]').forEach(el => {
        const ativo = el.dataset.tema === pref;
        el.classList.toggle('bg-blue-50', ativo);
        el.classList.toggle('dark:bg-blue-950', ativo);
        el.classList.toggle('text-blue-700', ativo);
        el.classList.toggle('dark:text-blue-300', ativo);
        el.classList.toggle('font-bold', ativo);
    });

    window.dispatchEvent(new CustomEvent('tema:alterado', { detail: { pref, efetivo: temaEfetivo(pref) } }));
}

// Chamada pelo botão/popover (ver renderPainelTema abaixo)
export function setTema(pref) {
    localStorage.setItem(LS_CHAVE, pref);
    aplicar(pref);
}

// Monta o popover com as 3 opções — reaproveitado o padrão de
// togglePainel() já usado em Colunas/Filtro de datas.
export function renderPainelTema() {
    const atual = getPreferencia();
    return ['auto', 'claro', 'escuro'].map(pref => `
        <button type="button" data-tema="${pref}" onclick="setTema('${pref}')"
            class="w-full text-left flex items-center gap-2 text-xs py-1.5 px-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700 dark:text-slate-200 whitespace-nowrap ${pref === atual ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold' : ''}">
            ${icones[pref]} ${rotulos[pref]}
        </button>`).join('');
}

export function initTema() {
    const painel = document.getElementById('painel-tema');
    if (painel) painel.innerHTML = renderPainelTema();
    aplicar(getPreferencia());

    // Em modo automático, reage se o SO mudar de claro pra escuro (ou
    // vice-versa) com a página já aberta — sem isso só atualizaria no
    // próximo carregamento.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (getPreferencia() === 'auto') aplicar('auto');
    });
}
