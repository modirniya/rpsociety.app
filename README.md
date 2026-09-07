# rpsociety.app

The marketing and content site for **RPS Mafia** — free browser Mafia with voice built in.

- Hosting: **GitHub Pages** from `main` (root). Custom domain via the `CNAME` file → `rpsociety.app`.
- The game itself lives at `play.rpsociety.app` (Fly.io, private repo `rp-society`).
- Deploy = push to `main`.

## The site is generated

**Do not edit the HTML in this repository.** Every page is written by `site/build.py` from the copy
and data in `site/content.py`, and the next build overwrites anything edited by hand.

```bash
python3 site/build.py            # regenerate every page
python3 site/build.py --check    # report drift, write nothing (exit 1 if stale)
```

That produces 25 pages, `sitemap.xml` and `robots.txt`. There is no build dependency beyond the
Python standard library, and no framework — the site is a few dozen static documents, which is the
cheapest way to keep it fast and crawlable.

### What is where

| Path | Holds |
|---|---|
| `site/content.py` | All copy, the role definitions and the setup ladder |
| `site/build.py` | Layout, stylesheet, page builders, sitemap |
| `index.html`, `roles/`, `setups/`, … | Generated output — GitHub Pages serves these |
| `assets/` | Icons, also generated (see below) |

### The rules content must match the engine

The role and setup pages state exactly what the server deals. That accuracy is the whole reason
those pages can outrank a wiki, so if a role or a distribution changes in the game, change
`site/content.py` to match. Only roles production actually deals get pages — Mayor, Psychiatrist and
Negotiator are implemented but gated off, and are mentioned rather than given pages of their own.

## Legal documents

`/privacy/` and `/terms/` are **mirrored** from `legal.neuera.app/rpsmafia/`, which is the source
of truth and the only place version history lives. Both pages set their canonical to the hub and are
deliberately excluded from `sitemap.xml`, so this site never lists a URL whose canonical points
elsewhere.

```bash
python3 site/build.py --sync-legal   # re-fetch both documents into site/legal_cache/
```

The fetched fragments are committed under `site/legal_cache/`, so an ordinary build needs no
network and any change to the mirrored text shows up in a diff for review. Run the sync after a
policy is republished on the hub. To change a policy, edit it in the `neuera-legal` repository, not
here.

## Fonts

Self-hosted in `assets/fonts/`, declared by `assets/fonts.css`. Loading them from Google's CDN
sends every visitor's IP address to Google, which is a transfer that would then have to be
disclosed. The site currently makes **no third-party requests at all**.

## Icons

`assets/` is generated too, from the brand masters in the app repo
(`rp-society/mvp/brand/`); regenerate with `python3 brand/generate_icons.py` from there, which writes
into this repo as well. Edit the masters, never the output.
