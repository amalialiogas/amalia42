(function () {
  const DEFAULT_WATCH_RADIUS_KM = 550;
  const STORAGE_KEY = "issOverhead.localViewerProfile";

  const localApiBase =
    window.location.protocol === "http:" || window.location.protocol === "https:"
      ? `${window.location.origin}/api/v1`
      : null;
  const geocodeApiUrl = localApiBase ? `${localApiBase}/geocode` : null;

  const elements = {
    findAddressButton: document.getElementById("findAddressButton"),
    locationAddressInput: document.getElementById("locationAddressInput"),
    locationLabelInput: document.getElementById("locationLabelInput"),
    locationLatitudeInput: document.getElementById("locationLatitudeInput"),
    locationLongitudeInput: document.getElementById("locationLongitudeInput"),
    locationRadiusInput: document.getElementById("locationRadiusInput"),
    locationSettingsForm: document.getElementById("locationSettingsForm"),
    notifyEnabledInput: document.getElementById("notifyEnabledInput"),
    savedCoordinatesValue: document.getElementById("savedCoordinatesValue"),
    savedNotificationValue: document.getElementById("savedNotificationValue"),
    savedRadiusValue: document.getElementById("savedRadiusValue"),
    savedWatchSummary: document.getElementById("savedWatchSummary"),
    settingsFeedback: document.getElementById("settingsFeedback"),
    settingsSavedLabelValue: document.getElementById("settingsSavedLabelValue"),
    settingsSavedMetaValue: document.getElementById("settingsSavedMetaValue"),
    useCurrentLocationButton: document.getElementById("useCurrentLocationButton"),
  };

  const state = {
    locationProfile: loadStoredLocationProfile(),
  };

  renderLocationSettingsForm();
  renderSavedWatchSummary();

  if (elements.locationSettingsForm) {
    elements.locationSettingsForm.addEventListener("submit", handleLocationSettingsSubmit);
  }

  if (elements.useCurrentLocationButton) {
    elements.useCurrentLocationButton.addEventListener("click", handleUseCurrentLocationClick);
  }

  if (elements.findAddressButton) {
    elements.findAddressButton.addEventListener("click", handleFindAddressClick);
  }

  function renderLocationSettingsForm() {
    const profile = state.locationProfile || createEmptyLocationProfile();

    elements.locationLabelInput.value = profile.label || "";
    elements.locationAddressInput.value = profile.address || "";
    elements.locationAddressInput.dataset.geocodedAddress = profile.address || "";
    elements.locationLatitudeInput.value = profile.latitude || "";
    elements.locationLongitudeInput.value = profile.longitude || "";
    elements.locationRadiusInput.value = clampWatchRadius(profile.watchRadiusKm);
    elements.notifyEnabledInput.checked = Boolean(profile.notificationsEnabled);
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

    elements.notifyEnabledInput.checked = notificationsEnabled;
    saveStoredLocationProfile();
    renderSavedWatchSummary();
    setFeedback(
      elements.settingsFeedback,
      notificationsEnabled
        ? "Watch settings saved. Alerts are armed while Mission Control is open."
        : "Watch settings saved. Distance and direction will update on Mission Control.",
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
        setFeedback(elements.settingsFeedback, message, "error");
      },
      {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000,
        timeout: 10000,
      }
    );
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

  function renderSavedWatchSummary() {
    const profile = state.locationProfile || createEmptyLocationProfile();
    const latitude = parseFiniteNumber(profile.latitude);
    const longitude = parseFiniteNumber(profile.longitude);
    const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
    const label = profile.label || "My location";
    const radiusKm = clampWatchRadius(profile.watchRadiusKm);

    elements.settingsSavedLabelValue.textContent = hasCoordinates ? label : "Not set";
    elements.settingsSavedMetaValue.textContent = hasCoordinates
      ? `${formatCoordinate(latitude, "N", "S")} / ${formatCoordinate(longitude, "E", "W")}`
      : "Add a location below";
    elements.savedWatchSummary.textContent = hasCoordinates
      ? `${label} is saved as the watch point for Mission Control.`
      : "No watch point has been saved yet.";
    elements.savedCoordinatesValue.textContent = hasCoordinates
      ? `${formatCoordinate(latitude, "N", "S")} / ${formatCoordinate(longitude, "E", "W")}`
      : "--";
    elements.savedRadiusValue.textContent = hasCoordinates ? `${formatNumber(radiusKm, 0)} km` : "--";
    elements.savedNotificationValue.textContent = describeNotificationState(profile);
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
})();
