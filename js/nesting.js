// ============================================================
// nesting.js — Lógica de encadeamento hierárquico
// Usado por: exportar.js (exportarTudoAninhado)
// ============================================================

export function buildNesting(db) {
    const nest = db.livros.map(livro => {
        const l = { ...livro };

        l.conteudo_elementos = (db.elementos || []).filter(
            e => e.paiId == l.id && e.paiTipo === 'livro'
        );
        l.conteudo_poemas_diretos = db.poemas.filter(
            p => p.paiId == l.id && p.paiTipo === 'livro'
        );
        l.conteudo_prosas_diretas = (db.prosas || []).filter(
            pr => pr.paiId == l.id && pr.paiTipo === 'livro'
        );
        l.conteudo_partes = db.partes
            .filter(p => p.livroId == l.id)
            .map(parte => {
                const p = { ...parte };
                p.conteudo_elementos      = (db.elementos || []).filter(e => e.paiId == p.id && e.paiTipo === 'parte');
                p.conteudo_poemas_diretos = db.poemas.filter(poe => poe.paiId == p.id && poe.paiTipo === 'parte');
                p.conteudo_prosas_diretas = (db.prosas || []).filter(pr => pr.paiId == p.id && pr.paiTipo === 'parte');
                p.conteudo_secoes         = getSecoes(p.id, 'parte', db);
                return p;
            });

        l.conteudo_secoes_diretas = getSecoes(l.id, 'livro', db);

        return l;
    });

    const avulsos_poemas = db.poemas.filter(p => !p.paiTipo || !p.paiId);
    const avulsos_prosas = (db.prosas || []).filter(pr => !pr.paiTipo || !pr.paiId);

    return {
        export_format: 'deep_nesting',
        data: nest,
        avulsos: {
            poemas: avulsos_poemas,
            prosas: avulsos_prosas
        }
    };
}

// Mesma árvore de buildNesting, mas devolve só um Livro (com seus próprios
// campos — título, sinopse, capa-id etc. — já junto do conteúdo aninhado).
// Usado pra exportar "este livro completo" sem precisar baixar o acervo todo.
export function buildNestingLivro(db, livroId) {
    const completo = buildNesting(db);
    return completo.data.find(l => String(l.id) === String(livroId)) || null;
}

export function getSecoes(paiId, paiTipo, db) {
    return db.secoes
        .filter(s => s.paiId == paiId && s.paiTipo === paiTipo)
        .map(secao => {
            const s = { ...secao };
            s.conteudo_elementos = (db.elementos || []).filter(e => e.paiId == s.id && e.paiTipo === 'secao');
            s.conteudo_poemas    = db.poemas.filter(p => p.paiId == s.id && p.paiTipo === 'secao');
            s.conteudo_prosas    = (db.prosas || []).filter(pr =>
                pr.paiId == s.id && pr.paiTipo === 'secao'
            );
            return s;
        });
}

// ─── Desaninhamento (caminho inverso de buildNesting) ─────────
// Usado por filtrar.html: quando alguém carrega lá um JSON gerado por
// exportarTudoAninhado/exportarLivroCompleto/exportarLivrosCompletos,
// essas funções desmontam a árvore Livro → Parte → Seção → Poema/Prosa
// de volta numa lista plana, com o contexto (livro/parte/seção) já
// resolvido em cada item.
//
// Ficam aqui — junto de buildNesting, que é quem define os nomes de
// campo dessa árvore (conteudo_partes, conteudo_poemas_diretos etc.)
// — pra não duplicar esse contrato de formato em dois arquivos que
// podem sair de sincronia entre si.

function flattenSecaoAninhada(secao, nomeLivro, nomeParte, poemasOut, prosasOut) {
    const nomeSecao = secao.titulo || null;
    const contexto = { livro: nomeLivro, parte: nomeParte, secao: nomeSecao };
    (secao.conteudo_poemas || []).forEach(p => poemasOut.push({ ...p, contexto }));
    (secao.conteudo_prosas || []).forEach(p => prosasOut.push({ ...p, contexto }));
}

export function flattenLivroAninhado(livro, poemasOut, prosasOut) {
    const nomeLivro = livro.siglaOficial || livro.siglaPessoal || livro.titulo || null;

    let contexto = { livro: nomeLivro, parte: null, secao: null };
    (livro.conteudo_poemas_diretos || []).forEach(p => poemasOut.push({ ...p, contexto }));
    (livro.conteudo_prosas_diretas || []).forEach(p => prosasOut.push({ ...p, contexto }));

    (livro.conteudo_secoes_diretas || []).forEach(secao =>
        flattenSecaoAninhada(secao, nomeLivro, null, poemasOut, prosasOut));

    (livro.conteudo_partes || []).forEach(parte => {
        const nomeParte = parte.titulo || null;
        const contextoParte = { livro: nomeLivro, parte: nomeParte, secao: null };
        (parte.conteudo_poemas_diretos || []).forEach(p => poemasOut.push({ ...p, contexto: contextoParte }));
        (parte.conteudo_prosas_diretas || []).forEach(p => prosasOut.push({ ...p, contexto: contextoParte }));
        (parte.conteudo_secoes || []).forEach(secao =>
            flattenSecaoAninhada(secao, nomeLivro, nomeParte, poemasOut, prosasOut));
    });
}

// Detecta se um objeto "parece" um Livro aninhado (tem ao menos uma das
// chaves de conteúdo que só existem nessa árvore, geradas por buildNesting).
export function pareceLivroAninhado(obj) {
    return !!obj && (
        'conteudo_partes' in obj ||
        'conteudo_poemas_diretos' in obj ||
        'conteudo_secoes_diretas' in obj
    );
}
