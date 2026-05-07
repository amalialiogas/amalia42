# ISS Overhead

A small web app for tracking the International Space Station in real time.

The app also includes student-facing pages for current crew, ISS experiments,
Canadian student programs, live lessons, ISS imagery, upcoming space events,
and space-career pathways for young Canadians.

## Run it locally

1. From this folder, start the local server:

   ```bash
   node server.mjs
   ```

2. Open [http://localhost:8000](http://localhost:8000)

The app is dependency-free. It loads Leaflet from a CDN and pulls live ISS telemetry from the public Where The ISS At API, with a local `/api` proxy available when you run the included server.
The Mission Control homepage is `mission.html`; the local server and Cloudflare Pages redirect file both send `/` there.

## Deploy on Cloudflare Pages

This project can be deployed directly from GitHub to Cloudflare Pages.

Recommended setup:

1. In Cloudflare, create a new `Pages` project from your GitHub repository.
2. Use your production branch, usually `main`.
3. Set the build command to `exit 0`.
4. Set the build output directory to the repository root: `.`

Notes:

- The static app lives at the project root.
- The `functions/` directory adds a Cloudflare Pages Function that proxies `/api/v1/*` to the public ISS API.
- `_routes.json` ensures only `/api/*` requests invoke the Pages Function while the rest of the site stays static.
