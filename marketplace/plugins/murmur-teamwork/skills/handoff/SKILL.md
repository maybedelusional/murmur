---
name: handoff
description: Use when your part of the work is done and another agent (a reviewer, tester or builder) should pick it up, or when you send another agent a message about your branch.
---

# Handing work to another agent

Before you message another agent about your work:

1. Commit everything on your branch with a clear message.
2. Run the tests that cover what you changed and note the result.

Then send one message (with `send_message`) that covers, in this order:

- **What changed**: one or two sentences, in plain words.
- **Where**: your branch name and the main files touched.
- **How to check it**: the exact command to run, and what passing looks like.
- **What's left or risky**: anything unfinished, assumptions you made, edge cases you didn't cover.

Keep it under 15 lines. Don't paste diffs; the other agent can read your branch with `git diff`.

After sending, don't wait for a reply unless you need an answer to continue.
