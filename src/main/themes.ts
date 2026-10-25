import { app, dialog, net, protocol, type BrowserWindow } from 'electron'
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, isAbsolute, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ThemeDraft, ThemeInfo } from '@shared/types'
import { DUSK, NIGHT, cleanTokens } from '@shared/themes'
import { getSettings, setSettings } from './settings'

/**
 * Themes: two built in, your own (made in the theme editor), and themes that
 * plugins ship in a themes/<name>/theme.json folder. A theme can have an image
 * or looping video behind the sky; the UI loads those through murmur-media://
 * so it can only ever read files inside a theme's own folder.
 *
 * theme.json:
 *   { "name": "Fjord", "tokens": { "sky": "#…", … }, "bands": true,
 *     "background": { "file": "sky.mp4", "dim": 0.2, "reactive": true } }
 */

const MEDIA = 'murmur-media'
const MEDIA_TYPES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm'])
const VIDEO_TYPES = new Set(['.mp4', '.webm'])
const MAX_MEDIA_BYTES = 200 * 1024 * 1024

/** Must run before the app is ready. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }
  ])
}

interface ThemeFile {
  name?: unknown
  tokens?: Record<string, unknown>
  bands?: unknown
  background?: { file?: unknown; dim?: unknown; reactive?: unknown }
}

interface Located {
  info: ThemeInfo
  dir?: string
}

export class ThemeManager {
  private themes = new Map<string, Located>()

  constructor(private pluginThemeDirs: () => Array<{ pluginName: string; dir: string }>) {}

  private get mineDir(): string {
    return join(app.getPath('userData'), 'themes')
  }

  /** Serves theme media: murmur-media://<theme id>/<file>. */
  handleMedia(): void {
    protocol.handle(MEDIA, async (req) => {
      const url = new URL(req.url)
      const id = decodeURIComponent(url.hostname)
      const file = decodeURIComponent(url.pathname.replace(/^\//, ''))
      // Standard schemes lower-case the host, so match ids case-insensitively.
      const theme = [...this.themes.values()].find((t) => t.info.id.toLowerCase() === id.toLowerCase())
      if (!theme?.dir || !file) return new Response('Not found', { status: 404 })
      const full = join(theme.dir, file)
      const rel = relative(theme.dir, full)
      if (rel.startsWith('..') || isAbsolute(rel) || !MEDIA_TYPES.has(extname(full).toLowerCase())) {
        return new Response('Not allowed', { status: 403 })
      }
      return net.fetch(pathToFileURL(full).toString(), { headers: req.headers })
    })
  }

  async list(): Promise<ThemeInfo[]> {
    this.themes.clear()
    const add = (l: Located): void => {
      this.themes.set(l.info.id, l)
    }
    add({ info: { id: 'dusk', name: 'Dusk', source: 'builtin', tokens: DUSK, bands: true } })
    add({ info: { id: 'night', name: 'Night', source: 'builtin', tokens: NIGHT, bands: true } })

    for (const name of await subdirs(this.mineDir)) {
      const l = await readTheme(`mine.${name}`, join(this.mineDir, name), 'mine')
      if (l) add(l)
    }
    for (const { pluginName, dir } of this.pluginThemeDirs()) {
      const folder = dir.split(/[\\/]/).pop()!
      const l = await readTheme(`plugin.${pluginName}.${folder}`, dir, 'plugin', pluginName)
      if (l) add(l)
    }
    return [...this.themes.values()].map((t) => t.info)
  }

  async current(): Promise<ThemeInfo> {
    const all = await this.list()
    return all.find((t) => t.id === getSettings().theme) ?? all[0]
  }

  async use(id: string): Promise<ThemeInfo> {
    const all = await this.list()
    const t = all.find((x) => x.id === id)
    if (!t) throw new Error('That theme is no longer available.')
    setSettings({ theme: id })
    return t
  }

  private chosen = new Set<string>()

  /** Lets the person pick an image or video; only files picked here can be copied into a theme. */
  async chooseBackground(win: BrowserWindow | null): Promise<string | null> {
    const opts = {
      title: 'Choose a background',
      properties: ['openFile' as const],
      filters: [{ name: 'Images and videos', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm'] }]
    }
    const pick = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const file = pick.filePaths[0]
    if (pick.canceled || !file) return null
    const size = (await stat(file)).size
    if (size > MAX_MEDIA_BYTES) throw new Error('That file is over 200 MB. Pick a shorter or smaller video.')
    this.chosen.add(file)
    return file
  }

  async save(draft: ThemeDraft): Promise<ThemeInfo> {
    const name = draft.name.trim()
    if (!name) throw new Error('Give the theme a name.')
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme'

    let id = draft.id
    if (id && !id.startsWith('mine.')) id = undefined // editing a built-in or plugin theme saves a copy
    let folderName = id ? id.slice(5) : slug
    if (!id) {
      for (let i = 2; existsSync(join(this.mineDir, folderName)); i++) folderName = `${slug}-${i}`
    }
    const dir = join(this.mineDir, folderName)
    await mkdir(dir, { recursive: true })

    const prev = id ? ((await readJsonSafe(join(dir, 'theme.json'))) as ThemeFile | null) : null
    let bgFile = typeof prev?.background?.file === 'string' ? prev.background.file : undefined

    if (draft.backgroundFile === null) {
      if (bgFile) await rm(join(dir, bgFile), { force: true })
      bgFile = undefined
    } else if (draft.backgroundFile) {
      if (!this.chosen.has(draft.backgroundFile)) throw new Error('Pick the background with the Choose button.')
      const ext = extname(draft.backgroundFile).toLowerCase()
      if (!MEDIA_TYPES.has(ext)) throw new Error('Backgrounds can be PNG, JPG, WebP, GIF, MP4 or WebM.')
      if (bgFile) await rm(join(dir, bgFile), { force: true })
      bgFile = `background${ext}`
      await cp(draft.backgroundFile, join(dir, bgFile))
    }

    const json: ThemeFile = {
      name,
      tokens: cleanTokens(draft.tokens),
      bands: draft.bands,
      background: bgFile ? { file: bgFile, dim: clampDim(draft.dim), reactive: draft.reactive } : undefined
    }
    await writeFile(join(dir, 'theme.json'), JSON.stringify(json, null, 2))
    const saved = await readTheme(`mine.${folderName}`, dir, 'mine')
    if (!saved) throw new Error('Couldn’t save the theme.')
    this.themes.set(saved.info.id, saved)
    return saved.info
  }

  async remove(id: string): Promise<void> {
    if (!id.startsWith('mine.')) throw new Error('Only your own themes can be deleted. Remove a plugin to remove its themes.')
    const folder = id.slice(5)
    if (!/^[a-z0-9-]+$/.test(folder)) return
    await rm(join(this.mineDir, folder), { recursive: true, force: true })
    if (getSettings().theme === id) setSettings({ theme: 'dusk' })
  }
}

function clampDim(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.min(0.8, Math.max(0, n)) : 0.2
}

async function subdirs(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
  } catch {
    return []
  }
}

async function readJsonSafe(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function readTheme(id: string, dir: string, source: ThemeInfo['source'], pluginName?: string): Promise<Located | null> {
  const json = (await readJsonSafe(join(dir, 'theme.json'))) as ThemeFile | null
  if (!json || typeof json !== 'object') return null
  const name = typeof json.name === 'string' && json.name.trim() ? json.name.trim().slice(0, 60) : id
  const info: ThemeInfo = {
    id,
    name,
    source,
    pluginName,
    tokens: cleanTokens(json.tokens),
    bands: json.bands !== false
  }
  const bg = json.background
  if (bg && typeof bg.file === 'string') {
    const ext = extname(bg.file).toLowerCase()
    const full = join(dir, bg.file)
    const rel = relative(dir, full)
    if (MEDIA_TYPES.has(ext) && !rel.startsWith('..') && !isAbsolute(rel) && existsSync(full)) {
      info.background = {
        kind: VIDEO_TYPES.has(ext) ? 'video' : 'image',
        url: `${MEDIA}://${encodeURIComponent(id)}/${encodeURIComponent(bg.file)}`,
        dim: clampDim(bg.dim),
        reactive: bg.reactive !== false
      }
      if (json.bands === undefined) info.bands = false
    }
  }
  return { info, dir }
}
