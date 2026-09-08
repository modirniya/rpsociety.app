#!/usr/bin/env python3
"""Generate the rpsociety.app static site.

    python3 site/build.py            # write every page
    python3 site/build.py --check    # report what would change, write nothing (exit 1 if stale)

Output lands in the repository root, which is what GitHub Pages serves. Source is this file plus
site/content.py — edit those, never the generated HTML.

Every page is written once, by hand, with its own title, description and structured data. There is
no CMS and no build dependency beyond the standard library on purpose: the site is a few dozen
static documents, and the cheapest way to keep them fast and crawlable is to keep them static.
"""

from __future__ import annotations

import datetime
import html
import json
import re
import subprocess
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import content as C  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CHECK = "--check" in sys.argv
_changed: list[str] = []

# Pages that exist, in navigation order, with the metadata the sitemap needs.
PAGES: list[dict] = []


def write(rel: str, text: str) -> None:
    path = ROOT / rel
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return
    _changed.append(rel)
    if not CHECK:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def e(s: str) -> str:
    return html.escape(s, quote=True)


# ==============================================================================================
# Layout
# ==============================================================================================

NAV = [
    ("/how-to-play/", "How to play"),
    ("/roles/", "Roles"),
    ("/setups/", "Setups"),
    ("/game-nights/", "Game nights"),
    ("/tools/role-generator/", "Role generator"),
]


def crumbs(trail: list[tuple[str, str]]) -> str:
    """Visible breadcrumb + the JSON-LD that matches it."""
    if not trail:
        return ""
    links = " <span aria-hidden=\"true\">/</span> ".join(
        f'<a href="{e(u)}">{e(t)}</a>' if u else f"<span>{e(t)}</span>" for u, t in trail
    )
    return f'<nav class="crumbs" aria-label="Breadcrumb">{links}</nav>'


def crumb_ld(trail: list[tuple[str, str]]) -> dict | None:
    if len(trail) < 2:
        return None
    items = []
    for i, (u, t) in enumerate(trail, start=1):
        item = {"@type": "ListItem", "position": i, "name": t}
        if u:
            item["item"] = C.SITE + u
        items.append(item)
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}


def faq_ld(faq: list[tuple[str, str]]) -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": a}}
            for q, a in faq
        ],
    }


def faq_html(faq: list[tuple[str, str]], heading: str = "Common questions") -> str:
    rows = "".join(
        f"<details><summary>{e(q)}</summary><p>{e(a)}</p></details>" for q, a in faq
    )
    return f'<section class="faq"><h2>{e(heading)}</h2>{rows}</section>'


def layout(*, path: str, title: str, description: str, body: str,
           trail: list[tuple[str, str]] | None = None,
           ld: list[dict] | None = None,
           priority: str = "0.6", nav_current: str = "",
           canonical: str | None = None) -> str:
    """One document. `title` is the <title>; the H1 lives inside `body`.

    `canonical` overrides the self-referential canonical. It is used only by the mirrored legal
    pages, whose authoritative copy lives on legal.neuera.app.
    """
    url = C.SITE + path
    canon = canonical or url
    blocks = list(ld or [])
    cl = crumb_ld(trail or [])
    if cl:
        blocks.append(cl)
    ld_tags = "".join(
        f'<script type="application/ld+json">{json.dumps(b, ensure_ascii=False)}</script>'
        for b in blocks
    )
    current_attr = ' aria-current="page"'
    nav_links = "".join(
        '<a href="{}"{}>{}</a>'.format(e(u), current_attr if u == nav_current else "", e(t))
        for u, t in NAV
    )

    PAGES.append({"path": path, "priority": priority})

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(description)}">
<link rel="canonical" href="{e(canon)}">
<meta name="theme-color" content="#0b0d14">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon.png">
<link rel="icon" type="image/png" sizes="192x192" href="/assets/icon-192.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{e(C.NAME)}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">
<meta property="og:url" content="{e(canon)}">
<meta property="og:image" content="{C.SITE}/assets/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{C.SITE}/assets/og-image.png">
<link rel="stylesheet" href="/assets/fonts.css">
<link rel="stylesheet" href="/assets/site.css">
{ld_tags}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="bar">
    <a class="brand" href="/" aria-label="{e(C.NAME)} home">
      <img src="/assets/icon-192.png" alt="" width="34" height="34">
      <span>{e(C.NAME)}</span>
    </a>
    <nav class="site-nav" aria-label="Main">{nav_links}</nav>
    <a class="btn btn-primary btn-sm" href="{C.PLAY}">Play</a>
  </div>
</header>
<main id="main">
{crumbs(trail or [])}
{body}
</main>
<footer class="site-foot">
  <div class="foot-grid">
    <div>
      <p class="foot-brand">{e(C.NAME)}</p>
      <p class="foot-note">Mafia with voice built in, five to twelve players, in your browser.
      Free, and nothing to install.</p>
      <a class="btn btn-primary" href="{C.PLAY}">Play now</a>
    </div>
    <div>
      <p class="foot-h">Learn</p>
      <a href="/how-to-play/">How to play</a>
      <a href="/roles/">Every role</a>
      <a href="/setups/">Setups by player count</a>
      <a href="/glossary/">Glossary</a>
    </div>
    <div>
      <p class="foot-h">Play</p>
      <a href="/game-nights/">Game nights</a>
      <a href="/tools/role-generator/">Role generator</a>
      <a href="/vs/epicmafia/">If you played EpicMafia</a>
      <a href="/vs/town-of-salem/">If you played Town of Salem</a>
    </div>
    <div>
      <p class="foot-h">Legal</p>
      <a href="/privacy/">Privacy Policy</a>
      <a href="/terms/">Terms of Use</a>
      <a href="https://legal.neuera.app/rpsmafia/">Version history</a>
    </div>
  </div>
  <p class="copyright">© 2026 Roleplay Society · <a href="{C.PLAY}">play.rpsociety.app</a></p>
</footer>
</body>
</html>
"""


# ==============================================================================================
# Stylesheet
# ==============================================================================================

CSS = """/* Generated by site/build.py — do not edit. */
:root{
  --ground:#0b0d14; --raised:#121623; --raised-2:#1a1f30;
  --ink:#f2efe6; --ink-dim:#a09b8e; --ink-faint:#6f6b61;
  --accent:#e0a458; --accent-soft:rgba(224,164,88,.13);
  --mafia:#d9564f; --mafia-soft:rgba(217,86,79,.13);
  --town:#5fb0c4; --town-soft:rgba(95,176,196,.13);
  --line:rgba(242,239,230,.12); --line-soft:rgba(242,239,230,.06);
  /* Fonts are self-hosted from /assets/fonts. Loading them from Google's CDN sends every
     visitor's IP address to Google, a transfer we would then have to disclose;
     self-hosting removes the question and one round trip with it. */
  --serif:"Cormorant Garamond",Georgia,"Times New Roman",serif;
  --sans:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --measure:66ch; --pad:clamp(20px,5vw,32px);
}
@media (prefers-color-scheme:light){
  :root:not([data-theme="dark"]){
    --ground:#f7f4ec; --raised:#fffdf7; --raised-2:#efeade;
    --ink:#15171f; --ink-dim:#585449; --ink-faint:#87826f;
    --accent:#8a5a11; --accent-soft:rgba(138,90,17,.10);
    --mafia:#a8322c; --mafia-soft:rgba(168,50,44,.09);
    --town:#1c6070; --town-soft:rgba(28,96,112,.09);
    --line:rgba(21,23,31,.15); --line-soft:rgba(21,23,31,.07);
  }
}
:root[data-theme="light"]{
  --ground:#f7f4ec; --raised:#fffdf7; --raised-2:#efeade;
  --ink:#15171f; --ink-dim:#585449; --ink-faint:#87826f;
  --accent:#8a5a11; --accent-soft:rgba(138,90,17,.10);
  --mafia:#a8322c; --mafia-soft:rgba(168,50,44,.09);
  --town:#1c6070; --town-soft:rgba(28,96,112,.09);
  --line:rgba(21,23,31,.15); --line-soft:rgba(21,23,31,.07);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);
  font-size:16px;line-height:1.62;-webkit-font-smoothing:antialiased}
.skip{position:absolute;left:-9999px;top:0;background:var(--accent);color:var(--ground);
  padding:10px 16px;z-index:10}
.skip:focus{left:8px;top:8px}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
a:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:2px}
img{max-width:100%;height:auto}

/* head */
.site-head{border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5;
  background:color-mix(in srgb,var(--ground) 92%,transparent);backdrop-filter:blur(8px)}
.bar{max-width:1080px;margin:0 auto;padding:14px var(--pad);display:flex;align-items:center;gap:18px}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);flex:none}
.brand:hover{text-decoration:none}
.brand span{font-family:var(--serif);font-weight:700;font-size:20px;letter-spacing:.01em}
.site-nav{display:flex;gap:20px;margin-left:auto;flex-wrap:wrap}
.site-nav a{color:var(--ink-dim);font-size:14px;font-weight:500}
.site-nav a:hover,.site-nav a[aria-current="page"]{color:var(--ink);text-decoration:none}
.site-nav a[aria-current="page"]{border-bottom:1.5px solid var(--accent)}
@media(max-width:820px){.site-nav{display:none}.bar{gap:12px}}

/* main */
main{max-width:1080px;margin:0 auto;padding:0 var(--pad)}
.crumbs{font-size:13px;color:var(--ink-faint);padding:22px 0 0}
.crumbs a{color:var(--ink-faint)}
.crumbs span[aria-hidden]{opacity:.5;margin:0 4px}
section{padding:clamp(26px,3.4vw,40px) 0}
section+section{border-top:1px solid var(--line-soft)}
h1{font-family:var(--serif);font-weight:700;font-size:clamp(34px,6vw,56px);line-height:1.04;
  letter-spacing:-.015em;margin:0 0 18px;text-wrap:balance;max-width:18ch}
h2{font-family:var(--serif);font-weight:700;font-size:clamp(25px,3.4vw,34px);line-height:1.14;
  margin:0 0 14px;text-wrap:balance}
h3{font-size:17px;font-weight:650;margin:30px 0 8px}
p{max-width:var(--measure);margin:0 0 16px}
.lede{font-size:clamp(17px,2.1vw,20px);line-height:1.55;color:var(--ink-dim);max-width:60ch;
  margin:0 0 28px}
ul,ol{max-width:var(--measure);padding-left:20px}
li{margin-bottom:8px}
li::marker{color:var(--ink-faint)}
.eyebrow{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);
  font-weight:600;margin:0 0 14px}

/* hero */
.hero{padding-top:clamp(34px,6vw,62px)}
.hero-crest{width:74px;height:74px;margin-bottom:22px}
.actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:0 0 14px}
.btn{display:inline-block;padding:13px 22px;border-radius:8px;font-weight:600;font-size:15px;
  border:1px solid transparent;background:none;font-family:inherit;cursor:pointer;
  line-height:1.2;text-align:center}
.btn:hover{text-decoration:none}
.btn-primary{background:var(--accent);color:#1a1206}
.btn-primary:hover{filter:brightness(1.08)}
.btn-ghost{border-color:var(--line);color:var(--ink)}
.btn-ghost:hover{border-color:var(--ink-dim)}
.btn-sm{padding:8px 15px;font-size:14px;flex:none}
.note{font-size:13.5px;color:var(--ink-faint);max-width:var(--measure)}

/* cards */
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(238px,100%),1fr));
  max-width:none;padding:0;list-style:none;margin:0}
/* Must follow .grid: same specificity, so the later rule wins. Five town cards in a
   four-wide grid left one alone in its own row; a wider minimum makes both role grids
   three across, reading 3 / 3+2. */
.roles-grid{grid-template-columns:repeat(auto-fit,minmax(min(290px,100%),1fr))}
.card{background:var(--raised);border:1px solid var(--line);border-radius:9px;padding:20px 22px;
  margin:0}
.card h3{margin:0 0 7px;font-size:16px}
.card p{font-size:14px;color:var(--ink-dim);margin:0;max-width:none}
a.card{color:inherit;display:block}
a.card:hover{border-color:var(--accent);text-decoration:none}
a.card h3{color:var(--accent)}

/* role + setup indexes */
.role-team{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;font-weight:600;
  padding:3px 8px;border-radius:3px;display:inline-block;margin-bottom:10px}
.team-mafia{background:var(--mafia-soft);color:var(--mafia)}
.team-town{background:var(--town-soft);color:var(--town)}

/* fact list */
.facts{display:grid;gap:0;margin:0 0 8px;max-width:var(--measure);padding:0;list-style:none}
.facts>div{display:grid;grid-template-columns:minmax(96px,150px) 1fr;gap:18px;padding:14px 0;
  border-bottom:1px solid var(--line-soft)}
.facts dt{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-faint);
  font-weight:600;padding-top:3px}
.facts dd{margin:0}
@media(max-width:560px){.facts>div{grid-template-columns:1fr;gap:4px}}

/* tables */
.scroller{overflow-x:auto;border:1px solid var(--line);border-radius:8px;margin:22px 0}
table{border-collapse:collapse;width:100%;font-size:14px;min-width:520px}
th{text-align:left;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--ink-faint);font-weight:600;padding:12px 15px;background:var(--raised);
  border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:12px 15px;border-bottom:1px solid var(--line-soft);vertical-align:top}
tr:last-child td{border-bottom:none}
td.num{font-variant-numeric:tabular-nums;font-weight:600}

/* callout */
.callout{border-left:3px solid var(--accent);background:var(--accent-soft);padding:18px 22px;
  margin:24px 0;max-width:var(--measure)}
.callout p:last-child{margin-bottom:0}

/* faq */
.faq details{border-bottom:1px solid var(--line-soft);max-width:var(--measure)}
.faq summary{cursor:pointer;padding:15px 0;font-weight:600;font-size:15.5px;list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq summary::before{content:"+";color:var(--accent);margin-right:11px;font-weight:400}
.faq details[open] summary::before{content:"–"}
.faq details p{padding:0 0 15px 24px;color:var(--ink-dim);margin:0}

/* glossary */
.gloss{max-width:var(--measure);padding:0;margin:24px 0}
.gloss>div{padding:13px 0;border-bottom:1px solid var(--line-soft)}
.gloss dt{font-weight:650;margin-bottom:3px}
.gloss dd{margin:0;color:var(--ink-dim);font-size:15px}

/* generator tool */
.tool{background:var(--raised);border:1px solid var(--line);border-radius:10px;padding:24px;
  margin:24px 0;max-width:640px}
.tool label{display:block;font-size:12px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-faint);font-weight:600;margin-bottom:8px}
.tool input,.tool select{width:100%;background:var(--ground);color:var(--ink);
  border:1px solid var(--line);border-radius:7px;padding:11px 13px;font:inherit;font-size:15px}
.tool .row{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px}
.tool .row>*{flex:1 1 180px}
#gen-out{margin-top:20px}
.deal{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));
  list-style:none;padding:0;margin:0}
.deal li{background:var(--ground);border:1px solid var(--line);border-radius:7px;
  padding:11px 14px;display:flex;justify-content:space-between;gap:10px;align-items:baseline;
  margin:0;font-size:14px}
.deal .r{font-weight:650}
.deal .r.mafia{color:var(--mafia)}
.deal .r.town{color:var(--town)}

/* mirrored legal documents — the hub's markup, restyled to this site */
.legal .legal-document{max-width:var(--measure)}
.legal .document-header{border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:26px}
.legal .document-header h2{font-size:17px;font-family:var(--sans);font-weight:650;margin-bottom:8px;color:var(--ink-dim)}
.legal .document-meta{display:flex;flex-wrap:wrap;gap:8px 20px;font-size:13px;color:var(--ink-faint)}
.legal .table-of-contents{background:var(--raised);border:1px solid var(--line);border-radius:8px;
  padding:20px 24px;margin:0 0 34px}
.legal .table-of-contents h3{margin:0 0 12px;font-size:12px;letter-spacing:.13em;
  text-transform:uppercase;color:var(--ink-faint)}
.legal .table-of-contents ol{margin:0;padding-left:20px;font-size:14.5px}
.legal .table-of-contents li{margin-bottom:6px}
.legal section{padding:0;border:0;margin:0 0 30px}
.legal section h3{font-size:19px;font-family:var(--serif);font-weight:700;margin:0 0 10px}
.legal section h4{font-size:15px;margin:20px 0 6px}
.legal p{margin-bottom:14px}
.legal ul{margin-bottom:16px}
.legal .note{margin-top:40px;padding-top:20px;border-top:1px solid var(--line)}

/* foot */
.site-foot{border-top:1px solid var(--line);margin-top:60px;padding:44px var(--pad) 30px;
  background:var(--raised)}
.foot-grid{max-width:1080px;margin:0 auto;display:grid;gap:32px;
  grid-template-columns:minmax(240px,1.4fr) repeat(auto-fit,minmax(150px,1fr))}
/* Those track minimums total 240 + 3x150 = 690px, which a grid will not shrink below — so on a
   phone the footer pushed the whole document wider than the viewport and every page scrolled
   sideways. Stack it instead. */
@media(max-width:720px){
  .foot-grid{grid-template-columns:1fr;gap:26px}
}
.foot-grid a{display:block;color:var(--ink-dim);font-size:14.5px;margin-bottom:9px}
.foot-grid a.btn{display:inline-block;color:#1a1206;margin-top:6px}
.foot-brand{font-family:var(--serif);font-size:21px;font-weight:700;margin:0 0 8px}
.foot-note{font-size:14px;color:var(--ink-dim);margin:0 0 4px;max-width:36ch}
.foot-h{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint);
  font-weight:600;margin:0 0 13px}
.copyright{max-width:1080px;margin:36px auto 0;padding-top:22px;border-top:1px solid var(--line-soft);
  font-size:13px;color:var(--ink-faint)}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}}
"""


# ==============================================================================================
# Pages
# ==============================================================================================

def build_home() -> None:
    body = f"""
<section class="hero">
  <img class="hero-crest" src="/assets/icon-192.png" alt="" width="74" height="74">
  <p class="eyebrow">Free · Browser · 5–12 players · 13+</p>
  <h1>Play Mafia online, with your voice.</h1>
  <p class="lede">Voice is part of the game, not something you arrange yourself. No Discord call to
  set up, no app to install, no narrator to talk anyone through the night. Open a link and play.</p>
  <div class="actions">
    <a class="btn btn-primary" href="{C.PLAY}">Play now</a>
    <a class="btn btn-ghost" href="/how-to-play/">Learn the rules</a>
  </div>
  <p class="note">Works on a phone or a computer. Nothing to buy, and nothing anyone can pay to
  win. You need to be 13 or over — the game asks once, and does not keep the answer.</p>
</section>

<section>
  <h2>The part everyone else leaves to you</h2>
  <p>Most online Mafia is a role dealer bolted onto a call you organise yourself. You get a room
  code and a voting screen, and you still have to run the voice, remember whose turn it is and hope
  nobody talks over the night.</p>
  <p>Here the server runs the table. It deals the roles, narrates the night, decides who is allowed
  to speak and when, resolves every action and tells each player only what they are entitled to
  know. Nobody sits out to moderate, because there is nothing left to moderate.</p>
  <ul class="grid">
    <li class="card"><h3>Voice, handled by the game</h3>
      <p>The server controls the microphones. During a night nobody can talk over it, and during a
      day the floor belongs to whoever holds it.</p></li>
    <li class="card"><h3>No moderator</h3>
      <p>Nobody has to sit out and read a script. Everyone at the table gets a role and plays.</p></li>
    <li class="card"><h3>Nothing to install</h3>
      <p>It runs in the browser. Share a four-character code and your group is in.</p></li>
  </ul>
</section>

<section>
  <h2>No group? Join a game night.</h2>
  <p>The hardest part of Mafia has always been getting eight people free at the same time. Game
  nights solve it: reserve a seat at a scheduled table, turn up, and the server matches you into a
  full game with other people who did the same. There is one every three hours, around the clock.</p>
  <p><a href="/game-nights/">How game nights work</a></p>
</section>

<section>
  <h2>Learn the game</h2>
  <ul class="grid">
    <li class="card"><a class="card" href="/how-to-play/" style="border:0;padding:0;background:none">
      <h3>How to play</h3><p>The complete rules, from the first night to the win condition.</p></a></li>
    <li class="card"><a class="card" href="/roles/" style="border:0;padding:0;background:none">
      <h3>Every role</h3><p>What each one does at night, and the thing people get wrong about it.</p></a></li>
    <li class="card"><a class="card" href="/setups/" style="border:0;padding:0;background:none">
      <h3>Setups by player count</h3><p>Exactly which roles are dealt at five players, or twelve.</p></a></li>
  </ul>
</section>

{faq_html(C.FAQ_HOME)}
"""
    game_ld = {
        "@context": "https://schema.org",
        "@type": "VideoGame",
        "name": C.NAME,
        "url": C.SITE,
        "description": "Free online Mafia with voice chat built in. Five to twelve players, in the "
                       "browser, no download.",
        "genre": ["Social deduction", "Party game"],
        "playMode": "MultiPlayer",
        "numberOfPlayers": {"@type": "QuantitativeValue", "minValue": 5, "maxValue": 12},
        "gamePlatform": ["Web browser"],
        "applicationCategory": "Game",
        "operatingSystem": "Any",
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD",
                   "availability": "https://schema.org/InStock"},
        "image": f"{C.SITE}/assets/og-image.png",
        "publisher": {"@type": "Organization", "name": "NeuEra Apps", "url": "https://neuera.app"},
        "inLanguage": "en",
    }
    # Identity for the knowledge graph. Unlike FAQPage and HowTo — whose rich results Google
    # retired in 2023 and May 2026 respectively — Organization still feeds entity understanding,
    # and it is the thing that ties the game, the studio and the legal documents together.
    org_ld = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "NeuEra Apps",
        "url": "https://neuera.app",
        "logo": f"{C.SITE}/assets/icon-512.png",
        "email": "hello@neuera.app",
        "brand": {
            "@type": "Brand",
            "name": C.NAME,
            "logo": f"{C.SITE}/assets/icon-512.png",
        },
        "subjectOf": [
            {"@type": "WebPage", "name": "Privacy Policy",
             "url": "https://legal.neuera.app/rpsmafia/privacy/"},
            {"@type": "WebPage", "name": "Terms of Use",
             "url": "https://legal.neuera.app/rpsmafia/terms/"},
        ],
    }
    write("index.html", layout(
        path="/",
        title="Play Mafia Online Free — Voice Chat, No Download | RPS Mafia",
        description="Free online Mafia with voice built in. 5 to 12 players, straight in your "
                    "browser — no app, no Discord call, no narrator. Join a game night if you "
                    "have no group.",
        body=body, ld=[game_ld, org_ld, faq_ld(C.FAQ_HOME)], priority="1.0",
    ))


def build_how_to_play() -> None:
    trail = [("/", "Home"), ("", "How to play")]
    body = f"""
<section class="hero">
  <p class="eyebrow">The rules</p>
  <h1>How to play Mafia</h1>
  <p class="lede">A complete guide to RPS Mafia — the roles, the night, the argument, the vote and
  the two ways a game can end. These are this game's own rules, and they are what the server
  actually does.</p>
</section>

<section>
  <h2>The shape of it</h2>
  <p>Mafia sets an informed minority against an uninformed majority. A few players know who each
  other are and are trying to eliminate everyone else. Everyone else knows nothing and is trying to
  work out who they are before the numbers run out.</p>
  <p>The game alternates between night, when a handful of people act in private, and day, when
  everyone argues in the open and votes one person out. That loop repeats until one side wins.</p>

  <h3>What you need</h3>
  <ul>
    <li>Between five and twelve players. Eight is the size most groups settle on.</li>
    <li>Somewhere to talk. Here that is built in; away from a computer it is a room and a narrator.</li>
    <li>Twenty to forty minutes, depending on how much the argument runs.</li>
  </ul>
  <div class="callout">
    <p><strong>There is no narrator in this game.</strong> Traditionally somebody has to sit out and
    read a script — waking the mafia, calling each role, remembering who did what. The server does
    all of it, so everybody who turns up gets to play.</p>
  </div>
</section>

<section>
  <h2>The roles</h2>
  <p>Every player is dealt exactly one role, privately, before the first day. Which roles appear
  depends on how many of you there are — see <a href="/setups/">setups by player count</a> for the
  exact table.</p>

  <h3>The mafia</h3>
  <ul>
    <li><strong><a href="/roles/godfather/">Godfather</a></strong> — chooses the night kill, reads
    as town to the Detective, and cannot be shot by the Sniper.</li>
    <li><strong><a href="/roles/mafia/">Mafia</a></strong> — an ordinary killer with no immunities,
    who inherits the kill if the Godfather dies.</li>
    <li><strong><a href="/roles/dr-lecter/">Dr. Lecter</a></strong> — the team's medic, who shields
    a teammate from the Sniper. Twelve-player games only.</li>
  </ul>

  <h3>The town</h3>
  <ul>
    <li><strong><a href="/roles/doctor/">Doctor</a></strong> — protects players from the night kill.</li>
    <li><strong><a href="/roles/detective/">Detective</a></strong> — investigates one player's
    alignment each night.</li>
    <li><strong><a href="/roles/sniper/">Sniper</a></strong> — shoots at night, and dies if he
    shoots a townsperson.</li>
    <li><strong><a href="/roles/die-hard/">Die-hard</a></strong> — survives the first attempt on his
    life, whether that is a kill or a lynch.</li>
    <li><strong><a href="/roles/citizen/">Citizen</a></strong> — no powers at all, and a vote that
    counts the same as everyone else's.</li>
  </ul>
</section>

<section>
  <h2>How a game runs</h2>

  <h3>1. Role reveal</h3>
  <p>Each player privately sees their own card. The mafia do not meet yet.</p>

  <h3>2. Day zero — introductions</h3>
  <p>Everyone speaks in turn. There is no vote, because nobody has died and there is nothing to go
  on. It exists so that everyone has said something before anyone has a reason to lie about it.</p>

  <h3>3. Night zero — the mafia meet</h3>
  <p>The mafia learn who each other are. Nobody is killed on the first night. Every other role
  sleeps through it.</p>

  <h3>4. Night — the roles act</h3>
  <p>In private, and simultaneously: the mafia kill, the Doctor protects, the Detective
  investigates, the Sniper shoots, Dr. Lecter shields. Then everything resolves at once and the
  results are announced.</p>
  <div class="callout">
    <p><strong>The mafia get exactly one kill a night, and exactly one of them is offered it.</strong>
    While the Godfather lives, that is always him. The other killers get an advisory pick their own
    team can see, which never commits anything. There is no merging of two choices and no race
    between two mafia.</p>
  </div>

  <h3>5. Recap</h3>
  <p>A short beat where the table is told what happened — who died, and privately, what the
  Detective found. Nobody's role is revealed by their death.</p>

  <h3>6. The count reveal vote</h3>
  <p>Before the day, the table may be offered a vote on whether to be told how many mafia and how
  many townspeople are still alive. A majority yes reveals it and spends one of a limited number of
  reveals.</p>
  <p>It is only offered when somebody has actually been eliminated since the last reveal, because
  only an elimination changes the hidden split. A Doctor save, an absorbed Die-hard hit or a tied
  vote changes nothing, and the offer is skipped.</p>

  <h3>7. Day — argue, then vote</h3>
  <p>Everyone alive gets a turn to speak, in an order that reshuffles each day so the same player is
  not always first. Then the table votes. A majority eliminates; a tie eliminates nobody and the day
  simply ends.</p>
  <p>A speaker may also hand one out-of-turn reply to another player, taken immediately after their
  own turn — once per player per day, and it cannot be handed on again.</p>

  <h3>8. Repeat until somebody wins</h3>
</section>

<section>
  <h2>How the game ends</h2>
  <div class="scroller"><table>
    <thead><tr><th>Side</th><th>Wins when</th></tr></thead>
    <tbody>
      <tr><td><strong>Town</strong></td><td>The last mafioso is eliminated.</td></tr>
      <tr><td><strong>Mafia</strong></td><td>The mafia equal everyone else in number. They do not
      need to be the majority — parity is enough.</td></tr>
    </tbody>
  </table></div>
  <p>Parity is why every wrong lynch costs the town twice: one townsperson gone, and one step closer
  to the number the mafia need.</p>
</section>

<section>
  <h2>If you are new, start here</h2>
  <ul>
    <li><strong>Say something on day zero.</strong> Silence early is the most common tell there is,
    and the easiest one to avoid.</li>
    <li><strong>Make observations, not accusations.</strong> "You agreed with him very fast" gives
    the table something to work with. "You are mafia" gives them nothing.</li>
    <li><strong>Do not clear anyone on one investigation.</strong> The Godfather comes back as town,
    every time.</li>
    <li><strong>As mafia, do not overplay innocence.</strong> The players who argue hardest that
    they are town are the ones the town watches.</li>
    <li><strong>Watch who is quiet when it matters,</strong> not who is quiet in general.</li>
  </ul>
  <p><a href="/roles/">Read what each role actually does →</a></p>
</section>

{faq_html(C.FAQ_RULES)}

<section>
  <h2>Play a game</h2>
  <p>You have the rules. The fastest way to learn the rest is one game with voice on.</p>
  <div class="actions">
    <a class="btn btn-primary" href="{C.PLAY}">Play now</a>
    <a class="btn btn-ghost" href="/game-nights/">Join a game night</a>
  </div>
</section>
"""
    howto_ld = {
        "@context": "https://schema.org",
        "@type": "HowTo",
        "name": "How to play Mafia",
        "description": "The complete rules of RPS Mafia, from role reveal to the win condition.",
        "totalTime": "PT30M",
        "step": [
            {"@type": "HowToStep", "name": "Role reveal",
             "text": "Each player privately sees their own role card."},
            {"@type": "HowToStep", "name": "Day zero",
             "text": "Everyone speaks in turn. There is no vote."},
            {"@type": "HowToStep", "name": "Night zero",
             "text": "The mafia learn who each other are. Nobody is killed."},
            {"@type": "HowToStep", "name": "Night",
             "text": "The mafia kill, the Doctor protects, the Detective investigates and the "
                     "Sniper shoots. Everything resolves at once."},
            {"@type": "HowToStep", "name": "Recap",
             "text": "The table is told who died. Roles are not revealed by death."},
            {"@type": "HowToStep", "name": "Count reveal vote",
             "text": "The table may vote on whether to learn how many of each side are alive."},
            {"@type": "HowToStep", "name": "Day",
             "text": "Everyone speaks, then the table votes someone out. A tie eliminates nobody."},
            {"@type": "HowToStep", "name": "Repeat",
             "text": "Continue until the mafia are gone or reach parity with the town."},
        ],
    }
    write("how-to-play/index.html", layout(
        path="/how-to-play/",
        title="How to Play Mafia — Complete Rules, Roles and Phases | RPS Mafia",
        description="The full rules of Mafia: every role, the night phase, the count reveal "
                    "vote, day voting and both win conditions — as the game actually runs them.",
        body=body, trail=trail, ld=[howto_ld, faq_ld(C.FAQ_RULES)], priority="0.9",
        nav_current="/how-to-play/",
    ))


def build_roles() -> None:
    """The roles hub, then one page per role production actually deals."""
    def cards_for(team: str) -> str:
        return "".join(
            f'<li class="card"><a class="card" href="/roles/{r["slug"]}/" '
            f'style="border:0;padding:0;background:none">'
            f'<span class="role-team team-{r["team"]}">{r["team"]}</span>'
            f'<h3>{e(r["name"])}</h3><p>{e(r["tagline"])}</p></a></li>'
            for r in C.ROLES if r["team"] == team
        )

    mafia_cards, town_cards = cards_for("mafia"), cards_for("town")
    gated = ", ".join(C.GATED_ROLES)
    hub = f"""
<section class="hero">
  <p class="eyebrow">Roles</p>
  <h1>Every role in the game</h1>
  <p class="lede">Eight roles, three of them mafia. Which ones appear depends on how many people are
  playing — a five-player game has no Detective, and only a twelve-player game has Dr. Lecter.</p>
</section>

<section>
  <h2>The mafia</h2>
  <p>Three roles, and never more than four players. They know each other from the first night.</p>
  <ul class="grid roles-grid">{mafia_cards}</ul>
</section>

<section>
  <h2>The town</h2>
  <p>Five roles, and everyone else. They start knowing nothing at all.</p>
  <ul class="grid roles-grid">{town_cards}</ul>

  <div class="callout">
    <p><strong>{e(gated)}</strong> are built and tested but are not dealt in public games yet. They
    are held back until the roles above have had enough play to be sure the balance is right. When
    they go in, they will get pages of their own here.</p>
  </div>
</section>

<section>
  <h2>How the roles fit together</h2>
  <p>The mafia land exactly one kill each night, so the town's problem is never the number of
  enemies — it is the rate. That is why the distribution counts killers rather than bodies: the
  Godfather and the plain Mafia kill, while Dr. Lecter protects, which is why he only appears once
  the mafia can afford a fourth seat.</p>
  <p>On the other side, the Doctor cancels kills, the Detective converts nights into information and
  the Sniper adds a second, riskier way to remove someone. The Die-hard is simply one extra town
  life. Read the exact composition at each size in <a href="/setups/">setups by player count</a>.</p>
</section>
"""
    write("roles/index.html", layout(
        path="/roles/",
        title="Mafia Game Roles — All 8 Explained | RPS Mafia",
        description="All 8 Mafia roles explained: Godfather, Mafia, Dr. Lecter, Doctor, "
                    "Detective, Sniper, Die-hard and Citizen — and what people get wrong.",
        body=hub, trail=[("/", "Home"), ("", "Roles")], priority="0.9",
        nav_current="/roles/",
    ))

    for i, r in enumerate(C.ROLES):
        prev_r = C.ROLES[i - 1] if i else C.ROLES[-1]
        next_r = C.ROLES[(i + 1) % len(C.ROLES)]
        extra = "".join(
            f"<h3>{e(h)}</h3><p>{e(p)}</p>" for h, p in r["body"]
        )
        appears = ", ".join(
            str(s["n"]) for s in C.SETUPS
            if r["name"] in s["mafia"] or r["name"] in s["town"]
            or (r["slug"] == "citizen" and s["citizens"])
        )
        body = f"""
<section class="hero">
  <span class="role-team team-{r['team']}">{r['team']}</span>
  <h1>{e(r['name'])}</h1>
  <p class="lede">{e(r['tagline'])}</p>
</section>

<section>
  <dl class="facts">
    <div><dt>Side</dt><dd>{'Mafia — wins when the mafia reach parity.' if r['team'] == 'mafia'
                           else 'Town — wins when every mafioso is gone.'}</dd></div>
    <div><dt>Appears at</dt><dd>{e(r['counts'])}</dd></div>
    <div><dt>At night</dt><dd>{e(r['night'])}</dd></div>
    <div><dt>During the day</dt><dd>{e(r['day'])}</dd></div>
  </dl>
</section>

<section>
  <h2>The thing people get wrong</h2>
  <p>{e(r['quirk'])}</p>
  {extra}
</section>

<section>
  <h2>Where it turns up</h2>
  <p>Games with this role: {e(appears) or 'varies'} players.
  See the exact composition at each size in <a href="/setups/">setups by player count</a>, or read
  the <a href="/how-to-play/">full rules</a>.</p>
  <p><a href="/roles/{prev_r['slug']}/">← {e(prev_r['name'])}</a> ·
     <a href="/roles/{next_r['slug']}/">{e(next_r['name'])} →</a></p>
  <div class="actions">
    <a class="btn btn-primary" href="{C.PLAY}">Play a game</a>
    <a class="btn btn-ghost" href="/roles/">All roles</a>
  </div>
</section>
"""
        write(f"roles/{r['slug']}/index.html", layout(
            path=f"/roles/{r['slug']}/",
            title=f"{r['name']} — Mafia Role Explained | RPS Mafia",
            description=f"What the {r['name']} does in Mafia. {r['tagline']} "
                        f"Night action, day play, and the rule people get wrong.",
            body=body,
            trail=[("/", "Home"), ("/roles/", "Roles"), ("", r["name"])],
            priority="0.7", nav_current="/roles/",
        ))


WORD = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven",
        8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve"}


def all_mafia(s: dict) -> str:
    """How to refer to the whole mafia team. "all two mafia" is not English; "both" is."""
    n = len(s["mafia"])
    if n == 1:
        return "the Godfather"          # at five players he is the entire team
    if n == 2:
        return "both mafia"
    return f"all {WORD[n]} mafia"


def kill_sentence(s: dict) -> str:
    """One sentence about who can take the night kill.

    Reads badly if generated mechanically: at five players "1 of the 1 mafia is a killer" is both
    redundant and ungrammatical, and the distinction between mafia and killers only exists at
    twelve, where Dr. Lecter protects instead. So say the interesting thing only when there is one.
    """
    mafia, killers = len(s["mafia"]), s["killers"]
    if mafia == 1:
        return "The mafia land one kill a night, and there is only one mafioso to take it."
    if killers == mafia:
        return (f"The mafia land one kill a night, and "
                f"{'either' if mafia == 2 else 'any'} of the {WORD[mafia]} can take it.")
    return (f"The mafia land one kill a night, and only {WORD[killers]} of the {WORD[mafia]} can "
            f"take it — Dr. Lecter protects rather than kills.")


def build_setups() -> None:
    rows = "".join(
        f'<tr><td class="num"><a href="/setups/{s["n"]}-players/">{s["n"]}</a></td>'
        f'<td>{e(", ".join(s["mafia"]))}</td>'
        f'<td>{e(", ".join(s["town"]))}</td>'
        f'<td class="num">{s["citizens"]}</td>'
        f'<td class="num">{s["killers"]}</td></tr>'
        for s in C.SETUPS
    )
    hub = f"""
<section class="hero">
  <p class="eyebrow">Setups</p>
  <h1>Mafia setups by player count</h1>
  <p class="lede">Exactly which roles are dealt at every size from five to twelve. This is not a
  suggestion — it is the distribution the server uses.</p>
</section>

<section>
  <div class="scroller"><table>
    <thead><tr><th>Players</th><th>Mafia</th><th>Town power roles</th><th>Citizens</th>
    <th>Killers</th></tr></thead>
    <tbody>{rows}</tbody>
  </table></div>
  <p class="note">"Killers" counts the mafia who can actually take the night kill. Dr. Lecter is
  mafia but protects rather than kills, which is why twelve players has four mafia and still only
  three killers.</p>
</section>

<section>
  <h2>Why the ladder looks like this</h2>
  <p>Because the mafia win at parity, what matters for balance is kill output rather than headcount.
  The ladder therefore adds killers slowly and deliberately: one at five, two at six and seven,
  three from eight upward, and a fourth mafia seat only at twelve — where it goes to a medic rather
  than another gun.</p>
  <p>Two rules follow from that and explain most of the table. The Detective only appears from six,
  because against a lone Godfather every investigation returns "town" and the role would be dead
  weight. And the Die-hard, whose armour is simply one extra town life, is used to smooth the
  middle of the ladder rather than to add another power.</p>
</section>
"""
    write("setups/index.html", layout(
        path="/setups/",
        title="Mafia Setups by Player Count — 5 to 12 Players | RPS Mafia",
        description="The exact Mafia role distribution for 5, 6, 7, 8, 9, 10, 11 and 12 players. "
                    "How many mafia, which power roles, and why the ladder is built that way.",
        body=hub, trail=[("/", "Home"), ("", "Setups")], priority="0.9",
        nav_current="/setups/",
    ))

    for i, s in enumerate(C.SETUPS):
        n = s["n"]
        town_total = n - len(s["mafia"])
        prev_s = C.SETUPS[i - 1] if i else None
        next_s = C.SETUPS[i + 1] if i + 1 < len(C.SETUPS) else None
        near = " · ".join(
            f'<a href="/setups/{x["n"]}-players/">{x["n"]} players</a>'
            for x in (prev_s, next_s) if x
        )
        mafia_li = "".join(f"<li>{e(m)}</li>" for m in s["mafia"])
        town_li = "".join(f"<li>{e(t)}</li>" for t in s["town"])
        body = f"""
<section class="hero">
  <p class="eyebrow">Setup</p>
  <h1>Mafia with {n} players</h1>
  <p class="lede">{e(s['note'])}</p>
</section>

<section>
  <h2>What gets dealt</h2>
  <div class="scroller"><table>
    <thead><tr><th>Side</th><th>Roles</th><th>Total</th></tr></thead>
    <tbody>
      <tr><td><strong>Mafia</strong></td><td>{e(", ".join(s["mafia"]))}</td>
          <td class="num">{len(s['mafia'])}</td></tr>
      <tr><td><strong>Town</strong></td>
          <td>{e(", ".join(s["town"]))}{e(f", and {s['citizens']} Citizen"
              + ("s" if s["citizens"] != 1 else ""))}</td>
          <td class="num">{town_total}</td></tr>
    </tbody>
  </table></div>
  <ul class="grid">
    <li class="card"><h3>Mafia team</h3><ul>{mafia_li}</ul></li>
    <li class="card"><h3>Town power roles</h3><ul>{town_li}</ul></li>
    <li class="card"><h3>Citizens</h3><p>{s['citizens']} with no night action at all — and the
      votes that decide most games.</p></li>
  </ul>
</section>

<section>
  <h2>How it plays</h2>
  <p>{e(s['feel'])}</p>
  <p>{kill_sentence(s)} The town wins by eliminating {all_mafia(s)}; the mafia win once the
  living town is down to {WORD[len(s['mafia'])]}.</p>
  <p>{'The Doctor protects two people a night while ten or more are alive, dropping to one below that.'
     if n >= 10 else 'The Doctor protects one player a night.'}</p>
</section>

<section>
  <h2>Nearby sizes</h2>
  <p>{near or 'This is the only size in the ladder.'}</p>
  <p>See the whole ladder in <a href="/setups/">setups by player count</a>, or read what each role
  does in <a href="/roles/">every role explained</a>.</p>
  <div class="actions">
    <a class="btn btn-primary" href="{C.PLAY}">Play with {n} players</a>
    <a class="btn btn-ghost" href="/how-to-play/">The rules</a>
  </div>
</section>
"""
        write(f"setups/{n}-players/index.html", layout(
            path=f"/setups/{n}-players/",
            title=f"Mafia with {n} Players — Roles and Setup | RPS Mafia",
            description=f"The exact roles for {'an' if n in (8, 11) else 'a'} {n}-player "
                        f"Mafia game: "
                        f"{len(s['mafia'])} mafia ({', '.join(s['mafia'])}) against "
                        f"{town_total} town, including {', '.join(s['town'])}.",
            body=body,
            trail=[("/", "Home"), ("/setups/", "Setups"), ("", f"{n} players")],
            priority="0.7", nav_current="/setups/",
        ))


def build_game_nights() -> None:
    body = f"""
<section class="hero">
  <p class="eyebrow">Game nights</p>
  <h1>Play tonight, without a group</h1>
  <p class="lede">The hardest part of Mafia has never been the rules. It is getting eight people
  free at the same time. Game nights fix that: reserve a seat, turn up, and the server builds a full
  table around you.</p>
  <div class="actions"><a class="btn btn-primary" href="{C.PLAY}">Reserve a seat</a></div>
</section>

<section>
  <h2>How it works</h2>
  <ol>
    <li><strong>Pick a slot.</strong> There is one every three hours, around the clock, so there is
    always a game within a couple of hours wherever you are.</li>
    <li><strong>Reserve your seat.</strong> That is the whole commitment. You can cancel, or move to
    a different slot, at any point before it starts.</li>
    <li><strong>Turn up shortly before.</strong> Being on the screen inside the check-in window is
    the check-in — there is nothing to press.</li>
    <li><strong>You are matched into a table.</strong> Everyone who showed up is divided into full
    games, and the table starts itself once everyone has arrived.</li>
  </ol>
  <div class="callout">
    <p><strong>The matchmaker seats the people who showed up, not the people who signed up.</strong>
    That is the whole reason it works. A slot with fifteen reservations and eight arrivals makes one
    good table, not two broken ones.</p>
  </div>
</section>

<section>
  <h2>One language per table</h2>
  <p>Every game night belongs to a single language, and tables never mix. A pool that is short of
  players is called off rather than topped up from another language, because a Mafia table where
  half the room cannot follow the argument is not a game.</p>
</section>

<section>
  <h2>If a night is called off</h2>
  <p>Not every slot fills. If one is short of players it is cancelled rather than run badly, and you
  are shown the next slots in your language that still have room, so moving takes one tap.</p>
</section>

{faq_html(C.FAQ_NIGHTS)}

<section>
  <h2>Or bring your own group</h2>
  <p>If you do have people, you do not need a game night at all — <a href="{C.PLAY}">start a
  table</a>, share the four-character code, and play immediately.</p>
</section>
"""
    write("game-nights/index.html", layout(
        path="/game-nights/",
        title="Play Mafia With Strangers — Scheduled Game Nights | RPS Mafia",
        description="No group? Reserve a seat at a scheduled Mafia game night, turn up, and get "
                    "matched into a full table. One every three hours, in your language, free.",
        body=body, trail=[("/", "Home"), ("", "Game nights")],
        ld=[faq_ld(C.FAQ_NIGHTS)], priority="0.9", nav_current="/game-nights/",
    ))


def build_glossary() -> None:
    items = "".join(
        f"<div><dt>{e(t)}</dt><dd>{e(d)}</dd></div>" for t, d in C.GLOSSARY
    )
    body = f"""
<section class="hero">
  <p class="eyebrow">Reference</p>
  <h1>Mafia glossary</h1>
  <p class="lede">The words that come up at the table, defined as this game uses them.</p>
</section>
<section><dl class="gloss">{items}</dl></section>
<section>
  <p>For the full sequence these terms describe, read <a href="/how-to-play/">how to play</a>, or
  look up a specific <a href="/roles/">role</a>.</p>
</section>
"""
    write("glossary/index.html", layout(
        path="/glossary/",
        title="Mafia Glossary — Terms and Jargon Explained | RPS Mafia",
        description="Every Mafia term defined: alignment, parity, lynch, kill authority, inquiry "
                    "immunity, count reveal, night zero and more.",
        body=body, trail=[("/", "Home"), ("", "Glossary")], priority="0.6",
    ))


def build_generator() -> None:
    setups_json = json.dumps({
        s["n"]: {"mafia": s["mafia"], "town": s["town"], "citizens": s["citizens"]}
        for s in C.SETUPS
    })
    body = f"""
<section class="hero">
  <p class="eyebrow">Free tool</p>
  <h1>Mafia role generator</h1>
  <p class="lede">Type in your players and get a balanced, secret deal. It uses the same
  distribution the game itself uses, so a five-player deal has no Detective and only twelve gets
  Dr. Lecter.</p>
</section>

<section>
  <div class="tool">
    <div class="row">
      <div>
        <label for="gen-names">Player names, one per line or comma separated</label>
        <input id="gen-names" type="text" value="Ava, Mia, Noor, Sam, Iris, Theo, Rae, Kai"
               autocomplete="off" spellcheck="false">
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" id="gen-go" type="button">Deal roles</button>
      <button class="btn btn-ghost" id="gen-again" type="button">Shuffle again</button>
    </div>
    <div id="gen-out" aria-live="polite"></div>
  </div>
  <p class="note">Everything happens in your browser. No names are sent anywhere, and nothing is
  stored.</p>
</section>

<section>
  <h2>Or skip the paper entirely</h2>
  <p>A generator still leaves somebody reading a script, remembering who acted and keeping the
  night straight. The game does all of that: it deals in secret, runs the night, resolves every
  action and tells each player only what they should know — so nobody has to sit out and narrate.</p>
  <div class="actions">
    <a class="btn btn-primary" href="{C.PLAY}">Let the game run it</a>
    <a class="btn btn-ghost" href="/setups/">See every setup</a>
  </div>
</section>

<script>
(function () {{
  var SETUPS = {setups_json};
  var names = document.getElementById('gen-names');
  var out = document.getElementById('gen-out');

  function parse(v) {{
    return v.split(/[\\n,]/).map(function (s) {{ return s.trim(); }})
            .filter(function (s) {{ return s.length; }});
  }}
  function shuffle(a) {{
    for (var i = a.length - 1; i > 0; i--) {{
      var r = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
      var j = Math.floor(r * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }}
    return a;
  }}
  function deal() {{
    var ps = parse(names.value);
    if (ps.length < 5 || ps.length > 12) {{
      out.innerHTML = '<p class="note">Mafia needs between 5 and 12 players. You have ' +
                      ps.length + '.</p>';
      return;
    }}
    var s = SETUPS[ps.length];
    var roles = s.mafia.slice().concat(s.town);
    for (var i = 0; i < s.citizens; i++) roles.push('Citizen');
    shuffle(ps);
    var mafiaSet = {{}};
    s.mafia.forEach(function (m) {{ mafiaSet[m] = 1; }});
    var html = '<ul class="deal">';
    for (var k = 0; k < ps.length; k++) {{
      var side = mafiaSet[roles[k]] ? 'mafia' : 'town';
      html += '<li><span>' + ps[k].replace(/[<>&]/g, '') + '</span>' +
              '<span class="r ' + side + '">' + roles[k] + '</span></li>';
    }}
    html += '</ul><p class="note">Show each player their own line only. ' + ps.length +
            ' players: ' + s.mafia.length + ' mafia against ' + (ps.length - s.mafia.length) +
            ' town.</p>';
    out.innerHTML = html;
  }}
  document.getElementById('gen-go').addEventListener('click', deal);
  document.getElementById('gen-again').addEventListener('click', deal);
  deal();
}})();
</script>
"""
    write("tools/role-generator/index.html", layout(
        path="/tools/role-generator/",
        title="Mafia Role Generator — Free Random Role Assigner | RPS Mafia",
        description="Free Mafia role generator. Enter your players and get a balanced secret deal "
                    "for 5 to 12 people, using the real distribution. Nothing leaves your browser.",
        body=body,
        trail=[("/", "Home"), ("", "Role generator")],
        priority="0.8", nav_current="/tools/role-generator/",
    ))


VS = [
    {
        "slug": "epicmafia",
        "name": "EpicMafia",
        "title": "An EpicMafia Alternative That Still Runs | RPS Mafia",
        "desc": "Looking for an EpicMafia alternative? A free browser Mafia with voice built in, "
                "5 to 12 players, no download and no setup to configure.",
        "lede": "EpicMafia gave a generation of players hundreds of roles and thousands of setups. "
                "If you are looking for somewhere to play now, here is an honest comparison.",
        "points": [
            ("What EpicMafia did well",
             "Depth, and a very great deal of it. Hundreds of roles, community setups, and a "
             "culture that took the game seriously. Nothing here matches that catalogue, and it "
             "would be silly to pretend otherwise."),
            ("What is different here",
             "Voice is part of the game rather than something you arrange in a separate call, and "
             "the server runs the night so nobody moderates. The role list is deliberately small — "
             "eight roles that have been balanced against each other at every player count, rather "
             "than a catalogue to configure."),
            ("Which you want",
             "If you want to build an elaborate custom setup, you want the deep catalogue. If you "
             "want to talk to seven other people and argue about who is lying, without configuring "
             "anything first, start here."),
        ],
    },
    {
        "slug": "town-of-salem",
        "name": "Town of Salem",
        "title": "A Town of Salem Alternative With Voice | RPS Mafia",
        "desc": "Looking for a Town of Salem alternative? Free browser Mafia with real voice chat, "
                "5 to 12 players, no download and no accounts to manage.",
        "lede": "Town of Salem is the biggest name in the category and where a lot of people first "
                "met the genre. This is what is different here.",
        "points": [
            ("What Town of Salem did well",
             "Scale, a huge role roster and years of accumulated community. It is a full product "
             "with a long history, and its role list is far larger than this one."),
            ("What is different here",
             "It is played by voice rather than by typing, which changes the game completely — "
             "bluffing out loud is a different skill from bluffing in a chat box. It runs in a "
             "browser with nothing to install, tables are five to twelve rather than fifteen, and "
             "there is no account to manage before you play."),
            ("Which you want",
             "If you like the text-chat format and the deep role list, stay where you are. If the "
             "part you actually enjoy is arguing with people out loud, this is built for that."),
        ],
    },
]


def build_vs() -> None:
    for v in VS:
        sections = "".join(
            f"<section><h2>{e(h)}</h2><p>{e(p)}</p></section>" for h, p in v["points"]
        )
        body = f"""
<section class="hero">
  <p class="eyebrow">Comparison</p>
  <h1>If you played {e(v['name'])}</h1>
  <p class="lede">{e(v['lede'])}</p>
</section>
{sections}
<section>
  <h2>What you get here</h2>
  <ul>
    <li>Free, in the browser, with nothing to install.</li>
    <li>Voice built into the game — no separate call to organise.</li>
    <li>Five to twelve players, with a <a href="/setups/">balanced setup</a> at every size.</li>
    <li>No moderator, because the server runs the night.</li>
    <li><a href="/game-nights/">Game nights</a> if you do not have a group.</li>
  </ul>
  <div class="actions">
    <a class="btn btn-primary" href="{C.PLAY}">Play a game</a>
    <a class="btn btn-ghost" href="/how-to-play/">Read the rules</a>
  </div>
</section>
"""
        write(f"vs/{v['slug']}/index.html", layout(
            path=f"/vs/{v['slug']}/",
            title=v["title"], description=v["desc"], body=body,
            trail=[("/", "Home"), ("", f"vs {v['name']}")], priority="0.6",
        ))


# ==================================================================================================
# Legal — mirrored from legal.neuera.app, which is the source of truth
# ==================================================================================================

LEGAL = {
    "privacy": {
        "source": "https://legal.neuera.app/rpsmafia/privacy/",
        "label": "Privacy Policy",
        "title": "Privacy Policy | RPS Mafia",
        "desc": "What RPS Mafia records and what it does not. Anonymous accounts by default, "
                "voice never recorded, and no analytics or advertising of any kind.",
    },
    "terms": {
        "source": "https://legal.neuera.app/rpsmafia/terms/",
        "label": "Terms of Use",
        "title": "Terms of Use | RPS Mafia",
        "desc": "The rules for playing RPS Mafia: who may play, how to behave in a voice game "
                "with strangers, and how reports and blocks work.",
    },
}

CACHE = Path(__file__).resolve().parent / "legal_cache"
ARTICLE_RE = re.compile(
    r'<article\s+class="legal-document current-document"[\s\S]*?</article>', re.I)


def sync_legal() -> None:
    """Re-fetch both documents from legal.neuera.app into the local cache.

    The cache is committed, so the mirrored text is reviewable in a diff and an ordinary build
    needs no network. Run this when a policy is republished; the build itself never fetches.
    """
    import urllib.request

    CACHE.mkdir(parents=True, exist_ok=True)
    for kind, meta in LEGAL.items():
        req = urllib.request.Request(meta["source"],
                                     headers={"User-Agent": "rpsociety.app build"})
        with urllib.request.urlopen(req, timeout=30) as r:
            if r.status != 200:
                raise SystemExit(f"sync_legal: {meta['source']} returned {r.status}")
            html_text = r.read().decode("utf-8")

        m = ARTICLE_RE.search(html_text)
        if not m:
            # Fail loudly. A silently empty legal page is worse than a failed build.
            raise SystemExit(f"sync_legal: no current-document article at {meta['source']}")

        body = m.group(0)
        # Defence in depth: the mirrored fragment must carry no behaviour of its own.
        body = re.sub(r"<script[\s\S]*?</script>", "", body, flags=re.I)
        body = re.sub(r'\son\w+="[^"]*"', "", body, flags=re.I)
        # Point cross-references at this site's own copies...
        body = body.replace("https://legal.neuera.app/rpsmafia/privacy/", "/privacy/")
        body = body.replace("https://legal.neuera.app/rpsmafia/terms/", "/terms/")
        body = body.replace('href="/rpsmafia/privacy/"', 'href="/privacy/"')
        body = body.replace('href="/rpsmafia/terms/"', 'href="/terms/"')
        # ...but keep the version history on the hub, which is the only place it exists.
        body = body.replace('href="./archive.html"',
                            f'href="{meta["source"]}archive.html"')
        # Relative links to other parts of the legal site would 404 here.
        body = body.replace('href="/data/"', 'href="https://legal.neuera.app/data/"')

        (CACHE / f"{kind}.html").write_text(body, encoding="utf-8")
        print(f"  synced {kind} from {meta['source']} ({len(body):,} bytes)")


def build_legal() -> None:
    for kind, meta in LEGAL.items():
        cached = CACHE / f"{kind}.html"
        if not cached.exists():
            raise SystemExit(
                f"missing {cached.relative_to(ROOT)} — run: python3 site/build.py --sync-legal")
        body = cached.read_text(encoding="utf-8")

        page = f"""
<section class="hero">
  <p class="eyebrow">Legal</p>
  <h1>{meta['label']}</h1>
</section>

<section class="legal">
{body}
  <p class="note">This document is published at
  <a href="{meta['source']}">legal.neuera.app/rpsmafia/{kind}</a>, which is its source of truth and
  where every past version stays readable. The copy above is mirrored from it.</p>
</section>
"""
        write(f"{kind}/index.html", layout(
            path=f"/{kind}/",
            title=meta["title"], description=meta["desc"], body=page,
            trail=[("/", "Home"), ("", meta["label"])],
            priority="0.3", canonical=meta["source"],
        ))
        # The canonical belongs to the hub, so this URL must not appear in our sitemap.
        PAGES[:] = [p for p in PAGES if p["path"] != f"/{kind}/"]


def build_404() -> None:
    write("404.html", layout(
        path="/404.html",
        title="Page not found | RPS Mafia",
        description="That page does not exist.",
        body=f"""
<section class="hero">
  <h1>Nothing here.</h1>
  <p class="lede">That page does not exist — but the game does.</p>
  <div class="actions">
    <a class="btn btn-primary" href="{C.PLAY}">Play Mafia</a>
    <a class="btn btn-ghost" href="/">Back to the start</a>
  </div>
  <p><a href="/how-to-play/">How to play</a> · <a href="/roles/">Roles</a> ·
     <a href="/setups/">Setups</a> · <a href="/game-nights/">Game nights</a></p>
</section>
""",
    ))
    # 404 is not a page anyone should be sent to from a sitemap.
    PAGES[:] = [p for p in PAGES if p["path"] != "/404.html"]


def last_modified(path: str) -> str:
    """The date a page's content last actually changed, from git.

    Google reads `lastmod` and ignores `changefreq` and `priority` entirely, so this is the only
    hint in the file worth getting right. Taking it from the build clock would mark all 25 pages
    as changed on every deploy, which teaches a crawler to distrust the field; taking it from git
    means a page is dated when its content moved.
    """
    rel = ("index.html" if path == "/" else path.lstrip("/")
           if path.endswith(".html") else path.strip("/") + "/index.html")
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%cs", "--", rel],
                             cwd=ROOT, capture_output=True, text=True, timeout=10).stdout.strip()
        if out:
            return out
    except Exception:
        pass
    return datetime.date.today().isoformat()


# IndexNow lets a site tell search engines a URL changed, instead of waiting to be crawled.
# Bing, Yandex, Seznam and Naver consume it; Google does not participate. It needs no account —
# only this key, published at /<key>.txt so the engine can confirm we own the domain.
INDEXNOW_KEY = "8d5d15f7373c8f08f29d4065809e4b94"


def build_indexnow_key() -> None:
    write(f"{INDEXNOW_KEY}.txt", INDEXNOW_KEY + "\n")


def submit_indexnow() -> None:
    """Tell the participating engines that every page in the sitemap is current.

    Run with --ping after a deploy. Deliberately not part of an ordinary build: this reaches out
    to a third party, and a build should not have side effects beyond writing files.
    """
    import urllib.request

    urls = [C.SITE + p["path"] for p in PAGES]
    payload = json.dumps({
        "host": C.SITE.replace("https://", ""),
        "key": INDEXNOW_KEY,
        "keyLocation": f"{C.SITE}/{INDEXNOW_KEY}.txt",
        "urlList": urls,
    }).encode()
    req = urllib.request.Request(
        "https://api.indexnow.org/indexnow", data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        print(f"  IndexNow: HTTP {r.status} for {len(urls)} URLs")


def build_sitemap_and_robots() -> None:
    seen, urls = set(), []
    for p in PAGES:
        if p["path"] in seen:
            continue
        seen.add(p["path"])
        urls.append(
            f"  <url><loc>{C.SITE}{p['path']}</loc>"
            f"<lastmod>{last_modified(p['path'])}</lastmod></url>"
        )
    write("sitemap.xml",
          '<?xml version="1.0" encoding="UTF-8"?>\n'
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          + "\n".join(urls) + "\n</urlset>\n")

    write("robots.txt",
          "User-agent: *\n"
          "Allow: /\n"
          "\n"
          f"Sitemap: {C.SITE}/sitemap.xml\n")


def check_css(css: str) -> None:
    """Fail loudly on an unterminated comment.

    The stylesheet is a single string, so one missing `*/` comments out every rule after it and
    nothing complains — the page just quietly loses its layout from that point down. This has
    happened once already.
    """
    opens, closes = css.count("/*"), css.count("*/")
    if opens != closes:
        i = css.rfind("/*")
        raise SystemExit(
            f"site.css: {opens} '/*' but {closes} '*/'. Everything after this is commented out:\n"
            f"  {css[i:i + 70]!r}")


def main() -> int:
    if "--sync-legal" in sys.argv:
        sync_legal()
    check_css(CSS)
    write("assets/site.css", CSS)
    build_home()
    build_how_to_play()
    build_roles()
    build_setups()
    build_game_nights()
    build_glossary()
    build_generator()
    build_vs()
    build_legal()
    build_indexnow_key()
    build_404()
    build_sitemap_and_robots()

    if "--ping" in sys.argv:
        submit_indexnow()

    print(f"{len(PAGES)} pages")
    if not _changed:
        print("everything already up to date")
        return 0
    verb = "would change" if CHECK else "wrote"
    print(f"{verb} {len(_changed)} file(s)")
    for f in sorted(_changed):
        print(f"  {f}")
    return 1 if CHECK else 0


if __name__ == "__main__":
    raise SystemExit(main())
