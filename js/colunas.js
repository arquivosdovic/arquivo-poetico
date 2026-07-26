// ============================================================
// colunas.js — Configuração de colunas visíveis (e sua ordem)
// nas tabelas de Poemas e Prosas. Cada tabela guarda sua própria
// escolha no localStorage; colunas não listadas aqui (ID/Título
// e Ações) são fixas e sempre aparecem, sempre nas pontas.
// Importado por: render-listas.js, main.js (expõe toggleColuna
// e moverColuna)
// ============================================================

const LS_PREFIX = 'arquivoPoetico_colunas_';

// Ordem de definição = ordem padrão de exibição (usada só até o
// usuário reordenar manualmente pelo seletor — a partir daí quem
// manda é a ordem salva no localStorage, ver lerEstado()).
// `default: true` são as colunas que já existiam antes desse recurso
// (mantidas ativas de cara); as demais começam desligadas.
export const DEFINICAO_COLUNAS = {
    poemas: [
        { key: 'dataEscrita',     label: 'Escrito em',  default: true  },
        { key: 'dataPublicacao',  label: 'Publicação',  default: true  },
        { key: 'estrutura',       label: 'Estrutura',   default: true  },
        { key: 'status',          label: 'Status',      default: true  },
        { key: 'elos',            label: 'Elos',        default: false },
        { key: 'referencias',     label: 'Referências', default: false },
        { key: 'etiquetas',       label: 'Etiquetas',   default: false },
        { key: 'notas',           label: 'Notas',       default: false },
    ],
    prosas: [
        { key: 'dataEscrita',     label: 'Data',        default: true  },
        { key: 'dataPublicacao',  label: 'Publicação',  default: true  },
        { key: 'vinculo',         label: 'Vínculo',     default: true  },
        { key: 'etiquetas',       label: 'Etiquetas',   default: false },
        { key: 'notas',           label: 'Notas',       default: false },
    ],
};

// Lê o estado salvo ({ ordem, ativas }) e sempre devolve algo íntegro:
// `ordem` contém TODAS as colunas definidas (ativas ou não — a ordem
// entre as desligadas importa pra quando forem religadas depois), sem
// duplicar nem faltar nenhuma; `ativas` é o subconjunto ligado.
function lerEstado(tabela) {
    const def = DEFINICAO_COLUNAS[tabela];
    if (!def) return { ordem: [], ativas: [] };

    const todasChaves = def.map(c => c.key);
    const chavesValidas = new Set(todasChaves);

    let ordem = null, ativas = null;
    const raw = localStorage.getItem(LS_PREFIX + tabela);
    if (raw) {
        try {
            const salvo = JSON.parse(raw);
            if (salvo && Array.isArray(salvo.ordem) && Array.isArray(salvo.ativas)) {
                ordem  = salvo.ordem.filter(k => chavesValidas.has(k));
                ativas = salvo.ativas.filter(k => chavesValidas.has(k));
            }
        } catch {
            // JSON inválido — cai pro padrão abaixo
        }
    }

    if (!ordem) ordem = [...todasChaves];
    if (!ativas) ativas = def.filter(c => c.default).map(c => c.key);

    // Colunas novas (adicionadas a DEFINICAO_COLUNAS depois de já existir
    // uma escolha salva no navegador) entram no fim da ordem, desligadas.
    todasChaves.forEach(k => { if (!ordem.includes(k)) ordem.push(k); });

    return { ordem, ativas };
}

function salvarEstado(tabela, estado) {
    localStorage.setItem(LS_PREFIX + tabela, JSON.stringify(estado));
}

function disparaAlteracao(tabela) {
    window.dispatchEvent(new CustomEvent('colunas:alteradas', { detail: { tabela } }));
}

// Colunas ativas, na ordem escolhida pelo usuário — é essa ordem que
// vale tanto pro cabeçalho quanto pras células da tabela.
export function getColunasAtivas(tabela) {
    const { ordem, ativas } = lerEstado(tabela);
    const setAtivas = new Set(ativas);
    return ordem.filter(k => setAtivas.has(k));
}

export function isColunaAtiva(tabela, key) {
    return getColunasAtivas(tabela).includes(key);
}

// Alterna uma coluna e dispara 'colunas:alteradas' pra quem estiver
// escutando (render-listas.js) re-renderizar a tabela em questão.
// Não mexe na ordem — só liga/desliga dentro dela.
export function toggleColuna(tabela, key, ativo) {
    if (!DEFINICAO_COLUNAS[tabela]) return;

    const estado = lerEstado(tabela);
    const setAtivas = new Set(estado.ativas);
    if (ativo) setAtivas.add(key); else setAtivas.delete(key);
    estado.ativas = estado.ordem.filter(k => setAtivas.has(k));

    salvarEstado(tabela, estado);
    disparaAlteracao(tabela);
}

// Troca a posição de uma coluna com a vizinha (acima/abaixo na ordem
// atual) — mesmo padrão de moverLivro() em render-listas.js.
export function moverColuna(tabela, key, direcao) {
    if (!DEFINICAO_COLUNAS[tabela]) return;

    const estado = lerEstado(tabela);
    const idx = estado.ordem.indexOf(key);
    if (idx === -1) return;

    const alvo = direcao === 'up' ? idx - 1 : idx + 1;
    if (alvo < 0 || alvo >= estado.ordem.length) return;

    [estado.ordem[idx], estado.ordem[alvo]] = [estado.ordem[alvo], estado.ordem[idx]];

    salvarEstado(tabela, estado);
    disparaAlteracao(tabela);
}

// Monta o HTML do painel de checkboxes + setinhas de reordenar (usado
// dentro do popover "Colunas ▾"). A ordem de exibição das linhas do
// próprio seletor já reflete a ordem escolhida.
export function renderSeletorColunas(tabela) {
    const def = DEFINICAO_COLUNAS[tabela];
    if (!def) return '';

    const rotulos = Object.fromEntries(def.map(c => [c.key, c.label]));
    const { ordem, ativas } = lerEstado(tabela);
    const setAtivas = new Set(ativas);

    return ordem.map((key, i) => `
        <div class="flex items-center gap-1 text-xs py-1 px-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 whitespace-nowrap">
            <div class="flex flex-col leading-none mr-1">
                <button type="button" onclick="moverColuna('${tabela}', '${key}', 'up')" ${i === 0 ? 'disabled' : ''}
                    class="text-[9px] text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-20 disabled:hover:text-gray-400"
                    title="Mover para cima">▲</button>
                <button type="button" onclick="moverColuna('${tabela}', '${key}', 'down')" ${i === ordem.length - 1 ? 'disabled' : ''}
                    class="text-[9px] text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-20 disabled:hover:text-gray-400"
                    title="Mover para baixo">▼</button>
            </div>
            <label class="flex items-center gap-2 py-0.5 px-1 cursor-pointer">
                <input type="checkbox" ${setAtivas.has(key) ? 'checked' : ''}
                    onchange="toggleColuna('${tabela}', '${key}', this.checked)">
                ${rotulos[key]}
            </label>
        </div>`).join('');
}
