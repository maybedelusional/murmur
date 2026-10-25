// A stand-in for the Electron bridge so the UI can be opened in a plain
// browser while designing (`npm run dev`, then open the renderer URL).
// Never used inside the real app.
import type { AgentSnapshot, ApprovalRequest, MurmurApi, NowPlaying, Settings } from '@shared/types'

export function installMock(): void {
  const now = Date.now()
  const mk = (p: Partial<AgentSnapshot> & Pick<AgentSnapshot, 'name' | 'role' | 'status' | 'statusText' | 'mode'>): AgentSnapshot => ({
    id: p.name.toLowerCase().replace(/\s/g, '-'),
    task: 'Add refresh-token rotation to the session endpoint.',
    branch: `murmur/${p.name.toLowerCase().replace(/\s/g, '-')}-k3f9`,
    folder: `C:\\cw\\acme-web\\${p.name.toLowerCase().replace(/\s/g, '-')}`,
    activity: [],
    files: [],
    linesAdded: 0,
    linesRemoved: 0,
    costUsd: 0,
    createdAt: now,
    ...p
  })
  let agents: AgentSnapshot[] = [
    mk({ name: 'Planner', role: 'planner', status: 'idle', statusText: 'Done, waiting for you', mode: 'ask', task: 'Plan the session work into parallel tasks.' }),
    mk({
      name: 'Builder A',
      role: 'builder',
      status: 'working',
      statusText: 'Editing src/auth/session.ts',
      mode: 'auto',
      linesAdded: 184,
      linesRemoved: 37,
      files: [
        { file: 'src/auth/session.ts', added: 92, removed: 30, sharedWith: ['Builder B'] },
        { file: 'src/auth/rotate.ts', added: 71, removed: 0, sharedWith: [] },
        { file: 'src/routes/login.ts', added: 12, removed: 7, sharedWith: [] },
        { file: 'test/auth.spec.ts', added: 9, removed: 0, sharedWith: [] }
      ],
      activity: [
        { at: now - 240000, kind: 'read', text: 'Read src/auth/session.ts' },
        { at: now - 180000, kind: 'edit', text: 'Edited src/auth/session.ts' },
        { at: now - 170000, kind: 'edit', text: 'Wrote src/auth/rotate.ts' },
        { at: now - 90000, kind: 'run', text: 'Ran npm test -- auth' },
        { at: now - 60000, kind: 'say', text: 'All 12 auth tests pass. Next I will handle the expired-token path.' }
      ]
    }),
    mk({ name: 'Builder B', role: 'builder', status: 'working', statusText: 'Running npm test', mode: 'auto', task: 'Rate-limit the login route.' }),
    mk({ name: 'Reviewer', role: 'reviewer', status: 'waiting', statusText: 'Waiting for you', mode: 'ask', task: 'Review the builders\u2019 branches.' }),
    mk({ name: 'Tester', role: 'tester', status: 'working', statusText: 'Writing end-to-end tests', mode: 'edits', task: 'Test an expired session.' })
  ]
  let approvals: ApprovalRequest[] = [
    { id: 'ap1', agentId: 'reviewer', title: 'Reviewer wants to run a command', detail: 'git diff main...murmur/builder-a-k3f9', toolName: 'Bash', at: now }
  ]
  let settings: Settings = { worktreeRoot: 'C:\\cw', allowBypass: false, hideAutoCaution: false, theme: 'dusk' }
  const listeners = new Set<(a: AgentSnapshot[], p: ApprovalRequest[]) => void>()
  const push = (): void => listeners.forEach((l) => l(agents, approvals))
  const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value })
  const playing: NowPlaying = { available: true, title: 'Low Tide', artist: 'Halden Fields', playing: true }

  const api: MurmurApi = {
    platform: 'win32',
    window: { minimize() {}, toggleMaximize() {}, close() {} },
    project: {
      current: () => Promise.resolve({ path: 'C:\\code\\acme-web', name: 'acme-web', branch: 'main' }),
      choose: () => ok(null)
    },
    agents: {
      list: () => Promise.resolve(agents),
      create: (input) => {
        const a = mk({ name: `${input.role[0].toUpperCase()}${input.role.slice(1)} ${agents.length}`, role: input.role, status: 'starting', statusText: 'Starting', mode: input.mode, task: input.task })
        agents = [...agents, a]
        setTimeout(() => {
          agents = agents.map((x) => (x.id === a.id ? { ...x, status: 'working', statusText: 'Reading the code' } : x))
          push()
        }, 1500)
        push()
        return ok(a)
      },
      send: () => ok(undefined),
      pause: (id) => {
        agents = agents.map((x) => (x.id === id ? { ...x, status: 'paused', statusText: 'Paused' } : x))
        push()
        return ok(undefined)
      },
      resume: (id) => {
        agents = agents.map((x) => (x.id === id ? { ...x, status: 'working', statusText: 'Thinking' } : x))
        push()
        return ok(undefined)
      },
      pauseAll: () => {
        agents = agents.map((x) => (x.status === 'working' ? { ...x, status: 'paused', statusText: 'Paused' } : x))
        push()
        return ok(undefined)
      },
      setMode: (id, mode) => {
        agents = agents.map((x) => (x.id === id ? { ...x, mode } : x))
        push()
        return ok(undefined)
      },
      merge: (id) => {
        agents = agents.map((x) => (x.id === id ? { ...x, status: 'merged', statusText: 'Merged into main' } : x))
        push()
        return ok('main')
      },
      discard: (id) => {
        agents = agents.filter((x) => x.id !== id)
        push()
        return ok(undefined)
      },
      openTerminal: () => ok(undefined),
      answer: (approvalId) => {
        approvals = approvals.filter((p) => p.id !== approvalId)
        agents = agents.map((x) => (x.status === 'waiting' ? { ...x, status: 'working', statusText: 'Reviewing builder-a' } : x))
        push()
        return ok(undefined)
      },
      onUpdate: (cb) => {
        listeners.add(cb)
        setTimeout(() => cb(agents, approvals), 0)
        return () => listeners.delete(cb)
      }
    },
    settings: {
      get: () => Promise.resolve(settings),
      set: (patch) => {
        settings = { ...settings, ...patch }
        return Promise.resolve(settings)
      }
    },
    media: {
      onChange: (cb) => {
        setTimeout(() => cb(playing), 0)
        return () => undefined
      },
      command: () => Promise.resolve()
    },
    updates: { onChange: () => () => undefined, restartToUpdate() {} }
  }
  window.murmur = api
}
