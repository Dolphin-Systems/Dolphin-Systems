# Blog post format

Add one JSON file per post, named after its slug, then run `node scripts/build-site.mjs` from the repository root. Commit the JSON and generated HTML together. The blog index and article pages are static, so GitHub Pages can serve them without a runtime service.

Example `content/posts/a-clearer-handoff.json`:

```json
{
  "slug": "a-clearer-handoff",
  "title": "A clearer handoff",
  "description": "How to make ownership visible in a shared workflow.",
  "date": "2026-09-22",
  "category": "Systems",
  "body": [
    { "type": "paragraph", "text": "Start with the point where work changes hands." },
    { "type": "heading", "text": "Make the next step visible" },
    { "type": "list", "items": ["Name the owner.", "Record the decision."] }
  ]
}
```

The build escapes post text before placing it in HTML. Supported block types are `paragraph`, `heading`, and `list`. Use valid calendar dates and lowercase hyphenated slugs. Your future automation can create these JSON files and run the same build command. No sample article is published until you add one.
