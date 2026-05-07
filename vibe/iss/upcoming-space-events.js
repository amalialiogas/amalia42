import { upcomingSpaceEventsContent } from "./content-data.mjs";

const API_PATH = "/api/v1/upcoming-space-events";
const REFRESH_INTERVAL_MS = upcomingSpaceEventsContent.refreshIntervalMs;

const elements = {
  countValue: document.getElementById("spaceEventsCountValue"),
  monthList: document.getElementById("spaceEventsMonthList"),
  sourceValue: document.getElementById("spaceEventsSourceValue"),
  statusBadge: document.getElementById("spaceEventsStatusBadge"),
  updatedValue: document.getElementById("spaceEventsUpdatedValue"),
};

loadSpaceEvents();
window.setInterval(loadSpaceEvents, REFRESH_INTERVAL_MS);

async function loadSpaceEvents() {
  setStatus("Checking updates", "loading");

  try {
    const content = await requestContent(API_PATH);
    renderSpaceEvents(content, { isFallback: false });
  } catch (error) {
    console.error(error);
    renderSpaceEvents(upcomingSpaceEventsContent, { isFallback: true });
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

function renderSpaceEvents(content, options) {
  const items = Array.isArray(content.items) ? content.items : [];
  elements.monthList.innerHTML = "";
  renderMonthGroups(items).forEach(function (monthSection) {
    elements.monthList.appendChild(monthSection);
  });

  elements.countValue.textContent = `${items.length || "--"} events`;
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
    const monthKey = item.monthKey || getMonthKey(item);
    if (!groups.has(monthKey)) {
      groups.set(monthKey, []);
    }
    groups.get(monthKey).push(item);
  });

  return Array.from(groups.entries())
    .sort(function ([leftKey], [rightKey]) {
      return compareMonthKeys(leftKey, rightKey);
    })
    .map(function ([monthKey, monthItems]) {
      return createMonthSection(monthKey, monthItems);
    });
}

function createMonthSection(monthKey, items) {
  const section = document.createElement("section");
  section.className = "space-event-month";

  const heading = document.createElement("h3");
  heading.className = "space-event-month-heading";
  heading.textContent = formatMonth(monthKey);

  const grid = document.createElement("div");
  grid.className = "space-event-grid";
  items.forEach(function (item) {
    grid.appendChild(createEventCard(item));
  });

  section.append(heading, grid);
  return section;
}

function createEventCard(item) {
  const article = document.createElement("article");
  article.className = "space-event-card";

  const top = document.createElement("div");
  top.className = "space-event-card-top";
  top.append(createTextElement("p", "space-event-provider", item.provider || item.source));
  top.append(createTextElement("span", "space-event-type", item.type));

  const title = createTextElement("h3", "", item.title);
  const meta = document.createElement("div");
  meta.className = "space-event-meta-grid";
  meta.append(createMetaLine("Date", item.dateText || formatDate(item.startDate)));
  meta.append(createMetaLine("Category", item.category));
  meta.append(createMetaLine("Status", item.status || item.source));

  const description = createTextElement("p", "space-event-description", item.description);
  const whyItMatters = createTextElement("p", "space-event-why", item.whyItMatters);
  const links = createEventLinks(item);

  article.append(top, title, meta, description, whyItMatters, links);
  return article;
}

function createEventLinks(item) {
  const links = document.createElement("div");
  links.className = "space-event-links";
  const itemLinks =
    Array.isArray(item.links) && item.links.length > 0
      ? item.links
      : [
          {
            label: item.source ? `Open ${item.source}` : "Open event",
            href: item.href,
          },
        ];

  itemLinks.forEach(function (itemLink) {
    if (!itemLink || !itemLink.href) {
      return;
    }

    const link = document.createElement("a");
    link.className = "space-event-link";
    link.href = itemLink.href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = itemLink.label || "Open event";
    links.appendChild(link);
  });

  return links;
}

function createMetaLine(label, value) {
  const paragraph = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}:`;
  paragraph.append(strong, ` ${value || "To be confirmed"}`);
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

function compareMonthKeys(leftKey, rightKey) {
  return monthSortValue(leftKey) - monthSortValue(rightKey);
}

function monthSortValue(monthKey) {
  if (/^\d{4}$/.test(monthKey)) {
    return Number(`${monthKey}12`);
  }

  if (/^\d{4}-\d{2}$/.test(monthKey)) {
    return Number(monthKey.replace("-", ""));
  }

  if (/under review/i.test(monthKey)) {
    return 999998;
  }

  return 999999;
}

function getMonthKey(item) {
  if (/^\d{4}$/.test(item.dateText || "")) {
    return item.dateText;
  }

  if (/under review/i.test(item.dateText || "")) {
    return "Schedule under review";
  }

  return String(item.startDate || "").slice(0, 7) || "Upcoming";
}

function formatMonth(monthKey) {
  if (/^\d{4}$/.test(monthKey)) {
    return monthKey;
  }

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
