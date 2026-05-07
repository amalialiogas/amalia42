import { stationImagesContent } from "./content-data.mjs";

const API_PATH = "/api/v1/station-images";
const REFRESH_INTERVAL_MS = stationImagesContent.refreshIntervalMs;

const elements = {
  countValue: document.getElementById("stationImagesCountValue"),
  grid: document.getElementById("stationImagesGrid"),
  sourceValue: document.getElementById("stationImagesSourceValue"),
  statusBadge: document.getElementById("stationImagesStatusBadge"),
  updatedValue: document.getElementById("stationImagesUpdatedValue"),
};

loadStationImages();
window.setInterval(loadStationImages, REFRESH_INTERVAL_MS);

async function loadStationImages() {
  setStatus("Checking updates", "loading");

  try {
    const content = await requestContent(API_PATH);
    renderStationImages(content, { isFallback: false });
  } catch (error) {
    console.error(error);
    renderStationImages(stationImagesContent, { isFallback: true });
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

function renderStationImages(content, options) {
  const items = Array.isArray(content.items) ? content.items : [];
  elements.grid.innerHTML = "";
  items.forEach(function (item) {
    elements.grid.appendChild(createImageCard(item));
  });

  elements.countValue.textContent = `${items.length || "--"} images`;
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

function createImageCard(item) {
  const article = document.createElement("article");
  article.className = "station-image-card";

  const image = document.createElement("img");
  image.src = item.imageUrl || item.thumbnailUrl;
  image.alt = `${item.title || "ISS image"} taken from the International Space Station`;
  image.loading = "lazy";

  const body = document.createElement("div");
  body.className = "station-image-card-body";

  const title = createTextElement("h3", "", item.title);
  const meta = document.createElement("div");
  meta.className = "station-image-meta";
  meta.append(createMetaLine("Date", item.dateText));
  meta.append(createMetaLine("Location", item.locationText));

  const link = document.createElement("a");
  link.className = "station-image-link";
  link.href = item.href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Open NASA image record";

  body.append(title, meta, link);
  article.append(image, body);
  return article;
}

function createMetaLine(label, value) {
  const paragraph = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}:`;
  paragraph.append(strong, ` ${value || "Not listed"}`);
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
