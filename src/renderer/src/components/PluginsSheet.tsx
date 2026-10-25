import { useEffect, useMemo, useState } from 'react'
import type { InstalledPlugin, Marketplace, MarketplacePlugin, MurmurApi, MySkill, PluginContents, PluginsState, Result } from '@shared/types'

type Tab = 'browse' | 'installed' | 'skills' | 'marketplaces'

interface Props {
  api: MurmurApi
  run: <T>(call: Promise<Result<T>>) => Promise<T | undefined>
  notify(text: string): void
  onClose(): void
}

const runsCode = (c?: PluginContents): boolean => Boolean(c && (c.hooks || c.mcpServers.length))

function summary(c?: PluginContents): string {
  if (!c) return ''
  const parts: string[] = []
  const n = (count: number, one: string, many: string): void => {
    if (count) parts.push(`${count} ${count === 1 ? one : many}`)
  }
  n(c.skills.length, 'skill', 'skills')
  n(c.commands.length, 'command', 'commands')
  n(c.agents.length, 'agent', 'agents')
  n(c.mcpServers.length, 'tool server', 'tool servers')
  if (c.hooks) parts.push('hooks')
  return parts.join(', ')
}

function ago(ms?: number): string {
  if (!ms) return 'never'
  const m = Math.round((Date.now() - ms) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

export function PluginsSheet({ api, run, notify, onClose }: Props) {
  const [state, setState] = useState<PluginsState | null>(null)
  const [tab, setTab] = useState<Tab>('browse')

  useEffect(() => {
    void api.plugins.state().then(setState)
    const off = api.plugins.onChange(setState)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [api, onClose])

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'browse', label: 'Browse' },
    { id: 'installed', label: `Installed${state?.installed.length ? ` (${state.installed.length})` : ''}` },
    { id: 'skills', label: `My skills${state?.mySkills.length ? ` (${state.mySkills.length})` : ''}` },
    { id: 'marketplaces', label: 'Marketplaces' }
  ]

  return (
    <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="plugins-title">
      <header className="sheet-head">
        <h1 id="plugins-title">Plugins and skills</h1>
        <div className="tabs" role="tablist" aria-label="Plugins and skills">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className="tab" onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </header>
      {!state ? (
        <p className="muted sheet-pad">Loading…</p>
      ) : tab === 'browse' ? (
        <Browse state={state} api={api} run={run} notify={notify} />
      ) : tab === 'installed' ? (
        <Installed state={state} api={api} run={run} onBrowse={() => setTab('browse')} />
      ) : tab === 'skills' ? (
        <Skills state={state} api={api} run={run} />
      ) : (
        <Marketplaces state={state} api={api} run={run} />
      )}
    </section>
  )
}

// ---------- Browse ----------

function Browse({ state, api, run, notify }: { state: PluginsState; api: MurmurApi; run: Props['run']; notify: Props['notify'] }) {
  const [query, setQuery] = useState('')
  const [market, setMarket] = useState<string>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const marketsByKey = useMemo(() => new Map(state.marketplaces.map((m) => [m.key, m])), [state.marketplaces])
  const installedKeys = useMemo(() => new Set(state.installed.map((p) => p.key)), [state.installed])

  const plugins = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.marketplaces
      .filter((m) => market === 'all' || m.key === market)
      .flatMap((m) => m.plugins)
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q) ||
          (p.contents?.skills ?? []).some((s) => s.toLowerCase().includes(q))
      )
  }, [state.marketplaces, market, query])

  const selected = plugins.find((p) => p.key === selectedKey) ?? null
  const anyLoading = state.marketplaces.some((m) => m.loading)

  return (
    <div className="browse">
      <nav className="market-filter" aria-label="Marketplaces">
        <input
          className="input"
          type="search"
          placeholder="Search plugins and skills"
          aria-label="Search plugins and skills"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="filter-list" role="radiogroup" aria-label="Show plugins from">
          <FilterItem active={market === 'all'} onClick={() => setMarket('all')} label="Everything" count={state.marketplaces.reduce((n, m) => n + m.plugins.length, 0)} />
          {state.marketplaces.map((m) => (
            <FilterItem key={m.key} active={market === m.key} onClick={() => setMarket(m.key)} label={marketLabel(m)} count={m.plugins.length} official={m.official} loading={m.loading} />
          ))}
        </div>
      </nav>

      <div className="plugin-list" role="list" aria-busy={anyLoading}>
        {plugins.length === 0 ? (
          <p className="muted sheet-pad">{anyLoading ? 'Loading marketplaces…' : query ? `Nothing matches “${query}”.` : 'This marketplace has no plugins yet.'}</p>
        ) : null}
        {plugins.map((p) => {
          const m = marketsByKey.get(p.marketplaceKey)
          return (
            <button
              key={p.key}
              role="listitem"
              className={`plugin-row${p.key === selectedKey ? ' selected' : ''}`}
              onClick={() => setSelectedKey(p.key)}
            >
              <span className="plugin-row-top">
                <span className="plugin-name">{p.name}</span>
                {installedKeys.has(p.key) ? <span className="installed-mark">Installed</span> : null}
              </span>
              {p.description ? <span className="plugin-desc">{p.description}</span> : null}
              <span className="plugin-meta">
                {m ? marketLabel(m) : ''}
                {p.contents ? `, ${summary(p.contents)}` : ''}
                {runsCode(p.contents) ? <span className="runs-code">, runs code</span> : null}
              </span>
            </button>
          )
        })}
      </div>

      <aside className="plugin-detail">
        {selected ? (
          <PluginDetail
            key={selected.key}
            plugin={selected}
            market={marketsByKey.get(selected.marketplaceKey)}
            installed={state.installed.find((i) => i.key === selected.key)}
            busy={state.busy.includes(selected.key)}
            onInstall={async (allowCode) => {
              const r = await run(api.plugins.install(selected.key, allowCode))
              if (r && r.runsCode && !r.enabled) {
                notify(`${selected.name} runs code on your computer, so it's installed but switched off. Turn it on under Installed if you trust it.`)
              }
            }}
            onUninstall={() => void run(api.plugins.uninstall(selected.key))}
          />
        ) : (
          <div className="detail-empty">
            <p>Pick a plugin to see what it adds.</p>
            <p className="muted">
              Plugins give your agents new skills, commands and helpers. They use Claude Code’s plugin format, so anything made for Claude Code works here too.
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}

function marketLabel(m: Marketplace): string {
  const known: Record<string, string> = {
    'anthropics/claude-plugins-official': 'Claude official',
    'anthropics/skills': 'Anthropic skills',
    'anthropics/claude-plugins-community': 'Claude community',
    'maybedelusional/murmur/marketplace': 'Murmur community'
  }
  return known[m.key] ?? m.name
}

function FilterItem(p: { active: boolean; onClick(): void; label: string; count: number; official?: boolean; loading?: boolean }) {
  return (
    <button role="radio" aria-checked={p.active} className="filter-item" onClick={p.onClick}>
      <span>
        {p.label}
        {p.official ? <span className="official"> from Anthropic</span> : null}
      </span>
      <span className="muted">{p.loading && !p.count ? '…' : p.count}</span>
    </button>
  )
}

function PluginDetail(props: {
  plugin: MarketplacePlugin
  market?: Marketplace
  installed?: InstalledPlugin
  busy: boolean
  onInstall(allowCode: boolean): Promise<void>
  onUninstall(): void
}) {
  const { plugin: p, market, installed, busy } = props
  const contents = installed?.contents ?? p.contents
  const code = runsCode(contents)
  const [confirming, setConfirming] = useState(false)

  const install = (): void => {
    if (code && !confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    void props.onInstall(code)
  }

  return (
    <div className="detail">
      <h2>{p.name}</h2>
      {p.description ? <p className="detail-desc">{p.description}</p> : null}

      <dl className="facts">
        <dt>From</dt>
        <dd title={p.from}>{p.from}</dd>
        {market ? (
          <>
            <dt>Listed in</dt>
            <dd>
              {marketLabel(market)}
              {market.official ? <span className="official"> (from Anthropic)</span> : null}
            </dd>
          </>
        ) : null}
        {p.author ? (
          <>
            <dt>By</dt>
            <dd>{p.author}</dd>
          </>
        ) : null}
        {installed?.version ?? p.version ? (
          <>
            <dt>Version</dt>
            <dd>{installed?.version ?? p.version}</dd>
          </>
        ) : null}
      </dl>

      {contents ? (
        <div className="contents">
          <ContentList title="Skills" items={contents.skills} />
          <ContentList title="Commands" items={contents.commands.map((c) => `/${c}`)} />
          <ContentList title="Helper agents" items={contents.agents} />
          <ContentList title="Tool servers" items={contents.mcpServers} />
          {contents.hooks ? <ContentList title="Hooks" items={['Runs scripts when agents use tools']} /> : null}
        </div>
      ) : (
        <p className="muted">This plugin lives in its own repository. Murmur checks what it contains when it downloads.</p>
      )}

      {code ? (
        <div className="note danger">
          <strong>Runs code on your computer.</strong> Its {contents?.hooks ? 'hooks' : ''}
          {contents?.hooks && contents.mcpServers.length ? ' and ' : ''}
          {contents?.mcpServers.length ? 'tool servers' : ''} run with your permissions whenever an agent uses it. Only install it if you trust {p.from}.
        </div>
      ) : null}

      {!p.supported ? (
        <p className="muted">Murmur can’t install plugins from {p.from} yet.</p>
      ) : installed ? (
        <div className="detail-actions">
          <span className="muted">Installed{installed.enabled ? '' : ', switched off'}</span>
          <button className="btn" onClick={props.onUninstall} disabled={busy}>
            Remove
          </button>
        </div>
      ) : (
        <div className="detail-actions">
          {p.homepage ? (
            <a className="btn quiet" href={p.homepage} target="_blank" rel="noreferrer">
              Homepage
            </a>
          ) : null}
          {confirming ? (
            <button className="btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          ) : null}
          <button className={`btn ${confirming ? 'danger' : 'primary'}`} onClick={install} disabled={busy}>
            {busy ? 'Installing…' : confirming ? 'Install and turn on' : 'Install'}
          </button>
        </div>
      )}
    </div>
  )
}

function ContentList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div>
      <h3>{title}</h3>
      <p className="content-items">{items.join(', ')}</p>
    </div>
  )
}

// ---------- Installed ----------

function Installed({ state, api, run, onBrowse }: { state: PluginsState; api: MurmurApi; run: Props['run']; onBrowse(): void }) {
  const [confirmOn, setConfirmOn] = useState<string | null>(null)
  if (!state.installed.length) {
    return (
      <div className="sheet-empty">
        <p>No plugins installed yet.</p>
        <button className="btn primary" onClick={onBrowse}>
          Browse plugins
        </button>
      </div>
    )
  }
  return (
    <div className="sheet-pad installed-list">
      <p className="muted lead">New agents get these as soon as they start. Agents already running pick up changes the next time they start.</p>
      {state.installed.map((p) => {
        const code = runsCode(p.contents)
        const busy = state.busy.includes(p.key)
        return (
          <div className="installed-row" key={p.key}>
            <div className="installed-info">
              <span className="plugin-name">{p.name}</span>
              <span className="plugin-meta">
                {p.marketplaceName}
                {p.version ? `, version ${p.version}` : ''}
                {summary(p.contents) ? `, ${summary(p.contents)}` : ''}
                {code ? <span className="runs-code">, runs code</span> : null}
              </span>
              {confirmOn === p.key ? (
                <div className="note danger" style={{ marginTop: 8 }}>
                  <strong>{p.name} runs code on your computer</strong> whenever an agent uses it.{' '}
                  <button
                    className="btn danger"
                    style={{ marginLeft: 6 }}
                    onClick={() => {
                      setConfirmOn(null)
                      void run(api.plugins.setEnabled(p.key, true))
                    }}
                  >
                    Turn it on
                  </button>{' '}
                  <button className="btn" onClick={() => setConfirmOn(null)}>
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={p.enabled}
                onChange={(e) => {
                  if (e.target.checked && code) setConfirmOn(p.key)
                  else void run(api.plugins.setEnabled(p.key, e.target.checked))
                }}
              />
              <span>{p.enabled ? 'On' : 'Off'}</span>
            </label>
            <button className="btn" disabled={busy} onClick={() => void run(api.plugins.update(p.key))}>
              {busy ? 'Updating…' : 'Update'}
            </button>
            <button className="btn" disabled={busy} onClick={() => void run(api.plugins.uninstall(p.key))}>
              Remove
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ---------- My skills ----------

const BLANK: MySkill = { name: '', description: '', body: '' }

function Skills({ state, api, run }: { state: PluginsState; api: MurmurApi; run: Props['run'] }) {
  const [editing, setEditing] = useState<{ original?: string; skill: MySkill } | null>(
    state.mySkills[0] ? { original: state.mySkills[0].name, skill: state.mySkills[0] } : null
  )
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = async (): Promise<void> => {
    if (!editing) return
    const r = await api.plugins.saveSkill(editing.skill, editing.original)
    if (!r.ok) {
      await run(Promise.resolve(r))
      return
    }
    const name = editing.skill.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    setEditing({ original: name, skill: { ...editing.skill, name } })
  }

  return (
    <div className="skills">
      <nav className="skills-list" aria-label="Your skills">
        <button className="btn primary" onClick={() => setEditing({ skill: { ...BLANK } })}>
          New skill
        </button>
        {state.mySkills.map((s) => (
          <button
            key={s.name}
            className={`filter-item${editing?.original === s.name ? ' selected' : ''}`}
            onClick={() => {
              setConfirmDelete(false)
              setEditing({ original: s.name, skill: s })
            }}
          >
            <span>{s.name}</span>
          </button>
        ))}
      </nav>

      {editing ? (
        <form
          className="skill-editor"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="field">
            <label htmlFor="skill-name">Name</label>
            <input
              id="skill-name"
              className="input"
              value={editing.skill.name}
              placeholder="for example write-release-notes"
              onChange={(e) => setEditing({ ...editing, skill: { ...editing.skill, name: e.target.value } })}
            />
          </div>
          <div className="field">
            <label htmlFor="skill-desc">When should agents use it?</label>
            <textarea
              id="skill-desc"
              className="textarea"
              rows={2}
              value={editing.skill.description}
              placeholder="Use when writing release notes for a new version."
              onChange={(e) => setEditing({ ...editing, skill: { ...editing.skill, description: e.target.value } })}
            />
          </div>
          <div className="field grow">
            <label htmlFor="skill-body">Instructions</label>
            <textarea
              id="skill-body"
              className="textarea mono-area"
              value={editing.skill.body}
              placeholder={'# Release notes\n\n1. Read the commits since the last tag.\n2. Group them into Added, Changed and Fixed.\n3. Write one plain sentence per change.'}
              onChange={(e) => setEditing({ ...editing, skill: { ...editing.skill, body: e.target.value } })}
            />
          </div>
          <div className="detail-actions">
            {editing.original ? (
              confirmDelete ? (
                <>
                  <span className="muted">Delete {editing.original}?</span>
                  <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => {
                      void run(api.plugins.deleteSkill(editing.original!))
                      setConfirmDelete(false)
                      setEditing(null)
                    }}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>
                  Delete
                </button>
              )
            ) : null}
            <button type="submit" className="btn primary">
              {editing.original ? 'Save' : 'Create skill'}
            </button>
          </div>
        </form>
      ) : (
        <div className="sheet-empty">
          <p>Write your own skills: instructions agents follow when a task matches.</p>
          <p className="muted">Every agent gets your skills. They’re saved as a regular Claude Code plugin, so you can share them later.</p>
        </div>
      )}
    </div>
  )
}

// ---------- Marketplaces ----------

function Marketplaces({ state, api, run }: { state: PluginsState; api: MurmurApi; run: Props['run'] }) {
  const [repo, setRepo] = useState('')
  const [adding, setAdding] = useState(false)
  const anyLoading = state.marketplaces.some((m) => m.loading)

  return (
    <div className="sheet-pad markets">
      <form
        className="add-market"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!repo.trim()) return
          setAdding(true)
          const r = await run(api.plugins.addMarketplace(repo))
          setAdding(false)
          if (r !== undefined) setRepo('')
        }}
      >
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="market-repo">Add a marketplace from GitHub</label>
          <input id="market-repo" className="input mono" placeholder="owner/repository" value={repo} onChange={(e) => setRepo(e.target.value)} />
          <span className="muted small">Anthropic doesn’t check marketplaces from other people. Only add ones you trust.</span>
        </div>
        <button className="btn primary" type="submit" disabled={adding || !repo.trim()}>
          {adding ? 'Adding…' : 'Add'}
        </button>
      </form>

      <div className="market-rows">
        <div className="market-rows-head">
          <h2>Your marketplaces</h2>
          <button className="btn" disabled={anyLoading} onClick={() => void run(api.plugins.refresh())}>
            {anyLoading ? 'Checking…' : 'Check for new plugins'}
          </button>
        </div>
        {state.marketplaces.map((m) => (
          <div className="market-row" key={m.key}>
            <div className="installed-info">
              <span className="plugin-name">
                {marketLabel(m)}
                {m.official ? <span className="official"> from Anthropic</span> : null}
              </span>
              <span className="plugin-meta mono">
                github.com/{m.repo}
                {m.path ? `/${m.path}` : ''}
              </span>
              <span className="plugin-meta">
                {m.loading ? 'Updating…' : `${m.plugins.length} ${m.plugins.length === 1 ? 'plugin' : 'plugins'}, updated ${ago(m.refreshedAt)}`}
              </span>
              {m.error ? <span className="clash">{m.error}</span> : null}
            </div>
            <button className="btn" onClick={() => void run(api.plugins.removeMarketplace(m.key))}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
