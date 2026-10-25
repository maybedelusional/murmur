import type { Recipe } from './types'

/** Teams Murmur ships with. Custom ones are saved next to these. */
export const BUILTIN_RECIPES: Recipe[] = [
  {
    id: 'plan-build-review',
    name: 'Plan, build and review',
    description: 'A planner splits the task and starts builders for each piece (you approve each one). A reviewer checks their branches.',
    builtin: true,
    members: [
      {
        role: 'planner',
        mode: 'edits',
        canStartAgents: true,
        brief:
          'Plan the work first and write it to PLAN.md. Then start one builder per independent piece with the start_agent tool (at most 3), each with a precise task that names the files it owns, so builders never edit the same files. When builders tell you they are done, ask Reviewer to review their branches.'
      },
      {
        role: 'reviewer',
        mode: 'ask',
        brief:
          'Wait until a builder or the planner messages you that a branch is ready, then review that branch and send your findings to its author. Until then, read the code base so you know it.'
      }
    ]
  },
  {
    id: 'two-takes',
    name: 'Two takes, one review',
    description: 'Two builders solve the same task independently so you can compare. A reviewer tells you which one is better and why.',
    builtin: true,
    members: [
      { role: 'builder', mode: 'edits', brief: 'Solve the task your own way. Keep it simple and well tested. Tell Reviewer when you are done.' },
      { role: 'builder', mode: 'edits', brief: 'Solve the task your own way, deliberately trying a different approach from the obvious one. Tell Reviewer when you are done.' },
      {
        role: 'reviewer',
        mode: 'ask',
        brief:
          'Two builders are solving the same task separately. When both say they are done, compare their branches and write a short verdict: which one to merge, and why. Message both builders with anything they should fix.'
      }
    ]
  },
  {
    id: 'build-and-test',
    name: 'Build and test',
    description: 'A builder implements the task while a tester writes tests for it at the same time.',
    builtin: true,
    members: [
      { role: 'builder', mode: 'edits', brief: 'Implement the task. When you are done, tell Tester your branch name so they can run their tests against it.' },
      {
        role: 'tester',
        mode: 'edits',
        brief:
          'Write tests for the task from its description, before the code exists. When Builder tells you their branch is ready, run your tests against it and report the results to Builder.'
      }
    ]
  }
]
