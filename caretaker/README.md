# Dolphin Systems caretaker

Cloudflare Worker for daily website care:

- checks `https://dolphinsystems.net/`
- generates one automation/systems blog post with the OpenAI API
- commits the post JSON to `content/posts/`
- lets GitHub Actions rebuild the static blog pages

## Secrets

Set these in Cloudflare. Do not commit them.

```bash
npx wrangler secret put OPENAI_API_KEY --config caretaker/wrangler.jsonc
npx wrangler secret put GITHUB_TOKEN --config caretaker/wrangler.jsonc
npx wrangler secret put ADMIN_TOKEN --config caretaker/wrangler.jsonc
```

`GITHUB_TOKEN` should be a fine-grained GitHub token for `Dolphin-Systems/Dolphin-Systems` with repository Contents read/write. If you want failed health checks to open issues, also grant Issues read/write.

## Deploy

```bash
npx wrangler deploy --config caretaker/wrangler.jsonc
```

The cron is daily at `13:00 UTC`. Manual generation is available with:

```bash
curl -X POST "https://dolphin-systems-caretaker.<your-subdomain>.workers.dev/generate" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```
