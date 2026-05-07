(function () {
  const CREW_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
  const CREW_API_PATH = "/api/v1/crew";
  const CREW_FEED_URL =
    "https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json";

  const fallbackCrewFeed = {
    iss_expedition: 74,
    bundledAt: "2026-05-01",
    people: [
      {
        name: "Sergey Kud-Sverchkov",
        country: "Russia",
        agency: "Roscosmos",
        position: "Commander",
        spacecraft: "Soyuz MS-28",
        iss: true,
        days_in_space: 189,
        url: "https://en.wikipedia.org/wiki/Sergey_Kud-Sverchkov",
        image:
          "https://upload.wikimedia.org/wikipedia/commons/3/37/Roscosmos_cosmonaut_and_Soyuz_MS-27_Backup_Commander_Sergey_Kud-Sverchkov_%28jsc2025e033531%29.jpg",
      },
      {
        name: "Chris Williams",
        country: "United States",
        agency: "NASA",
        position: "Flight Engineer",
        spacecraft: "Soyuz MS-28",
        iss: true,
        days_in_space: 0,
        url: "https://en.wikipedia.org/wiki/Christopher_Williams_(astronaut)",
        image: "https://upload.wikimedia.org/wikipedia/commons/5/50/Christopher_Williams_February_2024.jpg",
      },
      {
        name: "Sergey Mikaev",
        country: "Russia",
        agency: "Roscosmos",
        position: "Flight Engineer",
        spacecraft: "Soyuz MS-28",
        iss: true,
        days_in_space: 0,
        url: "https://en.wikipedia.org/wiki/Sergei_Mikayev",
        image:
          "https://upload.wikimedia.org/wikipedia/commons/a/a8/Roscosmos_cosmonaut_Sergey_Mikaev_poses_for_a_portrait_at_NASA%27s_Johnson_Space_Center_%28jsc2024e077064_alt%29.jpg",
      },
      {
        name: "Jessica Meir",
        country: "United States",
        agency: "NASA",
        position: "Flight Engineer",
        spacecraft: "Crew-12 Dragon",
        iss: true,
        days_in_space: 204,
        url: "https://en.wikipedia.org/wiki/Jessica_Meir",
        image: "https://upload.wikimedia.org/wikipedia/commons/4/44/Jessica_Meir_official_portrait_in_an_EMU.jpg",
      },
      {
        name: "Jack Hathaway",
        country: "United States",
        agency: "NASA",
        position: "Flight Engineer",
        spacecraft: "Crew-12 Dragon",
        iss: true,
        days_in_space: 0,
        url: "https://en.wikipedia.org/wiki/Jack_Hathaway",
        image: "https://upload.wikimedia.org/wikipedia/commons/8/84/Jack_Hathaway_2024.jpg",
      },
      {
        name: "Sophie Adenot",
        country: "France",
        agency: "ESA",
        position: "Flight Engineer",
        spacecraft: "Crew-12 Dragon",
        iss: true,
        days_in_space: 0,
        url: "https://en.wikipedia.org/wiki/Sophie_Adenot",
        image:
          "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Official_portrait_of_ESA_astronaut_Sophie_Adenot_%28jsc2025e058846_alt%29.jpg/500px-Official_portrait_of_ESA_astronaut_Sophie_Adenot_%28jsc2025e058846_alt%29.jpg",
      },
      {
        name: "Andrey Fedyaev",
        country: "Russia",
        agency: "Roscosmos",
        position: "Flight Engineer",
        spacecraft: "Crew-12 Dragon",
        iss: true,
        days_in_space: 0,
        url: "https://en.wikipedia.org/wiki/Andrey_Fedyaev",
        image: "https://upload.wikimedia.org/wikipedia/commons/1/1d/SpaceX_crew_6_image_5.png",
      },
    ],
  };

  const profileSummaries = {
    "sergey kud-sverchkov":
      "A veteran Russian cosmonaut and rocket engineer, Kud-Sverchkov worked at RSC Energia before joining the cosmonaut corps. This is his second long-duration station mission.",
    "christoper williams":
      "Williams is a physicist and board-certified medical physicist whose research has included astrophysics and image-guided cancer treatment. Expedition 74 is his first spaceflight.",
    "chris williams":
      "Williams is a physicist and board-certified medical physicist whose research has included astrophysics and image-guided cancer treatment. Expedition 74 is his first spaceflight.",
    "christopher williams":
      "Williams is a physicist and board-certified medical physicist whose research has included astrophysics and image-guided cancer treatment. Expedition 74 is his first spaceflight.",
    "sergey mikayev":
      "Mikaev is a former Russian military pilot selected for cosmonaut training in 2018. He launched on Soyuz MS-28 for his first mission aboard the International Space Station.",
    "sergey mikaev":
      "Mikaev is a former Russian military pilot selected for cosmonaut training in 2018. He launched on Soyuz MS-28 for his first mission aboard the International Space Station.",
    "jessica meir":
      "Meir is a biologist and physiologist who previously served on Expeditions 61 and 62. She returned to the station as commander of NASA's SpaceX Crew-12 mission.",
    "jack hathaway":
      "Hathaway is a U.S. Navy captain, test pilot, and Crew-12 pilot with more than 2,500 flight hours. Expedition 74 is his first spaceflight.",
    "sophie adenot":
      "Adenot is a French engineer, helicopter experimental test pilot, and ESA astronaut. Her epsilon mission on Crew-12 is her first spaceflight.",
    "andrey fedyaev":
      "Fedyaev is a test cosmonaut and former military pilot. Crew-12 is his second long-duration stay on the station after serving on NASA's SpaceX Crew-6 mission in 2023.",
  };

  const displayNameCorrections = {
    "christoper williams": "Chris Williams",
    "christopher williams": "Chris Williams",
    "sergey mikayev": "Sergey Mikaev",
  };

  const elements = {
    crewCountValue: document.getElementById("crewCountValue"),
    crewGrid: document.getElementById("crewGrid"),
    crewSourceValue: document.getElementById("crewSourceValue"),
    crewStatusBadge: document.getElementById("crewStatusBadge"),
    crewUpdatedValue: document.getElementById("crewUpdatedValue"),
  };

  loadCrew();
  window.setInterval(loadCrew, CREW_REFRESH_INTERVAL_MS);

  async function loadCrew() {
    setCrewStatus("Loading crew", "loading");

    try {
      const feed = await requestCrewFeed();
      renderCrew(feed, { isFallback: false });
    } catch (error) {
      console.error(error);
      renderCrew(fallbackCrewFeed, { isFallback: true });
    }
  }

  async function requestCrewFeed() {
    const candidates = getCrewFeedCandidates();
    let lastError = null;

    for (const url of candidates) {
      try {
        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Crew feed request failed with ${response.status}.`);
        }

        return response.json();
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Unable to reach the crew feed.");
  }

  function getCrewFeedCandidates() {
    const candidates = [];
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
      candidates.push(`${window.location.origin}${CREW_API_PATH}`);
    }
    candidates.push(CREW_FEED_URL);
    return candidates;
  }

  function renderCrew(feed, options) {
    const crew = getIssCrew(feed);

    elements.crewGrid.innerHTML = "";
    crew.forEach(function (person) {
      elements.crewGrid.appendChild(createCrewCard(person, feed));
    });

    elements.crewCountValue.textContent = String(crew.length || "--");
    elements.crewUpdatedValue.textContent = options.isFallback
      ? `Using bundled roster from ${formatFallbackDate(feed.bundledAt)}`
      : `Updated ${formatTime(new Date())}`;

    setCrewStatus(
      options.isFallback ? "Using fallback roster" : "Live roster loaded",
      options.isFallback ? "loading" : "live"
    );

    elements.crewSourceValue.textContent = options.isFallback
      ? "The live crew feed could not be reached, so the page is showing its bundled fallback roster."
      : `Live feed loaded for Expedition ${feed.iss_expedition || "--"}. This page refreshes automatically every 15 minutes while open.`;
  }

  function getIssCrew(feed) {
    if (!feed || !Array.isArray(feed.people)) {
      return [];
    }

    return feed.people
      .filter(function (person) {
        return person && person.iss === true;
      })
      .map(normalizePerson);
  }

  function normalizePerson(person) {
    const key = normalizeKey(person.name);
    return {
      ...person,
      name: displayNameCorrections[key] || person.name,
      lookupKey: key,
    };
  }

  function createCrewCard(person, feed) {
    const article = document.createElement("article");
    article.className = person.position === "Commander" ? "crew-card crew-card-command" : "crew-card";

    const media = document.createElement("div");
    media.className = "crew-card-media";

    if (person.image) {
      const image = document.createElement("img");
      image.src = person.image;
      image.alt = `${person.name} portrait`;
      image.loading = "lazy";
      media.appendChild(image);
    } else {
      const fallbackAvatar = document.createElement("span");
      fallbackAvatar.className = "crew-avatar crew-avatar-large";
      fallbackAvatar.setAttribute("aria-hidden", "true");
      fallbackAvatar.textContent = getInitials(person.name);
      media.appendChild(fallbackAvatar);
    }

    const content = document.createElement("div");
    content.className = "crew-card-content";

    const top = document.createElement("div");
    top.className = "crew-card-top";

    const avatar = document.createElement("span");
    avatar.className = "crew-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = getInitials(person.name);

    const headingGroup = document.createElement("div");
    const name = document.createElement("h3");
    name.textContent = person.name || "Crew member";
    const role = document.createElement("p");
    role.className = "crew-role";
    role.textContent = [person.agency, person.position].filter(Boolean).join(" / ") || "ISS crew";
    headingGroup.append(name, role);
    top.append(avatar, headingGroup);

    const bio = document.createElement("p");
    bio.className = "crew-bio";
    bio.textContent = getBio(person, feed);

    const tags = document.createElement("div");
    tags.className = "crew-tags";
    tags.setAttribute("aria-label", `${person.name} mission details`);
    [
      `Expedition ${feed.iss_expedition || "--"}`,
      person.spacecraft,
      person.country,
      getExperienceLabel(person.days_in_space),
    ]
      .filter(Boolean)
      .forEach(function (label) {
        const tag = document.createElement("span");
        tag.textContent = label;
        tags.appendChild(tag);
      });

    content.append(top, bio, tags);

    if (person.url) {
      const link = document.createElement("a");
      link.className = "crew-profile-link";
      link.href = person.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Profile source";
      content.appendChild(link);
    }

    article.append(media, content);
    return article;
  }

  function getBio(person, feed) {
    const knownSummary = profileSummaries[person.lookupKey] || profileSummaries[normalizeKey(person.name)];
    if (knownSummary) {
      return knownSummary;
    }

    const country = person.country ? ` from ${person.country}` : "";
    const agency = person.agency ? `${person.agency} ` : "";
    const position = person.position || "crew member";
    const spacecraft = person.spacecraft ? `, launched on ${person.spacecraft}` : "";
    const expedition = feed.iss_expedition ? ` during Expedition ${feed.iss_expedition}` : "";

    return `${person.name} is a ${agency}${position}${country}${spacecraft}${expedition}. Open the profile source for a fuller biography.`;
  }

  function getExperienceLabel(daysInSpace) {
    const days = Number(daysInSpace);
    if (!Number.isFinite(days) || days <= 0) {
      return "First listed mission";
    }

    return `${formatNumber(days, 0)} prior days in space`;
  }

  function getInitials(name) {
    if (!name) {
      return "ISS";
    }

    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) {
        return part.charAt(0).toUpperCase();
      })
      .join("");
  }

  function normalizeKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function formatNumber(value, digits) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(value);
  }

  function formatTime(date) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function formatFallbackDate(value) {
    if (!value) {
      return "the bundled copy";
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date(`${value}T00:00:00`));
  }

  function setCrewStatus(label, tone) {
    elements.crewStatusBadge.textContent = label;
    elements.crewStatusBadge.className = `status-badge status-${tone}`;
  }
})();
