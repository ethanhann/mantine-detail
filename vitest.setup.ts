import "@testing-library/jest-dom/vitest";
import { expect, vi } from "vitest";
import type { AxeMatchers } from "vitest-axe/matchers";
import * as matchers from "vitest-axe/matchers";

expect.extend(matchers);

declare module "vitest" {
	// biome-ignore lint/suspicious/noExplicitAny: must match vitest's Assertion<T = any> signature exactly to merge.
	interface Assertion<T = any> extends AxeMatchers {}
	interface AsymmetricMatchersContaining extends AxeMatchers {}
}

// jsdom lacks matchMedia, which Mantine's color-scheme provider reads on mount.
Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: (query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatchEvent: vi.fn(),
	}),
});

// jsdom lacks ResizeObserver, used by Mantine ScrollArea inside Drawer/Modal.
class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver ??=
	ResizeObserverStub as unknown as typeof ResizeObserver;
