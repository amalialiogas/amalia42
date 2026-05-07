(function () {
  const POLL_INTERVAL_MS = 5000;
  const TRAIL_WINDOW_SECONDS = 90 * 60;
  const TRAIL_STEP_SECONDS = 600;
  const TRAIL_SEED_POINTS = 10;
  const FORECAST_WINDOW_SECONDS = 90 * 60;
  const FORECAST_STEP_SECONDS = 600;
  const FORECAST_POINTS = Math.floor(FORECAST_WINDOW_SECONDS / FORECAST_STEP_SECONDS);
  const FORECAST_REFRESH_SECONDS = 60;
  const DEFAULT_WATCH_RADIUS_KM = 550;
  const STORAGE_KEY = "issOverhead.localViewerProfile";

  const localApiBase =
    window.location.protocol === "http:" || window.location.protocol === "https:"
      ? `${window.location.origin}/api/v1`
      : null;

  const apiCandidates = [localApiBase, "https://api.wheretheiss.at/v1"].filter(Boolean);
  const geocodeApiUrl = localApiBase ? `${localApiBase}/geocode` : null;

  const elements = {
    altitudeValue: document.getElementById("altitudeValue"),
    findAddressButton: document.getElementById("findAddressButton"),
    followToggle: document.getElementById("followToggle"),
    footprintValue: document.getElementById("footprintValue"),
    headingValue: document.getElementById("headingValue"),
    latitudeValue: document.getElementById("latitudeValue"),
    locationAddressInput: document.getElementById("locationAddressInput"),
    locationLabelInput: document.getElementById("locationLabelInput"),
    locationLatitudeInput: document.getElementById("locationLatitudeInput"),
    locationLongitudeInput: document.getElementById("locationLongitudeInput"),
    locationRadiusInput: document.getElementById("locationRadiusInput"),
    locationSettingsForm: document.getElementById("locationSettingsForm"),
    longitudeValue: document.getElementById("longitudeValue"),
    mapPositionValue: document.getElementById("mapPositionValue"),
    notifyEnabledInput: document.getElementById("notifyEnabledInput"),
    positionSummary: document.getElementById("positionSummary"),
    recenterButton: document.getElementById("recenterButton"),
    ribbonSectorValue: document.getElementById("ribbonSectorValue"),
    ribbonTimeValue: document.getElementById("ribbonTimeValue"),
    ribbonVisibilityValue: document.getElementById("ribbonVisibilityValue"),
    sampleCountValue: document.getElementById("sampleCountValue"),
    sectorValue: document.getElementById("sectorValue"),
    settingsFeedback: document.getElementById("settingsFeedback"),
    statusBadge: document.getElementById("statusBadge"),
    trackingModeValue: document.getElementById("trackingModeValue"),
    trailWindowValue: document.getElementById("trailWindowValue"),
    updatedAt: document.getElementById("updatedAt"),
    useCurrentLocationButton: document.getElementById("useCurrentLocationButton"),
    velocityValue: document.getElementById("velocityValue"),
    visibilityValue: document.getElementById("visibilityValue"),
    watchDirectionValue: document.getElementById("watchDirectionValue"),
    watchDistanceValue: document.getElementById("watchDistanceValue"),
    watchHeadline: document.getElementById("watchHeadline"),
    watchLocationValue: document.getElementById("watchLocationValue"),
    watchLogList: document.getElementById("watchLogList"),
    watchNotificationValue: document.getElementById("watchNotificationValue"),
    watchRadiusValue: document.getElementById("watchRadiusValue"),
    watchStateBadge: document.getElementById("watchStateBadge"),
    watchSummary: document.getElementById("watchSummary"),
  };

  const state = {
    activeApiBase: null,
    autoFollow: true,
    forecast: [],
    forecastUpdatedAt: 0,
    history: [],
    isBooted: false,
    isForecastRefreshing: false,
    isRefreshing: false,
    lastError: null,
    latest: null,
    locationProfile: loadStoredLocationProfile(),
    locationWatch: null,
  };

  initializeLocationWatch();

  const map = L.map("map", {
    center: [18, 0],
    zoom: 2.3,
    maxBounds: [
      [-85, -180],
      [85, 180],
    ],
    maxBoundsViscosity: 0.45,
    zoomControl: false,
    minZoom: 2,
    maxZoom: 6,
  });

  L.control.zoom({ position: "topright" }).addTo(map);

  const basemapLayer = L.layerGroup().addTo(map);
  const trailLayer = L.layerGroup().addTo(map);
  const forecastLayer = L.layerGroup().addTo(map);
  const gridLayer = L.layerGroup().addTo(map);
  const footprintCircle = L.circle([0, 0], {
    color: "#0f5ec9",
    fillColor: "#0a84ff",
    fillOpacity: 0.08,
    interactive: false,
    opacity: 0.35,
    radius: 1000,
    weight: 1.2,
  }).addTo(map);

  const marker = L.marker([0, 0], {
    icon: L.divIcon({
      className: "iss-marker",
      html:
        '<span class="iss-marker-pulse"></span><span class="iss-marker-core"></span>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -14],
    }),
  }).addTo(map);

  marker.bindPopup("Waiting for the latest ISS telemetry...");

  renderGraticule();
  loadVectorBasemap();

  elements.followToggle.addEventListener("click", function () {
    state.autoFollow = !state.autoFollow;
    syncFollowToggle();

    if (state.autoFollow && state.latest) {
      map.flyTo([state.latest.latitude, state.latest.longitude], map.getZoom(), {
        animate: true,
        duration: 1.2,
      });
    }
  });

  elements.recenterButton.addEventListener("click", function () {
    if (!state.latest) {
      return;
    }

    map.flyTo([state.latest.latitude, state.latest.longitude], Math.max(map.getZoom(), 3), {
      animate: true,
      duration: 1.2,
    });
  });

  map.on("dragstart zoomstart", function () {
    if (state.autoFollow) {
      state.autoFollow = false;
      syncFollowToggle();
    }
  });

  syncFollowToggle();
  setStatus("Connecting", "loading");
  seedTrail()
    .catch(function (error) {
      console.error(error);
      setStatus("Fallback mode", "error");
      return refreshPosition();
    })
    .finally(function () {
      scheduleRefresh();
    });

  function initializeLocationWatch() {
    renderLocationSettingsForm();
    renderLocationWatchMonitor();

    if (elements.locationSettingsForm) {
      elements.locationSettingsForm.addEventListener("submit", handleLocationSettingsSubmit);
    }

    if (elements.useCurrentLocationButton) {
      elements.useCurrentLocationButton.addEventListener("click", handleUseCurrentLocationClick);
    }

    if (elements.findAddressButton) {
      elements.findAddressButton.addEventListener("click", handleFindAddressClick);
    }
  }

  function scheduleRefresh() {
    window.setTimeout(function () {
      refreshPosition();
      window.setInterval(refreshPosition, POLL_INTERVAL_MS);
    }, 1500);
  }

  async function loadVectorBasemap() {
    const attributionControl = map.attributionControl;
    attributionControl.setPrefix("Leaflet");
    attributionControl.addAttribution("Land outlines &copy; Natural Earth");

    try {
      const response = await fetch(
        "https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json"
      );

      if (!response.ok) {
        throw new Error(`Basemap request failed with ${response.status}.`);
      }

      const topojson = await response.json();
      const land = window.topojson.feature(topojson, topojson.objects.land);

      L.geoJSON(land, {
        attribution: "Land outlines &copy; Natural Earth",
        interactive: false,
        style: function () {
          return {
            color: "rgba(104, 135, 155, 0.55)",
            fillColor: "rgba(247, 244, 239, 0.96)",
            fillOpacity: 1,
            weight: 1.1,
          };
        },
      }).addTo(basemapLayer);
    } catch (error) {
      console.error(error);
      elements.statusBadge.textContent = "Basemap unavailable";
      elements.statusBadge.className = "status-badge status-loading";
    }
  }

  function renderGraticule() {
    const gridStyle = {
      color: "rgba(255, 255, 255, 0.28)",
      interactive: false,
      opacity: 1,
      weight: 1,
    };

    for (let latitude = -60; latitude <= 60; latitude += 30) {
      const points = [];
      for (let longitude = -180; longitude <= 180; longitude += 5) {
        points.push([latitude, longitude]);
      }
      L.polyline(points, gridStyle).addTo(gridLayer);
    }

    for (let longitude = -150; longitude <= 180; longitude += 30) {
      const points = [];
      for (let latitude = -85; latitude <= 85; latitude += 5) {
        points.push([latitude, longitude]);
      }
      L.polyline(points, gridStyle).addTo(gridLayer);
    }

    L.polyline(
      [
        [0, -180],
        [0, 180],
      ],
      {
        color: "rgba(255, 255, 255, 0.48)",
        interactive: false,
        opacity: 1,
        weight: 1.3,
      }
    ).addTo(gridLayer);
  }

  function renderLocationSettingsForm() {
    const profile = state.locationProfile || createEmptyLocationProfile();

    if (elements.locationLabelInput) {
      elements.locationLabelInput.value = profile.label || "";
    }
    if (elements.locationAddressInput) {
      elements.locationAddressInput.value = profile.address || "";
      elements.locationAddressInput.dataset.geocodedAddress = profile.address || "";
    }
    if (elements.locationLatitudeInput) {
      elements.locationLatitudeInput.value = profile.latitude || "";
    }
    if (elements.locationLongitudeInput) {
      elements.locationLongitudeInput.value = profile.longitude || "";
    }
    if (elements.locationRadiusInput) {
      elements.locationRadiusInput.value = clampWatchRadius(profile.watchRadiusKm);
    }
    if (elements.notifyEnabledInput) {
      elements.notifyEnabledInput.checked = Boolean(profile.notificationsEnabled);
    }
  }

  async function handleLocationSettingsSubmit(event) {
    event.preventDefault();

    const label = elements.locationLabelInput.value.trim() || "My location";
    const address = elements.locationAddressInput.value.trim();
    let latitude = elements.locationLatitudeInput.value.trim();
    let longitude = elements.locationLongitudeInput.value.trim();
    let parsedLatitude = parseFiniteNumber(latitude);
    let parsedLongitude = parseFiniteNumber(longitude);
    const lastSavedAddress = state.locationProfile ? state.locationProfile.address || "" : "";
    const lastGeocodedAddress = elements.locationAddressInput.dataset.geocodedAddress || "";
    const savedLatitude = state.locationProfile
      ? parseFiniteNumber(state.locationProfile.latitude)
      : NaN;
    const savedLongitude = state.locationProfile
      ? parseFiniteNumber(state.locationProfile.longitude)
      : NaN;
    const coordinatesMissing = !Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude);
    const addressChanged = Boolean(address) && address !== lastSavedAddress && address !== lastGeocodedAddress;
    const coordinatesChanged =
      !sameCoordinate(parsedLatitude, savedLatitude) ||
      !sameCoordinate(parsedLongitude, savedLongitude);
    const shouldGeocodeAddress =
      Boolean(address) && (coordinatesMissing || (addressChanged && !coordinatesChanged));

    if (shouldGeocodeAddress) {
      const result = await geocodeAddress(address);
      if (!result) {
        return;
      }

      applyGeocodeResult(result);
      parsedLatitude = result.latitude;
      parsedLongitude = result.longitude;
      latitude = String(result.latitude);
      longitude = String(result.longitude);
    }

    if (!Number.isFinite(parsedLatitude) || parsedLatitude < -90 || parsedLatitude > 90) {
      setFeedback(
        elements.settingsFeedback,
        "Add a valid address, or enter a latitude between -90 and 90.",
        "error"
      );
      return;
    }

    if (!Number.isFinite(parsedLongitude) || parsedLongitude < -180 || parsedLongitude > 180) {
      setFeedback(
        elements.settingsFeedback,
        "Add a valid address, or enter a longitude between -180 and 180.",
        "error"
      );
      return;
    }

    let notificationsEnabled = elements.notifyEnabledInput.checked;
    if (notificationsEnabled) {
      notificationsEnabled = await requestNotificationPermission();
    }

    state.locationProfile = {
      ...createEmptyLocationProfile(),
      ...state.locationProfile,
      label,
      address,
      latitude,
      longitude,
      watchRadiusKm: clampWatchRadius(elements.locationRadiusInput.value),
      notificationsEnabled,
      inWatchZone: notificationsEnabled
        ? Boolean(state.locationProfile && state.locationProfile.inWatchZone)
        : false,
    };

    if (elements.notifyEnabledInput) {
      elements.notifyEnabledInput.checked = notificationsEnabled;
    }

    saveStoredLocationProfile();
    syncLocationWatchState(state.latest);
    setFeedback(
      elements.settingsFeedback,
      notificationsEnabled
        ? "Watch settings saved. Browser notifications are armed while this page is open."
        : "Watch settings saved. Distance and direction will update live.",
      "success"
    );
  }

  async function handleFindAddressClick() {
    const address = elements.locationAddressInput.value.trim();
    const result = await geocodeAddress(address);

    if (!result) {
      return;
    }

    applyGeocodeResult(result);
    setFeedback(
      elements.settingsFeedback,
      `Found coordinates for ${result.displayName}. Save the watch settings to use them.`,
      "success"
    );
  }

  async function geocodeAddress(address) {
    if (!address) {
      setFeedback(elements.settingsFeedback, "Enter an address to find coordinates.", "error");
      return null;
    }

    if (!geocodeApiUrl) {
      setFeedback(
        elements.settingsFeedback,
        "Address lookup needs the app server. Open the page from http://127.0.0.1:8000/.",
        "error"
      );
      return null;
    }

    setGeocodeButtonState(true);
    setFeedback(elements.settingsFeedback, "Looking up that address.", "warning");

    try {
      const query = new URLSearchParams({ q: address });
      const response = await fetch(`${geocodeApiUrl}?${query.toString()}`, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Address lookup failed with ${response.status}.`);
      }

      const results = await response.json();
      const bestMatch = Array.isArray(results) ? results[0] : null;

      if (!bestMatch) {
        setFeedback(
          elements.settingsFeedback,
          "No coordinates were found for that address. Try adding city, region, or country.",
          "error"
        );
        return null;
      }

      const latitude = Number(bestMatch.lat);
      const longitude = Number(bestMatch.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("Address lookup returned incomplete coordinates.");
      }

      return {
        displayName: bestMatch.display_name || address,
        latitude,
        longitude,
      };
    } catch (error) {
      console.error(error);
      setFeedback(
        elements.settingsFeedback,
        "Address lookup is unavailable right now. You can still enter coordinates manually.",
        "error"
      );
      return null;
    } finally {
      setGeocodeButtonState(false);
    }
  }

  function applyGeocodeResult(result) {
    elements.locationLatitudeInput.value = result.latitude.toFixed(4);
    elements.locationLongitudeInput.value = result.longitude.toFixed(4);
    elements.locationAddressInput.dataset.geocodedAddress =
      elements.locationAddressInput.value.trim();
    if (!elements.locationLabelInput.value.trim()) {
      elements.locationLabelInput.value = result.displayName.split(",")[0] || "My location";
    }
  }

  function setGeocodeButtonState(isLoading) {
    if (!elements.findAddressButton) {
      return;
    }

    elements.findAddressButton.disabled = isLoading;
    elements.findAddressButton.textContent = isLoading ? "Finding..." : "Find coordinates";
  }

  function handleUseCurrentLocationClick() {
    if (!navigator.geolocation) {
      setFeedback(elements.settingsFeedback, "This browser does not support location lookup.", "error");
      return;
    }

    if (!window.isSecureContext) {
      setFeedback(
        elements.settingsFeedback,
        "Browser location only works on HTTPS or localhost. Use the app server at http://127.0.0.1:8000/ or enter an address.",
        "error"
      );
      return;
    }

    elements.useCurrentLocationButton.disabled = true;
    elements.useCurrentLocationButton.textContent = "Locating...";
    setFeedback(elements.settingsFeedback, "Asking the browser for your location.", "warning");

    navigator.geolocation.getCurrentPosition(
      function (position) {
        const latitude = position.coords.latitude.toFixed(4);
        const longitude = position.coords.longitude.toFixed(4);

        elements.locationLatitudeInput.value = latitude;
        elements.locationLongitudeInput.value = longitude;
        elements.locationAddressInput.dataset.geocodedAddress =
          elements.locationAddressInput.value.trim();
        if (!elements.locationLabelInput.value.trim()) {
          elements.locationLabelInput.value = "My location";
        }

        elements.useCurrentLocationButton.disabled = false;
        elements.useCurrentLocationButton.textContent = "Use my current location";
        setFeedback(
          elements.settingsFeedback,
          "Location found. Save the watch settings to start tracking from there.",
          "success"
        );
      },
      function (error) {
        elements.useCurrentLocationButton.disabled = false;
        elements.useCurrentLocationButton.textContent = "Use my current location";
        const message =
          error && error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. You can enter an address instead."
            : "Unable to read your location. You can still enter an address or coordinates manually.";
        setFeedback(
          elements.settingsFeedback,
          message,
          "error"
        );
      },
      {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000,
        timeout: 10000,
      }
    );
  }

  function syncFollowToggle() {
    elements.followToggle.textContent = state.autoFollow
      ? "Auto-follow on"
      : "Auto-follow off";
    elements.followToggle.setAttribute("aria-pressed", String(state.autoFollow));

    if (elements.trackingModeValue) {
      elements.trackingModeValue.textContent = state.autoFollow
        ? "Auto-follow"
        : "Free explore";
    }
  }

  async function seedTrail() {
    const now = Math.floor(Date.now() / 1000);
    const timestamps = Array.from({ length: TRAIL_SEED_POINTS }, function (_, index) {
      return String(now - (TRAIL_SEED_POINTS - 1 - index) * TRAIL_STEP_SECONDS);
    }).join(",");

    const snapshots = await requestIss("/satellites/25544/positions", {
      timestamps,
      units: "kilometers",
    });

    const seededHistory = snapshots
      .map(normalizeSnapshot)
      .filter(isValidPoint)
      .sort(function (left, right) {
        return left.timestamp - right.timestamp;
      });

    if (!seededHistory.length) {
      throw new Error("No initial ISS positions were returned.");
    }

    state.history = seededHistory;
    applySnapshot(seededHistory[seededHistory.length - 1], { silentStatus: false });
    setStatus("Live feed ready", "live");
    state.isBooted = true;
  }

  async function refreshPosition() {
    if (state.isRefreshing) {
      return;
    }

    state.isRefreshing = true;

    try {
      const snapshot = normalizeSnapshot(
        await requestIss("/satellites/25544", { units: "kilometers" })
      );

      if (!isValidPoint(snapshot)) {
        throw new Error("The ISS API returned incomplete telemetry.");
      }

      applySnapshot(snapshot, { silentStatus: false });
      setStatus("Tracking live", "live");
      state.lastError = null;
    } catch (error) {
      console.error(error);
      state.lastError = error;
      setStatus("Signal interrupted", "error");
    } finally {
      state.isRefreshing = false;
    }
  }

  async function requestIss(pathname, params) {
    const query = new URLSearchParams(params || {});
    const suffix = query.size ? `${pathname}?${query.toString()}` : pathname;
    const preferredCandidates = state.activeApiBase
      ? [state.activeApiBase].concat(
          apiCandidates.filter(function (candidate) {
            return candidate !== state.activeApiBase;
          })
        )
      : apiCandidates;

    let lastError = null;

    for (const base of preferredCandidates) {
      try {
        const response = await fetch(`${base}${suffix}`, {
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`ISS API request failed with ${response.status}.`);
        }

        const data = await response.json();
        state.activeApiBase = base;
        return data;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Unable to reach the ISS API.");
  }

  function applySnapshot(snapshot, options) {
    const lastSnapshot = state.latest;
    state.latest = snapshot;
    upsertHistory(snapshot);
    redrawPath();
    refreshForecast(snapshot);
    updateMap(snapshot);
    updateTelemetry(snapshot, lastSnapshot);
    syncLocationWatchState(snapshot);

    if (!(options && options.silentStatus)) {
      setStatus(
        state.isBooted ? "Tracking live" : "Connecting",
        state.isBooted ? "live" : "loading"
      );
    }
  }

  function upsertHistory(snapshot) {
    const existingIndex = state.history.findIndex(function (entry) {
      return entry.timestamp === snapshot.timestamp;
    });

    if (existingIndex >= 0) {
      state.history.splice(existingIndex, 1, snapshot);
    } else {
      state.history.push(snapshot);
    }

    state.history.sort(function (left, right) {
      return left.timestamp - right.timestamp;
    });

    const cutoff = snapshot.timestamp - TRAIL_WINDOW_SECONDS;
    state.history = state.history.filter(function (entry) {
      return entry.timestamp >= cutoff;
    });
  }

  function redrawPath() {
    trailLayer.clearLayers();
    forecastLayer.clearLayers();

    const segments = splitAtDateline(state.history);
    segments.forEach(function (segment) {
      if (segment.length < 2) {
        return;
      }

      L.polyline(segment, {
        color: "#0a84ff",
        opacity: 0.9,
        weight: 3.5,
      }).addTo(trailLayer);
    });

    const forecastPoints = getForecastPathPoints(state.latest);
    const forecastSegments = splitAtDateline(forecastPoints);
    forecastSegments.forEach(function (segment) {
      if (segment.length < 2) {
        return;
      }

      L.polyline(segment, {
        color: "#ffb000",
        dashArray: "8 10",
        interactive: false,
        opacity: 0.95,
        weight: 3.2,
      }).addTo(forecastLayer);
    });

    if (forecastPoints.length > 1) {
      const destination = forecastPoints[forecastPoints.length - 1];
      L.circleMarker([destination.latitude, destination.longitude], {
        color: "#ffb000",
        fillColor: "#ffcc66",
        fillOpacity: 0.95,
        interactive: false,
        opacity: 1,
        radius: 5,
        weight: 2,
      }).addTo(forecastLayer);
    }
  }

  function updateMap(snapshot) {
    const latLng = [snapshot.latitude, snapshot.longitude];
    marker.setLatLng(latLng);
    footprintCircle.setLatLng(latLng);
    footprintCircle.setRadius(Math.max((snapshot.footprint * 1000) / 2, 1000));
    marker.setPopupContent(renderPopup(snapshot));

    if (state.autoFollow) {
      map.panTo(latLng, { animate: true, duration: 0.8 });
    }
  }

  function updateTelemetry(snapshot, lastSnapshot) {
    const headingDegrees = lastSnapshot ? calculateBearing(lastSnapshot, snapshot) : null;
    const headingLabel = headingDegrees === null ? "--" : describeBearing(headingDegrees);
    const sectorLabel = describeSector(snapshot.latitude, snapshot.longitude);

    elements.latitudeValue.textContent = formatCoordinate(snapshot.latitude, "N", "S");
    elements.longitudeValue.textContent = formatCoordinate(snapshot.longitude, "E", "W");
    elements.altitudeValue.textContent = `${formatNumber(snapshot.altitude, 1)} km`;
    elements.velocityValue.textContent = `${formatNumber(snapshot.velocity, 0)} km/h`;
    elements.visibilityValue.textContent = sentenceCase(snapshot.visibility);
    elements.headingValue.textContent = headingLabel;
    elements.footprintValue.textContent = `${formatNumber(snapshot.footprint, 0)} km`;
    updatePathMetrics(snapshot);
    elements.positionSummary.textContent = `${formatCoordinate(
      snapshot.latitude,
      "N",
      "S"
    )} / ${formatCoordinate(snapshot.longitude, "E", "W")}`;
    elements.updatedAt.textContent = `Last update ${formatTimestamp(snapshot.timestamp)}`;

    if (elements.mapPositionValue) {
      elements.mapPositionValue.textContent = sectorLabel;
    }
    if (elements.ribbonSectorValue) {
      elements.ribbonSectorValue.textContent = sectorLabel;
    }
    if (elements.ribbonVisibilityValue) {
      elements.ribbonVisibilityValue.textContent = sentenceCase(snapshot.visibility);
    }
    if (elements.ribbonTimeValue) {
      elements.ribbonTimeValue.textContent = formatTimeOnly(snapshot.timestamp);
    }
    if (elements.sectorValue) {
      elements.sectorValue.textContent = sectorLabel;
    }
  }

  async function refreshForecast(snapshot, options) {
    if (!snapshot || state.isForecastRefreshing) {
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (!(options && options.force) && now - state.forecastUpdatedAt < FORECAST_REFRESH_SECONDS) {
      return;
    }

    state.isForecastRefreshing = true;
    state.forecastUpdatedAt = now;

    try {
      const startTimestamp = Math.max(snapshot.timestamp, now);
      const timestamps = Array.from({ length: FORECAST_POINTS }, function (_, index) {
        return String(startTimestamp + (index + 1) * FORECAST_STEP_SECONDS);
      }).join(",");

      const snapshots = await requestIss("/satellites/25544/positions", {
        timestamps,
        units: "kilometers",
      });

      state.forecast = snapshots
        .map(normalizeSnapshot)
        .filter(isValidPoint)
        .filter(function (entry) {
          return entry.timestamp > snapshot.timestamp;
        })
        .sort(function (left, right) {
          return left.timestamp - right.timestamp;
        });

      redrawPath();
      updatePathMetrics(state.latest);
    } catch (error) {
      console.error(error);
      state.forecast = [];
      redrawPath();
      updatePathMetrics(state.latest);
    } finally {
      state.isForecastRefreshing = false;
    }
  }

  function syncLocationWatchState(snapshot) {
    let evaluation = evaluateLocationWatch(state.locationProfile, snapshot, false);

    if (
      state.locationProfile &&
      evaluation.canEvaluate &&
      Number.isFinite(evaluation.distanceKm)
    ) {
      if (evaluation.inWatchRadius && !state.locationProfile.inWatchZone) {
        state.locationProfile = {
          ...state.locationProfile,
          inWatchZone: true,
          lastOverheadAt: snapshot.timestamp,
          lastOverheadDistanceKm: Math.round(evaluation.distanceKm),
        };
        saveStoredLocationProfile();
        evaluation = evaluateLocationWatch(state.locationProfile, snapshot, true);
        sendOverheadNotification(evaluation);
      } else if (!evaluation.inWatchRadius && state.locationProfile.inWatchZone) {
        state.locationProfile = {
          ...state.locationProfile,
          inWatchZone: false,
        };
        saveStoredLocationProfile();
        evaluation = evaluateLocationWatch(state.locationProfile, snapshot, false);
      }
    }

    state.locationWatch = evaluation;
    renderLocationWatchMonitor();
  }

  function renderLocationWatchMonitor() {
    const evaluation =
      state.locationWatch || evaluateLocationWatch(state.locationProfile, state.latest, false);

    elements.watchStateBadge.textContent = evaluation.badgeLabel;
    elements.watchStateBadge.className = `status-badge status-${evaluation.badgeTone}`;
    elements.watchHeadline.textContent = evaluation.headline;
    elements.watchSummary.textContent = evaluation.summary;
    elements.watchLocationValue.textContent = evaluation.locationValue;
    elements.watchDistanceValue.textContent = evaluation.distanceValue;
    elements.watchDirectionValue.textContent = evaluation.directionValue;
    elements.watchRadiusValue.textContent = evaluation.radiusValue;
    elements.watchNotificationValue.textContent = evaluation.notificationValue;

    elements.watchLogList.innerHTML = "";
    evaluation.logItems.forEach(function (item) {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      elements.watchLogList.appendChild(listItem);
    });
  }

  function evaluateLocationWatch(profile, snapshot, justTriggered) {
    if (!profile || !profile.latitude || !profile.longitude) {
      return {
        badgeLabel: "Waiting for your location",
        badgeTone: "loading",
        headline: "Track the ISS from where you are",
        summary:
          "Open Settings and save your latitude and longitude first. The app will then compare the live ISS position with your location.",
        locationValue: "No location saved",
        distanceValue: "--",
        directionValue: "--",
        radiusValue: "--",
        notificationValue: "Not armed",
        logItems: [
          "Open Settings to save your latitude and longitude.",
          "Turn on notifications if you want an overhead alert.",
          "Watch the live distance and direction update every few seconds.",
        ],
        canEvaluate: false,
      };
    }

    const locationValue = profile.label || "My location";
    const radiusKm = clampWatchRadius(profile.watchRadiusKm);

    if (!snapshot) {
      return {
        badgeLabel: "Waiting for live ISS data",
        badgeTone: "loading",
        headline: "Your location is saved",
        summary:
          "Once live telemetry arrives, the app will calculate the ISS distance and bearing from your location.",
        locationValue,
        distanceValue: "--",
        directionValue: "--",
        radiusValue: `${formatNumber(radiusKm, 0)} km`,
        notificationValue: describeNotificationState(profile),
        logItems: [
          `Saved location: ${locationValue}.`,
          `Coordinates: ${formatCoordinate(Number(profile.latitude), "N", "S")} / ${formatCoordinate(
            Number(profile.longitude),
            "E",
            "W"
          )}.`,
          "Waiting for live ISS telemetry.",
        ],
        canEvaluate: false,
      };
    }

    const latitude = parseFiniteNumber(profile.latitude);
    const longitude = parseFiniteNumber(profile.longitude);
    const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

    if (!hasCoordinates) {
      return {
        badgeLabel: "Location incomplete",
        badgeTone: "loading",
        headline: "Add coordinates to finish setup",
        summary:
          "The app needs latitude and longitude before it can calculate where the ISS is relative to you.",
        locationValue,
        distanceValue: "Needs coordinates",
        directionValue: "--",
        radiusValue: `${formatNumber(radiusKm, 0)} km`,
        notificationValue: "Not armed",
        logItems: [
          "Use Settings to fill your location from the browser or enter coordinates manually.",
          "Latitude must be between -90 and 90.",
          "Longitude must be between -180 and 180.",
        ],
        canEvaluate: false,
      };
    }

    const distanceKm = haversineDistanceKm(
      latitude,
      longitude,
      snapshot.latitude,
      snapshot.longitude
    );
    const bearingDegrees = calculateBearing(
      { latitude, longitude },
      { latitude: snapshot.latitude, longitude: snapshot.longitude }
    );
    const visibilityRadiusKm = snapshot.footprint / 2;
    const inWatchRadius = distanceKm <= radiusKm;
    const visibleNow = distanceKm <= visibilityRadiusKm;
    const formattedDistance = `${formatNumber(distanceKm, 0)} km away`;
    const directionLabel =
      bearingDegrees === null ? "--" : `${describeBearing(bearingDegrees)} from you`;

    if (inWatchRadius) {
      const notificationSent =
        justTriggered &&
        profile.notificationsEnabled &&
        "Notification" in window &&
        Notification.permission === "granted";

      return {
        badgeLabel: notificationSent
          ? "Overhead notification sent"
          : justTriggered
            ? "Overhead watch triggered"
            : "ISS is overhead",
        badgeTone: "live",
        headline: "The ISS is within your overhead watch radius",
        summary: notificationSent
          ? `A browser notification was sent because the ISS entered your watch radius and is ${formattedDistance}.`
          : justTriggered
            ? `The ISS entered your watch radius and is ${formattedDistance}.`
            : `The station is ${formattedDistance}, ${directionLabel.toLowerCase()}.`,
        locationValue,
        distanceValue: formattedDistance,
        directionValue: directionLabel,
        radiusValue: `${formatNumber(radiusKm, 0)} km`,
        notificationValue: describeNotificationState(profile),
        logItems: [
          `Your saved location is ${formatCoordinate(latitude, "N", "S")} / ${formatCoordinate(
            longitude,
            "E",
            "W"
          )}.`,
          profile.notificationsEnabled
            ? "Notifications are armed for this watch radius while the page is open."
            : "Notifications are off, but distance tracking is active.",
          profile.lastOverheadAt
            ? `Most recent overhead trigger: ${formatTimestamp(profile.lastOverheadAt)}.`
            : "This is the first overhead trigger for this location.",
        ],
        canEvaluate: true,
        distanceKm,
        inWatchRadius,
      };
    }

    if (visibleNow) {
      return {
        badgeLabel: "Visible pass nearby",
        badgeTone: "live",
        headline: "The ISS is within the broader visibility footprint",
        summary:
          "The station may be close enough for a viewing window, though it has not entered your tighter overhead alert radius.",
        locationValue,
        distanceValue: formattedDistance,
        directionValue: directionLabel,
        radiusValue: `${formatNumber(radiusKm, 0)} km`,
        notificationValue: describeNotificationState(profile),
        logItems: [
          `The ISS is ${formattedDistance}.`,
          `Look toward ${directionLabel.replace(" from you", "")}.`,
          `The broader visibility footprint is about ${formatNumber(visibilityRadiusKm, 0)} km right now.`,
        ],
        canEvaluate: true,
        distanceKm,
        inWatchRadius,
      };
    }

    return {
      badgeLabel: "Local watch active",
      badgeTone: "live",
      headline: "The app is tracking the ISS relative to you",
      summary: `No overhead alert is needed right now. The next trigger will fire when the ISS comes within ${formatNumber(
        radiusKm,
        0
      )} km of your location.`,
      locationValue,
      distanceValue: formattedDistance,
      directionValue: directionLabel,
      radiusValue: `${formatNumber(radiusKm, 0)} km`,
      notificationValue: describeNotificationState(profile),
      logItems: [
        `The ISS is ${formattedDistance}.`,
        `Look toward ${directionLabel.replace(" from you", "")}.`,
        profile.lastOverheadAt
          ? `Last overhead trigger: ${formatTimestamp(profile.lastOverheadAt)}.`
          : "No overhead trigger has fired for this location yet.",
      ],
      canEvaluate: true,
      distanceKm,
      inWatchRadius,
    };
  }

  async function requestNotificationPermission() {
    if (!("Notification" in window)) {
      setFeedback(
        elements.settingsFeedback,
        "This browser does not support desktop notifications.",
        "error"
      );
      return false;
    }

    if (Notification.permission === "granted") {
      return true;
    }

    if (Notification.permission === "denied") {
      setFeedback(
        elements.settingsFeedback,
        "Notifications are blocked for this site. Change the browser permission to enable alerts.",
        "error"
      );
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      return true;
    }

    setFeedback(
      elements.settingsFeedback,
      "Notification permission was not granted. Distance tracking will still work.",
      "warning"
    );
    return false;
  }

  function describeNotificationState(profile) {
    if (!profile || !profile.notificationsEnabled) {
      return "Off";
    }

    if (!("Notification" in window)) {
      return "Unsupported";
    }

    if (Notification.permission === "granted") {
      return "Armed while open";
    }

    if (Notification.permission === "denied") {
      return "Blocked";
    }

    return "Permission needed";
  }

  function sendOverheadNotification(evaluation) {
    if (
      !state.locationProfile ||
      !state.locationProfile.notificationsEnabled ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    try {
      new Notification("ISS overhead", {
        body: `The ISS is ${evaluation.distanceValue} from ${evaluation.locationValue}. ${evaluation.directionValue}.`,
        tag: "iss-overhead-alert",
      });
    } catch (error) {
      console.error(error);
    }
  }

  function renderPopup(snapshot) {
    return `
      <strong>International Space Station</strong><br />
      ${formatCoordinate(snapshot.latitude, "N", "S")} / ${formatCoordinate(
        snapshot.longitude,
        "E",
        "W"
      )}<br />
      Altitude ${formatNumber(snapshot.altitude, 1)} km<br />
      Velocity ${formatNumber(snapshot.velocity, 0)} km/h
    `;
  }

  function splitAtDateline(points) {
    const segments = [];
    let currentSegment = [];

    points.forEach(function (point) {
      const currentPoint = [point.latitude, point.longitude];

      if (!currentSegment.length) {
        currentSegment.push(currentPoint);
        return;
      }

      const previousPoint = currentSegment[currentSegment.length - 1];
      if (Math.abs(previousPoint[1] - currentPoint[1]) > 180) {
        segments.push(currentSegment);
        currentSegment = [currentPoint];
        return;
      }

      currentSegment.push(currentPoint);
    });

    if (currentSegment.length) {
      segments.push(currentSegment);
    }

    return segments;
  }

  function getTrailMinutes() {
    if (state.history.length < 2) {
      return 0;
    }

    const firstTimestamp = state.history[0].timestamp;
    const lastTimestamp = state.history[state.history.length - 1].timestamp;
    return Math.round((lastTimestamp - firstTimestamp) / 60);
  }

  function getForecastPathPoints(snapshot) {
    if (!snapshot) {
      return [];
    }

    const upcomingPoints = state.forecast.filter(function (entry) {
      return entry.timestamp > snapshot.timestamp;
    });

    return [snapshot].concat(upcomingPoints);
  }

  function getForecastMinutes(snapshot) {
    const forecastPoints = getForecastPathPoints(snapshot);
    if (forecastPoints.length < 2) {
      return 0;
    }

    const firstTimestamp = forecastPoints[0].timestamp;
    const lastTimestamp = forecastPoints[forecastPoints.length - 1].timestamp;
    return Math.round((lastTimestamp - firstTimestamp) / 60);
  }

  function updatePathMetrics(snapshot) {
    if (!snapshot) {
      return;
    }

    const trailMinutes = getTrailMinutes();
    const forecastMinutes = getForecastMinutes(snapshot);
    const forecastSampleCount = Math.max(getForecastPathPoints(snapshot).length - 1, 0);
    const totalSamples = state.history.length + forecastSampleCount;

    elements.sampleCountValue.textContent = String(totalSamples);
    elements.trailWindowValue.textContent =
      trailMinutes > 0 || forecastMinutes > 0
        ? `Past ${trailMinutes || "--"} min / next ${forecastMinutes || "--"} min`
        : "--";
  }

  function calculateBearing(fromPoint, toPoint) {
    const lat1 = degreesToRadians(fromPoint.latitude);
    const lat2 = degreesToRadians(toPoint.latitude);
    const deltaLon = degreesToRadians(toPoint.longitude - fromPoint.longitude);

    const y = Math.sin(deltaLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

    const bearing = (radiansToDegrees(Math.atan2(y, x)) + 360) % 360;
    return Number.isFinite(bearing) ? bearing : null;
  }

  function describeBearing(degrees) {
    if (degrees === null) {
      return "--";
    }

    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index = Math.round(degrees / 45) % directions.length;
    return `${directions[index]} ${Math.round(degrees)}°`;
  }

  function describeSector(latitude, longitude) {
    const latitudeBand =
      Math.abs(latitude) < 12
        ? "Equatorial"
        : latitude >= 0
          ? "Northern"
          : "Southern";

    let region = "ocean corridor";

    if (longitude >= 140 || longitude < -140) {
      region = "Pacific arc";
    } else if (longitude >= 85 && longitude < 140) {
      region = "Asia-Pacific lane";
    } else if (longitude >= 30 && longitude < 85) {
      region = "Indian Ocean lane";
    } else if (longitude >= -15 && longitude < 30) {
      region = "Africa-Europe pass";
    } else if (longitude >= -75 && longitude < -15) {
      region = "Atlantic pass";
    } else {
      region = "Americas pass";
    }

    return `${latitudeBand} ${region}`;
  }

  function createEmptyLocationProfile() {
    return {
      label: "",
      address: "",
      latitude: "",
      longitude: "",
      watchRadiusKm: DEFAULT_WATCH_RADIUS_KM,
      notificationsEnabled: false,
      inWatchZone: false,
      lastOverheadAt: null,
      lastOverheadDistanceKm: null,
    };
  }

  function normalizeSnapshot(snapshot) {
    return {
      altitude: Number(snapshot.altitude),
      footprint: Number(snapshot.footprint),
      latitude: normalizeLongitudeNumber(Number(snapshot.latitude), true),
      longitude: normalizeLongitudeNumber(Number(snapshot.longitude), false),
      timestamp: Number(snapshot.timestamp),
      velocity: Number(snapshot.velocity),
      visibility: snapshot.visibility || "unknown",
    };
  }

  function normalizeLongitudeNumber(value, clampLatitude) {
    if (!Number.isFinite(value)) {
      return value;
    }

    if (clampLatitude) {
      return Math.max(-90, Math.min(90, value));
    }

    return ((((value + 180) % 360) + 360) % 360) - 180;
  }

  function isValidPoint(snapshot) {
    return (
      Number.isFinite(snapshot.latitude) &&
      Number.isFinite(snapshot.longitude) &&
      Number.isFinite(snapshot.altitude) &&
      Number.isFinite(snapshot.velocity) &&
      Number.isFinite(snapshot.timestamp)
    );
  }

  function formatCoordinate(value, positiveLabel, negativeLabel) {
    if (!Number.isFinite(value)) {
      return "--";
    }

    const suffix = value >= 0 ? positiveLabel : negativeLabel;
    return `${Math.abs(value).toFixed(2)}° ${suffix}`;
  }

  function formatNumber(value, digits) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(value);
  }

  function formatTimestamp(timestamp) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(timestamp * 1000));
  }

  function formatTimeOnly(timestamp) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(timestamp * 1000));
  }

  function sentenceCase(value) {
    if (!value) {
      return "--";
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function setStatus(label, tone) {
    elements.statusBadge.textContent = label;
    elements.statusBadge.className = `status-badge status-${tone}`;
  }

  function setFeedback(element, message, tone) {
    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.className = "location-feedback";
    if (tone) {
      element.classList.add(`is-${tone}`);
    }
  }

  function clampWatchRadius(value) {
    const numericValue = parseFiniteNumber(value);
    if (!Number.isFinite(numericValue)) {
      return DEFAULT_WATCH_RADIUS_KM;
    }

    return Math.max(50, Math.min(2500, Math.round(numericValue)));
  }

  function parseFiniteNumber(value) {
    if (value === "" || value === null || value === undefined) {
      return NaN;
    }

    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : NaN;
  }

  function sameCoordinate(left, right) {
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      return false;
    }

    return Math.abs(left - right) < 0.0001;
  }

  function haversineDistanceKm(latitudeA, longitudeA, latitudeB, longitudeB) {
    const earthRadiusKm = 6371;
    const deltaLatitude = degreesToRadians(latitudeB - latitudeA);
    const deltaLongitude = degreesToRadians(longitudeB - longitudeA);
    const startLatitude = degreesToRadians(latitudeA);
    const endLatitude = degreesToRadians(latitudeB);

    const haversine =
      Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
      Math.cos(startLatitude) *
        Math.cos(endLatitude) *
        Math.sin(deltaLongitude / 2) *
        Math.sin(deltaLongitude / 2);

    const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    return earthRadiusKm * arc;
  }

  function loadStoredLocationProfile() {
    try {
      const rawValue = window.localStorage.getItem(STORAGE_KEY);
      if (!rawValue) {
        return createEmptyLocationProfile();
      }

      const parsedValue = JSON.parse(rawValue);
      if (!parsedValue || typeof parsedValue !== "object") {
        return createEmptyLocationProfile();
      }

      return {
        ...createEmptyLocationProfile(),
        ...parsedValue,
      };
    } catch {
      return createEmptyLocationProfile();
    }
  }

  function saveStoredLocationProfile() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.locationProfile));
  }

  function degreesToRadians(value) {
    return (value * Math.PI) / 180;
  }

  function radiansToDegrees(value) {
    return (value * 180) / Math.PI;
  }
})();
