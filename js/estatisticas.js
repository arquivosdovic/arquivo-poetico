// ============================================================
// estatisticas.js — Painel de estatísticas: palavras, temas,
// pessoas, distribuição por ano e por livro/coletânea.
// ============================================================

import { db } from './db.js';

const STOPWORDS = new Set([
    'a','o','as','os','um','uma','uns','umas','de','do','da','dos','das','em','no','na','nos','nas',
    'por','para','pra','pro','pros','pras','com','sem','sob','sobre','entre','até','após','ante','perante','desde','contra',
    'e','ou','mas','nem','que','se','quando','como','porque','pois','porém','contudo','todavia',
    'eu','tu','ele','ela','nós','vós','eles','elas','me','te','se','nos','vos','lhe','lhes','lo','la',
    'meu','minha','meus','minhas','teu','tua','teus','tuas','seu','sua','seus','suas','nosso','nossa',
    'nossos','nossas','este','esta','estes','estas','esse','essa','esses','essas','aquele','aquela',
    'aqueles','aquelas','isto','isso','aquilo','this','that',
    'é','foi','ser','são','era','eram','está','estão','estava','estavam','ter','tem','têm','tinha',
    'tinham','há','havia','seja','sejam','será','serão','sido','sendo','estar','estado','faz','fazer',
    'não','sim','mais','menos','muito','muita','muitos','muitas','pouco','pouca','poucos','poucas',
    'já','ainda','também','só','apenas','bem','mal','assim','aqui','ali','lá','onde','aonde','cá',
    'então','enquanto','embora','caso','cada','todo','toda','todos','todas','outro','outra','outros',
    'outras','algum','alguma','alguns','algumas','nenhum','nenhuma','qualquer','quaisquer',
    'meu','seu','dele','dela','deles','delas','lhe','consigo','si','vossa','vosso',
    'ao','aos','à','às','pelo','pela','pelos','pelas','num','numa','nuns','numas','dum','duma',
    'qual','quais','quem','cujo','cuja','cujos','cujas','tão','tal','tanto','tanta','tantos','tantas',
    'sob','sobre','as','os','um','uma',
    'foi','ser','ter','vai','vou','vem','vir','quer','ver','dar','deu','dá','dão','fui','foi',
    'isso','isto','aqui','lá','cá','aí','né','tá','tô','num','numas','dum','duma',
    // pronomes pessoais e de tratamento
    'você','voce','vocês','voces','vc','vcs','te','ti','si',
    // indefinidos e quantificadores genéricos
    'tudo','mesmo','mesma','mesmos','mesmas',
    //!!! 'quanto','quanta','quantos','quantas',
    // advérbios genéricos de tempo
    //!!! 'agora','depois','antes','sempre','nunca','jamais','talvez','quase','logo',
    //'hoje','ontem'
]);

function limparTexto(texto) {
    if (!texto) return '';
    return texto
        .replace(/<[^>]+>/g, ' ')      // remove tags HTML (divs/spans de formatação do editor)
        .replace(/&nbsp;/g, ' ')
        .replace(/&[a-z]+;/g, ' ');
}

function tokenizar(texto) {
    return limparTexto(texto)
        .toLowerCase()
        .normalize('NFC')
        .match(/[a-zà-úçãõâêîôû]+/g) || [];
}

function listaDeCampo(valor) {
    if (!valor) return [];
    return valor.split(',').map(s => s.trim()).filter(Boolean);
}

// ─── Resolução de Livro (pra agrupar Por Livro / Por Ano) ──────

function livroIdDoItem(item) {
    if (item.paiTipo === 'livro') return item.paiId;
    if (item.paiTipo === 'parte') {
        const p = db.partes.find(x => x.id == item.paiId);
        return p ? p.livroId : null;
    }
    if (item.paiTipo === 'secao') {
        const s = db.secoes.find(x => x.id == item.paiId);
        if (!s) return null;
        if (s.paiTipo === 'parte') {
            const p = db.partes.find(x => x.id == s.paiId);
            return p ? p.livroId : null;
        }
        return s.paiId;
    }
    return null;
}

function todosOsTextos() {
    return [...db.poemas, ...db.prosas];
}

// ─── Agregações ─────────────────────────────────────────────

export function contarPorAno() {
    const contagem = {};
    todosOsTextos().forEach(t => {
        const ano = parseInt(t.ano);
        if (!ano) return;
        contagem[ano] = (contagem[ano] || 0) + 1;
    });
    const anos = Object.keys(contagem).map(Number).sort((a, b) => a - b);
    return { labels: anos.map(String), data: anos.map(a => contagem[a]) };
}

export function contarPorLivro() {
    const contagem = {};
    todosOsTextos().forEach(t => {
        const livroId = livroIdDoItem(t);
        const livro = livroId ? db.livros.find(l => l.id == livroId) : null;
        const nome = livro ? (livro.siglaOficial || livro.siglaPessoal || livro.titulo) : 'Avulso';
        contagem[nome] = (contagem[nome] || 0) + 1;
    });
    (db.coletaneas || []).forEach(c => {
        const qtd = (db.itensColetanea || []).filter(i => String(i.coletaneaId) === String(c.id)).length;
        if (qtd > 0) contagem[`${c.titulo}`] = qtd;
    });
    // Coletâneas reais vivem em db.livros (tipo === 'Coletânea'); cada uma tem
    // Partes (db.partes, livroId = id da coletânea) e cada Parte tem Itens em
    // db.itensColetanea (parteId). O campo db.coletaneas acima é legado e
    // nunca é preenchido pela aba Coletâneas — mantido só por compatibilidade.
    db.livros.filter(l => l.tipo === 'Coletânea').forEach(col => {
        const partesIds = db.partes.filter(p => p.livroId == col.id).map(p => String(p.id));
        const qtd = (db.itensColetanea || []).filter(i => partesIds.includes(String(i.parteId))).length;
        if (qtd > 0) {
            const sigla = col.siglaOficial || col.siglaPessoal || col.titulo;
            contagem[`${sigla}`] = qtd;
        }
    });
    const ordenado = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
    return { labels: ordenado.map(o => o[0]), data: ordenado.map(o => o[1]) };
}

export function contarPorTema(top = 12) {
    const contagem = {};
    todosOsTextos().forEach(t => {
        listaDeCampo(t.sinalizacoes).forEach(tag => { contagem[tag] = (contagem[tag] || 0) + 1; });
    });
    const ordenado = Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, top);
    return { labels: ordenado.map(o => o[0]), data: ordenado.map(o => o[1]) };
}

export function contarPorPessoa(top = 12) {
    const contagem = {};
    todosOsTextos().forEach(t => {
        listaDeCampo(t.pessoas).forEach(nome => { contagem[nome] = (contagem[nome] || 0) + 1; });
    });
    const ordenado = Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, top);
    return { labels: ordenado.map(o => o[0]), data: ordenado.map(o => o[1]) };
}

export function palavrasMaisFrequentes(livroId = '', top = 40) {
    let textos;
    if (!livroId) {
        textos = todosOsTextos();
    } else {
        const livroSel = db.livros.find(l => String(l.id) === String(livroId));
        if (livroSel && livroSel.tipo === 'Coletânea') {
            // Coletâneas: textos estão em db.itensColetanea referenciando poemas/prosas por refId
            const partesIds = db.partes
                .filter(p => String(p.livroId) === String(livroId))
                .map(p => String(p.id));
            const refs = (db.itensColetanea || [])
                .filter(i => partesIds.includes(String(i.parteId)) && i.refId && i.refTipo);
            textos = refs.map(i => {
                if (i.textoOverride) return { texto: i.textoOverride };
                const col = db[i.refTipo + 's'];
                return col?.find(x => x.id == i.refId) || null;
            }).filter(Boolean);
        } else {
            textos = todosOsTextos().filter(t => String(livroIdDoItem(t)) === String(livroId));
        }
    }

    const contagem = {};
    textos.forEach(t => {
        tokenizar(t.texto).forEach(palavra => {
            if (palavra.length < 3 || STOPWORDS.has(palavra)) return;
            contagem[palavra] = (contagem[palavra] || 0) + 1;
        });
    });
    return Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, top);
}

export function resumoGeral() {
    const textos = todosOsTextos();
    const totalPalavras = textos.reduce((soma, t) => soma + tokenizar(t.texto).length, 0);
    const porAno = contarPorAno();

    let anoMaisProdutivo = '—';
    if (porAno.labels.length) {
        const idxMax = porAno.data.indexOf(Math.max(...porAno.data));
        anoMaisProdutivo = porAno.labels[idxMax];
    }

    const porLivro = contarPorLivro();
    const livroComMais = porLivro.labels.length ? porLivro.labels[0] : '—';

    return {
        totalPoemas: db.poemas.length,
        totalProsas: db.prosas.length,
        totalPalavras,
        mediaPalavras: textos.length ? Math.round(totalPalavras / textos.length) : 0,
        anoMaisProdutivo,
        livroComMais
    };
}

// ─── Renderização (cards + gráficos com Chart.js) ──────────────

const graficos = {}; // guarda instâncias do Chart.js pra poder destruir/recriar

function criarBarChart(canvasId, labels, data, cor) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Chart.js é carregado via CDN; pode não estar pronto no primeiro render.
    // Aguarda até 3s em intervalos de 100ms antes de desistir.
    if (typeof Chart === 'undefined') {
        let tentativas = 0;
        const espera = setInterval(() => {
            tentativas++;
            if (typeof Chart !== 'undefined') {
                clearInterval(espera);
                criarBarChart(canvasId, labels, data, cor);
            } else if (tentativas >= 30) {
                clearInterval(espera);
                console.warn('Chart.js não carregou a tempo para', canvasId);
            }
        }, 100);
        return;
    }

    if (graficos[canvasId]) graficos[canvasId].destroy();

    graficos[canvasId] = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: cor, borderRadius: 4 }] },
        options: {
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
}

function renderResumo() {
    const container = document.getElementById('est-resumo');
    if (!container) return;
    const r = resumoGeral();

    const cartoes = [
        ['Poemas', r.totalPoemas],
        ['Prosas', r.totalProsas],
        ['Palavras (total)', r.totalPalavras.toLocaleString('pt-BR')],
        ['Média de palavras/texto', r.mediaPalavras],
        ['Ano mais produtivo', r.anoMaisProdutivo],
        ['Livro com mais textos', r.livroComMais]
    ];

    container.innerHTML = cartoes.map(([rotulo, valor]) => `
        <div class="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div class="text-2xl font-black text-blue-700">${valor}</div>
            <div class="text-[10px] uppercase text-gray-400 font-bold mt-1">${rotulo}</div>
        </div>`).join('');
}

function popularSeletorLivroPalavras() {
    const sel = document.getElementById('est-livro-palavras');
    if (!sel) return;
    const valorAtual = sel.value;
    const livrosComuns = db.livros.filter(l => l.tipo !== 'Coletânea');
    const coletaneas   = db.livros.filter(l => l.tipo === 'Coletânea');
    const label = l => l.siglaOficial || l.siglaPessoal || l.titulo;
    sel.innerHTML = '<option value="">-- Todo o acervo --</option>' +
        (livrosComuns.length
            ? '<optgroup label="Livros">' +
              livrosComuns.map(l => `<option value="${l.id}">${label(l)}</option>`).join('') +
              '</optgroup>'
            : '') +
        (coletaneas.length
            ? '<optgroup label="Coletâneas">' +
              coletaneas.map(l => `<option value="${l.id}">${label(l)} (col.)</option>`).join('') +
              '</optgroup>'
            : '');
    if (Array.from(sel.options).some(o => o.value === valorAtual)) sel.value = valorAtual;
}

function renderListaPalavras() {
    const container = document.getElementById('lista-palavras');
    if (!container) return;
    const livroId = document.getElementById('est-livro-palavras')?.value || '';
    const palavras = palavrasMaisFrequentes(livroId, 40);

    container.innerHTML = palavras.length
        ? palavras.map(([palavra, n], i) => `
            <div class="flex justify-between items-center px-2 py-1 rounded ${i < 3 ? 'bg-blue-50' : ''}">
                <span class="text-gray-700">${palavra}</span>
                <span class="text-gray-400 font-mono text-xs">${n}</span>
            </div>`).join('')
        : '<p class="text-gray-400 col-span-full">Sem texto suficiente pra analisar ainda.</p>';
}

export function renderEstatisticas() {
    renderResumo();
    popularSeletorLivroPalavras();
    renderListaPalavras();

    const porAno = contarPorAno();
    criarBarChart('grafico-ano', porAno.labels, porAno.data, '#1d4ed8');

    const porLivro = contarPorLivro();
    criarBarChart('grafico-livro', porLivro.labels, porLivro.data, '#4f46e5');

    const porTema = contarPorTema();
    criarBarChart('grafico-temas', porTema.labels, porTema.data, '#0d9488');

    const porPessoa = contarPorPessoa();
    criarBarChart('grafico-pessoas', porPessoa.labels, porPessoa.data, '#e11d48');
}

window.addEventListener('db:saved', () => {
    // só recalcula se a aba de Estatísticas estiver visível, pra não gastar
    // processamento toda hora que algo é salvo em outra aba
    if (document.getElementById('estatisticas')?.classList.contains('active')) {
        renderEstatisticas();
    }
});
