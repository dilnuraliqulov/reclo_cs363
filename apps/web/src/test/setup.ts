import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  // The locale provider remembers a choice here, so one test's language must not reach the next.
  window.localStorage.clear()
})

// jsdom has no matchMedia; sonner and next-themes call it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

// jsdom implements none of the pointer-capture APIs, and Radix's Select calls them while opening.
// Without these, any test that opens a Select throws "hasPointerCapture is not a function".
// They go on Element, where jsdom would define them, so a test that stubs one of these on
// Element.prototype still wins — on HTMLElement they would shadow it instead.
Object.assign(window.Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => {},
  releasePointerCapture: () => {},
  scrollIntoView: () => {},
})

// jsdom has no ResizeObserver, and Radix's Switch measures its hidden checkbox with one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver ??= ResizeObserverStub
