import { useEffect, useRef, useState } from 'react'
import type { AccessMode, AgentSnapshot } from '@shared/types'
import { MODE_LONG, clockTime, money } from '../labels'
import { parseBudget } from './NewAgentDialog'

interface Props {
  agent: AgentSnapshot
  allowBypass: boolean
  onSend(text: string): void
  onPause(): void
  onResume(): void
  onSetMode(mode: AccessMode): void
  onReview(): void
  onSetBudget(budget: number | null): void
  onDiscard(): void
  onOpenTerminal(): void
}

export function AgentPanel(p: Props) {
  const a = p.agent
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState<'discard' | null>(null)
  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetText, setBudgetText] = useState('')
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setConfirming(null)
    setEditingBudget(false)
  }, [a.id])
  useEffect(() => {
    const el = feedRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [a.activity.length])

  const busy = a.status === 'working' || a.status === 'waiting' || a.status === 'starting'
  const hasChanges = a.files.length > 0

  const send = (): void => {
    const text = draft.trim()
    if (!text) return
    p.onSend(text)
    setDraft('')
  }

  return (
    <aside className="panel" aria-label={`${a.name} details`}>
      <div>
        <h2>{a.name}</h2>
        {a.teamName ? (
          <p className="team-line">
            {a.teamName}
            {a.startedBy ? `, started by ${a.startedBy}` : ''}
          </p>
        ) : null}
        <p className="task">{a.task.length > 400 ? `${a.task.slice(0, 399)}…` : a.task}</p>
      </div>

      {a.mode === 'auto' ? (
        <div className="note caution">
          <strong>Auto mode is on.</strong> This agent acts without asking you. Risky actions are still blocked, so check its
          changes before merging.
        </div>
      ) : null}
      {a.mode === 'bypass' ? (
        <div className="note danger">
          <strong>All checks are off.</strong> This agent can run anything inside its folder without asking. Only Murmur’s own
          rules (no pushing, stay in its folder) still apply.
        </div>
      ) : null}
      {a.status === 'error' && a.error ? <div className="note danger">{a.error}</div> : null}
      {a.overBudget ? (
        <div className="note caution">
          <strong>Stopped at its spending limit.</strong> Raise the limit below to let it continue.
        </div>
      ) : null}

      <dl className="facts">
        <dt>Access</dt>
        <dd>
          <select
            className="select"
            value={a.mode}
            aria-label="How much it asks you"
            disabled={a.status === 'merged'}
            onChange={(e) => p.onSetMode(e.target.value as AccessMode)}
          >
            {(Object.keys(MODE_LONG) as AccessMode[]).map((m) => (
              <option key={m} value={m} disabled={m === 'bypass' && !p.allowBypass}>
                {MODE_LONG[m].title}
              </option>
            ))}
          </select>
        </dd>
        <dt>Branch</dt>
        <dd className="mono" title={a.branch}>
          {a.branch}
        </dd>
        <dt>Folder</dt>
        <dd className="mono" title={a.folder}>
          {a.folder}
        </dd>
        <dt>Changes</dt>
        <dd>{hasChanges ? `${a.linesAdded} lines added, ${a.linesRemoved} removed` : 'Nothing yet'}</dd>
        <dt>Spent</dt>
        <dd className="spent">
          {editingBudget ? (
            <form
              className="budget-edit"
              onSubmit={(e) => {
                e.preventDefault()
                const v = parseBudget(budgetText)
                if (v === 'invalid') return
                p.onSetBudget(v ?? null)
                setEditingBudget(false)
              }}
            >
              <span>{money(a.costUsd)} of $</span>
              <input
                className="input"
                autoFocus
                inputMode="decimal"
                aria-label="Spending limit in dollars"
                placeholder="no limit"
                value={budgetText}
                onChange={(e) => setBudgetText(e.target.value)}
              />
              <button className="btn" type="submit">
                Set
              </button>
            </form>
          ) : (
            <>
              <span title="An estimate of what this agent's work would cost at API prices">
                {money(a.costUsd)}
                {a.budgetUsd !== undefined ? ` of ${money(a.budgetUsd)}` : ''}
              </span>
              <button
                className="link-btn"
                onClick={() => {
                  setBudgetText(a.budgetUsd !== undefined ? String(a.budgetUsd) : '')
                  setEditingBudget(true)
                }}
              >
                {a.budgetUsd !== undefined ? 'Change limit' : 'Set a limit'}
              </button>
            </>
          )}
        </dd>
      </dl>
      {a.budgetUsd !== undefined ? (
        <div className="meter" role="meter" aria-label="Spending limit used" aria-valuemin={0} aria-valuemax={a.budgetUsd} aria-valuenow={a.costUsd}>
          <span style={{ width: `${Math.min(100, (a.costUsd / a.budgetUsd) * 100)}%` }} className={a.costUsd / a.budgetUsd > 0.85 ? 'high' : ''} />
        </div>
      ) : null}

      {hasChanges ? (
        <section>
          <h3>Files changed</h3>
          {a.files.slice(0, 40).map((f) => (
            <div className="file-row" key={f.file}>
              <span className="line">
                <span className="path mono" title={f.file}>
                  {f.file}
                </span>
                <span className="delta">
                  +{f.added}
                  {f.removed ? ` −${f.removed}` : ''}
                </span>
              </span>
              {f.sharedWith.length ? <span className="clash">{f.sharedWith.join(' and ')} also changed this</span> : null}
            </div>
          ))}
          {a.files.length > 40 ? <p className="muted">and {a.files.length - 40} more</p> : null}
        </section>
      ) : null}

      <section>
        <h3>What it did</h3>
        <div className="activity" ref={feedRef} style={{ maxHeight: 260, overflow: 'auto' }}>
          {a.activity.length === 0 ? <span className="muted">Nothing yet.</span> : null}
          {a.activity.slice(-60).map((item, i) => (
            <div className={`activity-row ${item.kind}`} key={`${item.at}-${i}`}>
              <time>{clockTime(item.at)}</time>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </section>

      {a.status !== 'merged' ? (
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <input
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Tell ${a.name} something`}
            aria-label={`Message ${a.name}`}
          />
          <button className="btn" type="submit" disabled={!draft.trim()}>
            Send
          </button>
        </form>
      ) : null}

      {confirming === 'discard' ? (
        <div className="confirm" role="alertdialog" aria-label="Discard this agent">
          <span>
            Discard {a.name}? Its folder and branch are deleted.
            {a.status === 'merged' ? ' Its work is already merged.' : ' Anything it hasn’t merged is lost.'}
          </span>
          <span className="row">
            <button className="btn" onClick={() => setConfirming(null)}>
              Keep it
            </button>
            <button className="btn danger" onClick={p.onDiscard}>
              Discard
            </button>
          </span>
        </div>
      ) : (
        <div className="panel-actions">
          {busy ? (
            <button className="btn" onClick={p.onPause}>
              Pause
            </button>
          ) : (a.status === 'paused' || a.status === 'error') && !a.overBudget ? (
            <button className="btn" onClick={p.onResume}>
              Continue
            </button>
          ) : null}
          <button className="btn" onClick={p.onOpenTerminal}>
            Open terminal
          </button>
          <button className="btn" onClick={() => setConfirming('discard')}>
            Discard
          </button>
          {a.status !== 'merged' ? (
            <button
              className="btn primary"
              style={{ flexBasis: '100%' }}
              disabled={!hasChanges}
              title={!hasChanges ? 'No changes to review yet' : undefined}
              onClick={p.onReview}
            >
              Review and merge
            </button>
          ) : null}
        </div>
      )}
    </aside>
  )
}
