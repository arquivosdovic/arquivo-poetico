// DOM real via happy-dom — só para os testes de renderização/interação
// (ver render-dom.test.js). Diferente de dom-shim.js (que é um "boneco de
// pano" sem comportamento de verdade), este helper cria uma janela e um
// document de verdade: innerHTML é parseado, querySelector/getElementById
// funcionam, addEventListener/dispatchEvent disparam de verdade — dá pra
// testar tanto "o HTML renderizado tem o atributo certo" quanto "clicar
// aqui chama aquilo ali", que é exatamente o que dom-shim.js não permite.
//
// happy-dom é dev-dependency só de teste (ver package.json) — o app em
// produção continua vanilla JS, sem bundler e sem esse pacote.
import { Window } from 'happy-dom';

const window = new Window({ url: 'http://localhost/' });

globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.CustomEvent = window.CustomEvent;
globalThis.Event = window.Event;
globalThis.HTMLElement = window.HTMLElement;
globalThis.MouseEvent = window.MouseEvent;
globalThis.Node = window.Node;

// Nota: rodar ações que chamam save() (ex.: excluir um item) imprime um
// aviso do autobackup.js ("Não foi possível gravar o snapshot automático:
// ReferenceError: indexedDB is not defined") no stdout dos testes. É
// esperado — happy-dom não implementa IndexedDB, e o autobackup já é
// desenhado pra falhar em silêncio nesse caso (try/catch em
// tirarSnapshotSeNecessario, ver autobackup.js) sem derrubar o save()
// principal. Não indica teste quebrado.

export { window };
