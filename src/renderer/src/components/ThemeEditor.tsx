import { useEffect, useState } from 'react'
import type { MurmurApi, Result, ThemeDraft, ThemeInfo } from '@shared/types'
import { EDITABLE_TOKENS, isColor } from '@shared/themes'
import { applyTokens } from '../theme'

interface Props {
  api: MurmurApi
  run: <T>(call: Promise<Result<T>>) => Promise<T | undefined>
  /** Theme to start from; built-in and plugin themes are saved as your own copy. */
  base: ThemeInfo
  current: ThemeInfo
  onClose(): void
}

/**
 * A drawer at the side so the sky stays visible: every change previews live on
 * the real app, and Cancel puts the active theme back.
 */
export function ThemeEditor({ api, run, base, current, onClose }: Props) {
  const own = base.source === 'mine'
  const [name, setName] = useState(own ? base.name : `${base.name} copy`)
  const [tokens, setTokens] = useState<Record<string, string>>({ ...base.tokens })
  const [bands, setBands] = useState(base.bands)
  const [bgFile, setBgFile] = useState<string | null | undefined>(undefined) // undefined = keep
  const [dim, setDim] = useState(base.background?.dim ?? 0.2)
  const [reactive, setReactive] = useState(base.background?.reactive ?? true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    applyTokens(tokens)
  }, [tokens])

  const cancel = (): void => {
    applyTokens(current.tokens)
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const hasBackground = bgFile ? true : bgFile === null ? false : Boolean(base.background)
  const bgName = bgFile ? bgFile.split(/[\\/]/).pop() : base.background && bgFile !== null ? 'Current background' : null

  const save = async (): Promise<void> => {
    setSaving(true)
    const draft: ThemeDraft = {
      id: own ? base.id : undefined,
      name,
      tokens,
      bands,
      backgroundFile: bgFile === undefined ? (own ? undefined : null) : bgFile,
      dim,
      reactive
    }
    const saved = await run(api.themes.save(draft))
    if (saved) {
      await run(api.themes.use(saved.id))
      onClose()
    }
    setSaving(false)
  }

  return (
    <aside className="drawer" role="dialog" aria-modal="false" aria-labelledby="theme-editor-title">
      <h1 id="theme-editor-title">{own ? 'Edit theme' : 'New theme'}</h1>
      {!own ? <p className="muted small">Starting from {base.name}. Changes show on the app as you make them.</p> : null}

      <div className="field">
        <label htmlFor="theme-name">Name</label>
        <input id="theme-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="field">
        <span className="label">Colours</span>
        <div className="swatches">
          {EDITABLE_TOKENS.map(({ key, label }) => (
            <label className="swatch" key={key}>
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(tokens[key] ?? '') ? tokens[key] : '#000000'}
                onChange={(e) => setTokens((t) => ({ ...t, [key]: e.target.value }))}
              />
              <span>{label}</span>
              <input
                className="hex mono"
                aria-label={`${label} colour code`}
                value={tokens[key] ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setTokens((t) => ({ ...t, [key]: isColor(v) ? v : t[key] }))
                }}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label">Background</span>
        <p className="muted small" style={{ margin: 0 }}>
          An image or a looping video (MP4 or WebM, up to 200 MB) behind the flocks.
        </p>
        <div className="bg-row">
          <span className={bgName ? '' : 'muted'}>{bgName ?? 'None, just the sky colours'}</span>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const file = await api.themes.chooseBackground()
              if (file) {
                setBgFile(file)
                setBands(false)
              }
            }}
          >
            Choose…
          </button>
          {hasBackground ? (
            <button type="button" className="btn quiet" onClick={() => setBgFile(null)}>
              Remove
            </button>
          ) : null}
        </div>
        {bgFile ? <p className="muted small" style={{ margin: 0 }}>You’ll see it on the sky after saving.</p> : null}
        {hasBackground ? (
          <>
            <label className="range">
              <span>Darken it behind text</span>
              <input type="range" min={0} max={0.8} step={0.05} value={dim} onChange={(e) => setDim(Number(e.target.value))} />
            </label>
            <label className="check" style={{ color: 'var(--text)', marginTop: 0 }}>
              <input type="checkbox" checked={reactive} onChange={(e) => setReactive(e.target.checked)} />
              Video speeds up while agents are busy
            </label>
          </>
        ) : null}
        <label className="check" style={{ color: 'var(--text)', marginTop: 0 }}>
          <input type="checkbox" checked={bands} onChange={(e) => setBands(e.target.checked)} />
          Draw the sky bands and tree line
        </label>
      </div>

      <div className="drawer-actions">
        <button className="btn" onClick={cancel}>
          Cancel
        </button>
        <button className="btn primary" disabled={saving || !name.trim()} onClick={() => void save()}>
          {saving ? 'Saving…' : own ? 'Save' : 'Save theme'}
        </button>
      </div>
    </aside>
  )
}
