# readme-swarm

A swarm of named cursors builds your GitHub profile README every time someone opens it. They drag selection boxes, rough the layout in, type your text and drop your projects into place. Then an editing timeline cuts together your latest real commits.

It is **pure animated SVG**. No JavaScript, no browser extension, nothing for the visitor to install. A GitHub README can't run scripts, so every frame is CSS animation inside the images. When the build finishes, every project row is a normal clickable link.

**Live example:** [github.com/arijit-debug](https://github.com/arijit-debug)

## What it does

- **Builds everything at once.** Every block gets its own named cursor, and the whole swarm works at the same time: mark, rough, done.
- **Pixel reveal.** Images and ASCII art resolve through a dissolving pixel grid under a scan line.
- **Uses your real data.** The timeline strip shows your latest public commits as clips on V1/V2 tracks, with an audio waveform and a looping playhead. A GitHub Action rebuilds it every day.
- **Stays clickable.** Projects are separate images wrapped in links, so after the animation the README works like any other.
- **Respects reduced motion.** With `prefers-reduced-motion`, visitors see the finished page straight away.
- **Free.** GitHub Actions minutes are free for public repositories, and there are no dependencies.

## Set it up

1. In your profile repository (`<you>/<you>`), add a `swarm.config.json`. Start from [`examples/swarm.config.json`](examples/swarm.config.json).
2. Put these two markers in your `README.md` where the animation should go:

   ```html
   <!-- SWARM:START -->
   <!-- SWARM:END -->
   ```

3. Add `.github/workflows/swarm.yml`:

   ```yaml
   name: Rebuild README swarm
   on:
     schedule: [{ cron: '17 1 * * *' }]
     workflow_dispatch:
     push: { branches: [main], paths: [swarm.config.json] }
   permissions: { contents: write }
   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 22 }
         - uses: arijit-debug/readme-swarm@v1
         - run: |
             git diff --quiet -- README.md assets/swarm && exit 0
             git config user.name "readme-swarm[bot]"
             git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
             git add README.md assets/swarm && git commit -m "Rebuild README swarm" && git push
   ```

4. Run the workflow once from the **Actions** tab.

## Config

| key | what it is |
| --- | --- |
| `cursors` | Names and colours for the swarm, in the order they are handed jobs |
| `portrait` | Optional ASCII art file (`ascii`), window title and a typed `whoami` line; `"divider": false` drops the glowing line beside the window. It floats left at `layout.portraitWidth` (default `54%`) |
| `profile` | Avatar card: `avatar` (an 8-bit RGB/RGBA PNG), `name`, `handle`, `role`. The avatar resolves from coarse pixel blocks to full detail under a scan line |
| `about` | A card with a typed title and bullet lines |
| `projects` | A heading plus one clickable row per project (`icon`: `music`, `film`, `pen`, `code` or `spark`; `name`, `desc`, `href`, or `tag` for private work) |
| `toolkit` | Chips that drop in one by one, as a full-width strip (`"wide": false` keeps it in the column) |
| `layout.table` | `true` puts the portrait and the column in a two-cell table, the only layout that stays side by side in the GitHub mobile app (GitHub draws a thin border around the cells) |
| `layout.style` | `"markdown"` renders the column like plain GitHub markdown (headings, bullets, `code` chips) in light and dark variants that follow the visitor's theme; leave it out for dark cards |
| `layout.inertHref` | Where images without a link point (default `#swarm`, which does nothing). Without it GitHub links every image to its raw file |
| `layout.stagger` | Seconds between the start of one block and the next (default `0.12`). Every block builds at the same time |
| `timeline` | The editor strip: `max` commits, taken evenly from every repo pushed in the last `days` (default 45; `perRepo` overrides the share), `repos` to include, `exclude` to skip, `fallback` for offline builds |
| `layout.columnWidth` | Width of the right column images (default `44%`) |

## Preview locally

```bash
node src/cli.mjs --config swarm.config.json          # render SVGs and rewrite the README
node src/preview.mjs --config swarm.config.json      # write preview.html
node src/record.mjs --page preview.html --out build.mp4 --seconds 15
```

`record.mjs` pauses every animation and steps through it frame by frame in headless Chrome, so the video is smooth on any machine. It needs Chrome and ffmpeg.

## Honest notes

- The cursors are scripted animation. No AI model runs when someone views your profile. The names are just labels.
- Text inside the images can't be selected, so every image carries the full text as `alt`.
- GitHub caches images for a few minutes. The generator adds a content hash (`?v=`) to every image, so changes show up as soon as the cache refreshes.

## Credits

The "page that builds itself" idea comes from [**Swarm** by Joel Califa](https://califa.github.io/swarm-site/). The block states (mark, rough, done) follow Avi Vashishta's write-up, [Agents at Work: a page that builds itself](https://www.avivashishta.com/blog/agents-at-work-a-page-that-builds-itself). If you want the effect on *any* website in your own browser, try the [Swarm Rebuild](https://chromewebstore.google.com/detail/swarm-rebuild/diaeaocnhdhbknkbfbnkjikfcgokainm) extension by Dhvanil Patel. readme-swarm shares no code with these projects. It was written from scratch for the one place they can't run: a GitHub README.

## License

MIT
