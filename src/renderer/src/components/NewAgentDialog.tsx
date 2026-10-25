import { useEffect, useRef, useState } from 'react'
import type { AccessMode, NewAgentInput, Role, Settings } from '@shared/types'
import { MODE_LONG, ROLES } from '../labels'

interface Props {
  settings: Settings
  projectName: string
  onCreate(input: NewAgentInput): Promise<boolean>
  onHideCaution(): void
  onClose(): void
}

export function NewAgentDialog({ settings, projectName, onCreate, onHideCaution, onClose }: Props) {
  const [role, setRole] = useState<Role>('builder')
  const [task, setTask] = useState('')
  const [mode, setMode] = useState<AccessMode>('ask')
  const [hideCaution, setHideCaution] = useState(false)
  const [busy, setBusy] = useState(false)
  const taskRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    taskRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const modes: AccessMode[] = ['ask', 'edits', 'auto', 'bypass']
  const sep = projectName && settings.worktreeRoot.includes('\\') ? '\\' : '/'

  const submit = async (): Promise<void> => {
    if (!task.trim() || busy) return
    setBusy(true)
    if (hideCaution) onHideCaution()
    const ok = await onCreate({ role, task, mode })
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-agent-title"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h1 id="new-agent-title">New agent</h1>

        <div className="field">
          <span className="label" id="role-label">
            Role
          </span>
          <div className="chips" role="group" aria-labelledby="role-label">
            {ROLES.map((r) => (
              <button type="button" key={r.id} className="chip" aria-pressed={r.id === role} onClick={() => setRole(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="task">What should it do?</label>
          <textarea
            id="task"
            ref={taskRef}
            className="textarea"
            rows={3}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit()
            }}
            placeholder="For example: add a dark mode toggle to the settings page"
          />
        </div>

        <fieldset className="field" role="radiogroup">
          <legend>How much should it ask you?</legend>
          {modes.map((m) => {
            const locked = m === 'bypass' && !settings.allowBypass
            return (
              <button
                type="button"
                key={m}
                role="radio"
                aria-checked={mode === m}
                disabled={locked}
                className={`mode-option${m === 'auto' ? ' caution' : ''}${m === 'bypass' ? ' danger' : ''}`}
                onClick={() => setMode(m)}
              >
                <span className="dot" aria-hidden="true" />
                <span>
                  <span className="title">{MODE_LONG[m].title}</span>
                  <span className="desc">{locked ? 'Turn this on in Settings, under Advanced.' : MODE_LONG[m].desc}</span>
                </span>
              </button>
            )
          })}
        </fieldset>

        {mode === 'auto' && !settings.hideAutoCaution ? (
          <div className="note caution">
            <strong>Use with caution.</strong> The agent will act without asking. Murmur keeps it inside its own copy of the
            project and blocks pushing, but check its changes before you merge.
            <label className="check">
              <input type="checkbox" checked={hideCaution} onChange={(e) => setHideCaution(e.target.checked)} />
              Don’t show this again
            </label>
          </div>
        ) : null}
        {mode === 'bypass' ? (
          <div className="note danger">
            <strong>All checks are off.</strong> The agent can run any command inside its folder without asking.
          </div>
        ) : null}

        <div className="dialog-footer">
          <p>
            Works in its own copy of the project in{' '}
            <span className="mono" style={{ color: 'var(--text)' }}>
              {settings.worktreeRoot}
              {sep}
              {projectName}
            </span>
          </p>
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={!task.trim() || busy}>
              {busy ? 'Starting…' : 'Start agent'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
