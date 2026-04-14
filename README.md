# WINGO-Bingo

A small GitHub Pages bingo app that creates the same 4x4 card for the same
name/string on the same day.

## How it works

- Enter any name or string.
- The app combines that value with the local date in `YYYY-MM-DD` format.
- A deterministic shuffle picks 16 prompts from the field list.
- Clicking fields marks progress and is saved locally in the browser for that
  specific name and day.

## Field data

The bingo prompts live in `src/bingo-fields.json`.

This replaces the original plain-text `bingoFileds.txt` format so it is easier
to extend later.

## Local commands

```bash
bun run check
bun run build
bun run preview
```

The production site is generated into `dist/`.

To test locally:

1. Run `bun run build`
2. Run `bun run preview`
3. Open `http://localhost:4173`

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
