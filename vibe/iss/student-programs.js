import { studentProgramsContent } from "./content-data.mjs";

const API_PATH = "/api/v1/student-programs";
const REFRESH_INTERVAL_MS = studentProgramsContent.refreshIntervalMs;

const elements = {
  countValue: document.getElementById("studentProgramCountValue"),
  grid: document.getElementById("studentProgramsGrid"),
  sourceValue: document.getElementById("studentProgramsSourceValue"),
  statusBadge: document.getElementById("studentProgramsStatusBadge"),
  updatedValue: document.getElementById("studentProgramsUpdatedValue"),
};

loadStudentPrograms();
window.setInterval(loadStudentPrograms, REFRESH_INTERVAL_MS);

async function loadStudentPrograms() {
  setStatus("Checking updates", "loading");

  try {
    const content = await requestContent(API_PATH);
    renderStudentPrograms(content, { isFallback: false });
  } catch (error) {
    console.error(error);
    renderStudentPrograms(studentProgramsContent, { isFallback: true });
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

function renderStudentPrograms(content, options) {
  const items = Array.isArray(content.items) ? content.items : [];
  elements.grid.innerHTML = "";
  items.forEach(function (item) {
    elements.grid.appendChild(createProgramCard(item));
  });

  elements.countValue.textContent = `${items.length || "--"} options`;
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

function createProgramCard(item) {
  const article = document.createElement("article");
  article.className = "program-card";

  const top = document.createElement("div");
  top.className = "program-card-top";
  top.append(createTextElement("p", "program-category", item.category));
  top.append(createTextElement("span", "program-status", item.status));

  const title = createTextElement("h3", "", item.title);

  const meta = document.createElement("div");
  meta.className = "program-meta-grid";
  meta.append(createMetaLine("Grade level", item.gradeLevel));
  meta.append(createMetaLine("Quebec fit", item.quebecFit));
  meta.append(createMetaLine("French", item.french));

  const description = createTextElement("p", "program-description", item.description);
  const links = document.createElement("div");
  links.className = "program-links";
  (item.links || []).forEach(function (link) {
    const anchor = document.createElement("a");
    anchor.href = link.href;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.textContent = link.label || "Source";
    links.appendChild(anchor);
  });

  article.append(top, title, meta, description, links);
  return article;
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
