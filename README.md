# Murmur

A Windows app for running several Claude agents at once on one project. Each agent works in its own copy of the project (a git worktree on its own branch) and shows up on the canvas as a small flock of birds: a working flock wheels around, a flock that needs you circles in place, and a finished one settles down. You merge an agent's work back with one click when you're happy with it.

## What you need

- Windows 10 or 11
- [Git for Windows](https://git-scm.com/download/win)
- [Node.js 22](https://nodejs.org/) (only for building from source)
- Claude Code signed in on this computer: install it, run `claude` in a terminal once, and log in. Murmur's agents use that login. You can also set `ANTHROPIC_API_KEY` instead.

## Run it from source

```bash
git clone https://github.com/maybedelusional/murmur
cd murmur
npm install
npm run dev
```

Then open a project folder (any git repository with at least one commit) and press **New agent**.

## How it works

- **Agents** run through the Claude Agent SDK, one session each. Their working folders go in `C:\cw\<project>\<agent>` by default (short paths avoid Windows' 260-character limit); change this in Settings.
- **Access modes** per agent: *Ask before every action*, *Let it edit files*, *Auto* (a safety classifier decides, shown with a caution note) and *Skip all checks* (off unless you enable it under Settings → Advanced).
- **Murmur's own rules** apply in every mode: agents can't push, can't switch to main, and can't write outside their own folder.
- **Merging** commits whatever the agent left uncommitted and merges its branch into whatever branch your main folder has checked out. If that would conflict, nothing is changed and you're told which files clash.
- **Now playing** reads Windows' media controls, so it works with Spotify, a browser or any other player without logging in.
- **Agents survive restarts.** If you close Murmur mid-task, the agent comes back paused; press Continue to pick up where it left off.

## Releasing an update

Installed copies of Murmur check GitHub Releases on start and every few hours, download new versions in the background, and offer *Restart to update*.

1. Bump `"version"` in `package.json` (for example `0.1.0` → `0.2.0`).
2. Commit, then tag and push:
   ```bash
   git commit -am "Release 0.2.0"
   git tag v0.2.0
   git push && git push --tags
   ```
3. The **Release** workflow builds the Windows installer and publishes it. Users get it automatically.

If the repository is private, auto-update can't download releases for other people. Either make releases public (for example from a separate public repo) or keep it for your own use.

## Project layout

```
src/main/       Electron main process: agents, git worktrees, safety rules, media, updates
src/preload/    The small, typed bridge the UI talks through
src/renderer/   The React UI: title bar, agent list, the sky with its flocks, panels
src/shared/     Types shared by both sides
```

Open `npm run dev`'s renderer URL in a normal browser to work on the UI with sample data.
