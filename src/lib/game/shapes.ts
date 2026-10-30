// Дрони згори, ніс праворуч, центр у (0, 0), розміри — у пікселях сцени.
// Стінг перемальований з рендера в ТЗ; коли будуть кращі зображення — міняти тут.
import { SHAHED_LEN as SL, STING_LEN as L } from './config';

export const PALETTE = {
	yellow: '#f2c200',
	yellowDark: '#cf9f00',
	yellowLight: '#ffe27a',
	ink: '#161616',
	shahedBody: '#727474',
	shahedWing: '#585a5a',
	shahedEdge: '#8a8c8c'
} as const;

const H = 0.1 * L; // півширина фюзеляжу Стінга
const TIP = 0.45 * L; // y кінця крила, де стоять мотори
const NACELLE = { x0: -0.34 * L, x1: 0.1 * L, hw: 0.04 * L };
/** Штовхальний пропелер згори видно ребром — тонкою рискою позаду мотогондоли. */
const PROP = { x: NACELLE.x0 - 6, r: 0.14 * L };

function rr(x: number, y: number, w: number, h: number, r: number): Path2D {
	const p = new Path2D();
	p.roundRect(x, y, w, h, r);
	return p;
}

function poly(points: [number, number][]): Path2D {
	const p = new Path2D();
	points.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
	p.closePath();
	return p;
}

function stingParts() {
	const fuselage = new Path2D();
	fuselage.moveTo(-0.5 * L, -0.7 * H);
	fuselage.lineTo(0.5 * L - H, -H);
	fuselage.arc(0.5 * L - H, 0, H, -Math.PI / 2, Math.PI / 2);
	fuselage.lineTo(-0.5 * L, 0.7 * H);
	fuselage.closePath();

	const wing = rr(-0.12 * L, -TIP, 0.15 * L, 2 * TIP, 8);
	const pods = [-1, 1].map((s) =>
		rr(NACELLE.x0, s * TIP - NACELLE.hw, NACELLE.x1 - NACELLE.x0, 2 * NACELLE.hw, NACELLE.hw)
	);
	const fins = [-1, 1].map((s) =>
		poly([
			[-0.34 * L, s * 0.6 * H],
			[-0.47 * L, s * 0.2 * L],
			[-0.52 * L, s * 0.2 * L],
			[-0.48 * L, s * 0.6 * H]
		])
	);
	return { fuselage, wing, pods, fins };
}

function shahedParts() {
	const fuselage = rr(-0.5 * SL, -0.055 * SL, SL, 0.11 * SL, 0.055 * SL);
	// У Shahed-136 дельта починається майже від носа.
	const wing = poly([
		[0.36 * SL, 0],
		[-0.36 * SL, -0.36 * SL],
		[-0.46 * SL, -0.36 * SL],
		[-0.42 * SL, 0],
		[-0.46 * SL, 0.36 * SL],
		[-0.36 * SL, 0.36 * SL]
	]);
	const winglets = [-1, 1].map((s) => rr(-0.47 * SL, s * 0.36 * SL - 5, 0.16 * SL, 10, 4));
	const prop = rr(-0.52 * SL, -0.1 * SL, 8, 0.2 * SL, 4);
	return { fuselage, wing, winglets, prop };
}

let sting: ReturnType<typeof stingParts> | undefined;
let shahed: ReturnType<typeof shahedParts> | undefined;
const S = () => (sting ??= stingParts());
const SH = () => (shahed ??= shahedParts());

/** Частини силуету Стінга; заливати кожну окремо — так виходить обʼєднання без дірок. */
export function stingSilhouette(): Path2D[] {
	const p = S();
	return [p.fuselage, p.wing, ...p.pods, ...p.fins];
}

/** Півдіагональ рамки, у яку гарантовано влазить силует Стінга. */
export const STING_EXTENT = 0.6 * L;

export function drawSting(ctx: CanvasRenderingContext2D, spin: number) {
	const p = S();
	ctx.fillStyle = PALETTE.yellowDark;
	p.fins.forEach((f) => ctx.fill(f));
	ctx.fillStyle = PALETTE.yellowDark;
	ctx.fill(p.wing);
	ctx.fillStyle = PALETTE.yellowLight;
	ctx.fillRect(0.03 * L - 4, -0.46 * L + 8, 4, 0.92 * L - 16);

	ctx.fillStyle = PALETTE.ink;
	p.pods.forEach((f) => ctx.fill(f));

	// Лопаті, що обертаються: риска пульсує по довжині, як у сповільненій зйомці.
	for (const s of [-1, 1]) {
		const r = PROP.r * (0.75 + 0.25 * Math.abs(Math.cos(spin + s)));
		ctx.fillStyle = 'rgba(22, 22, 22, 0.55)';
		ctx.beginPath();
		ctx.roundRect(PROP.x - 4, s * TIP - r, 8, 2 * r, 4);
		ctx.fill();
		ctx.fillStyle = 'rgba(22, 22, 22, 0.9)';
		ctx.beginPath();
		ctx.arc(PROP.x + 2, s * TIP, 6, 0, Math.PI * 2);
		ctx.fill();
	}

	ctx.fillStyle = PALETTE.yellow;
	ctx.fill(p.fuselage);
	ctx.fillStyle = PALETTE.yellowLight;
	ctx.globalAlpha *= 0.7;
	ctx.fillRect(-0.44 * L, -4, 0.82 * L, 8);
	ctx.globalAlpha /= 0.7;
	ctx.fillStyle = 'rgba(22, 22, 22, 0.25)';
	ctx.fillRect(-0.18 * L, -H + 2, 3, 2 * H - 4);
	ctx.fillStyle = PALETTE.ink;
	ctx.beginPath();
	ctx.arc(0.5 * L - 0.08 * L, 0, 0.035 * L, 0, Math.PI * 2);
	ctx.fill();
}

export function drawShahed(ctx: CanvasRenderingContext2D) {
	const p = SH();
	ctx.fillStyle = PALETTE.shahedWing;
	ctx.fill(p.wing);
	ctx.strokeStyle = PALETTE.shahedEdge;
	ctx.lineWidth = 2;
	ctx.stroke(p.wing);
	ctx.fillStyle = PALETTE.shahedEdge;
	p.winglets.forEach((w) => ctx.fill(w));
	ctx.fillStyle = PALETTE.shahedBody;
	ctx.fill(p.fuselage);
	ctx.fillStyle = 'rgba(210, 210, 210, 0.25)';
	ctx.fill(p.prop);
}
