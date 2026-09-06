# rpsociety.app

The marketing site for **Roleplay Society** (currently an under-construction page).

- Hosting: **GitHub Pages** from `main` (root). Custom domain via the `CNAME` file → `rpsociety.app`.
- Static only: `index.html`, `404.html`, `assets/`. No build step.
- **The icons in `assets/` are generated, not hand-made.** They come from the brand masters in the
  app repo (`rp-society/mvp/brand/`); regenerate with `python3 brand/generate_icons.py` from there,
  which writes into this repo as well. Edit the masters, never the output.
- The game itself lives at `play.rpsociety.app` (Fly.io, private repo `rp-society`).

Deploy = push to `main`.
