import { describe, expect, it } from "vitest";
import { Container, TUI } from "../src/tui.js";
import { VirtualTerminal } from "./virtual-terminal.js";

/** Simple text component for testing */
class SimpleText {
	private lines: string[];
	constructor(text: string) {
		this.lines = text.split("\n");
	}
	render(width: number): string[] {
		return this.lines.map((l) => l.slice(0, width));
	}
	invalidate(): void {}
}

function createFullscreenTUI(cols = 40, rows = 12) {
	const terminal = new VirtualTerminal(cols, rows);
	const tui = new TUI(terminal);

	const header = new Container();
	header.addChild(new SimpleText("=== Header ==="));

	const content = new Container();

	const editor = new Container();
	editor.addChild(new SimpleText("> "));

	const footer = new Container();
	footer.addChild(new SimpleText("[footer]"));

	tui.setRegion("header", header);
	tui.setRegion("content", content);
	tui.setRegion("editor", editor);
	tui.setRegion("footer", footer);

	// Use minRows=3 for tests so small terminals still work
	tui.setFullscreen(true, { minRows: 3 });

	return { terminal, tui, header, content, editor, footer };
}

describe("TUI fullscreen mode", () => {
	it("should enter alternate screen and render regions", async () => {
		const { terminal, tui, content } = createFullscreenTUI(40, 12);
		content.addChild(new SimpleText("Hello world"));

		tui.start();

		await terminal.waitForRender();
		const viewport = await terminal.flushAndGetViewport();

		expect(terminal.isAlternateScreen).toBe(true);
		// Header on first line
		expect(viewport[0]).toContain("Header");
		// Content somewhere in the middle
		expect(viewport.some((l) => l.includes("Hello world"))).toBe(true);
		// Footer on last line
		expect(viewport[11]).toContain("footer");
		// Editor above footer
		expect(viewport[10]).toContain("> ");

		tui.stop();
		expect(terminal.isAlternateScreen).toBe(false);
	});

	it("should fill exactly terminal height", async () => {
		const { terminal, tui, content } = createFullscreenTUI(40, 8);
		content.addChild(new SimpleText("Line 1"));

		tui.start();
		await terminal.waitForRender();
		const viewport = await terminal.flushAndGetViewport();

		// Should have exactly 8 lines (rows)
		expect(viewport.length).toBe(8);

		tui.stop();
	});

	it("should auto-scroll to bottom when content grows", async () => {
		const { terminal, tui, content } = createFullscreenTUI(40, 12);
		// header=1, editor=1, footer=1 => content area = 9 lines
		const lines: string[] = [];
		for (let i = 0; i < 20; i++) {
			lines.push(`Line ${i}`);
		}
		content.addChild(new SimpleText(lines.join("\n")));

		tui.start();
		await terminal.waitForRender();
		const viewport = await terminal.flushAndGetViewport();

		// Should show the last lines (auto-scroll to bottom)
		expect(viewport.some((l) => l.includes("Line 19"))).toBe(true);
		// And first content lines should NOT be visible
		expect(viewport.some((l) => l.includes("Line 0"))).toBe(false);

		tui.stop();
	});

	it("should support scrolling up and back down", async () => {
		const { terminal, tui, content } = createFullscreenTUI(40, 12);
		const lines: string[] = [];
		for (let i = 0; i < 30; i++) {
			lines.push(`Line ${i}`);
		}
		content.addChild(new SimpleText(lines.join("\n")));

		tui.start();
		await terminal.waitForRender();

		// Scroll to top
		tui.scrollContentToTop();
		await terminal.waitForRender();
		const viewport = await terminal.flushAndGetViewport();

		// First content line should now be visible
		expect(viewport.some((l) => l.includes("Line 0"))).toBe(true);
		expect(tui.isContentScrolledUp).toBe(true);

		// Scroll back to bottom
		tui.scrollContentToBottom();
		await terminal.waitForRender();
		const viewport2 = await terminal.flushAndGetViewport();

		expect(viewport2.some((l) => l.includes("Line 29"))).toBe(true);
		expect(tui.isContentScrolledUp).toBe(false);

		tui.stop();
	});

	it("should restore fullscreen after stop/start cycle", async () => {
		const { terminal, tui, content } = createFullscreenTUI(40, 12);
		content.addChild(new SimpleText("Restored"));

		tui.start();
		await terminal.waitForRender();
		expect(terminal.isAlternateScreen).toBe(true);

		// Stop (simulating external editor)
		tui.stop();
		expect(terminal.isAlternateScreen).toBe(false);

		// Start again
		tui.start();
		await terminal.waitForRender();
		expect(terminal.isAlternateScreen).toBe(true);

		const viewport = await terminal.flushAndGetViewport();
		expect(viewport.some((l) => l.includes("Restored"))).toBe(true);

		tui.stop();
	});

	it("should show 'terminal too small' when rows < minRows", async () => {
		const terminal = new VirtualTerminal(40, 5);
		const tui = new TUI(terminal);
		tui.setFullscreen(true, { minRows: 10 });
		tui.start();
		await terminal.waitForRender();
		const viewport = await terminal.flushAndGetViewport();

		expect(viewport.some((l) => l.includes("Terminal too small"))).toBe(true);

		tui.stop();
	});

	it("should perform differential rendering (only changed lines)", async () => {
		const { terminal, tui, content } = createFullscreenTUI(40, 12);
		content.addChild(new SimpleText("Initial"));

		tui.start();
		await terminal.waitForRender();

		const redraws1 = tui.fullRedraws;

		// Trigger another render without changes
		tui.requestRender();
		await terminal.waitForRender();

		// No full redraw should have happened (differential found no changes)
		expect(tui.fullRedraws).toBe(redraws1);

		tui.stop();
	});

	it("should scroll by page", async () => {
		const { terminal, tui, content } = createFullscreenTUI(40, 12);
		// header=1, editor=1, footer=1 => content area = 9 lines
		const lines: string[] = [];
		for (let i = 0; i < 30; i++) {
			lines.push(`Line ${i}`);
		}
		content.addChild(new SimpleText(lines.join("\n")));

		tui.start();
		await terminal.waitForRender();

		// Scroll up by one page
		tui.scrollContentPage(-1);
		await terminal.waitForRender();
		const viewport = await terminal.flushAndGetViewport();

		// Should have scrolled up from the bottom
		expect(tui.isContentScrolledUp).toBe(true);
		// The last line should no longer be visible
		expect(viewport.some((l) => l.includes("Line 29"))).toBe(false);

		tui.stop();
	});
});
