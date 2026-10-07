# vendor/ — third-party datasets served from civ.fm

These used to load from `raw.githubusercontent.com` and `cdn.jsdelivr.net`.
Some ISPs and countries block those hosts, which broke the passport page and
every country choropleth for visitors there, so the files are hosted here.

| File | Source | Licence |
|---|---|---|
| `countries.geo.json` | [johan/world.geo.json](https://github.com/johan/world.geo.json) `countries.geo.json` | see upstream repo |
| `passport-index-tidy-iso3.csv` | [ilyankou/passport-index-dataset](https://github.com/ilyankou/passport-index-dataset) | MIT |
| `world-countries.json` | [mledoze/countries](https://github.com/mledoze/countries) (npm `world-countries@5.1.0`), slimmed to the fields the site reads | ODbL-1.0 |

Refresh with `./update.sh` (uses the GitHub API and npm, so it works even
where the raw host is blocked). The visa matrix changes a few times a year.
