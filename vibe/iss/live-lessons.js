import { liveLessonsContent } from "./content-data.mjs";

const API_PATH = "/api/v1/live-lessons";
const REFRESH_INTERVAL_MS = liveLessonsContent.refreshIntervalMs;

const elements = {
  countValue: document.getElementById("liveLessonsCountValue"),
  monthList: document.getElementById("liveLessonsMonthList"),
  sourceValue: document.getElementById("liveLessonsSourceValue"),
  statusBadge: document.getElementById("liveLessonsStatusBadge"),
  updatedValue: document.getElementById("liveLessonsUpdatedValue"),
};

loadLiveLessons();
window.setInterval(loadLiveLessons, REFRESH_INTERVAL_MS);

async function loadLiveLessons() {
  setStatus("Checking updates", "loading");

  try {
    const content = await requestContent(API_PATH);
    renderLiveLessons(content, { isFallback: false });
  } catch (error) {
    console.error(error);
    renderLiveLessons(liveLessonsContent, { isFallback: true });
  }
}

async function requestContent(pathname) {
  if (window.location.protocol !== "http:" && window.location.protocol !== "https:") {
    throw new Error("Server-backed content requires the app server.");
  }

  const response = await fetch(`${window.location.origin}${pathname}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Content request failed with ${response.status}.`);
  }

  return response.json();
}

function renderLiveLessons(content, options) {
  const items = Array.isArray(content.items) ? content.items : [];
  elements.monthList.innerHTML = "";
  renderMonthGroups(items).forEach(function (monthSection) {
    elements.monthList.appendChild(monthSection);
  });

  elements.countValue.textContent = `${items.length || "--"} listings`;
  elements.updatedValue.textContent = options.isFallback
    ? `Bundled snapshot checked ${formatDate(content.checkedAt)}`
    : `Updated ${formatDateTime(new Date())}`;
  elements.sourceValue.textContent = options.isFallback
    ? "The app server could not be reached, so this page is showing its bundled snapshot."
    : `${content.sourceStatus || "Loaded from the app server."} Refreshes every ${formatDuration(
        content.refreshIntervalMs
      )} while open.`;
  setStatus(options.isFallback ? "Bundled snapshot" : "Server updated", options.isFallback ? "loading" : "live");
}

function renderMonthGroups(items) {
  const groups = new Map();
  items.forEach(function (item) {
    const monthKey = item.monthKey || String(item.startDate || "").slice(0, 7) || "Upcoming";
    if (!groups.has(monthKey)) {
      groups.set(monthKey, []);
    }
    groups.get(monthKey).push(item);
  });

  return Array.from(groups.entries())
    .sort(function ([leftKey], [rightKey]) {
      return leftKey.localeCompare(rightKey);
    })
    .map(function ([monthKey, monthItems]) {
      return createMonthSection(monthKey, monthItems);
    });
}

function createMonthSection(monthKey, items) {
  const section = document.createElement("section");
  section.className = "lesson-month";

  const heading = document.createElement("h3");
  heading.className = "lesson-month-heading";
  heading.textContent = formatMonth(monthKey);

  const grid = document.createElement("div");
  grid.className = "lesson-grid";
  items.forEach(function (item) {
    grid.appendChild(createLessonCard(item));
  });

  section.append(heading, grid);
  return section;
}

function createLessonCard(item) {
  const article = document.createElement("article");
  article.className = "lesson-card";

  const top = document.createElement("div");
  top.className = "lesson-card-top";
  top.append(createTextElement("p", "lesson-provider", item.provider));
  top.append(createTextElement("span", "lesson-type", item.type));

  const title = createTextElement("h3", "", item.title);
  const meta = document.createElement("div");
  meta.className = "lesson-meta-grid";
  meta.append(createMetaLine("Date", item.dateText || formatDate(item.startDate)));
  meta.append(createMetaLine("Time", item.timeText || "Time to be confirmed"));
  meta.append(createMetaLine("Age group", item.ageGroup));

  const description = createTextElement("p", "lesson-description", item.description);
  const links = createLessonLinks(item);

  article.append(top, title, meta, description, links);
  return article;
}

function createLessonLinks(item) {
  const links = document.createElement("div");
  links.className = "lesson-links";
  const itemLinks = Array.isArray(item.links) && item.links.length > 0
    ? item.links
    : [
        {
          label: item.source ? `Open ${item.source}` : "Open listing",
          href: item.href,
        },
      ];

  itemLinks.forEach(function (itemLink) {
    if (!itemLink || !itemLink.href) {
      return;
    }

    const link = document.createElement("a");
    link.className = "lesson-link";
    link.href = itemLink.href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = itemLink.label || "Open listing";
    links.appendChild(link);
  });

  return links;
}

function createMetaLine(label, value) {
  const paragraph = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}:`;
  paragraph.append(strong, ` ${value || ""}`);
  return paragraph;
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  element.textContent = text || "";
  return element;
}

function setStatus(label, tone) {
  elements.statusBadge.textContent = label;
  elements.statusBadge.className = `status-badge status-${tone}`;
}

function formatMonth(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return monthKey;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(`${monthKey}-01T00:00:00`));
}

function formatDate(value) {
  if (!value) {
    return "Date to be confirmed";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(milliseconds) {
  const hours = Math.max(1, Math.round(milliseconds / (60 * 60 * 1000)));
  return `${hours} hours`;
}
