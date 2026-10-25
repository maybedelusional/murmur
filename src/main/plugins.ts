import { app } from 'electron'
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, normalize, relative } from 'node:path'
import type { SdkPluginConfig } from '@anthropic-ai/claude-agent-sdk'
import type {
  InstalledPlugin,
  Marketplace,
  MarketplacePlugin,
  MySkill,
  PluginContents,
  PluginsState
} from '@shared/types'
import { git } from './git'

/**
 * Plugins and skills use Claude Code's own format, so anything published for
 * Claude Code works in Murmur and the other way round.
 *
 *   marketplace = a git repo with .claude-plugin/marketplace.json listing plugins
 *   plugin      = a folder with skills/, commands/, agents/, hooks, .mcp.json
 *
 * Murmur clones marketplaces, copies installed plugins into its own folder,
 * and hands every enabled plugin to each agent session.
 */

interface MarketplaceSource {
  key: string
  repo: string
  /** Folder inside the repo that holds .claude-plugin/ (Murmur extension). */
  path?: string
  official: boolean
  builtin: boolean
}

interface StoredInstall extends InstalledPlugin {
  dir: string
}

interface Store {
  sources: MarketplaceSource[]
  installed: StoredInstall[]
  removedBuiltins: string[]
}

const BUILTIN: MarketplaceSource[] = [
  { key: 'anthropics/claude-plugins-official', repo: 'anthropics/claude-plugins-official', official: true, builtin: true },
  { key: 'anthropics/skills', repo: 'anthropics/skills', official: true, builtin: true },
  { key: 'anthropics/claude-plugins-community', repo: 'anthropics/claude-plugins-community', official: false, builtin: true },
  { key: 'maybedelusional/murmur/marketplace', repo: 'maybedelusional/murmur', path: 'marketplace', official: false, builtin: true }
]

const STALE_MS = 12 * 60 * 60 * 1000

export interface InstallResult {
  enabled: boolean
  runsCode: boolean
}

export const runsCode = (c: PluginContents): boolean => c.hooks || c.mcpServers.length > 0

/** Raw shape of a marketplace.json entry (only the parts Murmur reads). */
interface RawEntry {
  name?: unknown
  description?: unknown
  version?: unknown
  author?: unknown
  category?: unknown
  homepage?: unknown
  source?: unknown
  strict?: unknown
  skills?: unknown
  commands?: unknown
  agents?: unknown
  hooks?: unknown
  mcpServers?: unknown
  lspServers?: unknown
}

interface ComponentLists {
  skills: string[]
  commands: string[]
  agents: string[]
}

const asList = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/**
 * Some marketplaces (like anthropics/skills) point several plugins at one folder
 * and list which skills/commands/agents each plugin includes. Returns those lists.
 */
function componentLists(e: RawEntry): ComponentLists | null {
  const lists = { skills: asList(e.skills), commands: asList(e.commands), agents: asList(e.agents) }
  return lists.skills.length || lists.commands.length || lists.agents.length ? lists : null
}

/** Entries that define hooks or servers inline need the whole folder kept as-is. */
const hasInlineCode = (e: RawEntry): boolean => Boolean(e.hooks || e.mcpServers || e.lspServers)

const baseName = (p: string): string => p.replace(/\/+$/, '').split('/').pop()!.replace(/\.md$/, '')

function contentsFromLists(lists: ComponentLists, e: RawEntry): PluginContents {
  return {
    skills: lists.skills.map(baseName),
    commands: lists.commands.map(baseName),
    agents: lists.agents.map(baseName),
    hooks: Boolean(e.hooks),
    mcpServers: e.mcpServers && typeof e.mcpServers === 'object' ? Object.keys(e.mcpServers) : []
  }
}

type Source =
  | { kind: 'relative'; path: string }
  | { kind: 'github'; repo: string; ref?: string }
  | { kind: 'git'; url: string; ref?: string }
  | { kind: 'git-subdir'; url: string; path: string; ref?: string }
  | { kind: 'unsupported'; what: string }

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function gitUrl(repoOrUrl: string): string {
  if (/^[\w.-]+\/[\w.-]+$/.test(repoOrUrl)) return `https://github.com/${repoOrUrl}.git`
  return repoOrUrl
}

function parseSource(raw: unknown, pluginRoot?: string): Source {
  if (typeof raw === 'string') {
    const joined = pluginRoot && !raw.startsWith('./') && !raw.startsWith('../') ? `${pluginRoot}/${raw}` : raw
    return { kind: 'relative', path: joined }
  }
  if (raw && typeof raw === 'object') {
    const s = raw as Record<string, unknown>
    const ref = str(s.ref) ?? str(s.sha)
    switch (s.source) {
      case 'github':
        if (str(s.repo)) return { kind: 'github', repo: str(s.repo)!, ref }
        break
      case 'url':
      case 'git':
        if (str(s.url)) return { kind: 'git', url: str(s.url)!, ref }
        break
      case 'git-subdir':
        if (str(s.url) && str(s.path)) return { kind: 'git-subdir', url: str(s.url)!, path: str(s.path)!, ref }
        break
    }
    return { kind: 'unsupported', what: String(s.source ?? 'unknown') }
  }
  return { kind: 'unsupported', what: 'unknown' }
}

function describeSource(src: Source, marketplaceRepo: string): string {
  switch (src.kind) {
    case 'relative':
      return `github.com/${marketplaceRepo}`
    case 'github':
      return `github.com/${src.repo}`
    case 'git':
      return src.url.replace(/^https?:\/\//, '').replace(/\.git$/, '')
    case 'git-subdir':
      return `${src.url.replace(/^https?:\/\//, '').replace(/\.git$/, '')} (${src.path})`
    case 'unsupported':
      return `a ${src.what} source`
  }
}

/** Joins a path from a marketplace file onto a folder, refusing anything that escapes it. */
function inside(root: string, rel: string): string {
  const full = normalize(join(root, rel))
  const r = relative(root, full)
  if (r.startsWith('..') || isAbsolute(r)) throw new Error(`Path leaves its folder: ${rel}`)
  return full
}

async function listNames(dir: string, filter: (name: string, isDir: boolean) => boolean): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((e) => filter(e.name, e.isDirectory())).map((e) => e.name.replace(/\.md$/, ''))
  } catch {
    return []
  }
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Works out what a plugin folder contains, including the parts that run code. */
export async function inspectPlugin(dir: string): Promise<PluginContents> {
  const manifest = (await readJson(join(dir, '.claude-plugin', 'plugin.json'))) ?? {}
  const skills = await listNames(join(dir, 'skills'), (n, isDir) => isDir && existsSync(join(dir, 'skills', n, 'SKILL.md')))
  const commands = await listNames(join(dir, 'commands'), (n, isDir) => !isDir && n.endsWith('.md'))
  const agents = await listNames(join(dir, 'agents'), (n, isDir) => !isDir && n.endsWith('.md'))
  const hooks = existsSync(join(dir, 'hooks', 'hooks.json')) || Boolean(manifest.hooks)

  const mcp = new Set<string>()
  const mcpFile = await readJson(join(dir, '.mcp.json'))
  const fromFile = (mcpFile?.mcpServers ?? mcpFile) as Record<string, unknown> | undefined
  if (fromFile && typeof fromFile === 'object') Object.keys(fromFile).forEach((k) => mcp.add(k))
  if (manifest.mcpServers && typeof manifest.mcpServers === 'object') Object.keys(manifest.mcpServers).forEach((k) => mcp.add(k))

  const themes = await listNames(join(dir, 'themes'), (n, isDir) => isDir && existsSync(join(dir, 'themes', n, 'theme.json')))
  return { skills, commands, agents, hooks, mcpServers: [...mcp], themes }
}

export class PluginManager {
  private store: Store
  private marketplaces = new Map<string, Marketplace>()
  private busy = new Set<string>()
  private listeners = new Set<(s: PluginsState) => void>()

  constructor() {
    this.store = this.loadStore()
  }

  // ---------- paths ----------

  private get root(): string {
    return join(app.getPath('userData'), 'plugins')
  }
  private get storeFile(): string {
    return join(this.root, 'plugins.json')
  }
  private marketDir(key: string): string {
    return join(this.root, 'marketplaces', key.replace(/[^A-Za-z0-9._-]+/g, '__'))
  }
  private installDir(marketplaceName: string, plugin: string): string {
    return join(this.root, 'installed', marketplaceName.replace(/[^A-Za-z0-9._-]+/g, '_'), plugin)
  }
  private get mySkillsDir(): string {
    return join(this.root, 'my-skills')
  }

  // ---------- state ----------

  onChange(cb: (s: PluginsState) => void): void {
    this.listeners.add(cb)
  }

  private changed(): void {
    const s = this.state()
    this.listeners.forEach((l) => l(s))
  }

  private sources(): MarketplaceSource[] {
    const builtins = BUILTIN.filter((b) => !this.store.removedBuiltins.includes(b.key))
    return [...builtins, ...this.store.sources]
  }

  state(): PluginsState {
    const marketplaces = this.sources().map(
      (s) =>
        this.marketplaces.get(s.key) ?? {
          key: s.key,
          repo: s.repo,
          path: s.path,
          name: s.repo,
          official: s.official,
          builtin: s.builtin,
          plugins: [],
          loading: false
        }
    )
    return {
      marketplaces,
      installed: this.store.installed.map(({ dir: _dir, ...rest }) => rest),
      mySkills: this.readMySkills(),
      busy: [...this.busy]
    }
  }

  /** Theme folders inside enabled plugins (a Murmur addition to the plugin format). */
  themeDirs(): Array<{ pluginName: string; dir: string }> {
    return this.store.installed
      .filter((p) => p.enabled && p.contents.themes?.length)
      .flatMap((p) => (p.contents.themes ?? []).map((t) => ({ pluginName: p.name, dir: join(p.dir, 'themes', t) })))
  }

  /** Plugin folders to load into every agent session. */
  enabledForAgents(): SdkPluginConfig[] {
    const out: SdkPluginConfig[] = this.store.installed
      .filter((p) => p.enabled && existsSync(p.dir))
      .map((p) => ({ type: 'local' as const, path: p.dir }))
    if (this.readMySkills().length) out.push({ type: 'local', path: this.mySkillsDir })
    return out
  }

  // ---------- marketplaces ----------

  /** Loads cached marketplaces right away, then refreshes stale ones from the network. */
  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await this.ensureMySkillsPlugin()
    for (const s of this.sources()) {
      if (existsSync(this.marketDir(s.key))) await this.readMarketplace(s).catch(() => undefined)
    }
    this.changed()
    const stale = this.sources().filter((s) => {
      const m = this.marketplaces.get(s.key)
      return !m?.refreshedAt || Date.now() - m.refreshedAt > STALE_MS
    })
    await Promise.all(stale.map((s) => this.fetchMarketplace(s)))
  }

  async refreshAll(): Promise<void> {
    await Promise.all(this.sources().map((s) => this.fetchMarketplace(s)))
  }

  private setMarket(s: MarketplaceSource, patch: Partial<Marketplace>): void {
    const prev = this.marketplaces.get(s.key) ?? {
      key: s.key,
      repo: s.repo,
      path: s.path,
      name: s.repo,
      official: s.official,
      builtin: s.builtin,
      plugins: [],
      loading: false
    }
    this.marketplaces.set(s.key, { ...prev, ...patch })
    this.changed()
  }

  private async fetchMarketplace(s: MarketplaceSource): Promise<void> {
    this.setMarket(s, { loading: true, error: undefined })
    const dir = this.marketDir(s.key)
    const tmp = `${dir}.new`
    try {
      await rm(tmp, { recursive: true, force: true })
      await mkdir(join(this.root, 'marketplaces'), { recursive: true })
      await git(this.root, ['clone', '--depth', '1', gitUrl(s.repo), tmp])
      await rm(dir, { recursive: true, force: true })
      await cp(tmp, dir, { recursive: true })
      await rm(tmp, { recursive: true, force: true })
      await writeFile(join(dir, '.murmur-fetched'), String(Date.now()))
      await this.readMarketplace(s)
    } catch (e) {
      await rm(tmp, { recursive: true, force: true }).catch(() => undefined)
      const message = e instanceof Error ? e.message : String(e)
      const friendly = /not found|could not read|Authentication|403|404/i.test(message)
        ? `Couldn't open github.com/${s.repo}. Check the name, and that you have access if it's private.`
        : /resolve host|network|timed out/i.test(message)
          ? 'No connection. Showing the last copy Murmur saved, if any.'
          : `Couldn't update this marketplace: ${message.split('\n')[0]}`
      this.setMarket(s, { loading: false, error: friendly })
    }
  }

  private async readMarketplace(s: MarketplaceSource): Promise<void> {
    const repoDir = this.marketDir(s.key)
    const base = s.path ? inside(repoDir, s.path) : repoDir
    const json = await readJson(join(base, '.claude-plugin', 'marketplace.json'))
    if (!json) throw new Error('This repository has no .claude-plugin/marketplace.json, so it isn\'t a marketplace.')

    const name = str(json.name) ?? s.repo
    const metadata = (json.metadata ?? {}) as Record<string, unknown>
    const pluginRoot = str(metadata.pluginRoot)?.replace(/^\.\//, '')
    const entries = Array.isArray(json.plugins) ? (json.plugins as RawEntry[]) : []
    const plugins: MarketplacePlugin[] = []

    for (const e of entries) {
      const pname = str(e.name)
      if (!pname || !SAFE_NAME.test(pname)) continue
      const src = parseSource(e.source, pluginRoot)
      let contents: PluginContents | undefined
      const lists = componentLists(e)
      if (lists) contents = contentsFromLists(lists, e)
      else if (src.kind === 'relative') {
        try {
          contents = await inspectPlugin(inside(base, src.path))
        } catch {
          continue
        }
      }
      const author = e.author && typeof e.author === 'object' ? str((e.author as Record<string, unknown>).name) : str(e.author)
      plugins.push({
        key: `${s.key}/${pname}`,
        name: pname,
        marketplaceKey: s.key,
        description: str(e.description),
        version: str(e.version),
        author,
        category: str(e.category),
        homepage: str(e.homepage),
        from: describeSource(src, s.repo),
        supported: src.kind !== 'unsupported',
        contents
      })
    }

    let fetchedAt: number | undefined
    try {
      fetchedAt = Number(await readFile(join(repoDir, '.murmur-fetched'), 'utf8')) || (await stat(repoDir)).mtimeMs
    } catch {
      fetchedAt = undefined
    }

    this.setMarket(s, {
      name,
      description: str((metadata as Record<string, unknown>).description) ?? str(json.description),
      plugins: plugins.sort((a, b) => a.name.localeCompare(b.name)),
      loading: false,
      error: undefined,
      refreshedAt: fetchedAt
    })
  }

  async addMarketplace(input: string): Promise<void> {
    const repo = input
      .trim()
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\.git$/, '')
      .replace(/\/$/, '')
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      throw new Error('Enter a GitHub repository as owner/name, for example anthropics/claude-plugins-community.')
    }
    if (this.sources().some((s) => s.repo.toLowerCase() === repo.toLowerCase() && !s.path)) {
      throw new Error('That marketplace is already added.')
    }
    const source: MarketplaceSource = { key: repo, repo, official: false, builtin: false }
    this.store.removedBuiltins = this.store.removedBuiltins.filter((k) => k !== repo)
    if (!BUILTIN.some((b) => b.key === repo)) this.store.sources.push(source)
    this.saveStore()
    await this.fetchMarketplace(BUILTIN.find((b) => b.key === repo) ?? source)
    const m = this.marketplaces.get(repo)
    if (m?.error) {
      this.store.sources = this.store.sources.filter((s) => s.key !== repo)
      this.marketplaces.delete(repo)
      this.saveStore()
      this.changed()
      throw new Error(m.error)
    }
  }

  async removeMarketplace(key: string): Promise<void> {
    if (BUILTIN.some((b) => b.key === key)) this.store.removedBuiltins.push(key)
    this.store.sources = this.store.sources.filter((s) => s.key !== key)
    this.marketplaces.delete(key)
    this.saveStore()
    await rm(this.marketDir(key), { recursive: true, force: true })
    this.changed()
  }

  // ---------- installing ----------

  private findPlugin(key: string): { source: MarketplaceSource; market: Marketplace; plugin: MarketplacePlugin } {
    for (const source of this.sources()) {
      const market = this.marketplaces.get(source.key)
      const plugin = market?.plugins.find((p) => p.key === key)
      if (market && plugin) return { source, market, plugin }
    }
    throw new Error('That plugin is no longer in its marketplace. Refresh and try again.')
  }

  /**
   * Installs a plugin. Plugins that run code (hooks or MCP servers) are only
   * switched on if the person already agreed to that (`allowCode`); otherwise
   * they're installed but left off so nothing runs before they've looked.
   */
  async install(key: string, allowCode = false): Promise<InstallResult> {
    if (this.busy.has(key)) throw new Error('Already installing.')
    const { source, market, plugin } = this.findPlugin(key)
    if (!plugin.supported) throw new Error(`Murmur can't install plugins from ${plugin.from} yet.`)
    this.busy.add(key)
    this.changed()
    const target = this.installDir(market.name, plugin.name)
    const tmp = `${target}.new`
    try {
      await rm(tmp, { recursive: true, force: true })
      await mkdir(join(tmp, '..'), { recursive: true })
      const raw = await this.fetchPluginFiles(source, plugin.name, tmp)
      await rm(join(tmp, '.git'), { recursive: true, force: true })
      await shapePlugin(tmp, raw)
      await rm(target, { recursive: true, force: true })
      await cp(tmp, target, { recursive: true })
      await rm(tmp, { recursive: true, force: true })

      const contents = await inspectPlugin(target)
      const manifest = (await readJson(join(target, '.claude-plugin', 'plugin.json'))) ?? {}
      const prev = this.store.installed.find((p) => p.key === key)
      const entry: StoredInstall = {
        key,
        name: plugin.name,
        marketplaceKey: market.key,
        marketplaceName: market.name,
        description: plugin.description ?? str(manifest.description),
        version: str(manifest.version) ?? plugin.version,
        enabled: runsCode(contents) ? (prev?.enabled ?? allowCode) : (prev?.enabled ?? true),
        installedAt: Date.now(),
        contents,
        dir: target
      }
      this.store.installed = [...this.store.installed.filter((p) => p.key !== key), entry]
      this.saveStore()
      return { enabled: entry.enabled, runsCode: runsCode(contents) }
    } finally {
      await rm(tmp, { recursive: true, force: true }).catch(() => undefined)
      this.busy.delete(key)
      this.changed()
    }
  }

  /** Copies a plugin's files into `dest`, wherever the marketplace says they live. */
  private async fetchPluginFiles(source: MarketplaceSource, pluginName: string, dest: string): Promise<RawEntry> {
    const repoDir = this.marketDir(source.key)
    const base = source.path ? inside(repoDir, source.path) : repoDir
    const json = await readJson(join(base, '.claude-plugin', 'marketplace.json'))
    const entries = Array.isArray(json?.plugins) ? (json!.plugins as RawEntry[]) : []
    const entry = entries.find((e) => str(e.name) === pluginName)
    if (!entry) throw new Error('That plugin is no longer in its marketplace. Refresh and try again.')
    const metadata = (json?.metadata ?? {}) as Record<string, unknown>
    const src = parseSource(entry?.source, str(metadata.pluginRoot)?.replace(/^\.\//, ''))

    const cloneTo = async (url: string, ref: string | undefined, to: string): Promise<void> => {
      const args = ['clone', '--depth', '1']
      if (ref && !/^[0-9a-f]{40}$/.test(ref)) args.push('--branch', ref)
      await git(this.root, [...args, gitUrl(url), to])
      if (ref && /^[0-9a-f]{40}$/.test(ref)) {
        await git(to, ['fetch', '--depth', '1', 'origin', ref])
        await git(to, ['checkout', ref])
      }
    }

    switch (src.kind) {
      case 'relative':
        await cp(inside(base, src.path), dest, { recursive: true })
        return entry
      case 'github':
        await cloneTo(src.repo, src.ref, dest)
        return entry
      case 'git':
        await cloneTo(src.url, src.ref, dest)
        return entry
      case 'git-subdir': {
        const tmp = `${dest}.repo`
        await rm(tmp, { recursive: true, force: true })
        try {
          await cloneTo(src.url, src.ref, tmp)
          await cp(inside(tmp, src.path), dest, { recursive: true })
        } finally {
          await rm(tmp, { recursive: true, force: true })
        }
        return entry
      }
      case 'unsupported':
        throw new Error(`Murmur can't install from ${describeSource(src, source.repo)} yet.`)
    }
  }

  async update(key: string): Promise<void> {
    const installed = this.store.installed.find((p) => p.key === key)
    if (!installed) throw new Error('That plugin is not installed.')
    const src = this.sources().find((s) => s.key === installed.marketplaceKey)
    if (src) await this.fetchMarketplace(src)
    await this.install(key, installed.enabled)
  }

  async uninstall(key: string): Promise<void> {
    const p = this.store.installed.find((x) => x.key === key)
    if (!p) return
    this.store.installed = this.store.installed.filter((x) => x.key !== key)
    this.saveStore()
    await rm(p.dir, { recursive: true, force: true })
    this.changed()
  }

  setEnabled(key: string, enabled: boolean): void {
    const p = this.store.installed.find((x) => x.key === key)
    if (!p) throw new Error('That plugin is not installed.')
    p.enabled = enabled
    this.saveStore()
    this.changed()
  }

  // ---------- my skills: a local plugin Murmur writes for you ----------

  private async ensureMySkillsPlugin(): Promise<void> {
    const manifest = join(this.mySkillsDir, '.claude-plugin', 'plugin.json')
    if (existsSync(manifest)) return
    await mkdir(join(this.mySkillsDir, '.claude-plugin'), { recursive: true })
    await mkdir(join(this.mySkillsDir, 'skills'), { recursive: true })
    await writeFile(
      manifest,
      JSON.stringify({ name: 'my-skills', version: '1.0.0', description: 'Skills you wrote in Murmur.' }, null, 2)
    )
  }

  private readMySkills(): MySkill[] {
    const dir = join(this.mySkillsDir, 'skills')
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'SKILL.md')))
        .map((d) => parseSkill(d.name, readFileSync(join(dir, d.name, 'SKILL.md'), 'utf8')))
        .sort((a, b) => a.name.localeCompare(b.name))
    } catch {
      return []
    }
  }

  async saveSkill(skill: MySkill, previousName?: string): Promise<void> {
    const name = skill.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (!name) throw new Error('Give the skill a name.')
    if (!skill.description.trim()) throw new Error('Describe when the skill should be used. Claude reads this to decide.')
    if (!skill.body.trim()) throw new Error('Write the skill’s instructions.')
    const dir = join(this.mySkillsDir, 'skills')
    if (previousName && previousName !== name) await rm(join(dir, previousName), { recursive: true, force: true })
    else if (!previousName && existsSync(join(dir, name))) throw new Error(`You already have a skill called ${name}.`)
    await mkdir(join(dir, name), { recursive: true })
    const description = skill.description.trim().replace(/\s+/g, ' ')
    await writeFile(join(dir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${skill.body.trim()}\n`)
    this.changed()
  }

  async deleteSkill(name: string): Promise<void> {
    if (!SAFE_NAME.test(name)) return
    await rm(join(this.mySkillsDir, 'skills', name), { recursive: true, force: true })
    this.changed()
  }

  // ---------- storage ----------

  private loadStore(): Store {
    try {
      const raw = JSON.parse(readFileSync(join(app.getPath('userData'), 'plugins', 'plugins.json'), 'utf8')) as Partial<Store>
      return { sources: raw.sources ?? [], installed: raw.installed ?? [], removedBuiltins: raw.removedBuiltins ?? [] }
    } catch {
      return { sources: [], installed: [], removedBuiltins: [] }
    }
  }

  private saveStore(): void {
    try {
      writeFileSync(this.storeFile, JSON.stringify(this.store, null, 2))
    } catch {
      /* folder not ready yet; saved next time */
    }
  }
}

/**
 * Turns a fetched folder into a proper plugin: keeps only the components a
 * marketplace entry lists (when it lists them) and makes sure there's a
 * plugin.json, so Claude Code loads it under the right name.
 */
async function shapePlugin(dir: string, entry: RawEntry): Promise<void> {
  const lists = componentLists(entry)
  if (lists && !hasInlineCode(entry)) {
    const picked = `${dir}.pick`
    await rm(picked, { recursive: true, force: true })
    const copyAll = async (paths: string[], into: string): Promise<void> => {
      for (const p of paths) {
        const from = inside(dir, p)
        if (!existsSync(from)) continue
        const name = p.replace(/\/+$/, '').split('/').pop()!
        await cp(from, join(picked, into, name), { recursive: true })
      }
    }
    await mkdir(picked, { recursive: true })
    await copyAll(lists.skills, 'skills')
    await copyAll(lists.commands, 'commands')
    await copyAll(lists.agents, 'agents')
    for (const extra of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'README.md']) {
      if (existsSync(join(dir, extra))) await cp(join(dir, extra), join(picked, extra))
    }
    await rm(dir, { recursive: true, force: true })
    await cp(picked, dir, { recursive: true })
    await rm(picked, { recursive: true, force: true })
  }

  const manifestFile = join(dir, '.claude-plugin', 'plugin.json')
  const existing = await readJson(manifestFile)
  const name = str(entry.name)!
  if (existing && !lists) {
    if (existing.name !== name) {
      existing.name = name
      await writeFile(manifestFile, JSON.stringify(existing, null, 2))
    }
    return
  }
  const manifest: Record<string, unknown> = { name, description: str(entry.description), version: str(entry.version) }
  // Non-strict entries carry their hooks and servers in the marketplace file.
  if (entry.strict === false) {
    if (entry.hooks) manifest.hooks = entry.hooks
    if (entry.mcpServers) manifest.mcpServers = entry.mcpServers
    if (entry.lspServers) manifest.lspServers = entry.lspServers
  }
  await mkdir(join(dir, '.claude-plugin'), { recursive: true })
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2))
}

function parseSkill(folder: string, text: string): MySkill {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!m) return { name: folder, description: '', body: text.trim() }
  const front = m[1]
  const desc = /^description:\s*(.*)$/m.exec(front)?.[1]?.trim() ?? ''
  let description = desc
  try {
    if (desc.startsWith('"')) description = JSON.parse(desc) as string
  } catch {
    /* keep as written */
  }
  return { name: folder, description, body: m[2].trim() }
}
