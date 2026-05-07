import { liveLessonsContent } from "./content-data.mjs";

const EBTSOYP_EVENTS_URL = "https://exploringbytheseat.com/wp-json/tribe/events/v1/events";
const CSA_EVENTS_URL = "https://www.asc-csa.gc.ca/eng/events/";
const CSA_BASE_URL = "https://www.asc-csa.gc.ca";
const SPACE_EXPLORATION_CATEGORY_ID = "15";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const SPACE_EVENT_KEYWORDS = [
  "artemis",
  "astronaut",
  "canadarm",
  "crew-13",
  "earth observation",
  "esa",
  "international space station",
  "iss",
  "james webb",
  "lunar",
  "mars",
  "moon",
  "nasa",
  "osiris",
  "rocket",
  "rover",
  "satellite",
  "space",
];
const ONLINE_EVENT_KEYWORDS = [
  "facebook",
  "live",
  "microsoft teams",
  "online",
  "virtual",
  "webcast",
  "webinar",
  "youtube",
];

export async function buildLiveLessonsContent() {
  const fallbackItems = liveLessonsContent.items || [];
  const sourceResults = await Promise.allSettled([
    fetchExploringByTheSeatLessons(),
    fetchCanadianSpaceAgencyEvents(),
  ]);
  const liveItems = [];
  const sourceNotes = [];
  const sourceErrors = [];

  const exploringResult = sourceResults[0];
  if (exploringResult.status === "fulfilled") {
    liveItems.push(...exploringResult.value);
    sourceNotes.push(
      exploringResult.value.length > 0
        ? "Exploring by the Seat space lessons loaded from source feed."
        : "No future Exploring by the Seat space lessons were listed in the source feed."
    );
  } else {
    sourceErrors.push(`Exploring by the Seat: ${formatError(exploringResult.reason)}`);
  }

  const csaResult = sourceResults[1];
  if (csaResult.status === "fulfilled") {
    liveItems.push(...csaResult.value);
    sourceNotes.push(
      csaResult.value.length > 0
        ? "Canadian Space Agency online events loaded from the CSA events calendar."
        : "No future CSA online lessons or webinars were listed in the CSA events calendar."
    );
  } else {
    sourceErrors.push(`Canadian Space Agency: ${formatError(csaResult.reason)}`);
  }

  const items = mergeLessons([...liveItems, ...fallbackItems]).sort(compareLessons);

  return {
    ...liveLessonsContent,
    checkedAt: formatIsoDate(new Date()),
    sourceStatus:
      sourceNotes.length > 0
        ? sourceNotes.join(" ")
        : "Live source feeds could not be reached; showing the bundled source-linked snapshot.",
    sourceErrors,
    items,
  };
}

async function fetchExploringByTheSeatLessons() {
  const now = new Date();
  const endDate = new Date(now.getTime() + ONE_YEAR_MS);
  const query = new URLSearchParams({
    categories: SPACE_EXPLORATION_CATEGORY_ID,
    end_date: `${formatIsoDate(endDate)} 23:59:59`,
    per_page: "50",
    start_date: `${formatIsoDate(now)} 00:00:00`,
  });

  const response = await fetch(`${EBTSOYP_EVENTS_URL}?${query.toString()}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Exploring by the Seat feed failed with ${response.status}.`);
  }

  const payload = await response.json();
  const events = Array.isArray(payload.events) ? payload.events : [];

  return events
    .map(normalizeExploringByTheSeatEvent)
    .filter(function (item) {
      return item && new Date(item.endDate).getTime() >= Date.now();
    });
}

function normalizeExploringByTheSeatEvent(event) {
  if (!event || !event.title || !event.start_date) {
    return null;
  }

  const startDate = toIsoWithOffset(event.start_date, event.timezone_abbr);
  const endDate = toIsoWithOffset(event.end_date || event.start_date, event.timezone_abbr);
  const description = stripHtml(event.description || event.excerpt || "");

  return {
    provider: "Exploring by the Seat of Your Pants",
    type: "Live classroom lesson",
    title: decodeEntities(event.title),
    startDate,
    endDate,
    dateText: formatDateText(startDate),
    timeText: `${formatTimeText(startDate)} to ${formatTimeText(endDate)} ET`,
    monthKey: startDate.slice(0, 7),
    ageGroup: "Grades 4-12 suggested; source feed does not publish an exact grade band.",
    description,
    href: event.url,
    source: "Exploring by the Seat of Your Pants",
  };
}

async function fetchCanadianSpaceAgencyEvents() {
  const response = await fetch(CSA_EVENTS_URL, {
    headers: {
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`Canadian Space Agency events calendar failed with ${response.status}.`);
  }

  const html = await response.text();
  const summaries = extractCanadianSpaceAgencyEventSummaries(html)
    .filter(isFutureLessonCandidate)
    .slice(0, 8);

  const details = await Promise.all(
    summaries.map(function (summary) {
      return enrichCanadianSpaceAgencyEvent(summary);
    })
  );

  return details.filter(Boolean);
}

function extractCanadianSpaceAgencyEventSummaries(html) {
  const blocks = String(html || "").match(/<li class="blog">[\s\S]*?<\/li>/g) || [];

  return blocks
    .map(function (block) {
      const href = findMatch(block, /<article[\s\S]*?<a href="([^"]+)"/);
      const type = stripHtml(findMatch(block, /<small>([\s\S]*?)<\/small>/));
      const title = stripHtml(findMatch(block, /<h3 class="title">([\s\S]*?)<\/h3>/));
      const description = stripHtml(
        findMatch(block, /<p class="text-muted small">([\s\S]*?)<\/p>/)
      );
      const status = stripHtml(findMatch(block, /label-(?:danger|success|info)">([\s\S]*?)<\/span>/));
      const timeMatches = Array.from(block.matchAll(/<time[^>]*datetime="([^"]+)"/g));
      const startDate = timeMatches[0] ? toEasternIso(timeMatches[0][1]) : "";
      const endDate = timeMatches.length > 1 ? toEasternIso(timeMatches.at(-1)[1]) : startDate;

      if (!href || !title || !startDate) {
        return null;
      }

      return {
        provider: "Canadian Space Agency",
        type: type || "CSA online event",
        title,
        startDate,
        endDate,
        monthKey: startDate.slice(0, 7),
        ageGroup: "Canadian students, educators, and the public; check the CSA listing for details.",
        description,
        href: absoluteUrl(href),
        source: "Canadian Space Agency",
        status,
      };
    })
    .filter(Boolean);
}

async function enrichCanadianSpaceAgencyEvent(summary) {
  const response = await fetch(summary.href, {
    headers: {
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    return normalizeCanadianSpaceAgencySummary(summary);
  }

  const html = await response.text();
  const type = stripHtml(findField(html, "Type")) || summary.type;
  const dateField = stripHtml(findField(html, "Date"));
  const timeField = stripHtml(findField(html, "Time"));
  const locationField = stripHtml(findField(html, "Location"));
  const targetAudience = stripHtml(findField(html, "Target audience"));
  const summaryText =
    stripHtml(findSectionAfterHeading(html, "Summary")) || summary.description;
  const timeValue = findMatch(findField(html, "Time"), /datetime="([^"]+)"/);
  const startDate = timeValue ? toEasternIso(timeValue) : summary.startDate;

  return {
    ...summary,
    type,
    startDate,
    endDate: summary.endDate || startDate,
    dateText: dateField || formatDateText(startDate),
    timeText: timeField || "Time to be confirmed by the Canadian Space Agency",
    monthKey: startDate.slice(0, 7),
    ageGroup: targetAudience || summary.ageGroup,
    description: summaryText,
    links: [
      {
        label: "Open Canadian Space Agency",
        href: summary.href,
      },
    ],
    isCanadian: true,
    location: locationField,
  };
}

function normalizeCanadianSpaceAgencySummary(summary) {
  return {
    ...summary,
    dateText: formatDateText(summary.startDate),
    timeText: "Time to be confirmed by the Canadian Space Agency",
    links: [
      {
        label: "Open Canadian Space Agency",
        href: summary.href,
      },
    ],
    isCanadian: true,
  };
}

function isFutureLessonCandidate(item) {
  const searchableText = `${item.type} ${item.title} ${item.description}`.toLowerCase();
  const endTime = new Date(item.endDate || item.startDate).getTime();

  return (
    Number.isFinite(endTime) &&
    endTime >= Date.now() &&
    !/ended/i.test(item.status || "") &&
    includesAny(searchableText, SPACE_EVENT_KEYWORDS) &&
    includesAny(searchableText, ONLINE_EVENT_KEYWORDS)
  );
}

function mergeLessons(items) {
  const seen = new Set();
  const merged = [];

  items.forEach(function (item) {
    const key = `${item.href || item.title}|${item.startDate || item.dateText}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    merged.push(item);
  });

  return merged;
}

function compareLessons(left, right) {
  return new Date(left.startDate).getTime() - new Date(right.startDate).getTime();
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function toEasternIso(value) {
  const normalized = String(value || "").trim();
  const datePart = normalized.slice(0, 10);
  const offset = getEasternOffset(datePart);

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return `${normalized}T12:00:00${offset}`;
  }

  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(normalized)) {
    return `${normalized.replace(" ", "T")}:00${offset}`;
  }

  return normalized;
}

function toIsoWithOffset(value, timezoneAbbr) {
  const offset = timezoneAbbr === "EST" ? "-05:00" : "-04:00";
  return `${String(value).replace(" ", "T")}${offset}`;
}

function formatDateText(isoValue) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeZone: "America/Toronto",
  }).format(new Date(isoValue));
}

function formatTimeText(isoValue) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  }).format(new Date(isoValue));
}

function stripHtml(value) {
  return decodeEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function findField(html, label) {
  return findMatch(
    html,
    new RegExp(`<li><strong>${escapeRegExp(label)}:<\\/strong>([\\s\\S]*?)<\\/li>`, "i")
  );
}

function findSectionAfterHeading(html, heading) {
  return findMatch(
    html,
    new RegExp(`<h2[^>]*>${escapeRegExp(heading)}<\\/h2>\\s*<p>([\\s\\S]*?)<\\/p>`, "i")
  );
}

function findMatch(value, pattern) {
  const match = String(value || "").match(pattern);
  return match ? match[1] : "";
}

function includesAny(value, candidates) {
  return candidates.some(function (candidate) {
    return value.includes(candidate);
  });
}

function absoluteUrl(href) {
  return href.startsWith("http") ? href : `${CSA_BASE_URL}${href}`;
}

function getEasternOffset(datePart) {
  const month = Number(String(datePart).slice(5, 7));
  return month >= 3 && month <= 11 ? "-04:00" : "-05:00";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&#8211;/g, "-")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "...")
    .replace(/&#8230;/g, "...");
}
