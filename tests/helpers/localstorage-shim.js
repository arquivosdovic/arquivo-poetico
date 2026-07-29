// db.js lê `localStorage.getItem(...)` assim que é importado, pra
// carregar o estado salvo do navegador. No Node isso não existe por
// padrão — este shim só precisa bastar pra esse acesso não explodir;
// os testes não dependem de persistência de verdade, só das funções
// puras exportadas (sortPoemas, sortSecoes, calcularCascataColetanea etc).
if (typeof globalThis.localStorage === 'undefined') {
    globalThis.localStorage = {
        _dados: {},
        getItem(chave) {
            return this._dados[chave] ?? null;
        },
        setItem(chave, valor) {
            this._dados[chave] = String(valor);
        },
        removeItem(chave) {
            delete this._dados[chave];
        },
        clear() {
            this._dados = {};
        },
    };
}
