// Alguns módulos (ex.: modais.js) registram listeners ou mexem em
// elementos assim que são importados, não só quando alguma função é
// chamada. Isso é inofensivo no navegador, mas quebra a importação no
// Node, que não tem DOM. Este shim é só um "boneco de pano": aceita
// as chamadas mais comuns sem fazer nada de verdade. Ele NÃO simula
// comportamento real de UI — é só pra permitir importar os módulos e
// testar a lógica pura que eles exportam (que não depende de DOM).
function noop() {}

function criarElementoFalso() {
    const el = {
        style: {},
        classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        addEventListener: noop,
        removeEventListener: noop,
        appendChild: noop,
        removeChild: noop,
        setAttribute: noop,
        removeAttribute: noop,
        remove: noop,
        _textContent: '',
        get textContent() {
            return this._textContent;
        },
        set textContent(v) {
            this._textContent = v;
        },
        get innerHTML() {
            return this._innerHTML || '';
        },
        set innerHTML(v) {
            this._innerHTML = v;
        },
    };
    return el;
}

if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => criarElementoFalso(),
        addEventListener: noop,
        removeEventListener: noop,
        head: criarElementoFalso(),
        body: criarElementoFalso(),
    };
}

if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        addEventListener: noop,
        removeEventListener: noop,
        dispatchEvent: noop,
    };
}

if (typeof globalThis.CustomEvent === 'undefined') {
    globalThis.CustomEvent = class CustomEvent {
        constructor(type, opts) {
            this.type = type;
            Object.assign(this, opts);
        }
    };
}
