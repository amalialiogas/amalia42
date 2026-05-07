(function () {
  const LANGUAGE_STORAGE_KEY = "issOverhead.language";
  const THEME_STORAGE_KEY = "issOverhead.theme";
  const GOOGLE_TRANSLATE_SCRIPT =
    "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  const languages = [
    { code: "en", label: "English" },
    { code: "fr", label: "French" },
    { code: "es", label: "Spanish" },
    { code: "zh-CN", label: "Mandarin" },
    { code: "it", label: "Italian" },
    { code: "el", label: "Greek" },
  ];
  const themes = [
    { code: "day", label: "Daytime" },
    { code: "night", label: "Night" },
  ];

  let translateReady = false;
  let pendingLanguage = getStoredLanguage();
  let statusElement = null;
  let languageSelect = null;
  let themeSelect = null;

  applyTheme(getStoredTheme());
  initializeToolbar();
  initializeGoogleTranslate();

  function initializeToolbar() {
    const tabBar = document.querySelector(".page-tabs");
    if (!tabBar || document.querySelector(".language-toolbar")) {
      return;
    }

    const toolbar = document.createElement("section");
    toolbar.className = "language-toolbar";
    toolbar.setAttribute("aria-label", "Page options");

    const languageControl = createSelectControl(
      "Language",
      "languageSelect",
      languages,
      pendingLanguage
    );
    languageSelect = languageControl.select;
    languageSelect.addEventListener("change", function () {
      setLanguage(languageSelect.value);
    });

    const themeControl = createSelectControl("View", "themeSelect", themes, getStoredTheme());
    themeSelect = themeControl.select;
    themeSelect.addEventListener("change", function () {
      setTheme(themeSelect.value);
    });

    statusElement = document.createElement("p");
    statusElement.className = "language-status";
    statusElement.setAttribute("aria-live", "polite");
    statusElement.textContent = "Machine translation available";

    toolbar.append(languageControl.wrapper, themeControl.wrapper, statusElement);
    tabBar.insertAdjacentElement("afterend", toolbar);
    updateLanguageSelect(pendingLanguage);
  }

  function createSelectControl(labelText, selectId, options, selectedValue) {
    const wrapper = document.createElement("label");
    wrapper.className = "toolbar-select-control";
    wrapper.setAttribute("for", selectId);

    const label = document.createElement("span");
    label.className = "toolbar-select-label";
    label.textContent = labelText;

    const select = document.createElement("select");
    select.id = selectId;
    select.className = "toolbar-select";
    options.forEach(function (option) {
      const optionElement = document.createElement("option");
      optionElement.value = option.code;
      optionElement.textContent = option.label;
      select.appendChild(optionElement);
    });
    select.value = selectedValue;

    wrapper.append(label, select);
    return { select, wrapper };
  }

  function initializeGoogleTranslate() {
    const widget = document.createElement("div");
    widget.id = "google_translate_element";
    widget.hidden = true;
    document.body.appendChild(widget);

    window.googleTranslateElementInit = function () {
      translateReady = true;
      new window.google.translate.TranslateElement(
        {
          autoDisplay: false,
          includedLanguages: "en,fr,es,zh-CN,it,el",
          pageLanguage: "en",
        },
        "google_translate_element"
      );
      applyLanguageWhenReady(pendingLanguage);
    };

    const script = document.createElement("script");
    script.src = GOOGLE_TRANSLATE_SCRIPT;
    script.async = true;
    script.onerror = function () {
      setStatus("Translation unavailable");
    };
    document.head.appendChild(script);
  }

  function setLanguage(language) {
    pendingLanguage = language;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
    updateLanguageSelect(language);
    setStatus(`Switching to ${getLanguageLabel(language)}`);
    applyLanguageWhenReady(language);
  }

  function setTheme(theme) {
    const nextTheme = themes.some(function (item) {
      return item.code === theme;
    })
      ? theme
      : "day";
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
    if (themeSelect) {
      themeSelect.value = nextTheme;
    }
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme === "night" ? "night" : "day";
  }

  function applyLanguageWhenReady(language) {
    if (!translateReady && window.google && window.google.translate) {
      translateReady = true;
    }

    setTranslateCookie(language);
    let attempts = 0;
    const interval = window.setInterval(function () {
      attempts += 1;
      const select = document.querySelector(".goog-te-combo");

      if (select) {
        window.clearInterval(interval);
        applySelectLanguage(select, language);
        setStatus(`${getLanguageLabel(language)} selected`);
        return;
      }

      if (attempts >= 30) {
        window.clearInterval(interval);
        setStatus("Translation still loading");
      }
    }, 200);
  }

  function applySelectLanguage(select, language) {
    const values = Array.from(select.options).map(function (option) {
      return option.value;
    });
    const targetValue = values.includes(language) ? language : language === "en" ? "" : language;
    select.value = targetValue;
    select.dispatchEvent(new Event("change"));
  }

  function updateLanguageSelect(language) {
    if (languageSelect) {
      languageSelect.value = language;
    }
  }

  function setStatus(message) {
    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  function setTranslateCookie(language) {
    const cookieValue = language === "en" ? "/en/en" : `/en/${language}`;
    const hostname = window.location.hostname;
    document.cookie = `googtrans=${cookieValue}; path=/`;
    if (
      hostname &&
      hostname !== "localhost" &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(hostname) &&
      !hostname.includes(":")
    ) {
      document.cookie = `googtrans=${cookieValue}; domain=${hostname}; path=/`;
    }
  }

  function getStoredLanguage() {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return languages.some(function (language) {
      return language.code === storedLanguage;
    })
      ? storedLanguage
      : "en";
  }

  function getStoredTheme() {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return themes.some(function (theme) {
      return theme.code === storedTheme;
    })
      ? storedTheme
      : "day";
  }

  function getLanguageLabel(languageCode) {
    const language = languages.find(function (item) {
      return item.code === languageCode;
    });
    return language ? language.label : "English";
  }
})();
