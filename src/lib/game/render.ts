import { SHAHED_LEN, STAGE, STING_LEN, TARGET } from './config';
import { PALETTE, STING_EXTENT, drawShahed, drawSting, stingSilhouette } from './shapes';

export interface Scene {
	/** Секунди, лише для живих деталей: пропелери, туман, пульс. */
	t: number;
	shahedX: number | null;
	stingX: number | null;
	/** px/с для розмиття; 0 — Стінг зупинений. */
	stingSpeed: number;
	shahedSpeed: number;
	outline: 'off' | 'idle' | 'win';
	/** Зсув зупиненого Стінга від контуру — малюємо мірну лінію. */
	measure: number | null;
}

function mulberry(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function canvas(w: number, h: number) {
	const c = document.createElement('canvas');
	c.width = Math.max(1, Math.round(w));
	c.height = Math.max(1, Math.round(h));
	return c;
}

/** Димний сірий фон, як на слайді ТЗ: світліше в центрі, темні кути, пасма туману, зерно. */
function makeBackground(w: number, h: number, scale: number) {
	const c = canvas(w, h);
	const ctx = c.getContext('2d')!;
	ctx.fillStyle = '#121212';
	ctx.fillRect(0, 0, w, h);
	const g = ctx.createRadialGradient(w / 2, h * 0.48, 0, w / 2, h * 0.5, Math.hypot(w, h) * 0.55);
	g.addColorStop(0, '#3a3a3a');
	g.addColorStop(0.55, '#222222');
	g.addColorStop(1, '#0a0a0a');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, w, h);

	const rand = mulberry(7);
	for (let i = 0; i < 46; i++) {
		const x = rand() * w;
		const y = rand() * h;
		const r = (140 + rand() * 420) * scale;
		const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
		const a = 0.012 + rand() * 0.03;
		blob.addColorStop(0, `rgba(255,255,255,${a})`);
		blob.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.fillStyle = blob;
		ctx.fillRect(x - r, y - r, r * 2, r * 2);
	}

	const tile = canvas(192, 192);
	const tctx = tile.getContext('2d')!;
	const img = tctx.createImageData(192, 192);
	for (let i = 0; i < img.data.length; i += 4) {
		const v = rand() * 255;
		img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
		img.data[i + 3] = 10;
	}
	tctx.putImageData(img, 0, 0);
	ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
	ctx.fillRect(0, 0, w, h);
	return c;
}

/**
 * Контур навколо обʼєднаного силуету: заливка й товста обводка кожної частини,
 * потім внутрішність вирізається — лишається тільки зовнішня лінія.
 */
function makeOutline(scale: number, color: string, fill: string, width: number) {
	const size = STING_EXTENT * 2 + width * 4;
	const c = canvas(size * scale, size * scale);
	const ctx = c.getContext('2d')!;
	ctx.setTransform(scale, 0, 0, scale, (size * scale) / 2, (size * scale) / 2);
	const parts = stingSilhouette();
	ctx.fillStyle = color;
	ctx.strokeStyle = color;
	ctx.lineWidth = width * 2;
	ctx.lineJoin = 'round';
	for (const p of parts) {
		ctx.fill(p);
		ctx.stroke(p);
	}
	ctx.globalCompositeOperation = 'destination-out';
	for (const p of parts) ctx.fill(p);
	ctx.globalCompositeOperation = 'source-over';
	ctx.fillStyle = fill;
	for (const p of parts) ctx.fill(p);
	return c;
}

export class Renderer {
	private ctx: CanvasRenderingContext2D;
	private scale = 1;
	private bg: HTMLCanvasElement | null = null;
	private outlineIdle: HTMLCanvasElement | null = null;
	private outlineWin: HTMLCanvasElement | null = null;

	constructor(private el: HTMLCanvasElement) {
		this.ctx = el.getContext('2d', { alpha: false })!;
	}

	resize(cssW: number, cssH: number, dpr: number) {
		const w = Math.max(1, Math.round(cssW * dpr));
		const h = Math.max(1, Math.round(cssH * dpr));
		if (w === this.el.width && h === this.el.height && this.bg) return;
		this.el.width = w;
		this.el.height = h;
		this.scale = w / STAGE.w;
		this.bg = makeBackground(w, h, this.scale);
		this.outlineIdle = makeOutline(this.scale, 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.05)', 3);
		this.outlineWin = makeOutline(this.scale, PALETTE.yellow, 'rgba(242,194,0,0.08)', 4);
	}

	draw(s: Scene) {
		const { ctx, scale } = this;
		if (!this.bg) return;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalAlpha = 1;
		ctx.drawImage(this.bg, 0, 0);
		ctx.setTransform(scale, 0, 0, scale, 0, 0);
		this.fog(s.t);

		if (s.shahedX !== null) this.blurred(s.shahedX, s.shahedSpeed, 2, SHAHED_LEN, () => drawShahed(ctx));
		if (s.stingX !== null) {
			if (s.stingSpeed > 0) this.streak(s.stingX, s.stingSpeed);
			const spin = s.t * 40;
			this.blurred(s.stingX, s.stingSpeed, 5, STING_LEN, () => drawSting(ctx, spin));
		}

		const outline = s.outline === 'win' ? this.outlineWin : s.outline === 'idle' ? this.outlineIdle : null;
		if (outline) {
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.drawImage(outline, TARGET.x * scale - outline.width / 2, TARGET.y * scale - outline.height / 2);
			ctx.setTransform(scale, 0, 0, scale, 0, 0);
		}
		if (s.measure !== null && s.stingX !== null) this.ruler(s.stingX);
	}

	private fog(t: number) {
		const { ctx } = this;
		for (let i = 0; i < 2; i++) {
			const x = ((t * (14 + i * 9) + i * 900) % (STAGE.w + 1200)) - 600;
			const y = STAGE.h * (0.3 + i * 0.4);
			const g = ctx.createRadialGradient(x, y, 0, x, y, 620);
			g.addColorStop(0, 'rgba(255,255,255,0.035)');
			g.addColorStop(1, 'rgba(255,255,255,0)');
			ctx.fillStyle = g;
			ctx.fillRect(x - 620, y - 620, 1240, 1240);
		}
	}

	/** Розмиття руху — кілька прозорих копій позаду. */
	private blurred(x: number, speed: number, ghosts: number, len: number, draw: () => void) {
		const { ctx } = this;
		if (x < -len || x > STAGE.w + len) return;
		const n = speed > 0 ? ghosts : 0;
		for (let k = n; k >= 0; k--) {
			ctx.save();
			ctx.globalAlpha = k === 0 ? 1 : 0.3 * (1 - k / (n + 1));
			ctx.translate(x - k * speed * 0.011, TARGET.y);
			draw();
			ctx.restore();
		}
	}

	private streak(x: number, speed: number) {
		const { ctx } = this;
		const tail = x - STING_LEN * 0.45;
		const from = tail - speed * 0.14;
		const g = ctx.createLinearGradient(from, 0, tail, 0);
		g.addColorStop(0, 'rgba(242,194,0,0)');
		g.addColorStop(1, 'rgba(242,194,0,0.22)');
		ctx.fillStyle = g;
		ctx.fillRect(from, TARGET.y - 22, tail - from, 44);
		ctx.fillStyle = 'rgba(255,255,255,0.05)';
		for (const dy of [-150, 150]) ctx.fillRect(from + 80, TARGET.y + dy - 1, tail - from - 140, 2);
	}

	/** Мірна лінія: де мав бути центр і де Стінг зупинився. */
	private ruler(stingX: number) {
		const { ctx } = this;
		const top = TARGET.y - STING_EXTENT;
		const y = TARGET.y + STING_EXTENT + 24;
		ctx.lineWidth = 2;
		ctx.setLineDash([8, 8]);
		ctx.strokeStyle = 'rgba(255,255,255,0.45)';
		ctx.beginPath();
		ctx.moveTo(TARGET.x, top);
		ctx.lineTo(TARGET.x, y + 14);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.strokeStyle = PALETTE.yellow;
		ctx.beginPath();
		ctx.moveTo(stingX, top);
		ctx.lineTo(stingX, y + 14);
		ctx.moveTo(TARGET.x, y);
		ctx.lineTo(stingX, y);
		ctx.stroke();
	}
}
