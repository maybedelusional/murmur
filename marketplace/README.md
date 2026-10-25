# Murmur community marketplace

Plugins and skills built for running several agents at once. Murmur lists this marketplace by default, and it uses Claude Code's plugin format, so these plugins also work in Claude Code:

```
/plugin marketplace add maybedelusional/murmur
```

## Add your plugin

1. Put your plugin in `plugins/<your-plugin>/` (a `.claude-plugin/plugin.json` plus `skills/`, `commands/` or `agents/`), or host it in your own repository.
2. Add an entry to `.claude-plugin/marketplace.json`. For a plugin in its own repository use `"source": { "source": "github", "repo": "you/your-plugin" }`.
3. Open a pull request. Plugins that run code (hooks or MCP servers) get a closer review.

A skill is a folder with a `SKILL.md`: a short front matter with `name` and a `description` of when to use it, then the instructions.
