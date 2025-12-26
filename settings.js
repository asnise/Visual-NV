let appSettings = {
  theme: "light",
  uiScale: 1,
  stageBackground: "white",
  transitions: true,
  hwAccel: true,
};

function loadSettings() {
  const stored = localStorage.getItem("vnEditorSettings");
  if (stored) {
    try {
      appSettings = { ...appSettings, ...JSON.parse(stored) };
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }
  applyEffects();
}

function openSettingsModal() {
  document.getElementById("settingTheme").value = appSettings.theme;
  document.getElementById("settingUIScale").value = appSettings.uiScale;
  document.getElementById("settingStageBackground").value =
    appSettings.stageBackground;
  document.getElementById("settingHWAccel").checked = appSettings.hwAccel;
  document.getElementById("settingTransitions").checked =
    appSettings.transitions;

  openModal("settingsModal");
}

function saveAndApplySettings() {
  appSettings.theme = document.getElementById("settingTheme").value;
  appSettings.uiScale = parseFloat(
    document.getElementById("settingUIScale").value,
  );
  appSettings.stageBackground = document.getElementById(
    "settingStageBackground",
  ).value;
  appSettings.hwAccel = document.getElementById("settingHWAccel").checked;
  appSettings.transitions =
    document.getElementById("settingTransitions").checked;

  try {
    localStorage.setItem("vnEditorSettings", JSON.stringify(appSettings));
  } catch (e) {
    console.error("Failed to save settings:", e);
  }

  applyEffects();
  closeModal("settingsModal");
}

function applyEffects() {
  const root = document.documentElement;

  if (appSettings.theme === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }

  document.body.style.transform = `scale(${appSettings.uiScale})`;
  document.body.style.transformOrigin = "top center";
  document.body.style.height = `${100 / appSettings.uiScale}vh`;
  document.body.style.width = `${100 / appSettings.uiScale}vw`;

  const stage = document.getElementById("visualStage");
  if (stage) {
    if (appSettings.stageBackground === "white") {
      stage.style.backgroundColor = "white";
    } else if (appSettings.stageBackground === "black") {
      stage.style.backgroundColor = "black";
    } else if (appSettings.stageBackground === "checker") {
      const isDark = appSettings.theme === "dark";
      const color1 = isDark ? "#334155" : "#e2e8f0";
      const color2 = isDark ? "#1e293b" : "#ffffff";
      stage.style.background = `repeating-conic-gradient(${color1} 0% 25%, ${color2} 0% 50%) 50% / 20px 20px`;
    }
  }

  if (appSettings.hwAccel) {
    document.body.style.backfaceVisibility = "hidden";
    document.body.style.perspective = "1000px";
  } else {
    document.body.style.backfaceVisibility = "";
    document.body.style.perspective = "";
  }

  if (!appSettings.transitions) {
    if (!document.getElementById("no-transitions-style")) {
      const style = document.createElement("style");
      style.id = "no-transitions-style";
      style.textContent = `* { transition: none !important; animation: none !important; }`;
      document.head.appendChild(style);
    }
    if (el) el.remove();
  }

  if (typeof renderStage === "function") {
    renderStage();
  }
}

function resetSettings() {
  if (confirm("Reset all settings to default values?")) {
    appSettings = {
      theme: "light",
      uiScale: 1,
      stageBackground: "white",
      transitions: true,
      hwAccel: true,
    };
    try {
      localStorage.removeItem("vnEditorSettings");
    } catch (e) {}

    openSettingsModal();
    applyEffects();
    if (typeof showToast === "function") {
      showToast("Settings reset to defaults", "success");
    }
  }
}

function initSettingsModal() {
  const navItems = document.querySelectorAll(".settings-nav-item");
  const panels = document.querySelectorAll(".settings-panel");

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const tab = item.getAttribute("data-tab");

      navItems.forEach((n) => n.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));

      item.classList.add("active");
      document.getElementById(`settings-${tab}`).classList.add("active");
    });
  });

  loadSettings();
}

document.addEventListener("DOMContentLoaded", initSettingsModal);
