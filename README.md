# Dolphin Systems website

Static website for `dolphinsystems.net`, hosted from this repository with GitHub Pages.

## Build

Run `node scripts/build-site.mjs` after changing page copy in the build script or adding blog posts in `content/posts/`. Commit the generated HTML alongside source changes. The build uses only Node.js built-in modules.

Pages: Home, Services, Products, Research, About, Blog, and Contact. Shared styling and menu behavior are in `assets/`.

The visible brand is text-only. The browser favicon is in `assets/brand-mark.svg`. Brand colors are set in `assets/site.css`.

The blog publishing format is documented in [content/posts/README.md](content/posts/README.md). The build creates `blog/index.html` and one static `blog/<slug>.html` page for each post. If you remove a post, remove its generated HTML page in the same change.

The public contact email comes from the previous site. Change `email` near the top of `scripts/build-site.mjs` if the preferred address changes.

## Caretaker automation

The Cloudflare Worker in `caretaker/` can check the live site daily and generate blog posts using a secure API key stored in Cloudflare secrets. It commits new post JSON files into `content/posts/`; the GitHub Action in `.github/workflows/build-site.yml` rebuilds the static blog pages after those commits.

Required Cloudflare secrets:

- `DEEPSEEK_API_KEY`
- `GITHUB_TOKEN`
- `ADMIN_TOKEN`

See [caretaker/README.md](caretaker/README.md) for setup and deploy commands.
