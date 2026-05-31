---
name: "source-command-agent-vibes-mute"
description: "Mute all AgentVibes TTS output (project-specific by default)"
---

# source-command-agent-vibes-mute

Use this skill when the user asks to run the migrated source command `agent-vibes-mute`.

## Command Template

# Mute AgentVibes TTS

Mute TTS for this project only (default):

```bash
# Get the project root (where .Codex/ directory is located)
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
while [[ "$PROJECT_ROOT" != "/" ]] && [[ ! -d "$PROJECT_ROOT/.Codex" ]]; do
  PROJECT_ROOT=$(dirname "$PROJECT_ROOT")
done

if [[ -d "$PROJECT_ROOT/.Codex" ]]; then
  # Remove project unmute file if it exists
  rm -f "$PROJECT_ROOT/.Codex/agentvibes-unmuted"

  # Create project mute file
  touch "$PROJECT_ROOT/.Codex/agentvibes-muted"

  echo "🔇 **AgentVibes TTS muted for this project.** All voice output is now silenced."
else
  echo "⚠️ No .Codex directory found. Cannot create project-local mute file."
  exit 1
fi
```

**Advanced Options:**

To mute globally across ALL projects, use:
```bash
touch "$HOME/.agentvibes-muted"
```

To unmute, use `/agent-vibes:unmute`
