import { SHAHED_LEN, STING_LEN, TIMING, TUNING } from './config';
import type { Scene } from './render';
import { betterThan, judge, makeRound, verdictOf, xAt, type Judgement, type Round, type Verdict } from './sim';

export type Phase = 'attract' | 'ready' | 'flight' | 'result';

export interface GameDeps {
	latencyMs: () => number;
	speed: () => number;
	/** Результати поточного заходу — для «краще, ніж N%». */
	scores: () => number[];
	onStart: () => void;
	onAttempt: (j: Judgement, round: Round, attempt: number, latencyMs: number) => void;
	onEnd: (attempts: number, ms: number) => void;
}

/** Демо на екрані очікування: Стінг завмирає в контурі, щоб було видно мету. */
const DEMO_FREEZE = 1.3;
const DEMO_TAIL = 1.4;

export class Game {
	phase = $state<Phase>('attract');
	judgement = $state<Judgement | null>(null);
	verdict = $state<Verdict | null>(null);
	better = $state<number | null>(null);
	canRetry = $state(false);
	best = $state<number | null>(null);

	private round: Round;
	private demo: Round;
	private phaseAt = 0;
	private flightAt = 0;
	private tFrozen: number | null = null;
	private attempts = 0;
	private sessionAt = 0;

	constructor(private deps: GameDeps) {
		this.round = makeRound(Math.random, TUNING);
		this.demo = makeRound(() => 0.5, TUNING);
		this.refreshBest();
	}

	/** Для перевірок у dev: коли саме Стінг буде в контурі. */
	debug() {
		return { phase: this.phase, flightAt: this.flightAt, round: this.round };
	}

	refreshBest() {
		const s = this.deps.scores();
		this.best = s.length ? Math.max(...s) : null;
	}

	/** Відпускання пальця: старт з очікування й нова спроба з результату. */
	release(now: number) {
		if (this.phase === 'attract') {
			this.attempts = 0;
			this.sessionAt = now;
			this.deps.onStart();
			this.toReady(now);
		} else if (this.phase === 'result' && this.canRetry) {
			this.toReady(now);
		}
	}

	/** Натискання в польоті: stamp — час події з її timeStamp, а не момент обробки. */
	press(stamp: number) {
		if (this.phase !== 'flight' || stamp - this.flightAt < TIMING.ignoreMs) return;
		const latency = this.deps.latencyMs();
		this.finish(stamp, Math.max(0, (stamp - latency - this.flightAt) / 1000), latency);
	}

	toAttract(now: number) {
		if (this.phase !== 'attract' && this.attempts > 0) this.deps.onEnd(this.attempts, now - this.sessionAt);
		this.phase = 'attract';
		this.phaseAt = now;
		this.judgement = null;
		this.verdict = null;
	}

	private toReady(now: number) {
		this.round = makeRound(Math.random, TUNING, this.deps.speed());
		this.phase = 'ready';
		this.phaseAt = now;
		this.judgement = null;
		this.verdict = null;
		this.canRetry = false;
	}

	private finish(now: number, tTap: number | null, latency: number) {
		const j = judge(this.round, tTap);
		const previous = this.deps.scores();
		this.attempts++;
		this.better = j.outcome === 'hit' ? betterThan(previous, j.score) : null;
		this.deps.onAttempt(j, this.round, this.attempts, latency);
		this.tFrozen = tTap;
		this.judgement = j;
		this.verdict = verdictOf(j);
		this.phase = 'result';
		this.phaseAt = now;
		this.canRetry = false;
		this.refreshBest();
	}

	tick(now: number): Scene {
		const t = now / 1000;
		const base: Scene = { t, shahedX: null, stingX: null, stingSpeed: 0, shahedSpeed: 0, outline: 'idle', measure: null };

		switch (this.phase) {
			case 'attract':
				return this.demoScene(base, (now - this.phaseAt) / 1000);

			case 'ready':
				if (now - this.phaseAt >= TIMING.readyMs) {
					this.phase = 'flight';
					// Від точної межі, а не від кадру, що її помітив: повільний кадр не має зсувати рахунок.
					this.flightAt = this.phaseAt + TIMING.readyMs;
					return this.tick(now);
				}
				return base;

			case 'flight': {
				const ft = (now - this.flightAt) / 1000;
				if (ft > this.round.tEnd) {
					this.finish(now, null, this.deps.latencyMs());
					return base;
				}
				return this.flightScene(base, this.round, ft, true);
			}

			case 'result': {
				const since = now - this.phaseAt;
				if (!this.canRetry && since >= TIMING.resultLockMs) this.canRetry = true;
				if (since >= TIMING.idleMs) this.toAttract(now);
				if (this.tFrozen === null) return base;
				const scene = this.flightScene(base, this.round, this.tFrozen, false);
				scene.outline = this.verdict === 'intercepted' ? 'win' : 'idle';
				scene.measure = this.judgement?.outcome === 'hit' ? this.judgement.dx : null;
				return scene;
			}
		}
	}

	private flightScene(base: Scene, r: Round, ft: number, moving: boolean): Scene {
		return {
			...base,
			shahedX: xAt(r.shahed, SHAHED_LEN, ft),
			stingX: xAt(r.sting, STING_LEN, ft),
			shahedSpeed: moving ? r.shahed.speed : 0,
			stingSpeed: moving ? r.sting.speed : 0
		};
	}

	private demoScene(base: Scene, dt: number): Scene {
		const r = this.demo;
		const period = r.tEnd + DEMO_FREEZE + DEMO_TAIL;
		const lt = dt % period;
		if (lt >= r.tHit && lt < r.tHit + DEMO_FREEZE) {
			return { ...this.flightScene(base, r, r.tHit, false), outline: 'win' };
		}
		const ft = lt < r.tHit ? lt : lt - DEMO_FREEZE;
		return this.flightScene(base, r, ft, true);
	}
}
