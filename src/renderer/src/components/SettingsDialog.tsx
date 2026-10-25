import { useEffect, useState } from 'react'
import type { MurmurApi, Result, Settings, ThemeInfo } from '@shared/types'
import { parseBudget } from './NewAgentDialog'

interface Props {
  api: MurmurApi
  run: <T>(call: Promise<Result<T>>) => Promise<T | undefined>
  settings: Settings
  themes: ThemeInfo[]
  theme: ThemeInfo | null
  onSave(patch: Partial<Settings>): void
  onEditTheme(base: ThemeInfo): void
  onClose(): void
}

function ThemeSwatch({ t }: { t: ThemeInfo }) {
  return (
    <span className="theme-swatch" aria-hidden="true">
      <span style={{ background: t.tokens.skyHigh }} />
      <span style={{ background: t.tokens.sky }} />
      <span style={{ background: t.tokens.horizon }} />
      <span style={{ background: t.tokens.ink }} />
    </span>
  )
}

export function SettingsDialog({ api, run, settings, themes, theme, onSave, onEditTheme, onClose }: Props) {
  const [root, setRoot] = useState(settings.worktreeRoot)
  const [allowBypass, setAllowBypass] = useState(settings.allowBypass)
  const [showCaution, setShowCaution] = useState(!settings.hideAutoCaution)
  const [budget, setBudget] = useState(settings.defaultBudgetUsd > 0 ? String(settings.defaultBudgetUsd) : '')
  const [notifyApprovals, setNotifyApprovals] = useState(settings.notifyApprovals)
  const [notifyFinished, setNotifyFinished] = useState(settings.notifyFinished)
  const [notifyErrors, setNotifyErrors] = useState(settings.notifyErrors)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const budgetValue = parseBudget(budget)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const source = (t: ThemeInfo): string =>
    t.source === 'builtin' ? 'Built in' : t.source === 'mine' ? 'Yours' : `From ${t.pluginName ?? 'a plugin'}`

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onSubmit={(e) => {
          e.preventDefault()
          if (budgetValue === 'invalid') return
          onSave({
            worktreeRoot: root.trim() || settings.worktreeRoot,
            allowBypass,
            hideAutoCaution: !showCaution,
            defaultBudgetUsd: budgetValue ?? 0,
            notifyApprovals,
            notifyFinished,
            notifyErrors
          })
          onClose()
        }}
      >
        <h1 id="settings-title">Settings</h1>

        <div className="field">
          <span className="label">Theme</span>
          <div className="theme-list" role="radiogroup" aria-label="Theme">
            {themes.map((t) => (
              <div className="theme-row" key={t.id}>
                <button type="button" role="radio" aria-checked={theme?.id === t.id} className="theme-pick" onClick={() => void run(api.themes.use(t.id))}>
                  <ThemeSwatch t={t} />
                  <span className="theme-name">
                    {t.name}
                    <span className="muted small">
                      {source(t)}
                      {t.background ? (t.background.kind === 'video' ? ', video' : ', image') : ''}
                    </span>
                  </span>
                </button>
                {confirmDelete === t.id ? (
                  <>
                    <button type="button" className="btn quiet" onClick={() => setConfirmDelete(null)}>
                      Keep
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => {
                        setConfirmDelete(null)
                        void run(api.themes.remove(t.id))
                      }}
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn quiet" onClick={() => onEditTheme(t)}>
                      {t.source === 'mine' ? 'Edit' : 'Make a copy'}
                    </button>
                    {t.source === 'mine' ? (
                      <button type="button" className="btn quiet" onClick={() => setConfirmDelete(t.id)}>
                        Delete
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            ))}
          </div>
          <span className="muted small">More themes come with plugins: look for themes under Plugins.</span>
        </div>

        <div className="field">
          <label htmlFor="budget-default">Spending limit for new agents</label>
          <div className="budget-input">
            <span aria-hidden="true">$</span>
            <input
              id="budget-default"
              className="input"
              inputMode="decimal"
              placeholder="No limit"
              value={budget}
              aria-invalid={budgetValue === 'invalid'}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
          <span className="muted small">{budgetValue === 'invalid' ? 'Enter an amount like 5 or 2.50.' : 'You can change it for each agent.'}</span>
        </div>

        <div className="field">
          <span className="label">Notify me when Murmur is in the background</span>
          <label className="check" style={{ color: 'var(--text)', marginTop: 0 }}>
            <input type="checkbox" checked={notifyApprovals} onChange={(e) => setNotifyApprovals(e.target.checked)} />
            An agent needs my approval
          </label>
          <label className="check" style={{ color: 'var(--text)', marginTop: 0 }}>
            <input type="checkbox" checked={notifyFinished} onChange={(e) => setNotifyFinished(e.target.checked)} />
            An agent finishes
          </label>
          <label className="check" style={{ color: 'var(--text)', marginTop: 0 }}>
            <input type="checkbox" checked={notifyErrors} onChange={(e) => setNotifyErrors(e.target.checked)} />
            An agent stops with an error or hits its spending limit
          </label>
        </div>

        <div className="field">
          <label htmlFor="root">Where agents keep their copies</label>
          <input id="root" className="input mono" value={root} onChange={(e) => setRoot(e.target.value)} />
          <span className="muted small">Keep this short, like C:\cw. Long paths break some tools on Windows.</span>
        </div>

        <div className="field">
          <span className="label">Auto mode</span>
          <label className="check" style={{ color: 'var(--text)', marginTop: 0 }}>
            <input type="checkbox" checked={showCaution} onChange={(e) => setShowCaution(e.target.checked)} />
            Show the caution note when starting an agent in Auto
          </label>
        </div>

        <div className="field">
          <span className="label">Advanced</span>
          <label className="check" style={{ color: 'var(--text)', marginTop: 0 }}>
            <input type="checkbox" checked={allowBypass} onChange={(e) => setAllowBypass(e.target.checked)} />
            Allow “Skip all checks” mode
          </label>
          {allowBypass ? (
            <div className="note danger">Agents in this mode run any command without asking. Only use it for throwaway work you can afford to lose.</div>
          ) : null}
        </div>

        <div className="dialog-footer">
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={budgetValue === 'invalid'}>
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
