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

// Polyfill for IE methods that jsdom doesn't support
// This is needed for React DOM's input event polyfill
if (typeof Element !== 'undefined' && !Element.prototype.attachEvent) {
  Element.prototype.attachEvent = function(event: string, handler: EventListener) {
    const eventName = event.replace(/^on/, '');
    this.addEventListener(eventName, handler as any);
  };
  
  Element.prototype.detachEvent = function(event: string, handler: EventListener) {
    const eventName = event.replace(/^on/, '');
    this.removeEventListener(eventName, handler as any);
  };
}
