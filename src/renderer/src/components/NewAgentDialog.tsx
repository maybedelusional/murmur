import { useEffect, useRef, useState } from 'react'
import type { AccessMode, NewAgentInput, Recipe, Role, Settings, StartTeamInput } from '@shared/types'
import { MODE_LONG, ROLES } from '../labels'

interface Props {
  settings: Settings
  projectName: string
  recipes: Recipe[]
  onCreate(input: NewAgentInput): Promise<boolean>
  onStartTeam(input: StartTeamInput): Promise<boolean>
  onEditRecipes(): void
  onHideCaution(): void
  onClose(): void
}

const ROLE_LABEL: Record<Role, string> = { planner: 'Planner', builder: 'Builder', reviewer: 'Reviewer', tester: 'Tester', custom: 'Agent' }

export function parseBudget(text: string): number | undefined | 'invalid' {
  const t = text.trim().replace(',', '.').replace(/^\$/, '')
  if (!t) return undefined
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : 'invalid'
}

export function NewAgentDialog(p: Props) {
  const { settings } = p
  const [kind, setKind] = useState<'one' | 'team'>('one')
  const [role, setRole] = useState<Role>('builder')
  const [task, setTask] = useState('')
  const [mode, setMode] = useState<AccessMode>('ask')
  const [recipeId, setRecipeId] = useState(p.recipes[0]?.id ?? '')
  const [budget, setBudget] = useState(settings.defaultBudgetUsd > 0 ? String(settings.defaultBudgetUsd) : '')
  const [hideCaution, setHideCaution] = useState(false)
  const [busy, setBusy] = useState(false)
  const taskRef = useRef<HTMLTextAreaElement>(null)
  const { onClose } = p

  useEffect(() => {
    taskRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const modes: AccessMode[] = ['ask', 'edits', 'auto', 'bypass']
  const sep = settings.worktreeRoot.includes('\\') ? '\\' : '/'
  const budgetValue = parseBudget(budget)
  const recipe = p.recipes.find((r) => r.id === recipeId)
  const recipeUsesAuto = recipe?.members.some((m) => m.mode === 'auto' || m.mode === 'bypass')

  const submit = async (): Promise<void> => {
    if (!task.trim() || busy || budgetValue === 'invalid') return
    setBusy(true)
    if (hideCaution) p.onHideCaution()
    const ok =
      kind === 'one'
        ? await p.onCreate({ role, task, mode, budgetUsd: budgetValue })
        : await p.onStartTeam({ recipeId, task, budgetUsd: budgetValue })
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
        <div className="dialog-title-row">
          <h1 id="new-agent-title">{kind === 'one' ? 'New agent' : 'New team'}</h1>
          <div className="segmented" role="tablist" aria-label="Start one agent or a team">
            <button type="button" role="tab" aria-selected={kind === 'one'} onClick={() => setKind('one')}>
              One agent
            </button>
            <button type="button" role="tab" aria-selected={kind === 'team'} onClick={() => setKind('team')}>
              A team
            </button>
          </div>
        </div>

        {kind === 'one' ? (
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
        ) : (
          <fieldset className="field" role="radiogroup">
            <legend>Team</legend>
            {p.recipes.map((r) => (
              <button
                type="button"
                key={r.id}
                role="radio"
                aria-checked={r.id === recipeId}
                className="mode-option"
                onClick={() => setRecipeId(r.id)}
              >
                <span className="dot" aria-hidden="true" />
                <span>
                  <span className="title">{r.name}</span>
                  <span className="desc">{r.description}</span>
                  <span className="desc members">{r.members.map((m) => m.name || ROLE_LABEL[m.role]).join(', ')}</span>
                </span>
              </button>
            ))}
            <button type="button" className="link-btn" onClick={p.onEditRecipes}>
              Make or edit team recipes
            </button>
          </fieldset>
        )}

        <div className="field">
          <label htmlFor="task">{kind === 'one' ? 'What should it do?' : 'What should the team do?'}</label>
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

        {kind === 'one' ? (
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
        ) : null}

        {kind === 'one' && mode === 'auto' && !settings.hideAutoCaution ? (
          <div className="note caution">
            <strong>Use with caution.</strong> The agent will act without asking. Murmur keeps it inside its own copy of the
            project and blocks pushing, but check its changes before you merge.
            <label className="check">
              <input type="checkbox" checked={hideCaution} onChange={(e) => setHideCaution(e.target.checked)} />
              Don’t show this again
            </label>
          </div>
        ) : null}
        {kind === 'one' && mode === 'bypass' ? (
          <div className="note danger">
            <strong>All checks are off.</strong> The agent can run any command inside its folder without asking.
          </div>
        ) : null}
        {kind === 'team' && recipeUsesAuto ? (
          <div className="note caution">
            <strong>Some of this team runs in Auto.</strong> Those agents act without asking. Check their changes before you merge.
          </div>
        ) : null}

        <div className="field budget-field">
          <label htmlFor="budget">{kind === 'one' ? 'Spending limit' : 'Spending limit per agent'}</label>
          <div className="budget-input">
            <span aria-hidden="true">$</span>
            <input
              id="budget"
              className="input"
              inputMode="decimal"
              placeholder="No limit"
              value={budget}
              aria-invalid={budgetValue === 'invalid'}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
          <span className="muted small">
            {budgetValue === 'invalid' ? 'Enter an amount like 5 or 2.50.' : 'The agent pauses itself when it reaches this. Costs are estimates.'}
          </span>
        </div>

        <div className="dialog-footer">
          <p>
            {kind === 'one' ? 'Works in its own copy of the project in ' : 'Each agent works in its own copy of the project in '}
            <span className="mono" style={{ color: 'var(--text)' }}>
              {settings.worktreeRoot}
              {sep}
              {p.projectName}
            </span>
          </p>
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={!task.trim() || busy || budgetValue === 'invalid' || (kind === 'team' && !recipe)}>
              {busy ? 'Starting…' : kind === 'one' ? 'Start agent' : `Start ${recipe?.members.length ?? ''} agents`}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
