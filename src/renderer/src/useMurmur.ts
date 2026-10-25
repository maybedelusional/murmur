import { useCallback, useEffect, useState } from 'react'
import type { AgentSnapshot, ApprovalRequest, NowPlaying, ProjectInfo, Result, Settings, UpdateState } from '@shared/types'

export interface MurmurState {
  project: ProjectInfo | null
  agents: AgentSnapshot[]
  approvals: ApprovalRequest[]
  settings: Settings | null
  nowPlaying: NowPlaying
  update: UpdateState
  error: string | null
}

export function useMurmur() {
  const api = window.murmur
  const [state, setState] = useState<MurmurState>({
    project: null,
    agents: [],
    approvals: [],
    settings: null,
    nowPlaying: { available: false },
    update: { kind: 'none' },
    error: null
  })

  useEffect(() => {
    void Promise.all([api.project.current(), api.agents.list(), api.settings.get()]).then(([project, agents, settings]) =>
      setState((s) => ({ ...s, project, agents, settings }))
    )
    const offs = [
      api.agents.onUpdate((agents, approvals) => setState((s) => ({ ...s, agents, approvals }))),
      api.media.onChange((nowPlaying) => setState((s) => ({ ...s, nowPlaying }))),
      api.updates.onChange((update) => setState((s) => ({ ...s, update })))
    ]
    return () => offs.forEach((off) => off())
  }, [api])

  const showError = useCallback((error: string | null) => setState((s) => ({ ...s, error })), [])

  /** Runs an API call and surfaces its error message, if any. */
  const run = useCallback(
    async <T,>(call: Promise<Result<T>>): Promise<T | undefined> => {
      const r = await call
      if (!r.ok) {
        showError(r.error)
        return undefined
      }
      return r.value
    },
    [showError]
  )

  const chooseProject = useCallback(async () => {
    const project = await run(api.project.choose())
    if (project) {
      const agents = await api.agents.list()
      setState((s) => ({ ...s, project, agents }))
    }
  }, [api, run])

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const settings = await api.settings.set(patch)
      setState((s) => ({ ...s, settings }))
    },
    [api]
  )

  return { state, api, run, showError, chooseProject, updateSettings }
}
