import { Fragment, useEffect, useMemo, useState } from 'react'
import type { AgentSnapshot, DiffLine, FileDiff, MurmurApi, Result } from '@shared/types'

interface Props {
  agent: AgentSnapshot
  api: MurmurApi
  run: <T>(call: Promise<Result<T>>) => Promise<T | undefined>
  onClose(): void
}

interface Comment {
  id: string
  file: string
  line: number
  side: 'old' | 'new'
  quote: string
  text: string
}

/** One row of the side-by-side view: what was there before, and what's there now. */
interface Row {
  left?: DiffLine
  right?: DiffLine
}

function toRows(lines: DiffLine[]): Row[] {
  const rows: Row[] = []
  let dels: DiffLine[] = []
  let adds: DiffLine[] = []
  const flush = (): void => {
    const n = Math.max(dels.length, adds.length)
    for (let i = 0; i < n; i++) rows.push({ left: dels[i], right: adds[i] })
    dels = []
    adds = []
  }
  for (const l of lines) {
    if (l.kind === 'del') dels.push(l)
    else if (l.kind === 'add') adds.push(l)
    else {
      flush()
      rows.push({ left: l, right: l })
    }
  }
  flush()
  return rows
}

export function ReviewSheet({ agent, api, run, onClose }: Props) {
  const [files, setFiles] = useState<FileDiff[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [draftAt, setDraftAt] = useState<{ file: string; line: number; side: 'old' | 'new'; quote: string } | null>(null)
  const [draft, setDraft] = useState('')
  const [merging, setMerging] = useState(false)

  useEffect(() => {
    void run(api.agents.diff(agent.id)).then((f) => {
      setFiles(f ?? [])
      if (f?.length) setSelected(f[0].file)
    })
  }, [agent.id, api, run])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement)) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const file = files?.find((f) => f.file === selected) ?? null
  const totals = useMemo(
    () => (files ?? []).reduce((t, f) => ({ added: t.added + f.added, removed: t.removed + f.removed }), { added: 0, removed: 0 }),
    [files]
  )
  const busy = agent.status === 'working' || agent.status === 'waiting' || agent.status === 'starting'

  const addComment = (): void => {
    if (!draftAt || !draft.trim()) return
    setComments((c) => [...c, { id: `${Date.now()}`, ...draftAt, text: draft.trim() }])
    setDraft('')
    setDraftAt(null)
  }

  const sendComments = async (): Promise<boolean> => {
    if (!comments.length) return true
    const body = [
      `Review comments on your branch (${comments.length}). Please address each one, then tell me when it's done.`,
      '',
      ...comments.map((c, i) =>
        [`${i + 1}. ${c.file}, line ${c.line}${c.side === 'old' ? ' (removed line)' : ''}:`, `   > ${c.quote.trim().slice(0, 160)}`, `   ${c.text}`].join('\n')
      )
    ].join('\n')
    const r = await run(api.agents.send(agent.id, body))
    if (r === undefined) return false
    setComments([])
    return true
  }

  const merge = async (): Promise<void> => {
    setMerging(true)
    const target = await run(api.agents.merge(agent.id))
    setMerging(false)
    if (target !== undefined) onClose()
  }

  const commentsFor = (fileName: string, side: 'old' | 'new', line?: number): Comment[] =>
    line === undefined ? [] : comments.filter((c) => c.file === fileName && c.side === side && c.line === line)

  const cell = (f: FileDiff, l: DiffLine | undefined, side: 'old' | 'new') => {
    if (!l) return <td className="d-num" />
    const no = side === 'old' ? l.oldNo : l.newNo
    // Unchanged lines exist on both sides; comments on them refer to the current version.
    const target = l.kind === 'context' ? 'new' : side
    const targetNo = target === 'old' ? l.oldNo : l.newNo
    return (
      <td className="d-num">
        <button
          className="d-num-btn"
          aria-label={`Comment on line ${no}`}
          onClick={() => {
            setDraft('')
            setDraftAt({ file: f.file, line: targetNo ?? 0, side: target, quote: l.text })
          }}
        >
          {no}
        </button>
      </td>
    )
  }

  return (
    <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <header className="sheet-head review-head">
        <div>
          <h1 id="review-title">Review {agent.name}</h1>
          <p className="muted">
            {files ? `${files.length} ${files.length === 1 ? 'file' : 'files'}, ${totals.added} lines added, ${totals.removed} removed` : 'Reading changes…'}
            {' '}on <span className="mono">{agent.branch}</span>
          </p>
        </div>
        <div className="review-actions">
          <button className="btn" onClick={onClose}>
            Back
          </button>
          <button className="btn" disabled={!comments.length} onClick={() => void sendComments()}>
            {comments.length ? `Send ${comments.length} ${comments.length === 1 ? 'comment' : 'comments'} to ${agent.name}` : 'No comments yet'}
          </button>
          <button
            className="btn primary"
            disabled={busy || merging || !files?.length}
            title={busy ? 'Pause it or wait until it’s done' : undefined}
            onClick={() => void merge()}
          >
            {merging ? 'Merging…' : 'Merge into project'}
          </button>
        </div>
      </header>

      {files && !files.length ? (
        <div className="sheet-empty">
          <p>{agent.name} hasn’t changed anything yet.</p>
        </div>
      ) : (
        <div className="review">
          <nav className="review-files" aria-label="Changed files">
            {(files ?? []).map((f) => {
              const n = comments.filter((c) => c.file === f.file).length
              return (
                <button key={f.file} className={`review-file${f.file === selected ? ' selected' : ''}`} onClick={() => setSelected(f.file)}>
                  <span className="mono review-file-name" title={f.file}>
                    {f.file}
                  </span>
                  <span className="review-file-meta">
                    {f.status === 'added' ? 'new, ' : f.status === 'deleted' ? 'deleted, ' : f.status === 'renamed' ? 'renamed, ' : ''}+{f.added} −{f.removed}
                    {n ? `, ${n} ${n === 1 ? 'comment' : 'comments'}` : ''}
                    {agent.files.find((x) => x.file === f.file)?.sharedWith.length ? <span className="runs-code">, also changed by another agent</span> : null}
                  </span>
                </button>
              )
            })}
          </nav>

          <div className="review-diff">
            {!file ? null : file.binary ? (
              <p className="muted sheet-pad">This is a binary file, so there’s nothing to show line by line.</p>
            ) : file.tooLarge && !file.hunks.length ? (
              <p className="muted sheet-pad">This file is too large to show here. Open the terminal to look at it.</p>
            ) : (
              <table className="diff-table">
                <colgroup>
                  <col className="c-num" />
                  <col />
                  <col className="c-num" />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th colSpan={2}>Before</th>
                    <th colSpan={2}>{agent.name}’s version</th>
                  </tr>
                </thead>
                <tbody>
                  {file.hunks.map((h, hi) => (
                    <Fragment key={hi}>
                      <tr className="d-hunk">
                        <td colSpan={4}>{h.header.replace(/^@@[^@]*@@\s?/, '') || `Lines ${h.lines.find((l) => l.newNo)?.newNo ?? ''}`}</td>
                      </tr>
                      {toRows(h.lines).map((r, ri) => {
                        const notes = [...commentsFor(file.file, 'old', r.left?.oldNo), ...commentsFor(file.file, 'new', r.right?.newNo)]
                        const drafting =
                          draftAt &&
                          draftAt.file === file.file &&
                          ((draftAt.side === 'old' && r.left?.oldNo === draftAt.line && r.left?.kind !== 'context') ||
                            (draftAt.side === 'new' && r.right?.newNo === draftAt.line))
                        return (
                          <Fragment key={ri}>
                            <tr>
                              {cell(file, r.left?.kind === 'add' ? undefined : r.left, 'old')}
                              <td className={`d-code ${r.left ? (r.left.kind === 'del' ? 'del' : '') : 'none'}`}>{r.left?.text}</td>
                              {cell(file, r.right?.kind === 'del' ? undefined : r.right, 'new')}
                              <td className={`d-code ${r.right ? (r.right.kind === 'add' ? 'add' : '') : 'none'}`}>{r.right?.text}</td>
                            </tr>
                            {notes.map((c) => (
                              <tr key={c.id} className="d-comment">
                                <td colSpan={4}>
                                  <div className="comment">
                                    <p>{c.text}</p>
                                    <button className="btn quiet" onClick={() => setComments((all) => all.filter((x) => x.id !== c.id))}>
                                      Remove
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {drafting ? (
                              <tr className="d-comment">
                                <td colSpan={4}>
                                  <form
                                    className="comment editing"
                                    onSubmit={(e) => {
                                      e.preventDefault()
                                      addComment()
                                    }}
                                  >
                                    <textarea
                                      className="textarea"
                                      rows={2}
                                      autoFocus
                                      aria-label={`Comment on line ${draftAt.line}`}
                                      placeholder={`What should ${agent.name} change here?`}
                                      value={draft}
                                      onChange={(e) => setDraft(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addComment()
                                        if (e.key === 'Escape') setDraftAt(null)
                                      }}
                                    />
                                    <span className="row">
                                      <button type="button" className="btn" onClick={() => setDraftAt(null)}>
                                        Cancel
                                      </button>
                                      <button type="submit" className="btn primary" disabled={!draft.trim()}>
                                        Add comment
                                      </button>
                                    </span>
                                  </form>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
            {file?.tooLarge && file.hunks.length ? <p className="muted sheet-pad">The rest of this file is too long to show.</p> : null}
          </div>
        </div>
      )}
    </section>
  )
}
