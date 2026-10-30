import { SHAHED_LEN, STAGE, STING_HALF_SPAN, STING_LEN, TARGET } from './config';
import shahedSvg from './sprites/shahed.svg?raw';
import stingSvg from './sprites/sting.svg?raw';

export interface Scene {
	/** Секунди, лише для живих деталей: туман. */
	t: number;
	/** Секунди для кута лопатей; на паузі не рухається, тож лопаті завмирають. */
	propT: number;
	shahedX: number | null;
	stingX: number | null;
	/** px/с для розмиття; 0 — Стінг зупинений. */
	stingSpeed: number;
	shahedSpeed: number;
	outline: 'off' | 'idle' | 'win';
	/** Зсув зупиненого Стінга від контуру — малюємо мірну лінію. */
	measure: number | null;
}

const ACCENT = '#f2c200';
/** Колір корпусу Стінга — для шлейфу. */
const KHAKI = '196, 176, 119';

// Розміри viewBox у SVG: довжина дрона — 1000 одиниць.
const STING_BOX = { w: 1, h: 0.88 };
const SHAHED_BOX = { w: 1.02, h: 0.74 };

/** Гвинт у координатах SVG дрона; dir — напрям обертання, phase — щоб гвинти не крутились синхронно. */
interface Prop {
	x: number;
	y: number;
	r: number;
	dir: 1 | -1;
	phase: number;
}

// У Стінга по два мотори на бік, гвинти позаду моторів; задня пара малюється першою.
const STING_PROPS: Prop[] = [
	{ x: -300, y: -290, r: 148, dir: -1, phase: 0.9 },
	{ x: -300, y: 290, r: 148, dir: 1, phase: 2.1 },
	{ x: -292, y: -346, r: 154, dir: 1, phase: 0 },
	{ x: -292, y: 346, r: 154, dir: -1, phase: 1.3 }
];
const SHAHED_PROPS: Prop[] = [{ x: -508, y: 0, r: 125, dir: 1, phase: 0.4 }];

/** Видима швидкість обертання, об/с: справжню око не розгледить, а так видно, що крутиться. */
const PROP_REV = 7;
/** Площина гвинта перпендикулярна польоту, згори його видно майже ребром. */
const PROP_SQUASH = 0.28;

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

function loadSvg(svg: string): Promise<HTMLImageElement> {
	const img = new Image();
	img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	return img.decode().then(() => img);
}

function raster(img: HTMLImageElement, w: number, h: number) {
	const c = canvas(w, h);
	c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
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
 * Контур будується з прозорості самого спрайта: силует, зсунутий по колу на товщину
 * лінії, мінус сам силует. Тож контур завжди точно повторює малюнок, хоч би який він був.
 */
function makeOutline(sprite: HTMLCanvasElement, ring: number, color: string, fillAlpha: number) {
	const mask = canvas(sprite.width, sprite.height);
	const mctx = mask.getContext('2d')!;
	mctx.drawImage(sprite, 0, 0);
	mctx.globalCompositeOperation = 'source-in';
	mctx.fillStyle = color;
	mctx.fillRect(0, 0, mask.width, mask.height);

	const pad = Math.ceil(ring) + 2;
	const out = canvas(mask.width + pad * 2, mask.height + pad * 2);
	const ctx = out.getContext('2d')!;
	const steps = 32;
	for (let i = 0; i < steps; i++) {
		const a = (i / steps) * Math.PI * 2;
		ctx.drawImage(mask, pad + Math.cos(a) * ring, pad + Math.sin(a) * ring);
	}
	ctx.globalCompositeOperation = 'destination-out';
	ctx.drawImage(mask, pad, pad);
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = fillAlpha;
	ctx.drawImage(mask, pad, pad);
	return out;
}

export class Renderer {
	private ctx: CanvasRenderingContext2D;
	private scale = 1;
	private images: { sting: HTMLImageElement; shahed: HTMLImageElement } | null = null;
	private bg: HTMLCanvasElement | null = null;
	private sting: HTMLCanvasElement | null = null;
	private shahed: HTMLCanvasElement | null = null;
	private outlineIdle: HTMLCanvasElement | null = null;
	private outlineWin: HTMLCanvasElement | null = null;

	constructor(private el: HTMLCanvasElement) {
		this.ctx = el.getContext('2d', { alpha: false })!;
		Promise.all([loadSvg(stingSvg), loadSvg(shahedSvg)]).then(([sting, shahed]) => {
			this.images = { sting, shahed };
			this.rebuildSprites();
		});
	}

	resize(cssW: number, cssH: number, dpr: number) {
		const w = Math.max(1, Math.round(cssW * dpr));
		const h = Math.max(1, Math.round(cssH * dpr));
		if (w === this.el.width && h === this.el.height && this.bg) return;
		this.el.width = w;
		this.el.height = h;
		this.scale = w / STAGE.w;
		this.bg = makeBackground(w, h, this.scale);
		this.rebuildSprites();
	}

	/** SVG растеризується під поточний розмір екрана, щоб на 86" не було мила. */
	private rebuildSprites() {
		if (!this.images || !this.bg) return;
		const s = this.scale;
		this.sting = raster(this.images.sting, STING_LEN * STING_BOX.w * s, STING_LEN * STING_BOX.h * s);
		this.shahed = raster(this.images.shahed, SHAHED_LEN * SHAHED_BOX.w * s, SHAHED_LEN * SHAHED_BOX.h * s);
		this.outlineIdle = makeOutline(this.sting, 3 * s, 'rgba(255,255,255,0.92)', 0.07);
		this.outlineWin = makeOutline(this.sting, 4 * s, ACCENT, 0.12);
	}

	draw(s: Scene) {
		const { ctx, scale } = this;
		if (!this.bg) return;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalAlpha = 1;
		ctx.drawImage(this.bg, 0, 0);
		ctx.setTransform(scale, 0, 0, scale, 0, 0);
		this.fog(s.t);
		ctx.setTransform(1, 0, 0, 1, 0, 0);

		if (this.shahed && s.shahedX !== null && this.blurred(this.shahed, s.shahedX, s.shahedSpeed, 2)) {
			this.props(SHAHED_PROPS, s.shahedX, SHAHED_LEN, s.propT, s.shahedSpeed > 0, '150, 153, 157');
		}
		if (this.sting && s.stingX !== null) {
			if (s.stingSpeed > 0) this.streak(s.stingX, s.stingSpeed);
			if (this.blurred(this.sting, s.stingX, s.stingSpeed, 5)) {
				this.props(STING_PROPS, s.stingX, STING_LEN, s.propT, s.stingSpeed > 0, '226, 226, 222');
			}
		}

		const outline = s.outline === 'win' ? this.outlineWin : s.outline === 'idle' ? this.outlineIdle : null;
		if (outline) this.sprite(outline, TARGET.x, 1);
		ctx.globalAlpha = 1;
		if (s.measure !== null && s.stingX !== null) this.ruler(s.stingX);
	}

	/** Спрайт по центру в точці (x, TARGET.y) сцени; трансформація — одинична. */
	private sprite(img: HTMLCanvasElement, x: number, alpha: number) {
		this.ctx.globalAlpha = alpha;
		this.ctx.drawImage(img, x * this.scale - img.width / 2, TARGET.y * this.scale - img.height / 2);
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

	/** Лопать-листок від втулки до кінця в проєкції диска ребром; додається до поточного шляху. */
	private blade(cx: number, cy: number, rx: number, r: number, a: number) {
		const dx = rx * Math.sin(a);
		const dy = r * Math.cos(a);
		const len = Math.hypot(dx, dy) || 1;
		const nx = -dy / len;
		const ny = dx / len;
		const at = (s: number, w: number) => [cx + dx * s + nx * w * r, cy + dy * s + ny * w * r] as const;
		const pts = [at(0.1, 0.05), at(0.5, 0.1), at(1, 0.03), at(1, -0.03), at(0.5, -0.07), at(0.1, -0.04)];
		this.ctx.moveTo(...pts[0]);
		for (const p of pts.slice(1)) this.ctx.lineTo(...p);
		this.ctx.closePath();
	}

	/** Розмиття руху — кілька прозорих копій позаду. false — дрон за межами екрана. */
	private blurred(img: HTMLCanvasElement, x: number, speed: number, ghosts: number) {
		const half = img.width / this.scale / 2;
		if (x < -half || x > STAGE.w + half) return false;
		const n = speed > 0 ? ghosts : 0;
		for (let k = n; k >= 0; k--) {
			this.sprite(img, x - k * speed * 0.011, k === 0 ? 1 : 0.3 * (1 - k / (n + 1)));
		}
		this.ctx.globalAlpha = 1;
		return true;
	}

	/**
	 * Гвинти: у русі — прозорий диск і дві лопаті зі шлейфом, на паузі — лише чіткі лопаті,
	 * як на кадрі з короткою витримкою.
	 */
	private props(list: Prop[], x: number, len: number, t: number, spinning: boolean, rgb: string) {
		const { ctx, scale } = this;
		const u = len / 1000;
		ctx.setTransform(scale, 0, 0, scale, 0, 0);
		ctx.lineCap = 'round';
		for (const p of list) {
			const cx = x + p.x * u;
			const cy = TARGET.y + p.y * u;
			const r = p.r * u;
			const rx = r * PROP_SQUASH;
			const theta = p.dir * t * Math.PI * 2 * PROP_REV + p.phase;

			if (spinning) {
				ctx.fillStyle = `rgba(${rgb},0.09)`;
				ctx.strokeStyle = `rgba(${rgb},0.2)`;
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.ellipse(cx, cy, rx, r, 0, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
			}

			const trail = spinning ? 8 : 1;
			for (let j = trail - 1; j >= 0; j--) {
				ctx.fillStyle = `rgba(${rgb},${spinning ? 0.5 * (1 - j / trail) ** 1.6 : 0.92})`;
				ctx.beginPath();
				for (const blade of [0, Math.PI]) this.blade(cx, cy, rx, r, theta + blade - p.dir * j * 0.11);
				ctx.fill();
				if (!spinning) {
					ctx.strokeStyle = 'rgba(0,0,0,0.35)';
					ctx.lineWidth = 1;
					ctx.stroke();
				}
			}

			ctx.fillStyle = '#2b2b2b';
			ctx.beginPath();
			ctx.arc(cx, cy, r * 0.09, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = `rgba(${rgb},0.9)`;
			ctx.beginPath();
			ctx.arc(cx, cy, r * 0.045, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.setTransform(1, 0, 0, 1, 0, 0);
	}

	private streak(x: number, speed: number) {
		const { ctx, scale } = this;
		ctx.setTransform(scale, 0, 0, scale, 0, 0);
		const tail = x - STING_LEN * 0.4;
		const from = tail - speed * 0.14;
		const g = ctx.createLinearGradient(from, 0, tail, 0);
		g.addColorStop(0, `rgba(${KHAKI},0)`);
		g.addColorStop(1, `rgba(${KHAKI},0.28)`);
		ctx.fillStyle = g;
		ctx.fillRect(from, TARGET.y - 40, tail - from, 80);
		ctx.fillStyle = 'rgba(255,255,255,0.06)';
		for (const dy of [-130, 130]) ctx.fillRect(from + 80, TARGET.y + dy - 1, tail - from - 140, 2);
		ctx.setTransform(1, 0, 0, 1, 0, 0);
	}

	/** Мірна лінія: де мав бути центр і де Стінг зупинився. */
	private ruler(stingX: number) {
		const { ctx, scale } = this;
		ctx.setTransform(scale, 0, 0, scale, 0, 0);
		const top = TARGET.y - STING_HALF_SPAN - 20;
		const y = TARGET.y + STING_HALF_SPAN + 30;
		ctx.lineWidth = 2;
		ctx.setLineDash([8, 8]);
		ctx.strokeStyle = 'rgba(255,255,255,0.45)';
		ctx.beginPath();
		ctx.moveTo(TARGET.x, top);
		ctx.lineTo(TARGET.x, y + 14);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.strokeStyle = ACCENT;
		ctx.beginPath();
		ctx.moveTo(stingX, top);
		ctx.lineTo(stingX, y + 14);
		ctx.moveTo(TARGET.x, y);
		ctx.lineTo(stingX, y);
		ctx.stroke();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
	}
}
