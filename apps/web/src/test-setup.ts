/// <reference types="@testing-library/jest-dom" />
import { expect } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)

// jsdom does not implement ResizeObserver
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    private cb: ResizeObserverCallback
    constructor(cb: ResizeObserverCallback) { this.cb = cb }
    observe() {
      // Fire immediately with reasonable default dimensions for tests
      this.cb([{ contentRect: { width: 800, height: 180, x: 0, y: 0, top: 0, left: 0, bottom: 180, right: 800, toJSON: () => ({}) } } as ResizeObserverEntry], this)
    }
    unobserve() {}
    disconnect() {}
  }
}
