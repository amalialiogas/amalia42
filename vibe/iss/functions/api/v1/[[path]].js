import { experimentsContent, studentProgramsContent } from "../../../content-data.mjs";
import { buildLiveLessonsContent } from "../../../live-lessons-service.mjs";
import { buildStationImagesContent } from "../../../station-images-service.mjs";
import { buildUpcomingSpaceEventsContent } from "../../../upcoming-space-events-service.mjs";

const UPSTREAM_API_BASE = "https://api.wheretheiss.at/v1";
const CREW_FEED_URL =
  "https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json";
const GEOCODE_API_URL = "https://nominatim.openstreetmap.org/search";

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);

  if (requestUrl.pathname === "/api/v1/crew") {
    return proxyCrewFeed();
  }

  if (requestUrl.pathname === "/api/v1/experiments") {
    return curatedContentResponse(experimentsContent);
  }

  if (requestUrl.pathname === "/api/v1/student-programs") {
    return curatedContentResponse(studentProgramsContent);
  }

  if (requestUrl.pathname === "/api/v1/live-lessons") {
    return curatedContentResponse(await buildLiveLessonsContent());
  }

  if (requestUrl.pathname === "/api/v1/station-images") {
    return curatedContentResponse(await buildStationImagesContent());
  }

  if (requestUrl.pathname === "/api/v1/upcoming-space-events") {
    return curatedContentResponse(await buildUpcomingSpaceEventsContent());
  }

  if (requestUrl.pathname === "/api/v1/geocode") {
    return proxyGeocode(requestUrl);
  }

  const upstreamPath = requestUrl.pathname.replace(/^\/api\/v1/, "");
  const upstreamUrl = `${UPSTREAM_API_BASE}${upstreamPath}${requestUrl.search}`;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
        "content-type":
          upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: "Unable to reach the upstream ISS API.",
        details: error instanceof Error ? error.message : String(error),
      },
      {
        status: 502,
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  }
}

function curatedContentResponse(content) {
  const refreshSeconds = Math.round((content.refreshIntervalMs || 0) / 1000);

  return Response.json(
    {
      ...content,
      servedAt: new Date().toISOString(),
    },
    {
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": `max-age=${refreshSeconds || 3600}, stale-while-revalidate=86400`,
      },
    }
  );
}

async function proxyGeocode(requestUrl) {
  const address = requestUrl.searchParams.get("q");
  if (!address) {
    return Response.json(
      { error: "Missing address query." },
      {
        status: 400,
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  }

  const query = new URLSearchParams({
    addressdetails: "1",
    format: "jsonv2",
    limit: "1",
    q: address,
  });

  try {
    const upstreamResponse = await fetch(`${GEOCODE_API_URL}?${query.toString()}`, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": "ISS Overhead web app",
      },
    });

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "max-age=86400",
        "content-type":
          upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: "Unable to reach the upstream address lookup service.",
        details: error instanceof Error ? error.message : String(error),
      },
      {
        status: 502,
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  }
}

async function proxyCrewFeed() {
  try {
    const upstreamResponse = await fetch(CREW_FEED_URL, {
      headers: {
        Accept: "application/json",
      },
    });

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "max-age=900, stale-while-revalidate=3600",
        "content-type":
          upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: "Unable to reach the upstream ISS crew feed.",
        details: error instanceof Error ? error.message : String(error),
      },
      {
        status: 502,
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  }
}
