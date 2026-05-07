import { stationImagesContent } from "./content-data.mjs";

const EOL_BASE_URL = "https://eol.jsc.nasa.gov";
const LATEST_ISS_IMAGERY_URL = `${EOL_BASE_URL}/temp/Latest_ISS_Imagery.json`;
const MAX_IMAGE_COUNT = 24;

export async function buildStationImagesContent() {
  try {
    const liveItems = await fetchLatestIssImagery();

    return {
      ...stationImagesContent,
      checkedAt: formatIsoDate(new Date()),
      sourceStatus:
        liveItems.length > 0
          ? "Latest ISS astronaut photography loaded from NASA's Gateway feed."
          : "NASA's Gateway feed did not return displayable ISS images.",
      items: liveItems.length > 0 ? liveItems : stationImagesContent.items,
    };
  } catch (error) {
    return {
      ...stationImagesContent,
      sourceStatus:
        "NASA's Gateway feed could not be reached; showing the bundled source-linked snapshot.",
      sourceError: error instanceof Error ? error.message : String(error),
      items: stationImagesContent.items,
    };
  }
}

async function fetchLatestIssImagery() {
  const response = await fetch(LATEST_ISS_IMAGERY_URL, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`NASA Gateway latest ISS imagery feed failed with ${response.status}.`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload.items) ? payload.items : [];

  return selectGalleryItems(items.map(normalizeGatewayImage).filter(Boolean));
}

function normalizeGatewayImage(item) {
  if (!item || !item.guid || !item.content) {
    return null;
  }

  const parsedTitle = parseGatewayTitle(item.title || item.guid);
  const link = decodeEntities(item.link || "");

  return {
    id: item.guid,
    title: item.guid,
    dateText: parsedTitle.dateText || "Date not listed",
    locationText: parsedTitle.locationText || "Nadir point not listed",
    latitude: parsedTitle.latitude,
    longitude: parsedTitle.longitude,
    imageUrl: absoluteDatabaseUrl(item.content),
    thumbnailUrl: item.thumbnail ? absoluteDatabaseUrl(`thumb/${item.thumbnail}`) : "",
    href: `${EOL_BASE_URL}/SearchPhotos/photo.pl?${link}`,
    source: "NASA Gateway to Astronaut Photography of Earth",
  };
}

function selectGalleryItems(items) {
  const selected = [];
  const seenLocations = new Set();
  const seenIds = new Set();

  items.forEach(function (item) {
    if (selected.length >= MAX_IMAGE_COUNT) {
      return;
    }

    const locationKey =
      Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
        ? `${item.dateText}|${Math.round(item.latitude)}|${Math.round(item.longitude)}`
        : item.id;

    if (seenLocations.has(locationKey) || seenIds.has(item.id)) {
      return;
    }

    seenLocations.add(locationKey);
    seenIds.add(item.id);
    selected.push(item);
  });

  if (selected.length >= 12) {
    return selected;
  }

  items.forEach(function (item) {
    if (selected.length >= MAX_IMAGE_COUNT || seenIds.has(item.id)) {
      return;
    }

    seenIds.add(item.id);
    selected.push(item);
  });

  return selected;
}

function parseGatewayTitle(title) {
  const dateMatch = String(title).match(/Date:\s*(\d{4}-\d{2}-\d{2})/);
  const locationMatch = String(title).match(/Nadir Lat,Lon:\s*(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const latitude = locationMatch ? Number(locationMatch[1]) : null;
  const longitude = locationMatch ? Number(locationMatch[2]) : null;

  return {
    dateText: dateMatch ? formatDisplayDate(dateMatch[1]) : "",
    locationText: locationMatch
      ? `Nadir latitude ${formatCoordinate(latitude)}, longitude ${formatCoordinate(longitude)}`
      : "",
    latitude,
    longitude,
  };
}

function absoluteDatabaseUrl(pathname) {
  return `${EOL_BASE_URL}/DatabaseImages/${pathname}`;
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(1) : "";
}

function decodeEntities(value) {
  return String(value || "").replace(/&amp;/g, "&");
}
