import { execFile } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join, basename } from 'node:path'
import type { DiffHunk, FileDiff } from '@shared/types'

export class GitError extends Error {}

export function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || err.message).trim()
        reject(new GitError(msg))
      } else resolve(stdout)
    })
  })
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface RepoInfo {
  root: string
  name: string
  branch: string
}

export async function inspectRepo(path: string): Promise<RepoInfo> {
  let root: string
  try {
    root = (await git(path, ['rev-parse', '--show-toplevel'])).trim()
  } catch {
    throw new GitError('This folder is not a git repository. Run "git init" in it and make a first commit.')
  }
  try {
    await git(root, ['rev-parse', '--verify', 'HEAD'])
  } catch {
    throw new GitError('This repository has no commits yet. Make a first commit so agents have something to branch from.')
  }
  const branch = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  return { root, name: basename(root), branch }
}

export async function addWorktree(repo: string, folder: string, branch: string): Promise<string> {
  await mkdir(dirname(folder), { recursive: true })
  if (process.platform === 'win32') {
    // Nested worktrees + node_modules easily exceed 260 characters.
    await git(repo, ['config', 'core.longpaths', 'true'])
  }
  const base = (await git(repo, ['rev-parse', 'HEAD'])).trim()
  await git(repo, ['worktree', 'add', '-b', branch, folder, base])
  return base
}

/** Removes a worktree and its branch. Retries because Windows locks open files. */
export async function removeWorktree(repo: string, folder: string, branch: string): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await git(repo, ['worktree', 'remove', '--force', folder])
      lastError = undefined
      break
    } catch (e) {
      lastError = e
      if (String(e).includes('is not a working tree')) {
        lastError = undefined
        break
      }
      await sleep(600 * (attempt + 1))
    }
  }
  if (lastError) {
    throw new GitError(
      `Couldn't remove ${folder}. A program (an editor, terminal or dev server) probably has a file open there. Close it and try again.`
    )
  }
  await git(repo, ['worktree', 'prune']).catch(() => undefined)
  await git(repo, ['branch', '-D', branch]).catch(() => undefined)
}

export interface Numstat {
  file: string
  added: number
  removed: number
}

/** Everything that differs between the agent's folder (including uncommitted work) and where it started. */
export async function changedFiles(folder: string, base: string): Promise<Numstat[]> {
  const out: Numstat[] = []
  const diff = await git(folder, ['diff', '--numstat', base])
  for (const line of diff.split('\n')) {
    const [a, r, ...rest] = line.split('\t')
    if (!rest.length) continue
    out.push({ file: rest.join('\t'), added: Number(a) || 0, removed: Number(r) || 0 })
  }
  const untracked = await git(folder, ['ls-files', '--others', '--exclude-standard'])
  for (const file of untracked.split('\n').filter(Boolean)) {
    let added = 0
    try {
      const text = await readFile(join(folder, file), 'utf8')
      added = text.length ? text.split('\n').length : 0
    } catch {
      /* binary or unreadable */
    }
    out.push({ file, added, removed: 0 })
  }
  return out
}

async function commitWith(folder: string, message: string, identity: boolean): Promise<void> {
  const id = identity ? ['-c', 'user.name=Murmur', '-c', 'user.email=murmur@localhost'] : []
  await git(folder, [...id, 'commit', '-m', message])
}

export async function commitAll(folder: string, message: string): Promise<boolean> {
  const status = await git(folder, ['status', '--porcelain'])
  if (!status.trim()) return false
  await git(folder, ['add', '-A'])
  try {
    await commitWith(folder, message, false)
  } catch (e) {
    if (/tell me who you are|user\.email|user\.name/i.test(String(e))) await commitWith(folder, message, true)
    else throw e
  }
  return true
}

/** Merges an agent branch into whatever is checked out in the main folder. */
export async function mergeBranch(repo: string, branch: string): Promise<string> {
  const target = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  const dirty = (await git(repo, ['status', '--porcelain', '--untracked-files=no'])).trim()
  if (dirty) {
    throw new GitError(`Your main folder has uncommitted changes on ${target}. Commit or stash them, then merge again.`)
  }
  try {
    await git(repo, ['merge', '--no-ff', '--no-edit', branch])
  } catch (e) {
    const conflicts = (await git(repo, ['diff', '--name-only', '--diff-filter=U']).catch(() => '')).trim()
    await git(repo, ['merge', '--abort']).catch(() => undefined)
    if (conflicts) {
      throw new GitError(
        `Merging would conflict in ${conflicts.split('\n').join(', ')}. Nothing was changed. Ask the agent to update its branch, or merge it by hand.`
      )
    }
    throw e
  }
  return target
}


const MAX_LINES_PER_FILE = 3000

/** Everything the agent changed since it started, as hunks the review screen can show. */
export async function fullDiff(folder: string, base: string): Promise<FileDiff[]> {
  const text = await git(folder, ['diff', '--no-color', '--no-ext-diff', '-M', '-U3', base])
  const files = parseUnifiedDiff(text)

  const untracked = (await git(folder, ['ls-files', '--others', '--exclude-standard'])).split('\n').filter(Boolean)
  for (const file of untracked) {
    let content: string | null = null
    try {
      const buf = await readFile(join(folder, file))
      content = buf.includes(0) ? null : buf.toString('utf8')
    } catch {
      content = null
    }
    const lines = content === null ? [] : content.replace(/\n$/, '').split('\n')
    const tooLarge = lines.length > MAX_LINES_PER_FILE
    files.push({
      file,
      status: 'added',
      binary: content === null,
      tooLarge,
      added: lines.length,
      removed: 0,
      hunks:
        content === null || tooLarge || !lines.length
          ? []
          : [{ header: `@@ -0,0 +1,${lines.length} @@`, lines: lines.map((t, i) => ({ kind: 'add' as const, newNo: i + 1, text: t })) }]
    })
  }
  return files.sort((a, b) => a.file.localeCompare(b.file))
}

export function parseUnifiedDiff(text: string): FileDiff[] {
  const out: FileDiff[] = []
  let cur: FileDiff | null = null
  let hunk: DiffHunk | null = null
  let oldNo = 0
  let newNo = 0
  let count = 0

  const unquote = (p: string): string => p.replace(/^"|"$/g, '').replace(/^[ab]\//, '')

  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = /^diff --git (.+?) (b\/.+|"b\/.+")$/.exec(line)
      const file = m ? unquote(m[2]) : line.slice(11)
      cur = { file, status: 'modified', binary: false, tooLarge: false, added: 0, removed: 0, hunks: [] }
      out.push(cur)
      hunk = null
      count = 0
      continue
    }
    if (!cur) continue
    if (line.startsWith('new file mode')) cur.status = 'added'
    else if (line.startsWith('deleted file mode')) cur.status = 'deleted'
    else if (line.startsWith('rename from ')) {
      cur.status = 'renamed'
      cur.oldFile = line.slice(12)
    } else if (line.startsWith('rename to ')) cur.file = line.slice(10)
    else if (line.startsWith('Binary files ')) cur.binary = true
    else if (line.startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
      oldNo = m ? Number(m[1]) : 0
      newNo = m ? Number(m[2]) : 0
      hunk = { header: line, lines: [] }
      if (count < MAX_LINES_PER_FILE) cur.hunks.push(hunk)
    } else if (hunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
      // (The ---/+++ file headers come before the first @@, while hunk is still null.)
      const kind = line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : 'context'
      if (kind === 'add') cur.added++
      if (kind === 'del') cur.removed++
      count++
      if (count > MAX_LINES_PER_FILE) {
        cur.tooLarge = true
        continue
      }
      hunk.lines.push({
        kind,
        oldNo: kind === 'add' ? undefined : oldNo,
        newNo: kind === 'del' ? undefined : newNo,
        text: line.slice(1)
      })
      if (kind !== 'add') oldNo++
      if (kind !== 'del') newNo++
    }
  }
  return out
}
