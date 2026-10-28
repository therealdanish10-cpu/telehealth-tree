# TeleHealth Today — Interactive Knowledge Tree

A standalone, static interactive **Knowledge Tree** web page for [TeleHealth Today](https://telehealthtoday.net/), built with plain HTML, CSS, and vanilla JavaScript (no frontend framework, no backend, no database).

All categories and topics are organized under two top-level root nodes — **Health** and **Wealth** — and rendered lazily from `data/tree.json` to support thousands of topics at any nesting depth.

---

## Project Structure

```text
├── index.html                                    # Main static page
├── style.css                                     # Clean healthcare theme & responsive layout
├── app.js                                        # Arbitrary-depth lazy tree renderer, search & side panel
├── data/
│   └── tree.json                                 # Generated JSON consumed by the page (committed to Git)
├── scripts/
│   └── build-tree.js                             # Reads Excel + extra-topics.txt and outputs data/tree.json
├── source/
│   ├── TeleHealth_Today_Categories_Columns.xlsx  # Source spreadsheet (47 categories)
│   └── extra-topics.txt                          # Plain-text additions & new categories
├── package.json                                  # Build script & xlsx devDependency
├── vercel.json                                   # Static Vercel configuration
└── README.md
```

---

## How to Add Topics or Categories

You do **not** need to edit `app.js` or `data/tree.json` manually. All content is generated from `source/extra-topics.txt` and `source/TeleHealth_Today_Categories_Columns.xlsx`.

### 1. Edit `source/extra-topics.txt` (or the Excel file)

Open `source/extra-topics.txt` and add lines using either format:

- **Add topics to an existing category:**
  ```text
  Category Name :: Topic 1 | Topic 2 | Topic 3
  ```

- **Create a brand-new category under `Health` or `Wealth`:**
  ```text
  @Health :: New Category Name :: Topic 1 | Topic 2 | Topic 3
  @Wealth :: Another Category :: Topic A | Topic B
  ```

*(Lines starting with `#` and blank lines are ignored. Duplicate topics within the same category are automatically skipped case-insensitively.)*

### 2. Regenerate `data/tree.json`

Run the build script locally:

```bash
npm install
npm run build:tree
```

 This updates `data/tree.json` and prints a summary of total categories, total topics, topics added from `extra-topics.txt`, and any warnings.

### 3. Commit and Push to GitHub

Because Vercel serves `data/tree.json` directly as a static asset, make sure to commit the updated `data/tree.json` file and push to GitHub:

```bash
git add source/extra-topics.txt data/tree.json
git commit -m "Update knowledge tree topics"
git push
```

Pushing to GitHub automatically triggers a fresh Vercel deployment.

---

## Deploying on Vercel

1. Push this repository to GitHub.
2. In [Vercel](https://vercel.com/), click **Add New… → Project** and import the repository.
3. Configure the project settings:
   - **Framework Preset:** `Other`
   - **Build Command:** *(leave empty / None — `data/tree.json` is pre-built and committed)*
   - **Output Directory:** `.` *(project root / leave default)*
4. Click **Deploy**.
