import { useCallback, useEffect, useState } from 'react'
import type { AccessMode, NewAgentInput, Recipe, StartTeamInput, ThemeInfo } from '@shared/types'
import { AgentPanel } from './components/AgentPanel'
import { AgentRail } from './components/AgentRail'
import { NewAgentDialog } from './components/NewAgentDialog'
import { PluginsSheet } from './components/PluginsSheet'
import { RecipeEditor } from './components/RecipeEditor'
import { ReviewSheet } from './components/ReviewSheet'
import { ThemeEditor } from './components/ThemeEditor'
import { SettingsDialog } from './components/SettingsDialog'
import { Sky } from './components/Sky'
import { TitleBar } from './components/TitleBar'
import { useMurmur } from './useMurmur'

export function App() {
  const { state, api, run, showError, chooseProject, updateSettings } = useMurmur()
  const { project, agents, approvals, settings, nowPlaying, update, error, themes, theme } = state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'new' | 'settings' | 'plugins' | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [editingRecipes, setEditingRecipes] = useState(false)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [themeBase, setThemeBase] = useState<ThemeInfo | null>(null)

  useEffect(() => {
    void api.recipes.list().then(setRecipes)
    // Clicking a Windows notification brings you to that agent.
    return api.agents.onFocus((id) => {
      setSelectedId(id)
      setDialog(null)
    })
  }, [api])

  // Keep a sensible selection as agents come and go.
  useEffect(() => {
    if (selectedId && agents.some((a) => a.id === selectedId)) return
    setSelectedId(agents[0]?.id ?? null)
  }, [agents, selectedId])

  // Errors fade on their own after a while.
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => showError(null), 9000)
    return () => clearTimeout(t)
  }, [error, showError])

  const selected = agents.find((a) => a.id === selectedId) ?? null
  const anyRunning = agents.some((a) => a.status === 'working' || a.status === 'waiting' || a.status === 'starting')

  const create = useCallback(
    async (input: NewAgentInput): Promise<boolean> => {
      const agent = await run(api.agents.create(input))
      if (agent) setSelectedId(agent.id)
      return Boolean(agent)
    },
    [api, run]
  )

  const startTeam = useCallback(
    async (input: StartTeamInput): Promise<boolean> => {
      const team = await run(api.agents.startTeam(input))
      if (team?.length) setSelectedId(team[0].id)
      return Boolean(team)
    },
    [api, run]
  )

  const reviewing = agents.find((a) => a.id === reviewId) ?? null

  const openNew = (): void => {
    if (!project) void chooseProject()
    else setDialog('new')
  }

  return (
    <div className="app">
      <TitleBar
        api={api}
        project={project}
        nowPlaying={nowPlaying}
        anyRunning={anyRunning}
        onChooseProject={() => void chooseProject()}
        onPauseAll={() => void run(api.agents.pauseAll())}
        onOpenSettings={() => setDialog('settings')}
        onOpenPlugins={() => setDialog(dialog === 'plugins' ? null : 'plugins')}
      />

      {project ? (
        <div className="body">
          <AgentRail agents={agents} selectedId={selectedId} onSelect={setSelectedId} onNew={openNew} />
          <Sky
            agents={agents}
            approvals={approvals}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAnswer={(id, allow) => void run(api.agents.answer(id, allow))}
            onNew={openNew}
            subscribeMessages={api.agents.onMessage}
            theme={theme}
          />
          {selected ? (
            <AgentPanel
              agent={selected}
              allowBypass={settings?.allowBypass ?? false}
              onSend={(text) => void run(api.agents.send(selected.id, text))}
              onPause={() => void run(api.agents.pause(selected.id))}
              onResume={() => void run(api.agents.resume(selected.id))}
              onSetMode={(mode: AccessMode) => void run(api.agents.setMode(selected.id, mode))}
              onReview={() => setReviewId(selected.id)}
              onSetBudget={(budget) => void run(api.agents.setBudget(selected.id, budget))}
              onDiscard={() => void run(api.agents.discard(selected.id))}
              onOpenTerminal={() => void run(api.agents.openTerminal(selected.id))}
            />
          ) : (
            <div style={{ width: 330, flexShrink: 0 }} />
          )}
        </div>
      ) : (
        <div className="welcome">
          <h1>Open a project to start</h1>
          <p>
            Pick a folder that’s a git repository. Every agent you start gets its own copy of it on its own branch, and you
            merge their work back when you’re happy with it.
          </p>
          <button className="btn primary" onClick={() => void chooseProject()}>
            Open a project
          </button>
        </div>
      )}

      {dialog === 'new' && settings && project ? (
        <NewAgentDialog
          settings={settings}
          projectName={project.name}
          recipes={recipes}
          onCreate={create}
          onStartTeam={startTeam}
          onEditRecipes={() => setEditingRecipes(true)}
          onHideCaution={() => void updateSettings({ hideAutoCaution: true })}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'plugins' ? <PluginsSheet api={api} run={run} notify={setInfo} onClose={() => setDialog(null)} /> : null}
      {dialog === 'settings' && settings ? (
        <SettingsDialog
          api={api}
          run={run}
          settings={settings}
          themes={themes}
          theme={theme}
          onSave={(patch) => void updateSettings(patch)}
          onEditTheme={(base) => {
            setDialog(null)
            setThemeBase(base)
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {editingRecipes ? (
        <RecipeEditor
          recipes={recipes}
          allowBypass={settings?.allowBypass ?? false}
          onSave={async (r) => {
            const saved = await run(api.recipes.save(r))
            setRecipes(await api.recipes.list())
            return saved
          }}
          onDelete={async (id) => {
            await run(api.recipes.remove(id))
            setRecipes(await api.recipes.list())
          }}
          onClose={() => setEditingRecipes(false)}
        />
      ) : null}
      {reviewing ? <ReviewSheet agent={reviewing} api={api} run={run} onClose={() => setReviewId(null)} /> : null}
      {themeBase && theme ? <ThemeEditor api={api} run={run} base={themeBase} current={theme} onClose={() => setThemeBase(null)} /> : null}

      <div className="toasts" aria-live="polite">
        {error ? (
          <div className="toast error" role="alert">
            <p>{error}</p>
            <button className="icon-btn" aria-label="Dismiss" onClick={() => showError(null)}>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" />
              </svg>
            </button>
          </div>
        ) : null}
        {info ? (
          <div className="toast" role="status">
            <p>{info}</p>
            <button className="icon-btn" aria-label="Dismiss" onClick={() => setInfo(null)}>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" />
              </svg>
            </button>
          </div>
        ) : null}
        {update.kind === 'ready' ? (
          <div className="toast">
            <p>Murmur {update.version} is ready.</p>
            <button className="btn primary" onClick={api.updates.restartToUpdate}>
              Restart to update
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
