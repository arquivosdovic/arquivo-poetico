// ============================================================
// utils.js — Funções puras sem dependências internas
// Importado por: db.js, render.js, forms.js
// ============================================================

export const sortBySeq = (lista) => {
    return [...lista].sort((a, b) => {
        const seqA = parseInt(a.sequencia) || 9999;
        const seqB = parseInt(b.sequencia) || 9999;
        return seqA - seqB || a.id - b.id;
    });
};

export async function toBase64(file) {
    if (!file) return null;
    return new Promise(res => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(file);
    });
}

// ─── Reordenação automática (inserir empurra, excluir fecha o buraco) ──

// Reposiciona um item dentro do grupo de irmãos (mesmo nível de
// competição). Se posicaoAntiga for null, trata como inserção nova
// (empurra pra frente quem estiver na posição ou depois). Se houver
// posicaoAntiga, trata como um "mover": desloca só quem estava entre
// a posição antiga e a nova, na direção certa.
// Converte o valor de sequência de um campo de formulário:
// string vazia / NaN / null → null (sem posição definida)
// qualquer inteiro válido → esse inteiro
export function seqOuNull(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = parseInt(valor);
    return isNaN(n) ? null : n;
}

export function reordenarPosicao(irmaos, itemAtual, posicaoDesejada, posicaoAntiga = null) {
    // Se o item não tem posição definida, não disputa slot com ninguém
    if (posicaoDesejada === null) {
        itemAtual.sequencia = null;
        return;
    }

    const outros = irmaos.filter(it => it !== itemAtual && it.id != itemAtual.id);

    if (posicaoAntiga === null) {
        // Inserção nova com posição: empurra pra frente quem tiver posição ≥ desejada
        outros.forEach(it => {
            const seq = it.sequencia;
            if (seq !== null && seq >= posicaoDesejada) it.sequencia = seq + 1;
        });
    } else if (posicaoDesejada > posicaoAntiga) {
        outros.forEach(it => {
            const seq = it.sequencia;
            if (seq !== null && seq > posicaoAntiga && seq <= posicaoDesejada) it.sequencia = seq - 1;
        });
    } else if (posicaoDesejada < posicaoAntiga) {
        outros.forEach(it => {
            const seq = it.sequencia;
            if (seq !== null && seq >= posicaoDesejada && seq < posicaoAntiga) it.sequencia = seq + 1;
        });
    }

    itemAtual.sequencia = posicaoDesejada;
}

// Fecha o buraco deixado por um item removido de uma posição.
// Itens sem posição (null) são ignorados.
export function fecharEspaco(irmaos, posicaoRemovida) {
    if (posicaoRemovida === null) return; // item sem posição não deixa buraco
    irmaos.forEach(it => {
        if (it.sequencia !== null && it.sequencia > posicaoRemovida) it.sequencia = it.sequencia - 1;
    });
}

// ─── Quem compete com quem (irmãos no mesmo "andar" da estrutura) ──
// Um item ligado direto ao Livro (sem Parte) compete com as Partes,
// não tem uma numeração isolada própria — por isso entra no mesmo grupo.

export function getIrmaosTopoLivro(db, livroId) {
    return [
        ...db.partes.filter(p => p.livroId == livroId),
        ...db.secoes.filter(s => s.paiTipo === 'livro' && s.paiId == livroId),
        ...db.elementos.filter(e => e.paiTipo === 'livro' && e.paiId == livroId),
        ...db.poemas.filter(p => p.paiTipo === 'livro' && p.paiId == livroId),
        ...db.prosas.filter(p => p.paiTipo === 'livro' && p.paiId == livroId)
    ];
}

export function getIrmaosDentroParte(db, parteId) {
    return [
        ...db.secoes.filter(s => s.paiTipo === 'parte' && s.paiId == parteId),
        ...db.elementos.filter(e => e.paiTipo === 'parte' && e.paiId == parteId),
        ...db.poemas.filter(p => p.paiTipo === 'parte' && p.paiId == parteId),
        ...db.prosas.filter(p => p.paiTipo === 'parte' && p.paiId == parteId)
    ];
}

export function getIrmaosDentroSecao(db, secaoId) {
    return [
        ...db.elementos.filter(e => e.paiTipo === 'secao' && e.paiId == secaoId),
        ...db.poemas.filter(p => p.paiTipo === 'secao' && p.paiId == secaoId),
        ...db.prosas.filter(p => (p.paiTipo === 'secao' && p.paiId == secaoId) || p.secaoId == secaoId)
    ];
}

export function getIrmaosPorEscopo(db, paiTipo, paiId) {
    if (paiTipo === 'parte') return getIrmaosDentroParte(db, paiId);
    if (paiTipo === 'secao') return getIrmaosDentroSecao(db, paiId);
    if (paiTipo === 'livro') return getIrmaosTopoLivro(db, paiId);
    return [];
}

// Calcula a posição "comparável" de um Elemento dentro do livro, em até
// 3 níveis: [livroSeq, posiçãoNoNívelDasPartes, posiçãoNoNívelDasSeções].
// Funciona em conjunto com a reordenação automática: como um item ligado
// direto ao Livro/Parte usa sua própria sequência competindo na MESMA
// escala dos irmãos reais (Partes, Seções), essa posição já é coerente.
export function getPosicaoElemento(el, db) {
    let livroSeq = 9999, posParte = 9999, posSecao = 9999;

    if (el.paiTipo === 'livro') {
        const l = db.livros.find(x => x.id == el.paiId);
        livroSeq = parseInt(l?.sequencia) || 9999;
        posParte = parseInt(el.sequencia) || 9999;

    } else if (el.paiTipo === 'parte') {
        const p = db.partes.find(x => x.id == el.paiId);
        if (p) {
            posParte = parseInt(p.sequencia) || 9999;
            const l = db.livros.find(x => x.id == p.livroId);
            livroSeq = parseInt(l?.sequencia) || 9999;
        }
        posSecao = parseInt(el.sequencia) || 9999;

    } else if (el.paiTipo === 'secao') {
        const s = db.secoes.find(x => x.id == el.paiId);
        if (s) {
            if (s.paiTipo === 'parte') {
                const p = db.partes.find(x => x.id == s.paiId);
                if (p) {
                    posParte = parseInt(p.sequencia) || 9999;
                    const l = db.livros.find(x => x.id == p.livroId);
                    livroSeq = parseInt(l?.sequencia) || 9999;
                }
            } else {
                posParte = parseInt(s.sequencia) || 9999;
                const l = db.livros.find(x => x.id == s.paiId);
                livroSeq = parseInt(l?.sequencia) || 9999;
            }
            posSecao = parseInt(s.sequencia) || 9999;
        }
    }

    return [livroSeq, posParte, posSecao];
}

// ─── Modal de confirmação de exclusão ────────────────────────
// Usado por db.js (deleteItem) e coletaneas.js (deletarParteColetanea,
// deletarItemColetanea). Vive aqui por ser uma utilidade genérica de UI
// sem dependência de estado interno — qualquer módulo pode importar.
//
// Uso:
//   abrirModalExclusao('Título do item', 'Tipo', () => { /* executa exclusão */ });

export function abrirModalExclusao(titulo, rotulo, onConfirmar) {
    let overlay = document.getElementById('modal-confirmar-exclusao');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'modal-confirmar-exclusao';
        overlay.style.cssText = `
            position:fixed; inset:0; z-index:10000;
            background:rgba(0,0,0,0.5);
            display:flex; align-items:center; justify-content:center;
            animation:fadeIn .15s ease-out;
        `;

        const caixa = document.createElement('div');
        caixa.style.cssText = `
            background:#fff; border-radius:12px;
            padding:28px 32px; max-width:380px; width:90%;
            box-shadow:0 8px 40px rgba(0,0,0,0.18);
            font-family:sans-serif;
        `;

        caixa.innerHTML = `
            <p style="margin:0 0 6px; font-size:11px; font-weight:700;
                      text-transform:uppercase; letter-spacing:.06em; color:#9ca3af;"
               id="excl-rotulo"></p>
            <h3 style="margin:0 0 20px; font-size:16px; font-weight:700;
                       color:#111827; line-height:1.4; word-break:break-word;"
                id="excl-titulo"></h3>
            <p style="margin:0 0 24px; font-size:13px; color:#6b7280;">
                Esta ação é permanente e não pode ser desfeita.
            </p>
            <div style="display:flex; gap:10px; justify-content:flex-end;">
                <button id="excl-cancelar"
                    style="padding:8px 18px; border-radius:8px; border:1px solid #e5e7eb;
                           background:#fff; color:#374151; font-size:13px; font-weight:600;
                           cursor:pointer;">
                    Cancelar
                </button>
                <button id="excl-confirmar"
                    style="padding:8px 18px; border-radius:8px; border:none;
                           background:#dc2626; color:#fff; font-size:13px; font-weight:600;
                           cursor:pointer;">
                    Excluir
                </button>
            </div>
        `;

        overlay.appendChild(caixa);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) _fecharModalExclusao();
        });
        document.addEventListener('keydown', _modalExclusaoTeclado);
    }

    document.getElementById('excl-rotulo').textContent = rotulo;
    document.getElementById('excl-titulo').textContent = titulo;

    const btnCancelar  = document.getElementById('excl-cancelar');
    const btnConfirmar = document.getElementById('excl-confirmar');
    btnCancelar.onclick  = _fecharModalExclusao;
    btnConfirmar.onclick = () => { _fecharModalExclusao(); onConfirmar(); };

    overlay.style.display = 'flex';
    setTimeout(() => btnCancelar.focus(), 0);
}

function _fecharModalExclusao() {
    const overlay = document.getElementById('modal-confirmar-exclusao');
    if (overlay) overlay.style.display = 'none';
}

function _modalExclusaoTeclado(e) {
    const overlay = document.getElementById('modal-confirmar-exclusao');
    if (!overlay || overlay.style.display === 'none') return;
    if (e.key === 'Escape') _fecharModalExclusao();
}

// Recebe o array db.livros e retorna todas as "Fases de Vida" já usadas,
// sem repetição e ordenadas — pra alimentar o datalist de sugestões.
export function extrairFasesUnicas(livros) {
    const fases = new Set();
    livros.forEach(l => { if (l.fase && l.fase.trim()) fases.add(l.fase.trim()); });
    return Array.from(fases).sort();
}

// ─── Datas parciais (Escrita / Primeira Publicação) ────────────
// Flexíveis: cada campo (dia/mes/ano/hora/minuto) é opcional e
// independente — dá pra saber só o ano, só o mês e ano, etc.

export function lerDataParcial(prefixo) {
    const campos = ['dia', 'mes', 'ano', 'hora', 'minuto'];
    const obj = {};
    campos.forEach(c => {
        const el = document.getElementById(`${prefixo}-${c}`);
        const v = el?.value;
        if (v !== '' && v != null) obj[c] = parseInt(v);
    });
    return Object.keys(obj).length ? obj : null;
}

export function preencherDataParcial(prefixo, dataObj) {
    const campos = ['dia', 'mes', 'ano', 'hora', 'minuto'];
    campos.forEach(c => {
        const el = document.getElementById(`${prefixo}-${c}`);
        if (el) el.value = (dataObj && dataObj[c] != null) ? dataObj[c] : '';
    });
}

export function formatarDataParcial(dataObj) {
    if (!dataObj) return '—';
    const { dia, mes, ano, hora, minuto } = dataObj;
    let partes = '';
    if (dia || mes || ano) {
        partes = [dia, mes, ano].filter(Boolean).map((v, i) => i < 2 ? String(v).padStart(2, '0') : v).join('/');
    }
    if (hora != null) {
        const h = String(hora).padStart(2, '0');
        const m = minuto != null ? String(minuto).padStart(2, '0') : '00';
        partes += (partes ? ' ' : '') + `${h}:${m}`;
    }
    return partes || '—';
}

// Extrai o ano (número) de uma data parcial, se houver.
export function anoDeDataParcial(dataObj) {
    return dataObj && dataObj.ano ? dataObj.ano : null;
}

// Recebe o array db.poemas e retorna todos os nomes de pessoas únicos ordenados
export function extrairPessoasUnicas(poemas) {
    const nomes = new Set();
    poemas.forEach(p => {
        if (p.pessoas) {
            const lista = Array.isArray(p.pessoas)
                ? p.pessoas
                : p.pessoas.split(',').map(s => s.trim());
            lista.forEach(n => { if (n) nomes.add(n); });
        }
    });
    return Array.from(nomes).sort();
}

// Filtra uma lista de textos (poemas/prosas) por uma busca livre que
// procura em título, ano, sinalizações e pessoas ao mesmo tempo.
export function filtrarTextos(lista, query) {
    if (!query || !query.trim()) return lista;
    const q = query.trim().toLowerCase();
    return lista.filter(item => {
        const campos = [
            item.titulo,
            item.ano,
            item.sinalizacoes,
            item.pessoas,
            item.notas,
            item._livros
        ].filter(Boolean).join(' ').toLowerCase();
        return campos.includes(q);
    });
}

// Recebe o array db.poemas e retorna todas as sinalizações únicas ordenadas
export function extrairSinalizacoesUnicas(poemas) {
    const sinais = new Set();
    poemas.forEach(p => {
        if (p.sinalizacoes) {
            const lista = Array.isArray(p.sinalizacoes)
                ? p.sinalizacoes
                : p.sinalizacoes.split(',').map(s => s.trim());
            lista.forEach(s => { if (s) sinais.add(s); });
        }
    });
    return Array.from(sinais).sort();
}

// Retorna array [livroSeq, nivel, parteSeq, secaoSeq] para ordenação hierárquica.
// Usado por render.js para ordenar seções e elementos.
export function getElementHierarchy(el, db) {
    let livroSeq = 9999, parteSeq = 9999, secaoSeq = 9999, nivel = 9;

    if (el.paiTipo === 'livro') {
        const l = db.livros.find(x => x.id == el.paiId);
        livroSeq = parseInt(l?.sequencia) || 9999;
        nivel = 1;
    } else if (el.paiTipo === 'parte') {
        const p = db.partes.find(x => x.id == el.paiId);
        if (p) {
            parteSeq = parseInt(p.sequencia) || 9999;
            const l = db.livros.find(x => x.id == p.livroId);
            livroSeq = parseInt(l?.sequencia) || 9999;
            nivel = 2;
        }
    } else if (el.paiTipo === 'secao') {
        const s = db.secoes.find(x => x.id == el.paiId);
        if (s) {
            secaoSeq = parseInt(s.sequencia) || 9999;
            nivel = 3;
            if (s.paiTipo === 'parte') {
                const p = db.partes.find(x => x.id == s.paiId);
                if (p) {
                    parteSeq = parseInt(p.sequencia) || 9999;
                    const l = db.livros.find(x => x.id == p.livroId);
                    livroSeq = parseInt(l?.sequencia) || 9999;
                }
            } else {
                const l = db.livros.find(x => x.id == s.paiId);
                livroSeq = parseInt(l?.sequencia) || 9999;
            }
        }
    }

    return [livroSeq, nivel, parteSeq, secaoSeq];
}
