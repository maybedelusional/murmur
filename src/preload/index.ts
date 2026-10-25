import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AgentMessageEvent,
  AgentSnapshot,
  ApprovalRequest,
  MurmurApi,
  NowPlaying,
  PluginsState,
  ThemeInfo,
  UpdateState
} from '@shared/types'

function listen<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const fn = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as T))
  ipcRenderer.on(channel, fn)
  return () => ipcRenderer.removeListener(channel, fn)
}

const api: MurmurApi = {
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.send(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC.windowClose)
  },
  project: {
    current: () => ipcRenderer.invoke(IPC.projectCurrent),
    choose: () => ipcRenderer.invoke(IPC.projectChoose)
  },
  agents: {
    list: () => ipcRenderer.invoke(IPC.agentsList),
    create: (input) => ipcRenderer.invoke(IPC.agentsCreate, input),
    send: (id, text) => ipcRenderer.invoke(IPC.agentsSend, id, text),
    pause: (id) => ipcRenderer.invoke(IPC.agentsPause, id),
    resume: (id) => ipcRenderer.invoke(IPC.agentsResume, id),
    pauseAll: () => ipcRenderer.invoke(IPC.agentsPauseAll),
    setMode: (id, mode) => ipcRenderer.invoke(IPC.agentsSetMode, id, mode),
    merge: (id) => ipcRenderer.invoke(IPC.agentsMerge, id),
    discard: (id) => ipcRenderer.invoke(IPC.agentsDiscard, id),
    openTerminal: (id) => ipcRenderer.invoke(IPC.agentsOpenTerminal, id),
    answer: (approvalId, allow) => ipcRenderer.invoke(IPC.agentsAnswer, approvalId, allow),
    onUpdate: (cb) => listen<[AgentSnapshot[], ApprovalRequest[]]>(IPC.agentsUpdated, cb),
    onMessage: (cb) => listen<[AgentMessageEvent]>(IPC.agentsMessage, cb),
    onFocus: (cb) => listen<[string]>(IPC.agentsFocus, cb),
    setBudget: (id, budget) => ipcRenderer.invoke(IPC.agentsSetBudget, id, budget),
    diff: (id) => ipcRenderer.invoke(IPC.agentsDiff, id),
    startTeam: (input) => ipcRenderer.invoke(IPC.agentsStartTeam, input)
  },
  recipes: {
    list: () => ipcRenderer.invoke(IPC.recipesList),
    save: (recipe) => ipcRenderer.invoke(IPC.recipesSave, recipe),
    remove: (id) => ipcRenderer.invoke(IPC.recipesRemove, id)
  },
  themes: {
    list: () => ipcRenderer.invoke(IPC.themesList),
    use: (id) => ipcRenderer.invoke(IPC.themesUse, id),
    save: (draft) => ipcRenderer.invoke(IPC.themesSave, draft),
    remove: (id) => ipcRenderer.invoke(IPC.themesRemove, id),
    chooseBackground: () => ipcRenderer.invoke(IPC.themesChooseBackground),
    onChange: (cb) => listen<[ThemeInfo[], ThemeInfo]>(IPC.themesChanged, cb)
  },
  plugins: {
    state: () => ipcRenderer.invoke(IPC.pluginsState),
    refresh: () => ipcRenderer.invoke(IPC.pluginsRefresh),
    install: (key, allowCode) => ipcRenderer.invoke(IPC.pluginsInstall, key, allowCode),
    update: (key) => ipcRenderer.invoke(IPC.pluginsUpdate, key),
    uninstall: (key) => ipcRenderer.invoke(IPC.pluginsUninstall, key),
    setEnabled: (key, enabled) => ipcRenderer.invoke(IPC.pluginsSetEnabled, key, enabled),
    addMarketplace: (repo) => ipcRenderer.invoke(IPC.pluginsAddMarketplace, repo),
    removeMarketplace: (key) => ipcRenderer.invoke(IPC.pluginsRemoveMarketplace, key),
    saveSkill: (skill, previousName) => ipcRenderer.invoke(IPC.pluginsSaveSkill, skill, previousName),
    deleteSkill: (name) => ipcRenderer.invoke(IPC.pluginsDeleteSkill, name),
    onChange: (cb) => listen<[PluginsState]>(IPC.pluginsChanged, cb)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch)
  },
  media: {
    onChange: (cb) => listen<[NowPlaying]>(IPC.mediaChanged, cb),
    command: (cmd) => ipcRenderer.invoke(IPC.mediaCommand, cmd)
  },
  updates: {
    onChange: (cb) => listen<[UpdateState]>(IPC.updateChanged, cb),
    restartToUpdate: () => ipcRenderer.send(IPC.updateRestart)
  }
}

contextBridge.exposeInMainWorld('murmur', api)
