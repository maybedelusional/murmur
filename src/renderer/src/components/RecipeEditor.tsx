import { useEffect, useState } from 'react'
import type { AccessMode, Recipe, RecipeMember, Role } from '@shared/types'
import { MODE_LONG, ROLES } from '../labels'

interface Props {
  recipes: Recipe[]
  allowBypass: boolean
  onSave(recipe: Recipe): Promise<Recipe | undefined>
  onDelete(id: string): Promise<void>
  onClose(): void
}

const blankMember = (): RecipeMember => ({ role: 'builder', mode: 'edits', brief: '' })

export function RecipeEditor({ recipes, allowBypass, onSave, onDelete, onClose }: Props) {
  const [editing, setEditing] = useState<Recipe>(() => structuredClone(recipes[0] ?? { id: '', name: '', description: '', members: [blankMember()] }))
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setMember = (i: number, patch: Partial<RecipeMember>): void =>
    setEditing((r) => ({ ...r, members: r.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) }))

  const save = async (): Promise<void> => {
    const saved = await onSave(editing)
    if (saved) setEditing(structuredClone(saved))
  }

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="recipes-title">
        <div className="dialog-title-row">
          <h1 id="recipes-title">Team recipes</h1>
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="recipes">
          <nav className="skills-list" aria-label="Recipes">
            <button
              className="btn primary"
              onClick={() => {
                setConfirmDelete(false)
                setEditing({ id: '', name: '', description: '', members: [blankMember()] })
              }}
            >
              New recipe
            </button>
            {recipes.map((r) => (
              <button
                key={r.id}
                className={`filter-item${editing.id === r.id ? ' selected' : ''}`}
                onClick={() => {
                  setConfirmDelete(false)
                  setEditing(structuredClone(r))
                }}
              >
                <span>{r.name}</span>
                {r.builtin ? <span className="muted small">built in</span> : null}
              </button>
            ))}
          </nav>

          <form
            className="recipe-form"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            {editing.builtin ? <p className="muted small">This one is built in. Saving makes your own copy.</p> : null}
            <div className="field">
              <label htmlFor="recipe-name">Name</label>
              <input id="recipe-name" className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="recipe-desc">Description</label>
              <input
                id="recipe-desc"
                className="input"
                value={editing.description}
                placeholder="What this team is good for"
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>

            <div className="field">
              <span className="label">Agents in the team</span>
              {editing.members.map((m, i) => (
                <div className="member" key={i}>
                  <div className="member-row">
                    <select className="select" aria-label="Role" value={m.role} onChange={(e) => setMember(i, { role: e.target.value as Role })}>
                      {ROLES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      aria-label="Name (optional)"
                      placeholder="Name (optional)"
                      value={m.name ?? ''}
                      onChange={(e) => setMember(i, { name: e.target.value })}
                    />
                    <select className="select" aria-label="How much it asks" value={m.mode} onChange={(e) => setMember(i, { mode: e.target.value as AccessMode })}>
                      {(Object.keys(MODE_LONG) as AccessMode[]).map((mode) => (
                        <option key={mode} value={mode} disabled={mode === 'bypass' && !allowBypass}>
                          {MODE_LONG[mode].title}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn quiet"
                      disabled={editing.members.length === 1}
                      onClick={() => setEditing({ ...editing, members: editing.members.filter((_, j) => j !== i) })}
                    >
                      Remove
                    </button>
                  </div>
                  <textarea
                    className="textarea"
                    rows={3}
                    aria-label="Its part of the work"
                    placeholder="Its part of the work, for example: review each builder’s branch when they say it’s ready"
                    value={m.brief}
                    onChange={(e) => setMember(i, { brief: e.target.value })}
                  />
                  <label className="check" style={{ color: 'var(--text)', marginTop: 0 }}>
                    <input type="checkbox" checked={Boolean(m.canStartAgents)} onChange={(e) => setMember(i, { canStartAgents: e.target.checked })} />
                    Can start more agents (you approve each one)
                  </label>
                </div>
              ))}
              <button
                type="button"
                className="btn"
                style={{ alignSelf: 'flex-start' }}
                disabled={editing.members.length >= 8}
                onClick={() => setEditing({ ...editing, members: [...editing.members, blankMember()] })}
              >
                Add an agent
              </button>
            </div>

            <div className="detail-actions">
              {editing.id && !editing.builtin ? (
                confirmDelete ? (
                  <>
                    <span className="muted">Delete {editing.name}?</span>
                    <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                      Keep it
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={async () => {
                        await onDelete(editing.id)
                        setConfirmDelete(false)
                        setEditing(structuredClone(recipes[0]))
                      }}
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>
                    Delete
                  </button>
                )
              ) : null}
              <button type="submit" className="btn primary">
                {editing.builtin ? 'Save as my copy' : editing.id ? 'Save' : 'Create recipe'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
