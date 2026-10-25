import type { AgentSnapshot } from '@shared/types'
import { MODE_SHORT, money } from '../labels'

interface Props {
  agents: AgentSnapshot[]
  selectedId: string | null
  onSelect(id: string): void
  onNew(): void
}

export function AgentRail({ agents, selectedId, onSelect, onNew }: Props) {
  // Agents started together from a team recipe are listed under their team.
  const groups: Array<{ key: string; title: string; agents: AgentSnapshot[] }> = []
  for (const a of agents) {
    const key = a.teamId ?? 'solo'
    let g = groups.find((x) => x.key === key)
    if (!g) {
      g = { key, title: a.teamName ?? 'Agents', agents: [] }
      groups.push(g)
    }
    g.agents.push(a)
  }
  const total = agents.reduce((sum, a) => sum + a.costUsd, 0)
  return (
    <aside className="rail">
      <button className="btn primary" onClick={onNew}>
        New agent
      </button>
      {groups.map((g) => (
        <section key={g.key}>
          <h2>{g.title}</h2>
          {g.agents.map((a) => (
            <button key={a.id} className={`agent-row${a.id === selectedId ? ' selected' : ''}`} onClick={() => onSelect(a.id)}>
              <span className="top">
                <span className="name">{a.name}</span>
                <span className={`mode ${a.mode}`}>{MODE_SHORT[a.mode]}</span>
              </span>
              <span className={`status ${a.status}`}>{a.statusText}</span>
            </button>
          ))}
        </section>
      ))}
      {agents.length === 0 ? (
        <section>
          <h2>Agents</h2>
          <p className="rail-empty">None yet.</p>
        </section>
      ) : null}
      {agents.length ? (
        <p className="rail-total" title="Estimated at API prices; a Claude subscription isn't billed per agent">
          Spent so far <span>{money(total)}</span>
        </p>
      ) : null}
    </aside>
  )
}
