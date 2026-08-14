import { JSDOM } from "jsdom";
import '@testing-library/jest-dom'

if (typeof document === "undefined") {
  const { window } = new JSDOM("<!doctype html><html><body></body></html>");

  Object.assign(globalThis, {
    document: window.document,
    HTMLElement: window.HTMLElement,
    HTMLImageElement: window.HTMLImageElement,
    navigator: window.navigator,
    window,
  });
}

// React's legacy input-event polyfill probes these IE-only methods in jsdom.
// Defining harmless shims keeps test output focused on actual failures.
Object.defineProperties(HTMLElement.prototype, {
  attachEvent: { configurable: true, value: () => undefined },
  detachEvent: { configurable: true, value: () => undefined },
});
