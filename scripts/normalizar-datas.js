#!/usr/bin/env node
// ============================================================
// normalizar-datas.js — Acervo Poético
//
// O que faz:
//   Pega o JSON baixado pelo botão "Baixar JSON" do Acervo
//   Poético (o mesmo objeto `db`: livros, partes, secoes,
//   poemas, prosas, elementos...) e preenche o campo
//   `dataPublicacao` de poemas e prosas que estão com esse
//   campo vazio, usando a data de publicação (`data`) do livro
//   ao qual o texto pertence — só quando o livro já tem essa
//   data preenchida.
//
// Regras aplicadas:
//   1. Só mexe em textos com dataPublicacao vazia (null,
//      undefined ou chave ausente). Textos que já têm uma data
//      nunca são sobrescritos.
//   2. Descobre o livro do texto por dois caminhos, nessa ordem:
//        a) campo `livrosIds` (primeiro id da lista), ou
//        b) hierarquia paiTipo/paiId, subindo de
//           poema/prosa -> secao -> parte -> livro
//           (ou poema/prosa -> parte -> livro,
//            ou poema/prosa -> livro, quando for direto)
//   3. Só preenche se o livro encontrado tiver `data` (ou seja,
//      já publicado). Livros sem data ficam de fora — nada a
//      normalizar ainda.
//   4. Respeita `publicado === false`: textos marcados assim
//      (ex.: descartados/cortados do livro) NÃO recebem a data,
//      mesmo pertencendo a um livro já publicado, porque
//      pertencem a ele só conceitualmente.
//
// Uso:
//   node normalizar-datas.js entrada.json saida.json
//
// A saída é o mesmo objeto `db` completo (nada além de
// dataPublicacao é alterado), pronto pra reimportar no app
// pela opção "Importar" / importarDB.
// ============================================================

const fs = require('fs');

function normId(id) {
    if (typeof id === 'string' && /^-?\d+$/.test(id)) return Number(id);
    return id;
}

function dataVazia(v) {
    return v === null || v === undefined;
}

function livroTemData(livro) {
    return !!(livro && livro.data && (livro.data.dia || livro.data.mes || livro.data.ano));
}

function construirIndices(db) {
    const livrosPorId = new Map((db.livros || []).map((l) => [normId(l.id), l]));
    const partesPorId = new Map((db.partes || []).map((p) => [normId(p.id), p]));
    const secoesPorId = new Map((db.secoes || []).map((s) => [normId(s.id), s]));
    return { livrosPorId, partesPorId, secoesPorId };
}

// Sobe a hierarquia (secao -> parte -> livro) até achar o livro,
// ou usa livrosIds direto se o texto já tiver essa ligação explícita.
function resolverLivro(item, indices) {
    const { livrosPorId, partesPorId, secoesPorId } = indices;

    if (Array.isArray(item.livrosIds) && item.livrosIds.length > 0) {
        const livro = livrosPorId.get(normId(item.livrosIds[0]));
        if (livro) return livro;
    }

    let paiTipo = item.paiTipo;
    let paiId = normId(item.paiId);
    let guard = 0;

    while (paiTipo && paiId !== null && paiId !== undefined && guard++ < 10) {
        if (paiTipo === 'livro') {
            return livrosPorId.get(paiId) || null;
        }
        if (paiTipo === 'parte') {
            const parte = partesPorId.get(paiId);
            if (!parte) return null;
            return livrosPorId.get(normId(parte.livroId)) || null;
        }
        if (paiTipo === 'secao') {
            const secao = secoesPorId.get(paiId);
            if (!secao) return null;
            paiTipo = secao.paiTipo;
            paiId = normId(secao.paiId);
            continue;
        }
        return null;
    }
    return null;
}

function normalizarLista(lista, tipoLabel, indices, relatorio) {
    for (const item of lista) {
        if (!dataVazia(item.dataPublicacao)) continue;

        if (item.publicado === false) {
            relatorio.pulados_descartados.push(`${tipoLabel}: ${item.titulo}`);
            continue;
        }

        const livro = resolverLivro(item, indices);

        if (!livro) {
            relatorio.pulados_sem_livro.push(`${tipoLabel}: ${item.titulo}`);
            continue;
        }

        if (!livroTemData(livro)) {
            relatorio.pulados_livro_sem_data.push(
                `${tipoLabel}: ${item.titulo} (livro: ${livro.titulo})`,
            );
            continue;
        }

        item.dataPublicacao = { ...livro.data };
        relatorio.normalizados.push(
            `${tipoLabel}: ${item.titulo} -> ${JSON.stringify(item.dataPublicacao)} (livro: ${livro.titulo})`,
        );
    }
}

function main() {
    const [, , entradaPath, saidaPath] = process.argv;

    if (!entradaPath || !saidaPath) {
        console.error('Uso: node normalizar-datas.js entrada.json saida.json');
        process.exit(1);
    }

    const db = JSON.parse(fs.readFileSync(entradaPath, 'utf8'));
    const indices = construirIndices(db);

    const relatorio = {
        normalizados: [],
        pulados_descartados: [],
        pulados_sem_livro: [],
        pulados_livro_sem_data: [],
    };

    normalizarLista(db.poemas || [], 'poema', indices, relatorio);
    normalizarLista(db.prosas || [], 'prosa', indices, relatorio);

    fs.writeFileSync(saidaPath, JSON.stringify(db, null, 2), 'utf8');

    console.log(`\n✅ ${relatorio.normalizados.length} textos normalizados:\n`);
    relatorio.normalizados.forEach((l) => console.log('  ' + l));

    console.log(
        `\n⏭️  ${relatorio.pulados_descartados.length} pulados por publicado:false (descartados/cortados):`,
    );
    relatorio.pulados_descartados.forEach((l) => console.log('  ' + l));

    console.log(
        `\n⏭️  ${relatorio.pulados_livro_sem_data.length} pulados por o livro ainda não ter data de publicação:`,
    );
    relatorio.pulados_livro_sem_data.forEach((l) => console.log('  ' + l));

    if (relatorio.pulados_sem_livro.length) {
        console.log(
            `\n⚠️  ${relatorio.pulados_sem_livro.length} pulados por não ter sido possível achar o livro (livrosIds e hierarquia paiTipo/paiId ausentes ou quebradas):`,
        );
        relatorio.pulados_sem_livro.forEach((l) => console.log('  ' + l));
    }

    console.log(`\nSalvo em: ${saidaPath}`);
}

main();
