import { useEffect, useState } from 'react'
import type { Settings } from '@shared/types'

interface Props {
  settings: Settings
  onSave(patch: Partial<Settings>): void
  onClose(): void
}

export function SettingsDialog({ settings, onSave, onClose }: Props) {
  const [root, setRoot] = useState(settings.worktreeRoot)
  const [allowBypass, setAllowBypass] = useState(settings.allowBypass)
  const [showCaution, setShowCaution] = useState(!settings.hideAutoCaution)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onSubmit={(e) => {
          e.preventDefault()
          onSave({ worktreeRoot: root.trim() || settings.worktreeRoot, allowBypass, hideAutoCaution: !showCaution })
          onClose()
        }}
      >
        <h1 id="settings-title">Settings</h1>

        <div className="field">
          <label htmlFor="root">Where agents keep their copies</label>
          <input id="root" className="input mono" value={root} onChange={(e) => setRoot(e.target.value)} />
          <span className="muted" style={{ fontSize: 13 }}>
            Keep this short, like C:\cw. Long paths break some tools on Windows.
          </span>
        </div>

        <div className="field">
          <span className="label">Theme</span>
          <div className="chips">
            <button type="button" className="chip" aria-pressed="true">
              Dusk
            </button>
          </div>
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
            <div className="note danger">
              Agents in this mode run any command without asking. Only use it for throwaway work you can afford to lose.
            </div>
          ) : null}
        </div>

        <div className="dialog-footer">
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary">
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
