import type { AgentSnapshot } from '@shared/types'
import { MODE_SHORT } from '../labels'

interface Props {
  agents: AgentSnapshot[]
  selectedId: string | null
  onSelect(id: string): void
  onNew(): void
}

export function AgentRail({ agents, selectedId, onSelect, onNew }: Props) {
  return (
    <aside className="rail">
      <button className="btn primary" onClick={onNew}>
        New agent
      </button>
      <section>
        <h2>Agents</h2>
        {agents.length === 0 ? <p className="rail-empty">None yet.</p> : null}
        {agents.map((a) => (
          <button key={a.id} className={`agent-row${a.id === selectedId ? ' selected' : ''}`} onClick={() => onSelect(a.id)}>
            <span className="top">
              <span className="name">{a.name}</span>
              <span className={`mode ${a.mode}`}>{MODE_SHORT[a.mode]}</span>
            </span>
            <span className={`status ${a.status}`}>{a.statusText}</span>
          </button>
        ))}
      </section>
    </aside>
  )
}
