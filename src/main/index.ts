import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import type {
  AccessMode,
  AgentSnapshot,
  ApprovalRequest,
  MySkill,
  NewAgentInput,
  ProjectInfo,
  Recipe,
  Result,
  Settings,
  StartTeamInput,
  ThemeDraft,
  UpdateState
} from '@shared/types'
import { AgentManager, type AgentNotice } from './agents'
import { getRecipe, listRecipes, removeRecipe, saveRecipe } from './recipes'
import { ThemeManager, registerMediaScheme } from './themes'
import { PluginManager } from './plugins'
import { MediaWatcher } from './media'
import { getSettings, setSettings } from './settings'
import { restartToUpdate, startUpdater } from './updater'

const agents = new AgentManager()
const plugins = new PluginManager()
agents.usePlugins(() => plugins.enabledForAgents())
const themes = new ThemeManager(() => plugins.themeDirs())
registerMediaScheme()
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

// ---------- notifications and the taskbar ----------

const NOTICE_TITLE: Record<AgentNotice, (name: string) => string> = {
  approval: (n) => `${n} needs you`,
  finished: (n) => `${n} is done`,
  error: (n) => `${n} stopped with an error`,
  budget: (n) => `${n} reached its budget`
}

function notify(kind: AgentNotice, agent: AgentSnapshot, text: string): void {
  const s = getSettings()
  const wanted = kind === 'approval' ? s.notifyApprovals : kind === 'finished' ? s.notifyFinished : s.notifyErrors
  if (!wanted || !Notification.isSupported()) return
  // Don't pop up about things the person is already looking at.
  if (win?.isFocused() && !win.isMinimized()) return
  const n = new Notification({ title: NOTICE_TITLE[kind](agent.name), body: text, silent: kind === 'finished' })
  n.on('click', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.webContents.send(IPC.agentsFocus, agent.id)
  })
  n.show()
  if (kind === 'approval' && win && !win.isFocused()) win.flashFrame(true)
}

/** Taskbar: moving bar while agents work, yellow when one waits for you, red on errors. */
function updateTaskbar(list: AgentSnapshot[], approvals: ApprovalRequest[]): void {
  if (!win || win.isDestroyed()) return
  if (list.some((a) => a.status === 'error')) win.setProgressBar(1, { mode: 'error' })
  else if (approvals.length) win.setProgressBar(1, { mode: 'paused' })
  else if (list.some((a) => a.status === 'working' || a.status === 'starting')) win.setProgressBar(2, { mode: 'indeterminate' })
  else win.setProgressBar(-1)
}

async function sendThemes(): Promise<void> {
  if (!win || win.isDestroyed()) return
  const list = await themes.list()
  win.webContents.send(IPC.themesChanged, list, await themes.current())
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
  win.on('focus', () => win?.flashFrame(false))
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
  handle(IPC.agentsSetBudget, (id: string, budget: number | null) => agents.setBudget(id, budget))
  handle(IPC.agentsDiff, (id: string) => agents.diff(id))
  handle(IPC.agentsStartTeam, (input: StartTeamInput) => agents.startTeam(getRecipe(input.recipeId), input.task, input.budgetUsd))

  ipcMain.handle(IPC.recipesList, () => listRecipes())
  handle(IPC.recipesSave, (recipe: Recipe) => saveRecipe(recipe))
  handle(IPC.recipesRemove, (id: string) => removeRecipe(id))

  ipcMain.handle(IPC.themesList, () => themes.list())
  handle(IPC.themesUse, async (id: string) => {
    const t = await themes.use(id)
    void sendThemes()
    return t
  })
  handle(IPC.themesSave, async (draft: ThemeDraft) => {
    const t = await themes.save(draft)
    void sendThemes()
    return t
  })
  handle(IPC.themesRemove, async (id: string) => {
    await themes.remove(id)
    void sendThemes()
  })
  ipcMain.handle(IPC.themesChooseBackground, () => themes.chooseBackground(win).catch(() => null))

  ipcMain.handle(IPC.pluginsState, () => plugins.state())
  handle(IPC.pluginsRefresh, () => plugins.refreshAll())
  handle(IPC.pluginsInstall, (key: string, allowCode?: boolean) => plugins.install(key, allowCode))
  handle(IPC.pluginsUpdate, (key: string) => plugins.update(key))
  handle(IPC.pluginsUninstall, (key: string) => plugins.uninstall(key))
  handle(IPC.pluginsSetEnabled, (key: string, enabled: boolean) => plugins.setEnabled(key, enabled))
  handle(IPC.pluginsAddMarketplace, (repo: string) => plugins.addMarketplace(repo))
  handle(IPC.pluginsRemoveMarketplace, (key: string) => plugins.removeMarketplace(key))
  handle(IPC.pluginsSaveSkill, (skill: MySkill, previousName?: string) => plugins.saveSkill(skill, previousName))
  handle(IPC.pluginsDeleteSkill, (name: string) => plugins.deleteSkill(name))

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
    themes.handleMedia()
    registerIpc()
    agents.onNotice(notify)
    agents.onChange(updateTaskbar)

    const last = getSettings().lastProject
    if (last) await agents.openProject(last).catch(() => undefined)

    createWindow()

    media = new MediaWatcher((now) => win?.webContents.send(IPC.mediaChanged, now))
    media.start()

    startUpdater((state: UpdateState) => win?.webContents.send(IPC.updateChanged, state))

    let themeCount = -1
    plugins.onChange((state) => {
      win?.webContents.send(IPC.pluginsChanged, state)
      // A plugin with themes was installed, removed or switched: refresh the theme list.
      const count = plugins.themeDirs().length
      if (count !== themeCount) {
        themeCount = count
        void sendThemes()
      }
    })
    void plugins.init()
  })

  app.on('before-quit', () => {
    agents.shutdown()
    media?.stop()
  })

  app.on('window-all-closed', () => app.quit())
}
