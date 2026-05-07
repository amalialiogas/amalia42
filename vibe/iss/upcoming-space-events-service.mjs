import { upcomingSpaceEventsContent } from "./content-data.mjs";

const NASA_LAUNCH_SCHEDULE_URL = "https://www.nasa.gov/event-type/launch-schedule/";
const MAX_DYNAMIC_EVENTS = 24;
const RECENT_PAST_BUFFER_MS = 24 * 60 * 60 * 1000;

export async function buildUpcomingSpaceEventsContent() {
  try {
    const liveItems = await fetchNasaLaunchScheduleEvents();
    const items = mergeSpaceEvents([...liveItems, ...upcomingSpaceEventsContent.items]);

    return {
      ...upcomingSpaceEventsContent,
      checkedAt: formatIsoDate(new Date()),
      sourceStatus:
        liveItems.length > 0
          ? "NASA launch schedule loaded from source and merged with mission descriptions."
          : "NASA launch schedule returned no displayable events; showing the bundled source-linked snapshot.",
      items,
    };
  } catch (error) {
    return {
      ...upcomingSpaceEventsContent,
      sourceStatus:
        "NASA launch schedule could not be reached; showing the bundled source-linked snapshot.",
      sourceError: error instanceof Error ? error.message : String(error),
      items: upcomingSpaceEventsContent.items,
    };
  }
}

async function fetchNasaLaunchScheduleEvents() {
  const response = await fetch(NASA_LAUNCH_SCHEDULE_URL, {
    headers: {
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`NASA launch schedule failed with ${response.status}.`);
  }

  const html = await response.text();
  return extractLaunchScheduleEvents(html)
    .filter(isUpcomingOrScheduleUnderReview)
    .slice(0, MAX_DYNAMIC_EVENTS)
    .map(enrichLaunchScheduleEvent);
}

function extractLaunchScheduleEvents(html) {
  const blocks =
    String(html || "").match(/<li[^>]*>\s*<a href="https:\/\/www\.nasa\.gov\/event\/[\s\S]*?<\/li>/g) ||
    [];

  return blocks
    .map(function (block) {
      const href = decodeEntities(findMatch(block, /<a href="([^"]+)" class="hds-event-item"/));
      const eventId = findMatch(block, /event-id=([0-9]+)/);
      const timestamp = Number(findMatch(block, /data-event-timestamp-start="(\d+)"/));
      const startDate = findMatch(block, /data-event-start-date="([^"]+)"/);
      const dateText = stripHtml(findMatch(block, /<span class="hds-event-date"[^>]*>([\s\S]*?)<\/span>/));
      const title = stripHtml(findMatch(block, /<h3 class="hds-event-title[^>]*>([\s\S]*?)<\/h3>/));

      if (!href || !title || !dateText) {
        return null;
      }

      const sortDate = Number.isFinite(timestamp) ? new Date(timestamp * 1000) : null;

      return {
        id: eventId ? `nasa-event-${eventId}` : slugify(title),
        title,
        href,
        dateText: normalizeDateText(dateText),
        startDate: startDate || (sortDate ? sortDate.toISOString() : ""),
        monthKey: getMonthKey(dateText, sortDate),
        sortTime: sortDate ? sortDate.getTime() : Number.MAX_SAFE_INTEGER,
        source: "NASA Launch Schedule",
      };
    })
    .filter(Boolean);
}

function enrichLaunchScheduleEvent(event) {
  const curated = findCuratedEvent(event);

  return {
    provider: curated?.provider || inferProvider(event.title),
    type: curated?.type || inferType(event.title),
    category: curated?.category || inferCategory(event.title),
    status: curated?.status || "NASA launch schedule",
    description: curated?.description || describeEvent(event.title),
    whyItMatters: curated?.whyItMatters || describeWhyItMatters(event.title),
    links: curated?.links || [{ label: "Open NASA event", href: event.href }],
    ...curated,
    ...event,
    source: "NASA Launch Schedule",
  };
}

function findCuratedEvent(event) {
  const normalizedHref = normalizeUrl(event.href);
  const normalizedTitle = normalizeTitle(event.title);

  return upcomingSpaceEventsContent.items.find(function (item) {
    return normalizeUrl(item.href) === normalizedHref || normalizeTitle(item.title) === normalizedTitle;
  });
}

function mergeSpaceEvents(items) {
  const seen = new Set();
  const merged = [];

  items.forEach(function (item) {
    if (!item || !item.title) {
      return;
    }

    const key = normalizeUrl(item.href) || normalizeTitle(item.title);
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    merged.push({
      ...item,
      sortTime: getSortTime(item),
      monthKey: item.monthKey || getMonthKey(item.dateText, new Date(getSortTime(item))),
    });
  });

  return merged.sort(compareEvents);
}

function isUpcomingOrScheduleUnderReview(event) {
  if (!event) {
    return false;
  }

  if (/under review/i.test(event.dateText)) {
    return true;
  }

  return !Number.isFinite(event.sortTime) || event.sortTime >= Date.now() - RECENT_PAST_BUFFER_MS;
}

function compareEvents(left, right) {
  const timeDelta = getSortTime(left) - getSortTime(right);
  if (timeDelta !== 0) {
    return timeDelta;
  }

  return String(left.title || "").localeCompare(String(right.title || ""));
}

function getSortTime(item) {
  if (Number.isFinite(item.sortTime)) {
    return item.sortTime;
  }

  const parsedTime = Date.parse(item.startDate || "");
  return Number.isFinite(parsedTime) ? parsedTime : Number.MAX_SAFE_INTEGER;
}

function getMonthKey(dateText, sortDate) {
  const cleanDateText = normalizeDateText(dateText);
  if (/^\d{4}$/.test(cleanDateText)) {
    return cleanDateText;
  }

  if (/under review/i.test(cleanDateText)) {
    return "Schedule under review";
  }

  if (sortDate instanceof Date && Number.isFinite(sortDate.getTime())) {
    return sortDate.toISOString().slice(0, 7);
  }

  return "Upcoming";
}

function inferProvider(title) {
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes("spacex")) {
    return "NASA / SpaceX";
  }

  if (lowerTitle.includes("jaxa")) {
    return "JAXA / NASA";
  }

  if (lowerTitle.includes("roscosmos")) {
    return "Roscosmos / ISS partners";
  }

  if (lowerTitle.includes("northrop")) {
    return "NASA / Northrop Grumman";
  }

  if (lowerTitle.includes("blue origin")) {
    return "NASA / Blue Origin";
  }

  if (lowerTitle.includes("firefly")) {
    return "NASA / Firefly Aerospace";
  }

  if (lowerTitle.includes("intuitive machines")) {
    return "NASA / Intuitive Machines";
  }

  if (lowerTitle.includes("astrobotic")) {
    return "NASA / Astrobotic";
  }

  return "NASA";
}

function inferType(title) {
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes("crs") || lowerTitle.includes("progress") || lowerTitle.includes("htv")) {
    return "ISS cargo launch";
  }

  if (lowerTitle.includes("crew") || lowerTitle.includes("soyuz")) {
    return "Crew launch";
  }

  if (lowerTitle.includes("clps") || lowerTitle.includes("moon")) {
    return "Lunar lander";
  }

  if (lowerTitle.includes("roman")) {
    return "Space telescope launch";
  }

  if (lowerTitle.includes("sunrise")) {
    return "Heliophysics launch";
  }

  if (lowerTitle.includes("swift")) {
    return "Spacecraft servicing";
  }

  if (lowerTitle.includes("artemis")) {
    return "Artemis crewed mission";
  }

  return "Space mission";
}

function inferCategory(title) {
  const lowerTitle = title.toLowerCase();
  if (
    lowerTitle.includes("crs") ||
    lowerTitle.includes("crew") ||
    lowerTitle.includes("soyuz") ||
    lowerTitle.includes("progress") ||
    lowerTitle.includes("htv") ||
    lowerTitle.includes("starliner")
  ) {
    return "International Space Station";
  }

  if (lowerTitle.includes("clps") || lowerTitle.includes("moon") || lowerTitle.includes("artemis")) {
    return "Moon";
  }

  if (lowerTitle.includes("roman")) {
    return "Astrophysics";
  }

  if (lowerTitle.includes("sunrise") || lowerTitle.includes("swift")) {
    return "Sun";
  }

  return "Space exploration";
}

function describeEvent(title) {
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes("crs") || lowerTitle.includes("progress") || lowerTitle.includes("htv")) {
    return "A cargo mission listed on NASA's launch schedule to support International Space Station operations.";
  }

  if (lowerTitle.includes("crew") || lowerTitle.includes("soyuz")) {
    return "A crew transportation mission listed on NASA's launch schedule for International Space Station operations.";
  }

  if (lowerTitle.includes("clps")) {
    return "A Commercial Lunar Payload Services mission listed by NASA to deliver science or technology to the Moon.";
  }

  if (lowerTitle.includes("roman")) {
    return "NASA's next wide-field infrared space telescope, built to study dark energy, exoplanets, and cosmic structure.";
  }

  if (lowerTitle.includes("sunrise")) {
    return "A NASA heliophysics mission that will use a formation of small satellites to study solar radio bursts.";
  }

  if (lowerTitle.includes("swift")) {
    return "A spacecraft servicing mission intended to boost NASA's Swift Observatory into a higher orbit.";
  }

  if (lowerTitle.includes("artemis")) {
    return "A NASA Artemis mission milestone connected to the agency's Moon to Mars exploration architecture.";
  }

  return "An upcoming space mission listed on NASA's launch schedule.";
}

function describeWhyItMatters(title) {
  const category = inferCategory(title);
  if (category === "International Space Station") {
    return "Station flights keep crews, research, and hardware moving between Earth and low Earth orbit.";
  }

  if (category === "Moon") {
    return "Lunar missions build science knowledge and technology needed for sustained exploration beyond Earth.";
  }

  if (category === "Astrophysics") {
    return "Space telescopes give scientists a clearer view of planets, stars, galaxies, and the early universe.";
  }

  if (category === "Sun") {
    return "Solar missions help researchers understand space weather that can affect spacecraft and Earth technology.";
  }

  return "The event is part of the next wave of exploration, science, and spaceflight operations.";
}

function findMatch(value, pattern) {
  const match = String(value || "").match(pattern);
  return match ? match[1] : "";
}

function stripHtml(value) {
  return decodeEntities(String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function normalizeDateText(value) {
  return stripHtml(value).replace(/^Targeted Date\s+/i, "");
}

function normalizeTitle(value) {
  return stripHtml(value)
    .toLowerCase()
    .replace(/[^\w]+/g, " ")
    .trim();
}

function normalizeUrl(value) {
  return String(value || "").replace(/\/$/, "").toLowerCase();
}

function slugify(value) {
  return normalizeTitle(value).replace(/\s+/g, "-") || "space-event";
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&#8217;|&#039;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"');
}
