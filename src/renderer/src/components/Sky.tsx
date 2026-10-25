import { useEffect, useRef, useState } from 'react'
import type { AgentMessageEvent, AgentSnapshot, ApprovalRequest } from '@shared/types'
import { Flock, Messenger, homeSlots } from '../flock'

interface Props {
  agents: AgentSnapshot[]
  approvals: ApprovalRequest[]
  selectedId: string | null
  onSelect(id: string): void
  onAnswer(approvalId: string, allow: boolean): void
  onNew(): void
  subscribeMessages(cb: (m: AgentMessageEvent) => void): () => void
}

const BIRDS: Record<string, number> = { planner: 26, builder: 42, reviewer: 22, tester: 32, custom: 32 }

export function Sky({ agents, approvals, selectedId, onSelect, onAnswer, onNew, subscribeMessages }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const flocks = useRef(new Map<string, Flock>())
  const labels = useRef(new Map<string, HTMLButtonElement>())
  const messengers = useRef<Messenger[]>([])

  // Agents messaging each other: a few birds fly from one flock to the other.
  useEffect(
    () =>
      subscribeMessages((m) => {
        if (messengers.current.length < 24) messengers.current.push(new Messenger(m.fromId, m.toId))
      }),
    [subscribeMessages]
  )
  const [size, setSize] = useState({ w: 0, h: 0 })

  // Keep one flock per agent, placed in its own patch of sky.
  const slots = homeSlots(agents.length)
  const homes = agents.map((a, i) => ({ id: a.id, x: slots[i][0] * size.w, y: slots[i][1] * size.h }))

  useEffect(() => {
    const map = flocks.current
    const ids = new Set(agents.map((a) => a.id))
    for (const id of map.keys()) if (!ids.has(id)) map.delete(id)
    if (!size.w) return
    agents.forEach((a, i) => {
      const home = homes[i]
      let f = map.get(a.id)
      if (!f) {
        f = new Flock(BIRDS[a.role] ?? 32, home.x, home.y)
        map.set(a.id, f)
      }
      f.moveHome(home.x, home.y)
      f.status = a.status
      f.setCount(a.status === 'merged' ? 12 : BIRDS[a.role] ?? 32)
    })
  })

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.w) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size.w * dpr)
    canvas.height = Math.round(size.h * dpr)
    const ctx = canvas.getContext('2d')!
    const bird = getComputedStyle(document.documentElement).getPropertyValue('--bird').trim() || '#1A1622'
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let raf = 0
    let last = performance.now()
    const frame = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size.w, size.h)
      ctx.fillStyle = bird
      for (const [id, f] of flocks.current) {
        if (!still) f.step(dt)
        f.draw(ctx)
        f.trackLabel(still ? 1 : dt)
        const el = labels.current.get(id)
        if (el) {
          el.style.left = `${f.labelX}px`
          el.style.top = `${Math.min(f.labelY, size.h - 64)}px`
        }
      }
      if (messengers.current.length) {
        for (const m of messengers.current) {
          const a = flocks.current.get(m.fromId)
          const b = flocks.current.get(m.toId)
          if (!a || !b) {
            m.done = true
            continue
          }
          m.draw(ctx, { x: a.centerX, y: a.centerY }, { x: b.centerX, y: b.centerY }, now)
        }
        messengers.current = messengers.current.filter((m) => !m.done)
      }
      raf = requestAnimationFrame(frame)
    }
    if (still) {
      // Let flocks settle once, then draw them standing still.
      for (let i = 0; i < 240; i++) for (const f of flocks.current.values()) f.step(1 / 60)
    }
    raf = requestAnimationFrame(frame)
    const onVis = (): void => {
      if (document.hidden) cancelAnimationFrame(raf)
      else {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [size.w, size.h, agents.length])

  const nameOf = (id: string): string => agents.find((a) => a.id === id)?.name ?? 'An agent'

  return (
    <main className="sky" ref={wrapRef}>
      <div className="sky-band-high" aria-hidden="true" />
      <div className="sky-band-low" aria-hidden="true" />
      <svg className="sky-horizon" viewBox="0 0 1000 150" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 40 C 180 28, 320 52, 520 38 S 840 22, 1000 36 L1000 150 L0 150 Z" fill="var(--horizon)" />
        <path
          d="M0 112 L60 104 L120 110 L190 96 L250 106 L330 100 L400 108 L470 94 L560 104 L620 98 L700 108 L780 100 L860 106 L930 96 L1000 104 L1000 150 L0 150 Z"
          fill="var(--treeline)"
        />
      </svg>
      <canvas ref={canvasRef} aria-hidden="true" />

      {agents.map((a, i) => {
        const home = homes[i]
        if (!home || !size.w) return null
        return (
          <button
            key={a.id}
            ref={(el) => {
              if (el) labels.current.set(a.id, el)
              else labels.current.delete(a.id)
            }}
            className={`flock-label${a.id === selectedId ? ' selected' : ''}`}
            style={{ left: home.x, top: home.y + 30 }}
            onClick={() => onSelect(a.id)}
          >
            <span className="flock-name">{a.name}</span>
            <span className={`flock-status ${a.status}`}>{skyStatus(a)}</span>
          </button>
        )
      })}

      {agents.length === 0 ? (
        <div className="sky-empty">
          <h2>An empty sky</h2>
          <p>Start an agent and give it a task. Each one gets its own copy of the project, so several can work at the same time without getting in each other’s way.</p>
          <button className="btn primary" onClick={onNew}>
            New agent
          </button>
        </div>
      ) : null}

      {approvals.length ? (
        <div className="approvals">
          {approvals.map((p) => (
            <div className="approval" key={p.id} role="alertdialog" aria-label={p.title}>
              <span>
                <span className="who">{nameOf(p.agentId)}</span> {askText(p, nameOf(p.agentId))}
                {p.detail ? <span className="detail mono">{p.detail}</span> : null}
              </span>
              <span className="actions">
                <button className="btn" onClick={() => onAnswer(p.id, false)}>
                  Don’t allow
                </button>
                <button className="btn accent" onClick={() => onAnswer(p.id, true)}>
                  Allow
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </main>
  )
}

/** "Builder A wants to run a command" → "wants to run a command" (the name is shown separately). */
function askText(p: ApprovalRequest, name: string): string {
  const lead = p.title.startsWith(name) ? name.length : p.title.startsWith('Claude ') ? 7 : 0
  const rest = p.title.slice(lead).trim()
  return rest || `wants to use ${p.toolName}`
}

function skyStatus(a: AgentSnapshot): string {
  switch (a.status) {
    case 'working':
    case 'starting':
      return 'Working'
    case 'waiting':
      return 'Waiting for you'
    case 'idle':
      return 'Done'
    case 'paused':
      return 'Paused'
    case 'error':
      return 'Stopped'
    case 'merged':
      return 'Merged'
  }
}
