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
