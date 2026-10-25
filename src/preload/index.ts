import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { AgentSnapshot, ApprovalRequest, MurmurApi, NowPlaying, UpdateState } from '@shared/types'

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
    onUpdate: (cb) => listen<[AgentSnapshot[], ApprovalRequest[]]>(IPC.agentsUpdated, cb)
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
