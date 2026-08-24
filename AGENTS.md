<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Deploy policy (Netlify free plan)

Gabe is on Netlify's free plan. Build credits are limited. Never deploy unless he explicitly says to deploy or publish.

When building or changing an app:

- Preview locally. Use `npm run dev` by default. Use `npx netlify dev` only if the project needs Netlify functions, redirects, or Netlify env.
- Tell Gabe the local URL and the exact command to start it. Default: `npm run dev` at http://127.0.0.1:43147
- Do not click Deploy, run `netlify deploy` / `netlify deploy --prod`, or otherwise publish.
- Do not push or open a PR in a way that will trigger a Netlify build. GitHub (`biggio34/gabes-app-hub`) is connected to Netlify — do not push there until he asks.
- After local preview looks good, ask before any deploy.

