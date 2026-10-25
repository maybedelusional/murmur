import type { AgentStatus } from '@shared/types'

/**
 * Each agent is drawn as its own small murmuration. How the flock moves says
 * what the agent is doing:
 *   working  → wheels and swirls across the sky
 *   waiting  → circles tightly over one spot (it needs you)
 *   idle     → settles into a loose, quiet cluster
 *   paused   → hangs almost still
 *   error    → breaks apart
 */

interface Bird {
  x: number
  y: number
  vx: number
  vy: number
  phase: number
  size: number
}

interface Behaviour {
  speed: number
  pull: number
  orbit: number
  wander: number
  spread: number
}

const BEHAVIOUR: Record<AgentStatus, Behaviour> = {
  starting: { speed: 70, pull: 1.6, orbit: 0, wander: 30, spread: 9 },
  working: { speed: 115, pull: 1.4, orbit: 0, wander: 52, spread: 9 },
  waiting: { speed: 70, pull: 2.2, orbit: 1, wander: 0, spread: 8 },
  idle: { speed: 22, pull: 0.9, orbit: 0, wander: 6, spread: 10 },
  paused: { speed: 8, pull: 0.6, orbit: 0, wander: 0, spread: 10 },
  error: { speed: 14, pull: 0.15, orbit: 0, wander: 0, spread: 22 },
  merged: { speed: 18, pull: 1.0, orbit: 0, wander: 4, spread: 11 }
}

export class Flock {
  birds: Bird[] = []
  homeX = 0
  homeY = 0
  status: AgentStatus = 'starting'
  private t = Math.random() * 100
  private seedOffset = Math.random() * Math.PI * 2

  constructor(count: number, x: number, y: number) {
    this.homeX = x
    this.homeY = y
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const d = Math.random() * 30
      this.birds.push({
        x: x + Math.cos(a) * d * 1.8,
        y: y + Math.sin(a) * d * 0.7,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        phase: Math.random() * Math.PI * 2,
        size: 0.75 + Math.random() * 0.6
      })
    }
  }

  /** Moves the flock's spot in the sky, carrying the birds along (e.g. on resize). */
  moveHome(x: number, y: number): void {
    const dx = x - this.homeX
    const dy = y - this.homeY
    if (!dx && !dy) return
    for (const b of this.birds) {
      b.x += dx
      b.y += dy
    }
    this.labelX += dx
    this.labelY += dy
    this.homeX = x
    this.homeY = y
  }

  setCount(n: number): void {
    while (this.birds.length > n) this.birds.pop()
    while (this.birds.length < n) {
      const b = this.birds[0]
      this.birds.push({ ...(b ?? { x: this.homeX, y: this.homeY, vx: 0, vy: 0, size: 1 }), phase: Math.random() * 6 })
    }
  }

  step(dt: number): void {
    const B = BEHAVIOUR[this.status]
    this.t += dt
    const t = this.t

    // Where the flock as a whole is heading.
    let tx = this.homeX
    let ty = this.homeY
    if (B.wander > 0) {
      tx += Math.cos(t * 0.55 + this.seedOffset) * B.wander + Math.sin(t * 0.23) * B.wander * 0.35
      ty += Math.sin(t * 0.9 + this.seedOffset) * B.wander * 0.38
    }

    const birds = this.birds
    const n = birds.length
    for (let i = 0; i < n; i++) {
      const b = birds[i]
      let ax = 0
      let ay = 0
      let cx = 0
      let cy = 0
      let avx = 0
      let avy = 0
      let near = 0

      for (let j = 0; j < n; j++) {
        if (i === j) continue
        const o = birds[j]
        const dx = b.x - o.x
        const dy = b.y - o.y
        const d2 = dx * dx + dy * dy
        if (d2 < 900) {
          near++
          cx += o.x
          cy += o.y
          avx += o.vx
          avy += o.vy
          const sep = B.spread * B.spread
          if (d2 < sep && d2 > 0.0001) {
            const f = (sep - d2) / sep
            ax += (dx / Math.sqrt(d2)) * f * 260
            ay += (dy / Math.sqrt(d2)) * f * 260
          }
        }
      }
      if (near > 0) {
        // cohesion and alignment with neighbours
        ax += (cx / near - b.x) * 0.9
        ay += (cy / near - b.y) * 0.9
        ax += (avx / near - b.vx) * 1.4
        ay += (avy / near - b.vy) * 1.4
      }

      // pull toward the flock's target, flattened like a real murmuration
      const dx = tx - b.x
      const dy = ty - b.y
      ax += dx * B.pull
      ay += dy * B.pull * 1.6

      if (B.orbit) {
        const r = Math.hypot(b.x - this.homeX, b.y - this.homeY) || 1
        const ox = -(b.y - this.homeY) / r
        const oy = (b.x - this.homeX) / r
        ax += ox * 140 + ((this.homeX - b.x) / r) * (r - 26) * 3
        ay += oy * 60 + ((this.homeY - b.y) / r) * (r - 12) * 3
      }

      b.vx += ax * dt
      b.vy += ay * dt
      const sp = Math.hypot(b.vx, b.vy)
      const max = B.speed * (0.85 + b.size * 0.2)
      if (sp > max) {
        b.vx = (b.vx / sp) * max
        b.vy = (b.vy / sp) * max
      }
      // gentle drag so quiet flocks actually settle
      const drag = B.speed < 30 ? 0.92 : 0.995
      b.vx *= Math.pow(drag, dt * 60)
      b.vy *= Math.pow(drag, dt * 60)
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.phase += dt * (6 + sp * 0.08)
    }
  }

  /** Smoothed centre and lower edge of the flock, so its label can follow it. */
  labelX = 0
  labelY = 0
  centerX = 0
  centerY = 0

  trackLabel(dt: number): void {
    if (!this.birds.length) return
    let sx = 0
    const ys: number[] = []
    for (const b of this.birds) {
      sx += b.x
      ys.push(b.y)
    }
    ys.sort((p, q) => p - q)
    // ignore the lowest few stragglers so the label doesn't jump
    const bottom = ys[Math.floor(ys.length * 0.9)]
    const tx = sx / this.birds.length
    const ty = bottom + 14
    this.centerX = tx
    this.centerY = ys[Math.floor(ys.length / 2)]
    if (!this.labelX && !this.labelY) {
      this.labelX = tx
      this.labelY = ty
    }
    const k = 1 - Math.pow(0.04, dt)
    this.labelX += (tx - this.labelX) * k
    this.labelY += (ty - this.labelY) * k
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const b of this.birds) drawBird(ctx, b.x, b.y, b.vx, b.vy, b.phase, b.size)
  }
}

/** One small ink bird, pointing the way it flies, wings beating when it's fast. */
export function drawBird(ctx: CanvasRenderingContext2D, x: number, y: number, vx: number, vy: number, phase: number, size: number): void {
  const sp = Math.hypot(vx, vy)
  const angle = sp > 2 ? Math.atan2(vy, vx) : 0
  const w = 3.3 * size
  const flap = sp > 25 ? 0.55 + 0.45 * Math.abs(Math.sin(phase)) : 0.8
  const h = 1.5 * size * flap
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(-w * 0.2, -w)
  ctx.quadraticCurveTo(w * 0.15, -h, w * 0.5, 0)
  ctx.quadraticCurveTo(w * 0.15, h, -w * 0.2, w)
  ctx.quadraticCurveTo(w * 0.05, 0, -w * 0.2, -w)
  ctx.fill()
  ctx.restore()
}

const MESSAGE_MS = 1900

/**
 * A message between agents: a few birds peel off the sender's flock and fly
 * an arc over to the recipient.
 */
export class Messenger {
  done = false
  private start = performance.now()
  private birds = Array.from({ length: 5 }, (_, i) => ({
    ox: (Math.random() - 0.5) * 18,
    oy: (Math.random() - 0.5) * 10,
    lag: i * 0.035,
    phase: Math.random() * 6,
    size: 0.8 + Math.random() * 0.4
  }))

  constructor(
    readonly fromId: string,
    readonly toId: string
  ) {}

  draw(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, now: number): void {
    const raw = (now - this.start) / MESSAGE_MS
    if (raw >= 1 + 0.15) {
      this.done = true
      return
    }
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    const cx = (from.x + to.x) / 2
    const cy = Math.min(from.y, to.y) - 60 - dist * 0.18
    for (const b of this.birds) {
      const t = Math.min(1, Math.max(0, raw - b.lag))
      if (t <= 0 || t >= 1) continue
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      const u = 1 - e
      const x = u * u * from.x + 2 * u * e * cx + e * e * to.x
      const y = u * u * from.y + 2 * u * e * cy + e * e * to.y
      // direction of travel = derivative of the curve
      const dx = 2 * u * (cx - from.x) + 2 * e * (to.x - cx)
      const dy = 2 * u * (cy - from.y) + 2 * e * (to.y - cy)
      const spread = Math.sin(Math.PI * e)
      b.phase += 0.35
      drawBird(ctx, x + b.ox * spread, y + b.oy * spread, dx, dy, b.phase, b.size)
    }
  }
}

/** Spreads flocks over the sky so they don't overlap; positions are fractions of the sky. */
export function homeSlots(count: number): Array<[number, number]> {
  const preset: Array<[number, number]> = [
    [0.5, 0.24],
    [0.26, 0.46],
    [0.74, 0.42],
    [0.5, 0.62],
    [0.22, 0.74],
    [0.78, 0.72],
    [0.16, 0.22],
    [0.84, 0.2]
  ]
  if (count <= preset.length) return preset.slice(0, count)
  const cols = Math.ceil(Math.sqrt(count * 1.6))
  const rows = Math.ceil(count / cols)
  const out: Array<[number, number]> = []
  for (let i = 0; i < count; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)
    out.push([(c + 0.5) / cols, 0.16 + ((r + 0.5) / rows) * 0.62])
  }
  return out
}
