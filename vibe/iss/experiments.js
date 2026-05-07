import { experimentsContent } from "./content-data.mjs";

const API_PATH = "/api/v1/experiments";
const REFRESH_INTERVAL_MS = experimentsContent.refreshIntervalMs;

const elements = {
  countValue: document.getElementById("experimentsCountValue"),
  grid: document.getElementById("experimentsGrid"),
  sourceValue: document.getElementById("experimentsSourceValue"),
  statusBadge: document.getElementById("experimentsStatusBadge"),
  updatedValue: document.getElementById("experimentsUpdatedValue"),
};

loadExperiments();
window.setInterval(loadExperiments, REFRESH_INTERVAL_MS);

async function loadExperiments() {
  setStatus("Checking updates", "loading");

  try {
    const content = await requestContent(API_PATH);
    renderExperiments(content, { isFallback: false });
  } catch (error) {
    console.error(error);
    renderExperiments(experimentsContent, { isFallback: true });
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

function renderExperiments(content, options) {
  const items = Array.isArray(content.items) ? content.items : [];
  elements.grid.innerHTML = "";
  items.forEach(function (item) {
    elements.grid.appendChild(createExperimentCard(item));
  });

  elements.countValue.textContent = `${items.length || "--"} experiments`;
  elements.updatedValue.textContent = options.isFallback
    ? `Bundled snapshot checked ${formatDate(content.checkedAt)}`
    : `Updated ${formatDateTime(new Date())}`;
  elements.sourceValue.textContent = options.isFallback
    ? "The app server could not be reached, so this page is showing its bundled snapshot."
    : `Loaded from the app server. Source snapshot checked ${formatDate(
        content.checkedAt
      )}; refreshes every ${formatDuration(content.refreshIntervalMs)} while open.`;
  setStatus(options.isFallback ? "Bundled snapshot" : "Server updated", options.isFallback ? "loading" : "live");
}

function createExperimentCard(item) {
  const article = document.createElement("article");
  article.className = "experiment-card";

  const top = document.createElement("div");
  top.className = "experiment-card-top";
  top.append(createTextElement("p", "experiment-category", item.category));
  top.append(createTextElement("span", "experiment-status", item.status));

  const title = createTextElement("h3", "", item.title);
  const copy = createTextElement("p", "experiment-copy", item.description);
  const impact = document.createElement("p");
  impact.className = "experiment-impact";
  const impactLabel = document.createElement("strong");
  impactLabel.textContent = "Why it matters:";
  impact.append(impactLabel, ` ${item.impact || ""}`);

  const tags = document.createElement("div");
  tags.className = "experiment-tags";
  (item.tags || []).forEach(function (tagLabel) {
    tags.append(createTextElement("span", "", tagLabel));
  });

  article.append(top, title, copy, impact, tags);
  appendLinks(article, item.links, "experiment-source-link");
  return article;
}

function appendLinks(parent, links, className) {
  (links || []).forEach(function (link) {
    const anchor = document.createElement("a");
    anchor.className = className;
    anchor.href = link.href;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.textContent = link.label || "Source";
    parent.appendChild(anchor);
  });
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

function formatDate(value) {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00`));
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
