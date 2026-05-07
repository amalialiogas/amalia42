import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { experimentsContent, studentProgramsContent } from "./content-data.mjs";
import { buildLiveLessonsContent } from "./live-lessons-service.mjs";
import { buildStationImagesContent } from "./station-images-service.mjs";
import { buildUpcomingSpaceEventsContent } from "./upcoming-space-events-service.mjs";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "127.0.0.1";
const upstreamApi = "https://api.wheretheiss.at";
const crewFeedUrl =
  "https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json";
const geocodeApiUrl = "https://nominatim.openstreetmap.org/search";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host}`);

  if (requestUrl.pathname === "/api/v1/crew") {
    await proxyCrewRequest(response);
    return;
  }

  if (requestUrl.pathname === "/api/v1/experiments") {
    sendCuratedContent(response, experimentsContent);
    return;
  }

  if (requestUrl.pathname === "/api/v1/student-programs") {
    sendCuratedContent(response, studentProgramsContent);
    return;
  }

  if (requestUrl.pathname === "/api/v1/live-lessons") {
    sendCuratedContent(response, await buildLiveLessonsContent());
    return;
  }

  if (requestUrl.pathname === "/api/v1/station-images") {
    sendCuratedContent(response, await buildStationImagesContent());
    return;
  }

  if (requestUrl.pathname === "/api/v1/upcoming-space-events") {
    sendCuratedContent(response, await buildUpcomingSpaceEventsContent());
    return;
  }

  if (requestUrl.pathname === "/api/v1/geocode") {
    await proxyGeocodeRequest(requestUrl, response);
    return;
  }

  if (requestUrl.pathname.startsWith("/api/")) {
    await proxyApiRequest(requestUrl, response);
    return;
  }

  await serveStaticFile(requestUrl.pathname, response);
});

server.listen(port, host, () => {
  console.log(`ISS Overhead is running at http://${host}:${port}`);
});

async function proxyApiRequest(requestUrl, response) {
  const upstreamUrl = `${upstreamApi}${requestUrl.pathname.replace(/^\/api/, "")}${requestUrl.search}`;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    const payload = Buffer.from(await upstreamResponse.arrayBuffer());
    response.writeHead(upstreamResponse.status, {
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
      "content-type":
        upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
    });
    response.end(payload);
  } catch (error) {
    response.writeHead(502, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(
      JSON.stringify({
        error: "Unable to reach the upstream ISS API.",
        details: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

function sendCuratedContent(response, content) {
  const refreshSeconds = Math.round((content.refreshIntervalMs || 0) / 1000);

  response.writeHead(200, {
    "access-control-allow-origin": "*",
    "cache-control": `max-age=${refreshSeconds || 3600}, stale-while-revalidate=86400`,
    "content-type": "application/json; charset=utf-8",
  });
  response.end(
    JSON.stringify({
      ...content,
      servedAt: new Date().toISOString(),
    })
  );
}

async function proxyCrewRequest(response) {
  try {
    const upstreamResponse = await fetch(crewFeedUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    const payload = Buffer.from(await upstreamResponse.arrayBuffer());
    response.writeHead(upstreamResponse.status, {
      "access-control-allow-origin": "*",
      "cache-control": "max-age=900, stale-while-revalidate=3600",
      "content-type":
        upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
    });
    response.end(payload);
  } catch (error) {
    response.writeHead(502, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(
      JSON.stringify({
        error: "Unable to reach the upstream ISS crew feed.",
        details: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

async function proxyGeocodeRequest(requestUrl, response) {
  const address = requestUrl.searchParams.get("q");
  if (!address) {
    response.writeHead(400, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({ error: "Missing address query." }));
    return;
  }

  const query = new URLSearchParams({
    addressdetails: "1",
    format: "jsonv2",
    limit: "1",
    q: address,
  });

  try {
    const upstreamResponse = await fetch(`${geocodeApiUrl}?${query.toString()}`, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": "ISS Overhead local app",
      },
    });

    const payload = Buffer.from(await upstreamResponse.arrayBuffer());
    response.writeHead(upstreamResponse.status, {
      "access-control-allow-origin": "*",
      "cache-control": "max-age=86400",
      "content-type":
        upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
    });
    response.end(payload);
  } catch (error) {
    response.writeHead(502, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(
      JSON.stringify({
        error: "Unable to reach the upstream address lookup service.",
        details: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

async function serveStaticFile(pathname, response) {
  const requestedPath = pathname === "/" ? "/mission.html" : pathname;
  const resolvedPath = path.normalize(path.join(rootDirectory, requestedPath));

  if (!resolvedPath.startsWith(rootDirectory)) {
    response.writeHead(403, {
      "content-type": "text/plain; charset=utf-8",
    });
    response.end("Forbidden");
    return;
  }

  try {
    const fileStats = await stat(resolvedPath);
    if (fileStats.isDirectory()) {
      throw new Error("Directory listings are not served.");
    }

    const contents = await readFile(resolvedPath);
    const extension = path.extname(resolvedPath);

    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": mimeTypes[extension] || "application/octet-stream",
    });
    response.end(contents);
  } catch {
    response.writeHead(404, {
      "content-type": "text/plain; charset=utf-8",
    });
    response.end("Not found");
  }
}
