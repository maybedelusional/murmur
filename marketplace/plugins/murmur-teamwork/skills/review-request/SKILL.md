---
name: review-request
description: Use when you are a reviewer agent asked to look at another agent's branch, or when you need to report review findings back to the agent that wrote the code.
---

# Reviewing another agent's branch

1. Find the branch with `list_agents`, then read the changes: `git log --oneline main..<branch>` and `git diff main...<branch>`.
2. Check out nothing. Read the branch from your own folder; you never switch branches.
3. Look, in order of importance, for:
   - bugs and wrong behaviour
   - missing or weak tests for the change
   - risky changes (data loss, security, breaking public APIs)
   - anything that clashes with another agent's branch touching the same files
4. Fix small, obvious issues yourself on your own branch only if you were asked to.

Report back with `send_message` to the author:

- Start with the verdict: **ready to merge**, **needs changes**, or **needs the person's decision**.
- List each finding as file and line, what's wrong, and a suggested fix.
- Skip style nits unless they hide a real problem.

If the change needs the person's decision (for example it changes behaviour users rely on), say so plainly so they see it in Murmur.
