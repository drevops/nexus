# Create with AI

An AI agent can turn a content model from a screenshot, a spreadsheet, a spec or a list of content types into a Nexus diagram. The **Create with AI** dialog hands the agent the instructions it needs and opens the diagram it writes back.

## How it works

The agent follows the `create-nexus-diagram` skill, a set of instructions that maps a source onto entity types, fields and references. It writes a `.nexus.json` document, which you paste into the dialog. The agent leaves the layout out, so Nexus lays the diagram out when it opens.

The site serves the [create-nexus-diagram skill](https://nexus.drevops.com/skills/create-nexus-diagram/SKILL.md) and the [Nexus JSON Schema](https://nexus.drevops.com/schema/nexus.schema.json), which defines the document format.

## Open the dialog

Click **Create with AI** on the landing screen (`Alt`+`A`), or click the caret beside **Open**, then **Create with AI…**.

## Hand the skill to your agent

The dialog has 3 tabs, 1 per way of giving the agent the skill. Pick the tab that suits your agent:

| Tab | Use it for | What to do |
|-----|------------|------------|
| **Prompt** | An agent that can read web pages, such as Claude Code, Codex or Cursor | Click **Copy prompt**, paste the prompt into the agent, then describe the content model or attach the source |
| **Skill** | A chat that can't read web pages | Click **Copy skill** and paste the whole skill into the chat first, then your source. **Download SKILL.md** saves the skill as a file |
| **Install** | An agent you use in a project, so it uses the skill whenever you ask for a Nexus diagram | Click **Copy command** and run the command in the project's root |

The prompt asks the agent to read the skill and reply with the whole document in a single JSON code block when it can't save files. The install command writes the skill to `.claude/skills`, where Claude Code reads it. For another agent, copy `SKILL.md` into the folder that agent reads its skills from. On https://nexus.drevops.com, the command is:

```bash
curl -sSL --create-dirs -o .claude/skills/create-nexus-diagram/SKILL.md https://nexus.drevops.com/skills/create-nexus-diagram/SKILL.md
```

When your browser doesn't allow the copy, the button selects the text so you can copy it yourself. The **Skill** tab loads the skill the first time you open the dialog. When it can't, the tab says so and names the skill's address, and the next time you open the dialog it tries again.

## Open the diagram

1. Paste what the agent wrote into **Paste the diagram**. Paste the `.nexus.json` document, or the agent's whole reply: Nexus reads the first code block of a reply.
2. Click **Open diagram**.

The diagram replaces the open diagram, and its history starts over. When the text isn't a diagram Nexus can read, the dialog stays open and shows `Could not open that diagram:` with the reason, such as `That isn't valid JSON`.

Check the diagram the agent wrote before you rely on it. The [Checks](checks.md) panel lists the problems Nexus finds in it.
