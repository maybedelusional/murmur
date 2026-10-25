import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import type { AccessMode, NewAgentInput, ProjectInfo, Result, Settings, UpdateState } from '@shared/types'
import { AgentManager } from './agents'
import { MediaWatcher } from './media'
import { getSettings, setSettings } from './settings'
import { restartToUpdate, startUpdater } from './updater'

const agents = new AgentManager()
let win: BrowserWindow | null = null
let media: MediaWatcher | null = null

/** Wraps a handler so errors come back to the UI as readable messages instead of crashes. */
function handle<A extends unknown[], T>(channel: string, fn: (...args: A) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_e, ...args: unknown[]): Promise<Result<T>> => {
    try {
      return { ok: true, value: await fn(...(args as A)) }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}

function projectInfo(): ProjectInfo | null {
  const p = agents.project
  return p ? { path: p.root, name: p.name, branch: p.branch } : null
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    frame: false,
    show: false,
    backgroundColor: '#1A1622',
    title: 'Murmur',
    // Packaged builds use the .exe's own icon.
    icon: app.isPackaged ? undefined : join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win?.show())
  agents.attach(win.webContents)

  // Links open in the browser, never inside Murmur.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.on(IPC.windowMinimize, () => win?.minimize())
  ipcMain.on(IPC.windowToggleMaximize, () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
  ipcMain.on(IPC.windowClose, () => win?.close())

  ipcMain.handle(IPC.projectCurrent, () => projectInfo())
  handle(IPC.projectChoose, async () => {
    if (!win) return null
    const pick = await dialog.showOpenDialog(win, { title: 'Open a project', properties: ['openDirectory'] })
    if (pick.canceled || !pick.filePaths[0]) return null
    await agents.openProject(pick.filePaths[0])
    setSettings({ lastProject: agents.project!.root })
    return projectInfo()
  })

  ipcMain.handle(IPC.agentsList, () => agents.list())
  handle(IPC.agentsCreate, (input: NewAgentInput) => agents.create(input))
  handle(IPC.agentsSend, (id: string, text: string) => agents.send(id, text))
  handle(IPC.agentsPause, (id: string) => agents.pause(id))
  handle(IPC.agentsResume, (id: string) => agents.resume(id))
  handle(IPC.agentsPauseAll, () => agents.pauseAll())
  handle(IPC.agentsSetMode, (id: string, mode: AccessMode) => agents.setMode(id, mode))
  handle(IPC.agentsMerge, (id: string) => agents.merge(id))
  handle(IPC.agentsDiscard, (id: string) => agents.discard(id))
  handle(IPC.agentsOpenTerminal, (id: string) => agents.openTerminal(id))
  handle(IPC.agentsAnswer, (approvalId: string, allow: boolean) => agents.answer(approvalId, allow))

  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSet, (_e, patch: Partial<Settings>) => setSettings(patch))

  ipcMain.handle(IPC.mediaCommand, (_e, cmd: 'toggle' | 'next' | 'previous') => media?.command(cmd))
  ipcMain.on(IPC.updateRestart, () => {
    agents.shutdown()
    restartToUpdate()
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win?.isMinimized()) win.restore()
    win?.focus()
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.maybedelusional.murmur')
    registerIpc()

    const last = getSettings().lastProject
    if (last) await agents.openProject(last).catch(() => undefined)

    createWindow()

    media = new MediaWatcher((now) => win?.webContents.send(IPC.mediaChanged, now))
    media.start()

    startUpdater((state: UpdateState) => win?.webContents.send(IPC.updateChanged, state))
  })

  app.on('before-quit', () => {
    agents.shutdown()
    media?.stop()
  })

  app.on('window-all-closed', () => app.quit())
}
