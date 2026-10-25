import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AccessMode, Recipe, Role } from '@shared/types'
import { BUILTIN_RECIPES } from '@shared/recipes'

const ROLES: Role[] = ['planner', 'builder', 'reviewer', 'tester', 'custom']
const MODES: AccessMode[] = ['ask', 'edits', 'auto', 'bypass']

const file = (): string => join(app.getPath('userData'), 'recipes.json')

function readMine(): Recipe[] {
  try {
    const data = JSON.parse(readFileSync(file(), 'utf8')) as Recipe[]
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export function listRecipes(): Recipe[] {
  return [...BUILTIN_RECIPES, ...readMine()]
}

export function getRecipe(id: string): Recipe {
  const r = listRecipes().find((x) => x.id === id)
  if (!r) throw new Error('That team recipe no longer exists.')
  return r
}

export function saveRecipe(input: Recipe): Recipe {
  const name = input.name?.trim()
  if (!name) throw new Error('Give the recipe a name.')
  if (!Array.isArray(input.members) || !input.members.length) throw new Error('Add at least one agent to the team.')
  if (input.members.length > 8) throw new Error('A team can have at most 8 agents.')
  const members = input.members.map((m) => {
    if (!ROLES.includes(m.role)) throw new Error('Unknown role in the recipe.')
    if (!MODES.includes(m.mode)) throw new Error('Unknown access mode in the recipe.')
    if (!m.brief?.trim()) throw new Error('Tell each agent what its part of the work is.')
    return {
      role: m.role,
      name: m.name?.trim() || undefined,
      mode: m.mode,
      brief: m.brief.trim(),
      canStartAgents: Boolean(m.canStartAgents)
    }
  })
  const builtin = BUILTIN_RECIPES.some((b) => b.id === input.id)
  const recipe: Recipe = {
    // Editing a built-in recipe saves your own copy.
    id: input.id && !builtin ? input.id : randomUUID(),
    name,
    description: input.description?.trim() ?? '',
    members
  }
  const mine = readMine().filter((r) => r.id !== recipe.id)
  writeFileSync(file(), JSON.stringify([...mine, recipe], null, 2))
  return recipe
}

export function removeRecipe(id: string): void {
  if (BUILTIN_RECIPES.some((b) => b.id === id)) throw new Error('Built-in recipes can’t be deleted.')
  writeFileSync(file(), JSON.stringify(readMine().filter((r) => r.id !== id), null, 2))
}
