import {
	allocateImageId,
	calculateImageRows,
	encodeKittyPlaceholder,
	getCapabilities,
	getCellDimensions,
	getImageDimensions,
	type ImageDimensions,
	imageFallback,
	renderImage,
	transmitKittyImage,
} from "../terminal-image.js";
import type { Component } from "../tui.js";

export interface ImageTheme {
	fallbackColor: (str: string) => string;
}

export interface ImageOptions {
	maxWidthCells?: number;
	maxHeightCells?: number;
	filename?: string;
	/** Kitty image ID. If provided, reuses this ID (for animations/updates). */
	imageId?: number;
}

export class Image implements Component {
	private base64Data: string;
	private mimeType: string;
	private dimensions: ImageDimensions;
	private theme: ImageTheme;
	private options: ImageOptions;
	private imageId: number;
	private transmitted = false;

	private cachedLines?: string[];
	private cachedWidth?: number;

	constructor(
		base64Data: string,
		mimeType: string,
		theme: ImageTheme,
		options: ImageOptions = {},
		dimensions?: ImageDimensions,
	) {
		this.base64Data = base64Data;
		this.mimeType = mimeType;
		this.theme = theme;
		this.options = options;
		this.dimensions = dimensions || getImageDimensions(base64Data, mimeType) || { widthPx: 800, heightPx: 600 };
		this.imageId = options.imageId ?? allocateImageId();
	}

	/** Get the Kitty image ID used by this image (if any). */
	getImageId(): number | undefined {
		return this.imageId;
	}

	invalidate(): void {
		this.cachedLines = undefined;
		this.cachedWidth = undefined;
		this.transmitted = false;
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const maxWidth = Math.min(width - 2, this.options.maxWidthCells ?? 60);

		const caps = getCapabilities();
		let lines: string[];

		if (caps.images === "kitty") {
			// Unicode placeholder mode: transmit image data once, then
			// embed placeholder characters in the text flow.  The terminal
			// renders image pixels on top of the placeholders, so images
			// scroll naturally with content in both scrollback and fullscreen.
			const rows = calculateImageRows(this.dimensions, maxWidth, getCellDimensions());
			lines = encodeKittyPlaceholder(this.imageId, maxWidth, rows);

			if (!this.transmitted) {
				// Prepend the transmit sequence to the first placeholder line.
				// It's zero-width (q=2 suppresses responses) so it won't affect layout.
				const transmit = transmitKittyImage(this.base64Data, this.imageId, maxWidth, rows);
				lines[0] = transmit + lines[0];
				this.transmitted = true;
			}
		} else if (caps.images) {
			// Direct display mode (a=T): used for iTerm2.
			const result = renderImage(this.base64Data, this.dimensions, {
				maxWidthCells: maxWidth,
				imageId: this.imageId,
			});

			if (result) {
				lines = [];
				for (let i = 0; i < result.rows - 1; i++) {
					lines.push("");
				}
				const moveUp = result.rows > 1 ? `\x1b[${result.rows - 1}A` : "";
				lines.push(moveUp + result.sequence);
			} else {
				const fallback = imageFallback(this.mimeType, this.dimensions, this.options.filename);
				lines = [this.theme.fallbackColor(fallback)];
			}
		} else {
			const fallback = imageFallback(this.mimeType, this.dimensions, this.options.filename);
			lines = [this.theme.fallbackColor(fallback)];
		}

		this.cachedLines = lines;
		this.cachedWidth = width;

		return lines;
	}
}
