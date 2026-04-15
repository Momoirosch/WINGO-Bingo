# WINGO-Bingo

A small GitHub Pages bingo app that discovers its subjects from JSON files.
Each subject can choose:

- `daily` or `weekly`
- `3x3` or `4x4`
- its own entry list
- an optional color theme

## How it works

- Enter any name or string.
- Pick a subject at the top of the page.
- The app combines that value with the current day or ISO week, depending on the subject.
- A deterministic shuffle picks the required number of prompts from that subject's card list.
- Clicking fields marks progress and saves it locally in the browser for that exact subject, name, and day or week.

## Adding a new bingo subject

Drop a new JSON file into `public/subjects/`.

Example:

```json
{
  "title": "Databases Bingo",
  "subtitle": "Weekly database chaos",
  "cadence": "weekly",
  "cardSize": 3,
  "entries": [
    "Deadlock mentioned",
    "Migration issue",
    "Someone says ACID",
    "N+1 query",
    "Schema drift",
    "Index forgotten",
    "Backup panic",
    "Slow query screenshot",
    "Connection pool drama"
  ],
  "theme": {
    "light": {
      "primary": "#7c3aed",
      "accent": "#ea580c"
    },
    "dark": {
      "primary": "#a78bfa",
      "accent": "#fb923c"
    }
  }
}
```

Required fields:

- `title`
- `cadence`: `daily` or `weekly`
- `cardSize`: `3` or `4`
- `entries`: at least `9` entries for `3x3`, or `16` for `4x4`

Optional fields:

- `subtitle`
- `theme.light`
- `theme.dark`

Theme values are partial overrides, so you only need to provide the colors you want to change.
Supported theme keys are:

- `bg`
- `bgAccent`
- `panel`
- `panelStrong`
- `text`
- `muted`
- `primary`
- `primaryStrong`
- `accent`
- `border`
- `shadow`
- `selectedBorder`
- `selectedTop`
- `selectedBottom`
- `winningBorder`
- `winningTop`
- `winningBottom`

The build step automatically creates the subject index, so you do not need to maintain a manifest by hand.

## Local commands

```bash
bun run check
bun run build
bun run preview
```

The production site is generated into `dist/`.

To test locally:

1. Run `bun run check`
2. Run `bun run build`
3. Run `bun run preview`
4. Open `http://localhost:4173`

## GitHub Pages

The repo includes a GitHub Actions workflow that builds the site and deploys
`dist/` to GitHub Pages whenever you push to `main`.

Publishing steps:

1. Push the repository to GitHub.
2. Open the repository on GitHub.
3. Go to `Settings` -> `Pages`.
4. Under `Build and deployment`, choose `GitHub Actions`.
5. Push a commit to `main`, or run the workflow manually from the `Actions`
   tab.
6. After the workflow finishes, the site will be available at:
   `https://Momoirosch.github.io/WINGO-Bingo/`
