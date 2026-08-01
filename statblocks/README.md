# Statblocks folder

Drop stat block files here and the Bestiary app picks them up automatically
the next time it loads (or when you click **Refresh** on the Repo Library
section in the catalog) — no rebuilding, no re-uploading through the app.

## Supported formats

- **`.md`** — the same markdown stat block format the app's "Import Markdown"
  button already understands (Homebrewery-style blockquotes or plain
  markdown; single or multiple monsters per file).
- **`.json`** — either:
  - A 5etools-style bestiary file: `{"monster": [ {...}, {...} ]}`
  - The app's own export format: `{"version": 1, "monsters": [ {...} ]}`

## How it works

The app calls the GitHub API to list whatever files are currently in this
folder, fetches each one, and parses it — so the "library" is always exactly
what's committed here. Nothing is embedded in the app itself.

Monsters loaded this way show up under a **Repo Library** section in the
catalog. They're read-only there (edit/delete aren't available, since the
source of truth is this folder, not your local save data) — click **Copy to
my library** on a card to get an editable copy in your own saved library.

## Example

See `example-creature.json` for the expected 5etools JSON shape.
