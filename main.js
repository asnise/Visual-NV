let project = {
  assets: {
    backgrounds: [],
  },
  characters: [
    {
      id: "c1",
      name: "Hiro",
      color: "#60a5fa",
      bodies: [
        {
          name: "uniform",
          color: "#60a5fa",
          url: null,
          fileName: null,
        },
      ],
      faces: [
        {
          name: "smile",
          x: 50,
          y: 20,
          scale: 1.0,
          url: null,
          fileName: null,
        },
      ],
    },
  ],
  chapters: [
    {
      id: 1,
      title: "Episode 1",
      frames: [
        {
          id: 100,
          text: {
            EN: "Welcome! Drag characters to the slots.",
            TH: "ยินดีต้อนรับ! ลากตัวละครไปยังช่องว่าง",
          },
          speakerId: "",
          background: "none",
          slots: [null, null, null, null],
        },
      ],
    },
  ],
};

const VN_LOCAL_PROJECT_KEY = "vnEditorProject_v1";
const VN_LOCAL_PROJECT_VERSION = 1;

let editorLanguage = "EN";
let supportedLanguages = ["EN", "TH", "JP", "CN", "KR"];

let __saveTimer = null;

async function saveProjectData(reason = "") {
  try {
    const payload = {
      v: VN_LOCAL_PROJECT_VERSION,
      savedAt: Date.now(),
      reason,
      data: {
        project,
        ui: {
          activeChapterId,
          activeFrameIndex,
          selectedSlotIndex,
          activeFilmstripTab,
          stageView,
          editorState,
          editorLanguage,
        },
      },
    };
    // Use IndexedDB for storage
    await ProjectStore.saveProject(payload);
    // Optional: console.log("Saved to IndexedDB:", reason);
  } catch (err) {
    console.error("Save failed:", err);
    if (typeof showToast === "function") showToast("Save Failed: " + err.message, "error");
  }
}

function scheduleAutoSave(reason = "") {
  if (__saveTimer) clearTimeout(__saveTimer);
  __saveTimer = setTimeout(() => {
    saveProjectData(reason);
  }, 2000); // Increase debounce to 2s
}

try {
  window.scheduleAutoSave = scheduleAutoSave;
} catch (e) { }

async function restoreProjectData() {
  try {
    // 1. Try Loading from IndexedDB (Preferred)
    let payload = await ProjectStore.loadProject();

    // 2. Migration: If no DB data, check LocalStorage
    if (!payload) {
      const raw = localStorage.getItem(VN_LOCAL_PROJECT_KEY);
      if (raw) {
        console.log("Migrating data from LocalStorage to IndexedDB...");
        try {
          payload = JSON.parse(raw);
          // Save to DB immediately
          await ProjectStore.saveProject(payload);
          // Clear LS to free up space (optional, but good practice if migration successful)
          // localStorage.removeItem(VN_LOCAL_PROJECT_KEY); 
        } catch (e) { console.error("Migration parse error", e); }
      }
    }

    if (!payload || payload.v !== VN_LOCAL_PROJECT_VERSION) return false;
    if (!payload.data || !payload.data.project) return false;

    project = payload.data.project;

    // --- START ADDITION: Restore Languages ---
    if (Array.isArray(project.languages)) {
      supportedLanguages = project.languages;
    }
    // --- END ADDITION ---

    // Ensure Assets Exist
    if (!project.assets.bgm) project.assets.bgm = [];
    if (!project.assets.voice) project.assets.voice = [];

    const ui = payload.data.ui || {};
    if (typeof ui.activeChapterId === "number")
      activeChapterId = ui.activeChapterId;
    if (typeof ui.activeFrameIndex === "number")
      activeFrameIndex = ui.activeFrameIndex;
    if (typeof ui.selectedSlotIndex === "number")
      selectedSlotIndex = ui.selectedSlotIndex;
    if (typeof ui.activeFilmstripTab === "string")
      activeFilmstripTab = ui.activeFilmstripTab;
    if (typeof ui.editorLanguage === "string")
      editorLanguage = ui.editorLanguage;

    if (ui.stageView && typeof ui.stageView === "object")
      stageView = { ...stageView, ...ui.stageView };
    if (ui.editorState && typeof ui.editorState === "object")
      editorState = { ...editorState, ...ui.editorState };

    return true;
  } catch (e) {
    console.error("Restore failed:", e);
    return false;
  }
}

let activeChapterId = 1;
let activeFrameIndex = 0;
let selectedSlotIndex = -1;
let editingCharId = null;
let editingOverlayIdx = -1;
let frameClipboard = null;
let activeFilmstripTab = "main";
let selectedFrameIndices = new Set();

let isDragging = false;
let isResizing = false;
let currentHandle = null;
let startX, startY, startLeft, startTop, startWidth, startHeight;

let editorState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  isPanning: false,
  startX: 0,
  startY: 0,
};

let stageView = {
  scale: 1,
  x: 0,
  y: 0,
  isPanning: false,
  startX: 0,
  startY: 0,
};

const OVERLAY_BASE_SIZE = 60;

function getChapter() {
  return (
    project.chapters.find((c) => c.id === activeChapterId) ||
    project.chapters[0]
  );
}

function getFrame() {
  const ch = getChapter();
  const f = ch ? ch.frames[activeFrameIndex] : null;
  if (f) {
    if (!Array.isArray(f.slots)) f.slots = [null, null, null, null, null];
    while (f.slots.length < 5) f.slots.push(null);
  }
  return f;
}

function getLocalizedFrameText(frame) {
  if (!frame) return "";
  if (typeof frame.text === "string") return frame.text;
  if (!frame.text) return "";
  return frame.text[editorLanguage] || frame.text["EN"] || "";
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createFrameFromTemplate(templateFrame) {
  const clone = deepClone(templateFrame);
  clone.id = Date.now() + Math.floor(Math.random() * 1000);
  if (!Array.isArray(clone.slots)) clone.slots = [null, null, null, null, null];
  clone.slots = clone.slots.slice(0, 5);
  while (clone.slots.length < 5) clone.slots.push(null);
  clone.slots.forEach((s) => {
    if (s) s.anim = "none";
  });
  if (!clone.choices) clone.choices = [];
  if (!clone.attributes) clone.attributes = {};
  if (!clone.frameType) clone.frameType = "main";
  if (clone.frameType === "instant" && !clone.returnToFrame) {
    clone.returnToFrame = "end";
  }

  if (typeof clone.text === "string") {
    clone.text = { EN: clone.text };
  } else if (!clone.text) {
    clone.text = { EN: "" };
  }

  return clone;
}

function reorderFrames(fromIdx, toIdx) {
  const chapter = getChapter();
  if (!chapter || fromIdx === toIdx) return;
  const frames = chapter.frames;
  const moved = frames.splice(fromIdx, 1)[0];
  const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx;
  frames.splice(insertAt, 0, moved);
  if (activeFrameIndex === fromIdx) activeFrameIndex = insertAt;
  else if (
    fromIdx < toIdx &&
    activeFrameIndex > fromIdx &&
    activeFrameIndex <= toIdx
  )
    activeFrameIndex--;
  else if (
    toIdx < fromIdx &&
    activeFrameIndex >= toIdx &&
    activeFrameIndex < fromIdx
  )
    activeFrameIndex++;
  switchFrame(activeFrameIndex);
}

function copyFrameAt(idx) {
  frameClipboard = deepClone(getChapter().frames[idx]);
}

function removeFrameAt(idx) {
  const chapter = getChapter();
  if (chapter.frames.length <= 1) return alert("Cannot delete the last frame.");
  chapter.frames.splice(idx, 1);
  if (activeFrameIndex >= chapter.frames.length)
    activeFrameIndex = chapter.frames.length - 1;
  switchFrame(activeFrameIndex);
}

function cutFrameAt(idx) {
  copyFrameAt(idx);
  removeFrameAt(idx);
}

function duplicateFrameAt(idx) {
  const cloned = createFrameFromTemplate(getChapter().frames[idx]);
  getChapter().frames.splice(idx + 1, 0, cloned);
  switchFrame(idx + 1);
}

function addChapter() {
  const id = Date.now();
  const newChapter = {
    id,
    title: "Chapter " + (project.chapters.length + 1),
    frames: [],
  };
  project.chapters.push(newChapter);
  newChapter.frames.push({
    id: Date.now(),
    text: { EN: "Chapter Start" },
    speakerId: "",
    background: "none",
    slots: [null, null, null, null, null],
  });
  renderChapterMgmt();
  loadChapter(id);
  scheduleAutoSave("add_chapter");
}

function newProject() {
  const ok = confirm("Create a new project? Unsaved changes will be lost.");
  if (!ok) return;

  project = {
    // --- START ADDITION: Default Languages ---
    languages: ["EN", "TH", "JP", "CN", "KR"],
    // --- END ADDITION ---
    assets: { backgrounds: [] },
    characters: [],
    chapters: [
      {
        id: Date.now(),
        title: "New Project",
        frames: [
          {
            id: Date.now() + 1,
            text: { EN: "Start" },
            speakerId: "",
            background: "none",
            slots: [null, null, null, null, null],
          },
        ],
      },
    ],
  };

  // Sync global variable
  supportedLanguages = project.languages;

  activeChapterId = project.chapters[0].id;
  loadChapter(activeChapterId);
  renderCastPalette();

  // IMMEDIATE SAVE: Cancel any pending auto-save and save immediately
  if (__saveTimer) clearTimeout(__saveTimer);
  saveProjectData("new_project");

  if (typeof showToast === "function")
    showToast("New project created", "success");
}

function deleteChapter(id) {
  if (project.chapters.length <= 1) return alert("Cannot delete last chapter");
  project.chapters = project.chapters.filter((c) => c.id !== id);
  loadChapter(project.chapters[0].id);
  renderChapterMgmt();
  scheduleAutoSave("delete_chapter");
}

function addFrame() {
  const chapter = getChapter();
  const template = chapter.frames.length
    ? chapter.frames[chapter.frames.length - 1]
    : {
      text: { EN: "" },
      speakerId: "",
      background: "none",
      slots: [null, null, null, null, null],
    };
  const newFrame = createFrameFromTemplate(template);
  newFrame.frameType = activeFilmstripTab;
  if (activeFilmstripTab === "instant") {
    newFrame.returnToFrame = "continue";
  }
  chapter.frames.push(newFrame);
  switchFrame(chapter.frames.length - 1);
  scheduleAutoSave("add_frame");
}

function deleteFrame() {
  removeFrameAt(activeFrameIndex);
  scheduleAutoSave("delete_frame");
}

function updateSlotProp(key, val) {
  if (selectedSlotIndex === -1) return;
  const slot = getFrame().slots[selectedSlotIndex];
  if (key === "scale" || key === "x" || key === "y" || key === "zIndex") {
    const n = parseFloat(val);
    slot[key] = Number.isFinite(n) ? n : key === "scale" ? 1 : 0;
  } else slot[key] = val;
  renderStage();
  renderFilmstrip();
  scheduleAutoSave("update_slot");
}

function updateText(val) {
  const frame = getFrame();
  if (typeof frame.text !== "object" || frame.text === null) {
    frame.text = { EN: frame.text || "" };
  }
  frame.text[editorLanguage] = val;

  renderStage();
  renderFilmstrip();
  scheduleAutoSave("update_text");
}

function changeEditorLanguage(lang) {
  editorLanguage = lang;
  renderInspector();
  renderStage();
  renderFilmstrip();
  scheduleAutoSave("change_editor_language");
}

function handleLanguageSelect(selectEl) {
  const val = selectEl.value;
  if (val === "__ADD_NEW__") {
    // Reset กลับไปค่าเดิมก่อน เพื่อไม่ให้ UI ค้างอยู่ที่คำว่า Add New
    selectEl.value = editorLanguage;
    addNewLanguage();
  } else {
    changeEditorLanguage(val);
  }
}

function addNewLanguage() {
  // ใช้ showPrompt ซึ่งเป็น Modal ของระบบ (จาก ui-overrides.js)
  if (typeof showPrompt === "function") {
    showPrompt(
      "Add New Language",
      "Enter language code (e.g. FR, DE, VI):",
      (val) => {
        const code = val ? val.toUpperCase().trim() : "";

        if (!code) return;

        if (supportedLanguages.includes(code)) {
          if (typeof showToast === "function")
            showToast("Language already exists!", "error");
          return;
        }

        supportedLanguages.push(code);

        if (!project.languages) project.languages = [...supportedLanguages];
        else if (!project.languages.includes(code))
          project.languages.push(code);

        changeEditorLanguage(code);

        if (typeof showToast === "function")
          showToast(`Language ${code} added`, "success");
      },
    );
  } else {
    // Fallback กรณีไม่มี ui-overrides
    const lang = prompt("Enter new language code:");
    if (lang) {
      const code = lang.toUpperCase().trim();
      if (code && !supportedLanguages.includes(code)) {
        supportedLanguages.push(code);
        if (!project.languages) project.languages = [...supportedLanguages];
        else project.languages.push(code);
        changeEditorLanguage(code);
      }
    }
  }
}

function updateFrameChoice(index, key, val) {
  const frame = getFrame();
  if (!frame.choices) frame.choices = [];
  if (frame.choices[index]) {
    if (key === "text") {
      const c = frame.choices[index];
      if (typeof c.text !== "object" || c.text === null) {
        c.text = {
          EN: c.text || "",
        };
      }
      c.text[editorLanguage] = val;
    } else {
      frame.choices[index][key] = val;
    }
    if (key === "type") renderInspector();
  }
}

function addFrameChoice() {
  const frame = getFrame();

  if ((frame.frameType || "main") === "instant") {
    return alert("Choices cannot be added to an Instant Frame.");
  }

  if (!frame.choices) frame.choices = [];
  frame.choices.push({ type: "jump", text: "New Choice", target: "" });
  renderInspector();
}

function removeFrameChoice(index) {
  const frame = getFrame();
  if (frame.choices) {
    frame.choices.splice(index, 1);
    renderInspector();
  }
}

function updateExecuteFunction(index, val) {
  const frame = getFrame();
  if (!frame.executeFunctions) frame.executeFunctions = [];
  frame.executeFunctions[index] = val;
}

function addExecuteFunction() {
  const frame = getFrame();
  if (!frame.executeFunctions) frame.executeFunctions = [];
  frame.executeFunctions.push("Function()");
  renderInspector();
}

function deleteExecuteFunction(index) {
  const frame = getFrame();
  if (frame.executeFunctions) {
    frame.executeFunctions.splice(index, 1);
    renderInspector();
  }
}

function updateSpeaker(val) {
  getFrame().speakerId = val;
  renderStage();
  scheduleAutoSave("update_speaker");
}

function updateBackground(val) {
  getFrame().background = val;
  renderStage();
  scheduleAutoSave("update_background");
}

function switchFilmstripTab(tab) {
  activeFilmstripTab = tab;
  document.querySelectorAll(".filmstrip-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tab);
  });
  renderFilmstrip();
  renderInspector();
  scheduleAutoSave("switch_filmstrip_tab");
}

function updateFrameType(type) {
  const frame = getFrame();
  frame.frameType = type;

  if (type === "instant" && !frame.returnToFrame) {
    frame.returnToFrame = "end";
  }
  renderInspector();
  renderFilmstrip();
  scheduleAutoSave("update_frame_type");
}

function updateReturnToFrame(value) {
  const frame = getFrame();

  frame.returnToFrame = "return";
  renderInspector();
}

function loadChapter(id) {
  activeChapterId = id;
  activeFrameIndex = 0;
  selectedSlotIndex = -1;
  closeModal("chapterModal");
  if (getChapter().frames.length === 0) addFrame();
  switchFrame(0);
  scheduleAutoSave("load_chapter");
}

function switchFrame(index) {
  activeFrameIndex = index;
  // Ensure the active frame is in the selection set if it's a single selection or navigation
  if (selectedFrameIndices.size <= 1 || !selectedFrameIndices.has(index)) {
    selectedFrameIndices.clear();
    selectedFrameIndices.add(index);
  }
  selectedSlotIndex = -1;
  renderStage();
  renderInspector();
  renderFilmstrip();
  scheduleAutoSave("switch_frame");
}

function handleFrameClick(index, event) {
  // If user holds CTRL, toggle selection
  if (event.ctrlKey || event.metaKey) {
    if (selectedFrameIndices.has(index)) {
      selectedFrameIndices.delete(index);
      // If we deselected the active frame, switch active to another one if possible
      if (index === activeFrameIndex && selectedFrameIndices.size > 0) {
        activeFrameIndex = Array.from(selectedFrameIndices)[0];
      }
    } else {
      selectedFrameIndices.add(index);
      activeFrameIndex = index; // Make the lastly added one active (optional design choice)
    }
  }
  // If user holds SHIFT, range select
  else if (event.shiftKey) {
    const start = Math.min(activeFrameIndex, index);
    const end = Math.max(activeFrameIndex, index);
    selectedFrameIndices.clear();
    for (let i = start; i <= end; i++) {
      selectedFrameIndices.add(i);
    }
    activeFrameIndex = index;
  }
  // Normal click
  else {
    selectedFrameIndices.clear();
    selectedFrameIndices.add(index);
    activeFrameIndex = index;
  }

  // Ensure at least one frame (the active one) is selected if set became empty (e.g. ctrl-click the last one)
  if (selectedFrameIndices.size === 0) {
    selectedFrameIndices.add(activeFrameIndex);
  }

  selectedSlotIndex = -1;
  renderStage();
  renderInspector();
  renderFilmstrip();
  scheduleAutoSave("select_frame"); // Just to save UI state if we persists selection
}

function updateBackgroundMulti(val) {
  const chapter = getChapter();
  selectedFrameIndices.forEach(idx => {
    if (chapter.frames[idx]) {
      chapter.frames[idx].background = val;
    }
  });
  renderStage();
  renderFilmstrip(); // Thumbnail might change? No, thumb doesn't show BG.
  renderInspector(); // To reflect change?
  scheduleAutoSave("update_background_multi");
}

function updateBGMMulti(val) {
  const chapter = getChapter();
  selectedFrameIndices.forEach(idx => {
    if (chapter.frames[idx]) {
      chapter.frames[idx].bgm = val || null;
    }
  });
  renderInspector();
  scheduleAutoSave("update_bgm_multi");
}

function selectSlot(index) {
  selectedSlotIndex = index;
  renderStage();
  renderInspector();
  scheduleAutoSave("select_slot");
}

function clearSlot(index) {
  getFrame().slots[index] = null;
  selectedSlotIndex = -1;
  renderStage();
  renderInspector();
  renderFilmstrip();
  scheduleAutoSave("clear_slot");
}

function addCharToSlot(index, charId) {
  const frame = getFrame();
  for (let i = 0; i < 5; i++)
    if (frame.slots[i]?.charId === charId) frame.slots[i] = null;
  const char = project.characters.find((c) => c.id === charId);
  const defaultBody = char?.bodies[0]?.name || "default";
  const defaultFace = char?.faces[0]?.name || "none";
  frame.slots[index] = {
    charId,
    body: defaultBody,
    face: defaultFace,
    face: defaultFace,
    anim: "fade_in",
    animExit: "none",
    scale: 1,
    scale: 1,
    x: 0,
    y: 0,
    zIndex: 0,
    mirror: false,
  };
  selectedSlotIndex = index;
  renderStage();
  renderInspector();
  renderFilmstrip();
  scheduleAutoSave("add_char_to_slot");
}

function moveCharSlot(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  const frame = getFrame();
  [frame.slots[fromIndex], frame.slots[toIndex]] = [
    frame.slots[toIndex],
    frame.slots[fromIndex],
  ];
  selectedSlotIndex = toIndex;
  renderStage();
  renderInspector();
  renderFilmstrip();
  scheduleAutoSave("move_char_slot");
}

function addCharacter() {
  openModal("addCharModal");
}

function deleteCharacter(id) {
  if (!confirm("Are you sure you want to delete this character?")) return;
  project.characters = project.characters.filter((c) => c.id !== id);
  if (editingCharId === id) {
    editingCharId =
      project.characters.length > 0 ? project.characters[0].id : null;
  }
  renderCharModal();
  renderCastPalette();
  renderStage();
  renderFilmstrip();
}

function createNewCharacter() {
  const name = document.getElementById("newCharName").value.trim();
  const fileInput = document.getElementById("newCharSprite");
  if (!name) return alert("Name is required");
  const newChar = {
    id: "c" + Date.now(),
    name,
    color: "#3b82f6",
    bodies: [
      {
        name: "default",
        color: "#3b82f6",
        url: null,
        fileName: null,
      },
    ],
    faces: [
      {
        name: "neutral",
        x: 50,
        y: 20,
        scale: 1.0,
        url: null,
        fileName: null,
      },
    ],
  };
  project.characters.push(newChar);
  if (fileInput.files[0]) {
    readFileAsDataURL(fileInput.files[0], (url, fileName) => {
      newChar.bodies[0].url = url;
      newChar.bodies[0].fileName = fileName;
      renderCastPalette();
      renderStage();
    });
  }
  editingCharId = newChar.id;
  closeModal("addCharModal");
  openModal("characterModal");
  renderCastPalette();
}

function renderCastPalette() {
  const list = document.getElementById("castList");
  list.innerHTML = project.characters
    .map((c) => {
      const thumb = c.bodies[0]?.url
        ? `background-image:url('${c.bodies[0].url}')`
        : `background-color:${c.color}`;
      return `<div class="draggable-char" draggable="true" ondragstart="dragStartNew(event)" data-id="${c.id}">
              <div class="char-dot" style="${thumb}"></div>
              <div style="font-weight:500;font-size:13px;">${c.name}</div>
            </div>`;
    })
    .join("");
}

function renderStage() {
  const frame = getFrame();
  if (!frame) return;
  const bgObj = project.assets.backgrounds.find(
    (b) => b.name === frame.background,
  );
  document.getElementById("visualStage").style.backgroundImage = bgObj?.url
    ? `url('${bgObj.url}')`
    : "none";

  const speaker = project.characters.find((c) => c.id === frame.speakerId);
  document.getElementById("overlaySpeaker").textContent = speaker
    ? speaker.name
    : "Narrator";
  document.getElementById("overlaySpeaker").style.color = speaker
    ? speaker.color
    : "#666";

  let text = getLocalizedFrameText(frame) || "";
  document.getElementById("overlayText").innerHTML =
    unityToHtml(text) || "Click here to edit text...";

  for (let i = 0; i < 5; i++) {
    const zone = document.querySelector(`.slot-zone[data-slot="${i}"]`);
    zone.innerHTML = "";
    const slot = frame.slots[i];

    if (slot && slot.zIndex !== undefined) {
      zone.style.zIndex = slot.zIndex;
    } else {
      zone.style.zIndex = "";
    }

    if (!slot) continue;

    const char = project.characters.find((c) => c.id === slot.charId);
    if (!char) continue;

    const body =
      char.bodies.find((b) => b.name === slot.body) || char.bodies[0];
    const face =
      slot.face && slot.face !== "none"
        ? char.faces.find((f) => f.name === slot.face)
        : null;

    const div = document.createElement("div");
    div.className = `stage-char ${i === selectedSlotIndex ? "selected" : ""}`;
    div.draggable = true;
    div.ondragstart = dragStartMove;
    div.onclick = (e) => {
      e.stopPropagation();
      selectSlot(i);
    };

    const wrapper = document.createElement("div");
    wrapper.className = "char-visual";
    wrapper.style.transform = `translate(${slot.x || 0}px, ${slot.y || 0}px) scale(${slot.scale || 1}) scaleX(${slot.mirror ? -1 : 1})`;

    if (body?.url) {
      const img = document.createElement("img");
      img.src = body.url;
      img.className = "char-visual-img";
      img.style.position = "relative";
      img.style.zIndex = "1";
      wrapper.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.style.width = "100px";
      placeholder.style.height = "250px";
      placeholder.style.backgroundColor = body?.color || char.color;
      placeholder.style.borderRadius = "6px";
      placeholder.style.position = "relative";
      placeholder.style.zIndex = "1";
      wrapper.appendChild(placeholder);
    }

    if (face?.url) {
      const faceEl = document.createElement("div");
      faceEl.className = "char-layer-face";
      const size = OVERLAY_BASE_SIZE * (face.scale || 1);
      faceEl.style.left = `${face.x}%`;
      faceEl.style.top = `${face.y}%`;
      faceEl.style.width = `${size}px`;
      faceEl.style.height = `${size}px`;
      faceEl.style.backgroundImage = `url('${face.url}')`;
      faceEl.style.zIndex = "2";
      wrapper.appendChild(faceEl);
    }

    div.appendChild(wrapper);

    const nameTag = document.createElement("div");
    nameTag.textContent = char.name;
    nameTag.style.cssText =
      "position:absolute;bottom:10px;left:50%;transform:translateX(-50%);color:white;font-weight:bold;text-shadow:0 1px 3px black;pointer-events:none;white-space:nowrap;z-index:10;";
    div.appendChild(nameTag);

    if (i === selectedSlotIndex) {
      const closeBtn = document.createElement("div");
      closeBtn.textContent = "Remove";

      closeBtn.className = "danger";
      closeBtn.style.cssText =
        "position:absolute;top:8px;right:8px;padding:4px 8px;border-radius:5px;font-size:12px;line-height:1;text-align:center;cursor:pointer;z-index:20;background:var(--danger);color:#fff;border:1px solid var(--danger);";
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        clearSlot(i);
      };
      div.appendChild(closeBtn);
    }

    zone.appendChild(div);
  }

  document
    .getElementById("dialogueBox")
    .classList.toggle("active", selectedSlotIndex === -1);
}

function renderFilmstrip() {
  const reel = document.getElementById("filmstrip");
  const chapter = getChapter();

  const visibleFrames = chapter.frames
    .map((f, i) => ({ ...f, originalIndex: i }))
    .filter((f) => {
      const type = f.frameType || "main";
      return type === activeFilmstripTab;
    });

  let html = visibleFrames
    .map((f) => {
      const idx = f.originalIndex;
      let dots = "";
      f.slots.forEach((s) => {
        if (s) {
          const c = project.characters.find((ch) => ch.id === s.charId);
          dots += `<div class="thumb-dot" style="background:${c ? c.color : "#ccc"}"></div>`;
        }
      });
      // Check selection state
      const isSelected = selectedFrameIndices.has(idx);
      const isActive = idx === activeFrameIndex;
      const classList = ["film-frame"];
      if (isActive) classList.push("active");
      if (isSelected) classList.push("selected");

      return `<div class="${classList.join(" ")}" data-idx="${idx}"
             draggable="true" onclick="handleFrameClick(${idx}, event)"
             ondragstart="onFrameDragStart(event)" ondragover="onFrameDragOver(event)"
             ondrop="onFrameDrop(event)" ondragend="onFrameDragEnd(event)"
             oncontextmenu="onFrameContextMenu(event)">
      <div class="frame-num">${idx + 1}</div>
      <div class="thumb-preview">${dots}</div>
      <div class="frame-caption">${getLocalizedFrameText(f) || "..."}</div>
    </div>`;
    })
    .join("");

  html += `<div class="film-frame film-frame-add" onclick="addFrame()">
            <div class="plus-icon">+</div>
          </div>`;

  reel.innerHTML = html;
}


function toggleSyntax(el) {
  const currentText = el.innerText;
  const val = el.dataset.val;
  const display = el.dataset.display;

  if (el.classList.contains("expanded")) {
    el.innerText = display;
    el.classList.remove("expanded");
  } else {
    el.innerText = val;
    el.classList.add("expanded");
  }
}

function unityToHtml(text) {
  if (!text) return "";
  let html = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/gi, "<b>$1</b>");
  html = html.replace(/&lt;i&gt;(.*?)&lt;\/i&gt;/gi, "<i>$1</i>");
  html = html.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/gi, "<u>$1</u>");
  html = html.replace(/&lt;s&gt;(.*?)&lt;\/s&gt;/gi, "<s>$1</s>");

  // Syntax Tag Support
  html = html.replace(
    /&lt;syntax val=&quot;(.*?)&quot;&gt;(.*?)&lt;\/syntax&gt;/gi,
    "<span class='interactive-syntax' onclick='toggleSyntax(this)' data-val='$1' data-display='$2'>$2</span>"
  );

  html = html.replace(
    /&lt;color=(.*?)&gt;(.*?)&lt;\/color&gt;/gi,
    "<span style='color:$1'>$2</span>",
  );
  html = html.replace(
    /&lt;size=(.*?)&gt;(.*?)&lt;\/size&gt;/gi,
    "<span style='font-size:1.2em'>$2</span>",
  );
  html = html.replace(
    /\{([^}]+)\}/g,
    '<span style="color:#3b82f6;font-weight:bold;">[$1]</span>',
  );
  html = html.replace(/\n/g, "<br>");
  return html;
}


// ฟังก์ชันแทรก Tag ลงใน Textarea ณ ตำแหน่ง Cursor
function insertTextTag(tagType) {
  const textarea = document.getElementById("tmInput");
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selectedText = text.substring(start, end);

  let open = "";
  let close = "";

  switch (tagType) {
    case "b":
      open = "<b>";
      close = "</b>";
      break;
    case "i":
      open = "<i>";
      close = "</i>";
      break;
    case "u":
      open = "<u>";
      close = "</u>";
      break;
    case "s":
      open = "<s>";
      close = "</s>";
      break;
    case "syntax":
      open = '<syntax val="HIDDEN">';
      close = "</syntax>";
      break;

    case "color":
      open = "<color=#FF0000>";
      close = "</color>";
      break;
    case "size":
      open = "<size=120%>";
      close = "</size>";
      break;
    case "br":
      open = "\n";
      close = "";
      break;
  }

  // ถ้าไม่มีการเลือกข้อความ ให้แทรก Tag คร่อมตรงกลางว่างๆ หรือแทรก Tag เปิดปิด
  const replacement = open + selectedText + close;

  textarea.value = text.substring(0, start) + replacement + text.substring(end);

  // อัปเดตข้อมูลและ Preview
  updateText(textarea.value);

  // ย้าย Cursor ไปข้างใน Tag (กรณีไม่ได้เลือก Text) หรือหลัง Tag (กรณีเลือก Text)
  const newCursorPos =
    selectedText.length > 0 ? start + replacement.length : start + open.length;
  textarea.focus();
  textarea.setSelectionRange(newCursorPos, newCursorPos);
}

// --- Text Editor Logic ---
// Logic moved to dialogue-editor.js

function unityToHtml(text) {
  if (!text) return "";
  let html = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 1. Basic Formatting
  html = html.replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/gi, "<b>$1</b>");
  html = html.replace(/&lt;i&gt;(.*?)&lt;\/i&gt;/gi, "<i>$1</i>");
  html = html.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/gi, "<u>$1</u>");
  html = html.replace(/&lt;s&gt;(.*?)&lt;\/s&gt;/gi, "<s>$1</s>");

  // 2. Syntax Tag Support <syntax val="...">...</syntax>
  html = html.replace(
    /&lt;syntax val=&quot;(.*?)&quot;&gt;(.*?)&lt;\/syntax&gt;/gi,
    "<span class='interactive-syntax' onclick='toggleSyntax(this)' data-val='$1' data-display='$2'>$2</span>"
  );

  // 3. Unity Rich Text <color=...>...</color>
  html = html.replace(
    /&lt;color=(.*?)&gt;(.*?)&lt;\/color&gt;/gi,
    "<span style='color:$1'>$2</span>",
  );
  html = html.replace(
    /&lt;size=(.*?)&gt;(.*?)&lt;\/size&gt;/gi,
    "<span style='font-size:1.2em'>$2</span>",
  );

  // 4. KV Tag Support {key:value} -> <span class="kv-tag">value</span>
  // This regex looks for {key:value} pattern
  html = html.replace(
    /\{([^:]+):([^}]+)\}/g,
    "<span class='kv-tag' data-full='{$1:$2}'>$2</span>"
  );



  html = html.replace(/\n/g, "<br>");
  return html;
}

function htmlToUnity(html) {
  let temp = document.createElement("div");
  temp.innerHTML = html;

  // Pre-process special spans back to raw text before traversal
  const syntaxSpans = temp.querySelectorAll(".interactive-syntax");
  syntaxSpans.forEach(span => {
    const val = span.getAttribute("data-val");
    const display = span.innerText; // Current visible text might be val or display
    // Ideally we reconstruct the original tag. 
    // Note: The user might have clicked it, so innerText could be 'val'.
    // But the original tag structure is <syntax val="VAL">DISPLAY</syntax>.
    // We rely on data-display if available, otherwise innerText.
    const originalDisplay = span.getAttribute("data-display") || display;
    const originalVal = val || "";
    const replacement = document.createTextNode(`<syntax val="${originalVal}">${originalDisplay}</syntax>`);
    span.parentNode.replaceChild(replacement, span);
  });

  const kvSpans = temp.querySelectorAll(".kv-tag");
  kvSpans.forEach(span => {
    const full = span.getAttribute("data-full");
    if (full) {
      const replacement = document.createTextNode(full);
      span.parentNode.replaceChild(replacement, span);
    }
  });

  function traverse(node) {
    let out = "";
    for (let child of node.childNodes) {
      if (child.nodeType === 3) {
        out += child.textContent;
      } else if (child.nodeType === 1) {
        // If it's a BR tag, handle strictly
        if (child.tagName.toLowerCase() === "br") {
          out += "\n";
          continue;
        }

        let content = traverse(child);
        let style = window.getComputedStyle(child);
        let tagName = child.tagName.toLowerCase();

        // Reconstruct basic tags
        if (tagName === "b" || tagName === "strong" || style.fontWeight === "bold" || parseInt(style.fontWeight) >= 700) {
          content = `<b>${content}</b>`;
        }
        if (tagName === "i" || tagName === "em" || style.fontStyle === "italic") {
          content = `<i>${content}</i>`;
        }
        if (tagName === "u" || style.textDecorationLine.includes("underline")) {
          content = `<u>${content}</u>`;
        }
        if (tagName === "s" || tagName === "strike" || style.textDecorationLine.includes("line-through")) {
          content = `<s>${content}</s>`;
        }

        if (child.style.color || child.color) {
          let c = child.style.color || child.color;
          if (c.startsWith("rgb")) c = rgbToHex(c);
          content = `<color=${c}>${content}</color>`;
        }

        // Block elements handling
        if (tagName === "div" || tagName === "p") {
          // check if not empty or has br
          if (out.length > 0) content = "\n" + content;
        }

        out += content;
      }
    }
    return out;
  }

  let raw = traverse(temp);
  // Clean up extra newlines logic if needed, but simple traversal usually creates 
  // accurate structure if <br> -> \n mapping is 1:1.
  return raw;
}

function rgbToHex(rgb) {
  let sep = rgb.indexOf(",") > -1 ? "," : " ";
  rgb = rgb.substr(4).split(")")[0].split(sep);
  let r = (+rgb[0]).toString(16),
    g = (+rgb[1]).toString(16),
    b = (+rgb[2]).toString(16);
  if (r.length == 1) r = "0" + r;
  if (g.length == 1) g = "0" + g;
  if (b.length == 1) b = "0" + b;
  return "#" + r + g + b;
}

function renderInspector() {
  const container = document.getElementById("inspectorContent");

  // --- Bulk Edit Mode ---
  if (selectedFrameIndices.size > 1) {
    const chapter = getChapter();
    const frames = Array.from(selectedFrameIndices).map(i => chapter.frames[i]).filter(f => f);

    // Determine common values
    const firstBg = frames[0]?.background;
    const sameBg = frames.every(f => f.background === firstBg);

    const firstBgm = frames[0]?.bgm;
    const sameBgm = frames.every(f => f.bgm === firstBgm);

    const bgOpts = ["none", ...project.assets.backgrounds.map((b) => b.name)]
      .map((n) => {
        const isSelected = sameBg && n === firstBg;
        return `<option value="${n}" ${isSelected ? "selected" : ""}>${n}</option>`;
      })
      .join("");

    const bgmOpts = (project.assets.bgm || [])
      .map(a => {
        const isSelected = sameBgm && a.name === firstBgm;
        return `<option value="${a.name}" ${isSelected ? "selected" : ""}>${a.name}</option>`;
      })
      .join("");

    container.innerHTML = `
      <div style="padding: 10px; border-bottom: 1px solid var(--border); margin-bottom: 15px; background: var(--bg-secondary); border-radius: 6px;">
        <strong style="display:block; margin-bottom:4px;">${selectedFrameIndices.size} Frames Selected</strong>
        <span style="font-size:11px; color:var(--text-muted);">Bulk editing mode</span>
      </div>
      
      <div class="form-group">
        <label>Background</label>
        <select onchange="updateBackgroundMulti(this.value)">
            ${!sameBg ? '<option value="" disabled selected>-- Mixed Values --</option>' : ''}
            ${bgOpts}
        </select>
        <button class="primary-btn" onclick="openModal('assetsModal')" style="margin-top:5px;">Assets Manager</button>
      </div>
      
      <div class="form-group">
        <label>Background Music (BGM)</label>
        <select onchange="updateBGMMulti(this.value)">
             ${!sameBgm ? '<option value="" disabled selected>-- Mixed Values --</option>' : ''}
             <option value="" ${sameBgm && !firstBgm ? "selected" : ""}> (None) </option>
             ${bgmOpts}
        </select>
      </div>
      
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 20px; padding: 10px; border: 1px dashed var(--border); border-radius: 4px;">
        <strong>Note:</strong> Editing Speaker, Dialogue, or Character Slots is disabled in multi-select mode. Please select a single frame to edit those properties.
      </div>
    `;
    return;
  }

  // --- Single Frame Mode (Original Logic) ---
  const frame = getFrame();

  // Styles & Icons
  const styles = `
    <style>
        details > summary { list-style: none; cursor: pointer; font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; outline: none; }
        details > summary::-webkit-details-marker { display: none; }
        details[open] .icon-collapsed { display: none; }
        details:not([open]) .icon-expanded { display: none; }
    </style>`;
  const iconExpanded = `<svg class="icon-expanded" style="width:16px; height:16px; margin-right:5px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m19 9-7 7-7-7"/></svg>`;
  const iconCollapsed = `<svg class="icon-collapsed" style="width:16px; height:16px; margin-right:5px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 5 7 7-7 7"/></svg>`;

  if (selectedSlotIndex === -1) {
    // --- Frame Inspector ---
    const speakerOpts = project.characters
      .map(
        (c) =>
          `<option value="${c.id}" ${frame.speakerId === c.id ? "selected" : ""}>${c.name}</option>`,
      )
      .join("");
    const bgOpts = ["none", ...project.assets.backgrounds.map((b) => b.name)]
      .map(
        (n) =>
          `<option value="${n}" ${frame.background === n ? "selected" : ""}>${n}</option>`,
      )
      .join("");
    const langOpts = supportedLanguages
      .map(
        (l) =>
          `<option value="${l}" ${editorLanguage === l ? "selected" : ""}>${l}</option>`,
      )
      .join("");

    // ดึง Text ปัจจุบันมาแสดงผลย่อๆ
    const currentText = getLocalizedFrameText(frame);
    const textPreview =
      currentText.length > 50
        ? currentText.substring(0, 50) + "..."
        : currentText || "(No text)";

    // จัดการ State ของ Details
    const choicesEl = container.querySelector("#details-choices");
    const choicesOpen = choicesEl ? choicesEl.hasAttribute("open") : true;
    const execEl = container.querySelector("#details-exec");
    const execOpen = execEl ? execEl.hasAttribute("open") : true;
    const choiceOpenMap = {};
    container
      .querySelectorAll("[data-choice-open]")
      .forEach(
        (el) => (choiceOpenMap[el.getAttribute("data-choice-open")] = true),
      );

    container.innerHTML = `
      ${styles}
      <div class="form-group">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <label>Speaker</label>
            <span style="font-size:10px; color:var(--text-muted);">ID: ${frame.id}</span>
        </div>
        <select onchange="updateSpeaker(this.value)"><option value="">(Narrator)</option>${speakerOpts}</select>
      </div>

      <div class="form-group">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
            <label style="margin:0;">Dialogue Text</label>
            <div style="display:flex; gap:5px; align-items:center;">
                <select style="width:auto; padding:2px 5px; font-size:11px; padding: 5px;" onchange="handleLanguageSelect(this)">
                    ${langOpts}
                    <option value="__ADD_NEW__" style="font-weight:bold; color:var(--primary);">+ Add New Language...</option>
                </select>
            </div>
        </div>

        <div style="border: 1px solid var(--border); border-radius: 6px; padding: 10px; background: var(--bg-secondary); cursor: pointer; transition: all 0.2s;"
             onclick="openTextEditor()"
             title="Click to edit dialogue">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px; display:flex; justify-content:space-between;">
                <span>CONTENT (${editorLanguage})</span>
                <span>✎ Edit</span>
            </div>
            <div style="font-size: 13px; color: var(--text-main); line-height: 1.4; max-height: 60px; overflow: hidden; pointer-events: none;">
                ${textPreview.replace(/</g, "&lt;")}
            </div>
        </div>
      </div>

      <details id="details-choices" class="form-group" style="border-top:1px solid var(--border); margin-top:10px; padding-top:10px;" ${choicesOpen ? "open" : ""}>
          <summary>${iconExpanded}${iconCollapsed}Choices</summary>
          ${(frame.choices || [])
        .map((c, i) => {
          const type = c.type || "jump";
          const isOpen = !!choiceOpenMap[String(i)];
          const choiceTextVal =
            typeof c.text === "object" && c.text !== null
              ? c.text[editorLanguage] || ""
              : c.text || "";
          return `<details data-choice-open="${isOpen ? i : ""}" style="background: rgba(0,0,0,0.05); padding: 8px; border-radius: 4px; margin-bottom: 8px; border: 1px solid var(--border);" ${isOpen ? "open" : ""}>
                  <summary style="font-size:12px; font-weight:700;">Choice ${i + 1}</summary>
                  <div style="margin-bottom: 4px;">
                      <label style="font-size: 11px;">Type</label>
                      <select class="inspector-input" onchange="updateFrameChoice(${i}, 'type', this.value)">
                          <option value="jump" ${type === "jump" ? "selected" : ""}>Jump Frame</option>
                          <option value="exec" ${type === "exec" ? "selected" : ""}>Execute Function</option>
                      </select>
                  </div>
                  <div style="margin-bottom: 4px;">
                      <label style="font-size: 11px;">Text (${editorLanguage})</label>
                      <input class="inspector-input" type="text" value="${choiceTextVal}" oninput="updateFrameChoice(${i}, 'text', this.value)">
                  </div>
                  ${type === "jump"
              ? `<div style="margin-bottom: 4px;"><label style="font-size: 11px;">Target</label><button class="primary-btn small" onclick="openNodeGraphV2()" style="width:100%">Open Graph</button></div>`
              : `<div style="margin-bottom: 4px;"><label style="font-size: 11px;">Function</label><input class="inspector-input" type="text" value="${c.target || ""}" onchange="updateFrameChoice(${i}, 'target', this.value)" placeholder="func()"></div>`
            }
                  <button class="danger small" onclick="removeFrameChoice(${i})" style="width: 100%; margin-top: 4px;">Remove</button>
              </details>`;
        })
        .join("")}
          <button class="primary-btn small" onclick="addFrameChoice()" style="width: 100%;">+ Add Choice</button>
      </details>

      <details id="details-exec" class="form-group" style="border-top:1px solid var(--border); margin-top:10px; padding-top:10px;" ${execOpen ? "open" : ""}>
          <summary>${iconExpanded}${iconCollapsed}Execute Function</summary>
          ${(frame.executeFunctions || [])
        .map(
          (val, i) => `
              <div style="margin-bottom: 4px; display:flex; flex-wrap: nowrap; align-items:center; border:1px solid var(--border); border-radius:4px; overflow:hidden; background:var(--bg-panel); height: 28px;">
                  <input class="inspector-input" type="text" value="${val}" oninput="updateExecuteFunction(${i}, this.value)" placeholder="Func()" style="border:none; border-radius:0; flex:1; min-width:0; margin:0; height:100%;">
                  <button class="danger small" onclick="deleteExecuteFunction(${i})" style="width:28px; height:100%; border-radius:0; display:flex; align-items:center; justify-content:center; padding:0; margin:0; flex-shrink:0; border-left:1px solid var(--border);">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
              </div>
          `,
        )
        .join("")}
          <button class="primary-btn small" onclick="addExecuteFunction()" style="width: 100%;">+ Add Function</button>
      </details>

      <details id="details-audio" class="form-group" style="border-top:1px solid var(--border); margin-top:10px; padding-top:10px;" open>
        <summary>${iconExpanded}${iconCollapsed}Audio</summary>
        
        <!-- BGM -->
        <div style="margin-bottom:10px;">
            <label style="font-size:11px;">Background Music (BGM)</label>
            <select onchange="updateBGM(this.value)">
                <option value="">(None)</option>
                ${(project.assets.bgm || []).map(a => `<option value="${a.name}" ${frame.bgm === a.name ? "selected" : ""}>${a.name}</option>`).join("")}
            </select>
        </div>

        <!-- Voice Over (Synced to Language) -->
        <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
               <label style="font-size:11px; margin:0;">Voice Over (${editorLanguage})</label>
            </div>
            <div style="display:flex; gap:5px; align-items:center;">
                <select onchange="updateVoiceOver(this.value)" style="flex:1; font-size:11px;">
                    <option value="">(None)</option>
                    ${(project.assets.voice || []).map(a => {
          const voMap = (typeof frame.voiceOver === 'object' && frame.voiceOver) ? frame.voiceOver : (typeof frame.voiceOver === 'string' ? { [editorLanguage]: frame.voiceOver } : {});
          const currentVo = voMap[editorLanguage];
          const selected = currentVo === a.name ? "selected" : "";
          return `<option value="${a.name}" ${selected}>${a.name}</option>`;
        }).join("")}
                </select>
            </div>
            <input type="file" id="voFileInput" style="display:none;" accept="audio/*" onchange="handleVoUpload(this)">
        </div>
      </details>

      <div class="form-group" style="border-top:1px solid var(--border); margin-top:10px; padding-top:10px;">
        <label>Background</label>
        <select onchange="updateBackground(this.value)">${bgOpts}</select>
        <button class="primary-btn" onclick="openModal('assetsModal')" style="margin-top:5px;">Assets Manager</button>
      </div>
      <button class="danger" onclick="deleteFrame()" style="margin-top:20px;">Delete Slide</button>`;
    return;
  }

  // --- Character Slot Inspector (คงเดิม) ---
  const slot = frame.slots[selectedSlotIndex];
  const char = project.characters.find((c) => c.id === slot.charId);
  const bodyOpts = char.bodies
    .map(
      (b) =>
        `<option value="${b.name}" ${slot.body === b.name ? "selected" : ""}>${b.name}</option>`,
    )
    .join("");
  const faceOpts = [
    '<option value="none">none</option>',
    ...char.faces.map(
      (f) =>
        `<option value="${f.name}" ${slot.face === f.name ? "selected" : ""}>${f.name}</option>`,
    ),
  ].join("");

  container.innerHTML = `
      <div style="margin-bottom:15px;padding-bottom:10px;border-bottom:1px solid var(--border);"><strong>${char.name}</strong> (Slot ${selectedSlotIndex})</div>
      <div class="form-group"><label>Body Sprite</label><select onchange="updateSlotProp('body',this.value)">${bodyOpts}</select></div>
      <div class="form-group"><label>Face Expression</label><select onchange="updateSlotProp('face',this.value)">${faceOpts}</select></div>
      <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div><label>Scale</label><input type="number" step="0.1" value="${slot.scale}" onchange="updateSlotProp('scale',this.value)"></div>
        <div><label>Z-Index</label><input type="number" step="1" value="${slot.zIndex}" onchange="updateSlotProp('zIndex',this.value)"></div>
        <div><label>X</label><input type="number" step="10" value="${slot.x}" onchange="updateSlotProp('x',this.value)"></div>
        <div><label>Y</label><input type="number" step="10" value="${slot.y}" onchange="updateSlotProp('y',this.value)"></div>
      </div>
      <div class="form-group">
        <label class="primary-btn small" style="width:100%;justify-content:center;">
           <input type="checkbox" ${slot.mirror ? "checked" : ""} onchange="updateSlotProp('mirror', this.checked)"> Mirror (Flip X)
        </label>
      </div>
      <div class="form-group"><label>Anim In</label>
        <select onchange="updateSlotProp('anim',this.value)">
            <option value="none" ${slot.anim === "none" ? "selected" : ""}>None</option>
            <option value="fade_in" ${slot.anim === "fade_in" ? "selected" : ""}>Fade In</option>
            <option value="slide_left" ${slot.anim === "slide_left" ? "selected" : ""}>Slide In Left</option>
            <option value="slide_right" ${slot.anim === "slide_right" ? "selected" : ""}>Slide In Right</option>
            <option value="shake" ${slot.anim === "shake" ? "selected" : ""}>Shake</option>
        </select>
      </div>
      <div class="form-group"><label>Anim Out</label>
        <select onchange="updateSlotProp('animExit',this.value)">
            <option value="none" ${slot.animExit === "none" ? "selected" : ""}>None</option>
            <option value="fade_out" ${slot.animExit === "fade_out" ? "selected" : ""}>Fade Out</option>
            <option value="slide_out_left" ${slot.animExit === "slide_out_left" ? "selected" : ""}>Slide Out Left</option>
            <option value="slide_out_right" ${slot.animExit === "slide_out_right" ? "selected" : ""}>Slide Out Right</option>
        </select>
      </div>`;
}

function updateBGM(val) {
  const frame = getFrame();
  frame.bgm = val || null;
  scheduleAutoSave("update_bgm");
}

function updateVoiceOver(val) {
  const frame = getFrame();
  if (typeof frame.voiceOver !== 'object' || !frame.voiceOver) {
    // Migration or init
    const oldVal = (typeof frame.voiceOver === 'string') ? frame.voiceOver : null;
    frame.voiceOver = {};
    if (oldVal) frame.voiceOver[editorLanguage] = oldVal;
  }

  if (val) {
    frame.voiceOver[editorLanguage] = val;
  } else {
    delete frame.voiceOver[editorLanguage];
  }

  scheduleAutoSave("update_voice_over");
}

function triggerVoUpload() {
  document.getElementById("voFileInput").click();
}

function handleVoUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const name = prompt("Enter name for this audio:", file.name.split('.')[0]);
  if (!name) {
    input.value = "";
    return;
  }

  readFileAsDataURL(file, (url, fn) => {
    // Add to Assets (VOICE ONLY)
    if (!project.assets.voice) project.assets.voice = [];
    project.assets.voice.push({ name, url, fileName: fn });

    // Assign to Frame
    const frame = getFrame();
    if (typeof frame.voiceOver !== 'object' || !frame.voiceOver) {
      const oldVal = (typeof frame.voiceOver === 'string') ? frame.voiceOver : null;
      frame.voiceOver = {};
      if (oldVal) frame.voiceOver[editorLanguage] = oldVal;
    }
    frame.voiceOver[editorLanguage] = name;

    // Render & Save
    renderAssetModal(); // Update asset list in background
    renderInspector();  // Update inspector UI
    scheduleAutoSave("upload_voice_over");
  });
  input.value = "";
}

function initOverlayEditorEvents() {
  const container = document.getElementById("overlayEditorContainer");
  const wrapper = document.getElementById("overlayTargetWrapper");

  container.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    editorState.zoom = Math.max(0.3, Math.min(5, editorState.zoom + delta));
    updateOverlayEditorTransform();
  });

  wrapper.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("resize-handle")) {
      isResizing = true;
      currentHandle = e.target.dataset.handle;
      const rect = wrapper.getBoundingClientRect();
      startWidth = rect.width;
      startHeight = rect.height;
      startX = e.clientX;
      startY = e.clientY;
      e.stopPropagation();
    } else if (e.button === 0) {
      isDragging = true;
      startLeft = parseFloat(wrapper.style.left || 50);
      startTop = parseFloat(wrapper.style.top || 20);
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging && !isResizing) return;

    let dx = e.clientX - startX;
    let dy = e.clientY - startY;

    if (isResizing) {
      let newWidth = startWidth + dx;
      if (newWidth < 10) return;
      const scale = newWidth / OVERLAY_BASE_SIZE;
      wrapper.style.width = OVERLAY_BASE_SIZE * scale + "px";
      wrapper.style.height = OVERLAY_BASE_SIZE * scale + "px";
      document.getElementById("propScale").value = scale.toFixed(2);
    } else if (isDragging) {
      const baseImg = document.getElementById("overlayBaseImg");
      const baseRect = baseImg.getBoundingClientRect();

      let refWidth = baseRect.width || 1;
      let refHeight = baseRect.height || 1;

      let newLeft = startLeft + (dx / refWidth) * 100;
      let newTop = startTop + (dy / refHeight) * 100;

      wrapper.style.left = newLeft + "%";
      wrapper.style.top = newTop + "%";

      document.getElementById("propX").value = newLeft.toFixed(1);
      document.getElementById("propY").value = newTop.toFixed(1);
    }
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    isResizing = false;
    currentHandle = null;
  });

  container.addEventListener("mousedown", (e) => {
    if (e.button === 1) {
      e.preventDefault();
      editorState.isPanning = true;
      editorState.startX = e.clientX - editorState.panX;
      editorState.startY = e.clientY - editorState.panY;
      container.style.cursor = "grabbing";
    }
  });

  container.addEventListener("mousemove", (e) => {
    if (editorState.isPanning) {
      editorState.panX = e.clientX - editorState.startX;
      editorState.panY = e.clientY - editorState.startY;
      updateOverlayEditorTransform();
    }
  });

  container.addEventListener("mouseup", () => {
    editorState.isPanning = false;
    container.style.cursor = "default";
  });
}

function updateOverlayEditorTransform() {
  const canvas = document.getElementById("overlayCanvas");
  const wrapper = document.getElementById("overlayTargetWrapper");
  const handles = document.querySelectorAll(".resize-handle");

  canvas.style.transform = `translate(${editorState.panX}px, ${editorState.panY}px) scale(${editorState.zoom})`;

  const scaleFactor = Math.min(1, 1 / editorState.zoom);
  wrapper.style.borderWidth = `${2 * scaleFactor}px`;
  handles.forEach((h) => {
    h.style.width = `${12 * scaleFactor}px`;
    h.style.height = `${12 * scaleFactor}px`;
    h.style.borderWidth = `${2 * scaleFactor}px`;

    if (h.classList.contains("nw") || h.classList.contains("ne"))
      h.style.top = `${-6 * scaleFactor}px`;
    else h.style.bottom = `${-6 * scaleFactor}px`;

    if (h.classList.contains("nw") || h.classList.contains("sw"))
      h.style.left = `${-6 * scaleFactor}px`;
    else h.style.right = `${-6 * scaleFactor}px`;
  });

  document.getElementById("zoomLabel").textContent =
    Math.round(editorState.zoom * 100) + "%";
}

function ensureOverlayWrapper() {
  const canvas = document.getElementById("overlayCanvas");
  const img = document.getElementById("overlayBaseImg");
  const overlay = document.getElementById("overlayTargetWrapper");

  let wrapper = document.getElementById("overlay-wrapper-inner");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.id = "overlay-wrapper-inner";
    wrapper.style.position = "relative";
    wrapper.style.display = "inline-block";
    wrapper.style.lineHeight = "0";

    canvas.appendChild(wrapper);
    wrapper.appendChild(img);
    wrapper.appendChild(overlay);

    canvas.style.display = "flex";
    canvas.style.justifyContent = "center";
    canvas.style.alignItems = "center";

    img.style.height = "auto";
    img.style.width = "auto";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "80vh";
    img.style.display = "block";
  }
}

function openOverlayEditor(idx) {
  ensureOverlayWrapper();

  editingOverlayIdx = idx;
  const char = project.characters.find((c) => c.id === editingCharId);
  const face = char.faces[idx];

  const sidebar = document.querySelector(".overlay-props-panel");
  const propsContent = sidebar.children[1];

  let bodySelect = document.getElementById("refBodySelect");
  if (!bodySelect) {
    const group = document.createElement("div");
    group.className = "form-group";
    group.style.borderBottom = "1px solid #eee";
    group.style.paddingBottom = "15px";
    group.style.marginBottom = "15px";
    group.innerHTML = `<label>Reference Body</label><select id="refBodySelect" onchange="changeEditorRefBody(this.value)"></select>`;
    propsContent.insertBefore(group, propsContent.firstChild);
    bodySelect = document.getElementById("refBodySelect");
  }
  bodySelect.innerHTML = char.bodies
    .map(
      (b, i) =>
        `<option value="${b.url || ""}" ${i === 0 ? "selected" : ""}>${b.name}</option>`,
    )
    .join("");

  document.getElementById("overlayBaseImg").src = char.bodies[0]?.url || "";
  document.getElementById("overlayTargetImg").src = face.url || "";
  const wrapper = document.getElementById("overlayTargetWrapper");
  wrapper.style.left = face.x + "%";
  wrapper.style.top = face.y + "%";
  const size = OVERLAY_BASE_SIZE * (face.scale || 1);
  wrapper.style.width = size + "px";
  wrapper.style.height = size + "px";
  document.getElementById("propX").value = face.x;
  document.getElementById("propY").value = face.y;
  document.getElementById("propScale").value = face.scale || 1;

  editorState.zoom = 1;
  editorState.panX = 0;
  editorState.panY = 0;

  updateOverlayEditorTransform();
  openModal("overlayModal");
}

function changeEditorRefBody(url) {
  document.getElementById("overlayBaseImg").src = url;
}

function updateOverlayFromProps() {
  const wrapper = document.getElementById("overlayTargetWrapper");
  const x = parseFloat(document.getElementById("propX").value) || 50;
  const y = parseFloat(document.getElementById("propY").value) || 20;
  const s = parseFloat(document.getElementById("propScale").value) || 1;
  wrapper.style.left = x + "%";
  wrapper.style.top = y + "%";
  wrapper.style.width = OVERLAY_BASE_SIZE * s + "px";
  wrapper.style.height = OVERLAY_BASE_SIZE * s + "px";
}

function saveOverlayPosition() {
  const char = project.characters.find((c) => c.id === editingCharId);
  if (char && editingOverlayIdx >= 0) {
    const f = char.faces[editingOverlayIdx];
    f.x = parseFloat(document.getElementById("propX").value) || 50;
    f.y = parseFloat(document.getElementById("propY").value) || 20;
    f.scale = parseFloat(document.getElementById("propScale").value) || 1;
  }
  closeModal("overlayModal");
  renderCharModal();
  renderStage();
  scheduleAutoSave("save_overlay_position");
}

function dragStartNew(ev) {
  const el = ev.target.closest(".draggable-char");
  if (!el) return;
  ev.dataTransfer.setData("type", "new");
  ev.dataTransfer.setData("id", el.dataset.id);
}

function dragStartMove(ev) {
  const zone = ev.target.closest(".stage-char");
  if (!zone) return;
  const slotIdx = Array.from(document.querySelectorAll(".slot-zone")).findIndex(
    (z) => z.contains(zone),
  );
  ev.dataTransfer.setData("type", "move");
  ev.dataTransfer.setData("index", slotIdx);
}

function allowDrop(ev) {
  ev.preventDefault();

  document.querySelectorAll(".slot-zone").forEach((el) => {
    if (el !== ev.currentTarget) {
      el.classList.remove("drag-over");
    }
  });

  ev.currentTarget.classList.add("drag-over");
}

function handleDragLeave(ev) {
  if (ev.currentTarget.contains(ev.relatedTarget)) {
    return;
  }

  ev.currentTarget.classList.remove("drag-over");
}

function drop(ev) {
  ev.preventDefault();
  ev.currentTarget.classList.remove("drag-over");

  document
    .querySelectorAll(".slot-zone")
    .forEach((z) => z.classList.remove("drag-over"));
  const target = ev.target.closest(".slot-zone");
  if (!target) return;
  const idx = parseInt(target.dataset.slot);
  const type = ev.dataTransfer.getData("type");
  if (type === "new") addCharToSlot(idx, ev.dataTransfer.getData("id"));
  else if (type === "move")
    moveCharSlot(parseInt(ev.dataTransfer.getData("index")), idx);
}

function onFrameDragStart(e) {
  e.dataTransfer.setData("idx", e.currentTarget.dataset.idx);
}

function onFrameDragOver(e) {
  e.preventDefault();
}

function onFrameDrop(e) {
  e.preventDefault();
  reorderFrames(
    parseInt(e.dataTransfer.getData("idx")),
    parseInt(e.currentTarget.dataset.idx),
  );
}

function onFrameDragEnd(e) { }

let contextFrameIndex = null;

function hideSlideContextMenu() {
  document.getElementById("slideContextMenu").style.display = "none";
}

function showSlideContextMenu(x, y) {
  const menu = document.getElementById("slideContextMenu");
  menu.style.display = "block";
  menu.style.left = x + 20 + "px";
  menu.style.top = y - 150 + "px";
}

function onFrameContextMenu(e) {
  e.preventDefault();
  contextFrameIndex = parseInt(e.currentTarget.dataset.idx);
  showSlideContextMenu(e.clientX, e.clientY);
}

function pasteFrameAt(idx) {
  if (!frameClipboard) {
    if (typeof showToast === "function") showToast("Nothing to paste", "info");
    return;
  }
  const cloned = createFrameFromTemplate(frameClipboard);
  getChapter().frames.splice(idx + 1, 0, cloned);
  switchFrame(idx + 1);
  scheduleAutoSave("paste_frame");
}

function contextMenuAction(act) {
  if (contextFrameIndex === null) return;
  if (act === "copy") copyFrameAt(contextFrameIndex);
  if (act === "cut") cutFrameAt(contextFrameIndex);
  if (act === "paste") pasteFrameAt(contextFrameIndex);
  if (act === "duplicate") duplicateFrameAt(contextFrameIndex);
  if (act === "remove") removeFrameAt(contextFrameIndex);
  hideSlideContextMenu();
}

function readFileAsDataURL(file, cb) {
  const reader = new FileReader();
  reader.onload = (e) => cb(e.target.result, file.name);
  reader.readAsDataURL(file);
}

async function optimizeImage(dataUrl, quality = 0.8) {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith("data:image")) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/webp", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function optimizeProjectImages() {
  if (typeof showToast === "function")
    showToast("Optimizing images...", "info");

  for (const char of project.characters) {
    for (const body of char.bodies) {
      if (body.url) body.url = await optimizeImage(body.url);
    }
    for (const face of char.faces) {
      if (face.url) face.url = await optimizeImage(face.url);
    }
  }

  for (const bg of project.assets.backgrounds) {
    if (bg.url) bg.url = await optimizeImage(bg.url);
  }
}

async function saveJSON() {
  if (typeof showLoading === "function") showLoading("Saving project...");
  try {
    await optimizeProjectImages();
    const jsonString = JSON.stringify(project);

    // Modern Save As (File System Access API)
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: "vn-project-save.vns",
          types: [
            {
              description: "Visual NV Save (.vns)",
              accept: { "application/gzip": [".vns"] },
            },
            {
              description: "JSON Project (.json)",
              accept: { "application/json": [".json"] },
            },
          ],
        });

        const writable = await handle.createWritable();

        let blobToWrite;
        // Check file extension to decide on compression
        if (handle.name.endsWith(".json")) {
          blobToWrite = new Blob([jsonString], { type: "application/json" });
        } else {
          // Default to VNS/GZIP
          if (window.CompressionStream) {
            const stream = new Blob([jsonString]).stream();
            const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
            blobToWrite = await new Response(compressedStream).blob();
          } else {
            // Fallback if browser supports FS API but not CompressionStream? Unlikely but safe.
            blobToWrite = new Blob([jsonString], { type: "application/json" });
          }
        }

        await writable.write(blobToWrite);
        await writable.close();

        if (typeof toast === "function") toast("Project saved successfully!");
        return; // Success
      } catch (err) {
        if (err.name === "AbortError") {
          // User cancelled
          return;
        }
        console.warn("File Picker failed, falling back to download:", err);
        // Fallthrough to download method
      }
    }

    // Fallback Legacy Download
    if (window.CompressionStream) {
      const stream = new Blob([jsonString]).stream();
      const compressedStream = stream.pipeThrough(
        new CompressionStream("gzip"),
      );
      const compressedBlob = await new Response(compressedStream).blob();

      const a = document.createElement("a");
      a.href = URL.createObjectURL(compressedBlob);
      a.download = "vn-project-save.vns";
      a.click();
    } else {
      const blob = new Blob([jsonString], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "vn-project-save.json";
      a.click();
    }
  } finally {
    if (typeof hideLoading === "function") hideLoading();
  }
}

function exportJSON() {
  const data = deepClone(project);

  function clean(obj) {
    for (let k in obj) {
      if (typeof obj[k] === "object" && obj[k]) clean(obj[k]);
      else if (
        k === "url" &&
        typeof obj[k] === "string" &&
        obj[k].startsWith("data:")
      )
        obj[k] = obj[k].fileName || "";
    }
  }
  clean(data);
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "vn-project.json";
  a.click();
}

async function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (typeof showLoading === "function") showLoading("Importing project...");

  try {
    let imported;
    if (
      file.name.endsWith(".vns") ||
      (file.name.endsWith(".json") && file.size > 0)
    ) {
      if (window.DecompressionStream) {
        try {
          const ds = new DecompressionStream("gzip");
          const stream = file.stream().pipeThrough(ds);
          const decompressedBlob = await new Response(stream).blob();
          const text = await decompressedBlob.text();
          imported = JSON.parse(text);
        } catch (err) {
          const text = await file.text();
          imported = JSON.parse(text);
        }
      } else {
        const text = await file.text();
        imported = JSON.parse(text);
      }
    } else {
      const text = await file.text();
      imported = JSON.parse(text);
    }

    if (imported.characters && imported.chapters) {
      project = imported;
      if (!project.assets) project.assets = { backgrounds: [] };

      // --- START ADDITION: Import Languages ---
      if (Array.isArray(project.languages)) {
        supportedLanguages = project.languages;
      } else {
        // If loading old project without languages, init defaults
        project.languages = ["EN", "TH", "JP", "CN", "KR"];
        supportedLanguages = project.languages;
      }
      // --- END ADDITION ---

      activeChapterId = project.chapters[0].id;
      loadChapter(activeChapterId);
      renderCastPalette();
      scheduleAutoSave("import_project");
      if (typeof showToast === "function")
        showToast("Project loaded", "success");
    } else alert("Invalid format");
  } catch (err) {
    console.error(err);
    alert("Parse error");
  }
  e.target.value = "";
  if (typeof hideLoading === "function") hideLoading();
}

function openModal(id) {
  document.getElementById(id).style.display = "flex";
  if (id === "characterModal") renderCharModal();
  if (id === "assetsModal") renderAssetModal();
  if (id === "chapterModal") renderChapterMgmt();
  if (id === "previewModal") updatePreviewRatio();
}

function closeModal(id) {
  if (id === "settingsModal" && typeof cancelSettings === "function") {
    cancelSettings();
    return;
  }
  document.getElementById(id).style.display = "none";
}

function renderCharModal() {
  const listPane = document.getElementById("charListPane");
  const editPane = document.getElementById("charEditPane");

  const charListHtml = project.characters
    .map((c) => {
      const thumb = c.bodies[0]?.url
        ? `background-image:url('${c.bodies[0].url}')`
        : `background-color:${c.color}`;
      return `<div class="list-item ${c.id === editingCharId ? "selected" : ""}" onclick="editingCharId='${c.id}';renderCharModal();">
              <div class="char-item-left">
                  <div class="img-preview-mini" style="${thumb}"></div>
                  <span>${c.name}</span>
              </div>
              <button class="danger" onclick="event.stopPropagation(); deleteCharacter('${c.id}')" title="Delete Character">Remove</button>
            </div>`;
    })
    .join("");

  listPane.innerHTML =
    charListHtml +
    `<div style="padding: 10px 0; text-align: center; margin-top: auto">
        <button
            class="primary-btn"
            onclick="
                addCharacter();
                closeModal('characterModal');
            "
        >
            + Add New Character
        </button>
    </div>`;

  if (!editingCharId) {
    editPane.innerHTML =
      "<p style='text-align:center;color:#999;padding:40px;'>Select a character</p>";
    return;
  }

  const char = project.characters.find((c) => c.id === editingCharId);

  const bodiesHtml = char.bodies
    .map(
      (b, i) => `
      <div class="layer-row">
        <div class="img-preview-mini" style="${b.url ? `background-image:url('${b.url}')` : `background-color:${b.color}`}"></div>
        <input type="text" value="${b.name}" onchange="updateCharLayer('bodies',${i},'name',this.value)" placeholder="Body Name">
  <label class="primary-btn">Upload<input type="file" onchange="uploadLayerImage('bodies',${i},this)" hidden accept="image/*"></label>
        <button class="danger" onclick="removeCharLayer('bodies',${i})" title="Remove">Remove</button>
      </div>`,
    )
    .join("");

  const facesHtml = char.faces
    .map(
      (f, i) => `
      <div class="layer-row">
        <div class="img-preview-mini" style="${f.url ? `background-image:url('${f.url}')` : ""}"></div>
        <input type="text" value="${f.name}" onchange="updateCharLayer('faces',${i},'name',this.value)" placeholder="Expression Name">
  <label class="primary-btn">Upload<input type="file" onchange="uploadLayerImage('faces',${i},this)" hidden accept="image/*"></label>
  <button class="primary-btn" onclick="openOverlayEditor(${i})">Graphic Editor</button>
        <button class="danger" onclick="removeCharLayer('faces',${i})" title="Remove">Remove</button>
      </div>`,
    )
    .join("");

  editPane.innerHTML = `
      <div style="padding:15px;background:var(--bg-panel);">
        <label style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">Character Name</label>
        <input type="text" value="${char.name}" onchange="updateCharPropEditor('name',this.value)" style="font-size:18px;font-weight:600;width:100%;padding:8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-panel);color:var(--text-main);">
      </div>

      <div class="chrome-tabs">
        <div class="chrome-tab active" onclick="showLayerTab('bodies')">Body Sprites (Base)</div>
        <div class="chrome-tab" onclick="showLayerTab('faces')">Expressions (Overlays)</div>
      </div>

      <div class="edit-scroll-area" style="padding:15px; overflow-y:auto; flex:1;">
          <div id="tab-bodies-content" style="display:block;">
              <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                  <h4 style="margin:0;font-size:14px;color:var(--text-main);">Body Sprites (Base)</h4>
                  <button class="primary-btn" onclick="addCharLayer('bodies')">+ Add Body</button>
              </div>
              <div class="layers-list" style="margin-bottom:20px;">
                  ${bodiesHtml}
              </div>
          </div>

          <div id="tab-faces-content" style="display:none;">
              <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                  <h4 style="margin:0;font-size:14px;color:var(--text-main);">Expressions (Overlays)</h4>
                  <button class="primary-btn" onclick="addCharLayer('faces')">+ Add Expression</button>
              </div>
              <div class="layers-list" style="margin-bottom:20px;">
                  ${facesHtml}
              </div>
          </div>
      </div>
  `;
}

function showLayerTab(tabName) {
  document
    .querySelectorAll(".chrome-tab")
    .forEach((tab) => tab.classList.remove("active"));
  document.getElementById("tab-bodies-content").style.display = "none";
  document.getElementById("tab-faces-content").style.display = "none";

  if (tabName === "bodies") {
    document.querySelector(".chrome-tab:nth-child(1)").classList.add("active");
    document.getElementById("tab-bodies-content").style.display = "block";
  } else {
    document.querySelector(".chrome-tab:nth-child(2)").classList.add("active");
    document.getElementById("tab-faces-content").style.display = "block";
  }
}

function updateCharPropEditor(key, val) {
  const char = project.characters.find((c) => c.id === editingCharId);
  if (char) char[key] = val;
  renderCharModal();
  renderCastPalette();
  renderStage();
}

function updateCharLayer(type, idx, key, val) {
  const char = project.characters.find((c) => c.id === editingCharId);
  if (char && char[type][idx]) char[type][idx][key] = val;
  renderStage();
}

function addCharLayer(type) {
  const char = project.characters.find((c) => c.id === editingCharId);
  if (type === "bodies")
    char.bodies.push({
      name: "new",
      color: char.color,
      url: null,
      fileName: null,
    });
  else
    char.faces.push({
      name: "new",
      x: 50,
      y: 20,
      scale: 1.0,
      url: null,
      fileName: null,
    });
  renderCharModal();
}

function removeCharLayer(type, idx) {
  const char = project.characters.find((c) => c.id === editingCharId);
  char[type].splice(idx, 1);
  renderCharModal();
  renderStage();
}

function uploadLayerImage(type, idx, input) {
  if (!input.files[0]) return;
  readFileAsDataURL(input.files[0], (url, fn) => {
    const char = project.characters.find((c) => c.id === editingCharId);
    char[type][idx].url = url;
    char[type][idx].fileName = fn;
    renderCharModal();
    renderCastPalette();
    renderStage();
  });
}

// --- Assets Manager (File Explorer Style) ---
let activeAssetTab = "backgrounds"; // repurpose as 'current category'
let selectedAsset = null; // Currently selected asset name

function renderAssetModal() {
  const modalBody = document.querySelector("#assetsModal .modal-body");

  // Apply Container Styles for 2-Pane Layout
  modalBody.style.display = "flex";
  modalBody.style.flexDirection = "row";
  modalBody.style.overflow = "hidden";
  modalBody.style.padding = "0"; // Reset padding
  modalBody.style.flex = "1";
  modalBody.style.height = "100%";

  const catNames = {
    "backgrounds": "Backgrounds",
    "bgm": "BGM (Music)",
    "voice": "Voice Over"
  };

  // --- HTML Structure ---
  modalBody.innerHTML = `
    <!-- Sidebar -->
    <div style="width: 200px; background: rgba(0,0,0,0.2); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 10px 0;">
        <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); padding: 0 15px 5px; text-transform: uppercase;">Library</div>
        <div class="explorer-nav-item ${activeAssetTab === 'backgrounds' ? 'active' : ''}" onclick="switchAssetExplorer('backgrounds')">
             <span>Backgrounds</span>
        </div>
        <div class="explorer-nav-item ${activeAssetTab === 'bgm' ? 'active' : ''}" onclick="switchAssetExplorer('bgm')">
             <span>BGM</span>
        </div>
        <div class="explorer-nav-item ${activeAssetTab === 'voice' ? 'active' : ''}" onclick="switchAssetExplorer('voice')">
             <span>Voice Over</span>
        </div>
    </div>

    <!-- Main Content -->
    <div style="flex: 1; display: flex; flex-direction: column; min-width: 0; background: var(--bg-body);">
        <!-- Toolbar -->
        <div style="height: 40px; border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 15px; background: var(--bg-panel);">
            <div style="font-weight: 600; font-size: 14px; color: var(--text-main); margin-right: auto;">
                 ${catNames[activeAssetTab]} 
                 <span style="font-weight:400; color:var(--text-muted); margin-left:5px; font-size:12px;">(${getAssetCount(activeAssetTab)} items)</span>
            </div>
            
            <div style="display: flex; gap: 8px;">
                <button class="primary-btn small" onclick="triggerAssetUpload()">
                    Upload
                </button>
                <button class="primary-btn small" onclick="exportAssets()">
                    Export
                </button>
                <button class="primary-btn small" onclick="renameSelectedAsset()" ${!selectedAsset ? 'disabled style="opacity:0.5"' : ''}>
                    Rename
                </button>
                <button class="danger small" onclick="deleteSelectedAsset()" ${!selectedAsset ? 'disabled style="opacity:0.5"' : ''}>
                    Delete
                </button>
            </div>
        </div>

        <!-- File Grid -->
        <div id="explorerGrid" 
             ondragover="handleAssetDragOver(event)" 
             ondragleave="handleAssetDragLeave(event)" 
             ondrop="handleAssetDrop(event)"
             onclick="deselectAsset(event)" 
             style="flex: 1; overflow-y: auto; overflow-x: hidden; padding: 15px; display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); grid-auto-rows: max-content; gap: 10px; align-content: start;">
            ${renderExplorerItems()}
        </div>
    </div>
    
    <!-- Hidden Input -->
    <input type="file" id="assetFileInput" style="display: none" />
  `;

  // Inject CSS for Nav Items if not present (simple inline style check)
  if (!document.getElementById('explorerStyles')) {
    const style = document.createElement('style');
    style.id = 'explorerStyles';
    style.textContent = `
          .explorer-nav-item {
              padding: 8px 15px;
              cursor: pointer;
              color: var(--text-muted);
              font-size: 13px;
              display: flex;
              align-items: center;
              transition: background 0.1s, color 0.1s;
          }
          .explorer-nav-item:hover {
              background: rgba(255,255,255,0.05);
              color: var(--text-main);
          }
          .explorer-nav-item.active {
              background: var(--primary-color);
              color: white;
          }
          .explorer-item {
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 8px;
              border-radius: 4px;
              border: 1px solid transparent;
              cursor: pointer;
              transition: background 0.1s;
          }
          .explorer-item:hover {
              background: rgba(255,255,255,0.05);
          }
          .explorer-item.selected {
              background: rgba(var(--primary-rgb), 0.2);
              border-color: var(--primary-color);
          }
          .explorer-thumb {
              width: 100%;
              aspect-ratio: 1;
              background-color: #111;
              border-radius: 4px;
              margin-bottom: 6px;
              background-size: cover;
              background-position: center;
              display: flex;
              align-items: center;
              justify-content: center;
              position: relative;
          }
          .explorer-label {
              font-size: 11px;
              text-align: center;
              color: var(--text-main);
              width: 100%;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
          }
      `;
    document.head.appendChild(style);
  }
}

function getAssetCount(type) {
  if (type === 'backgrounds') return project.assets.backgrounds.length;
  if (type === 'bgm') return (project.assets.bgm || []).length;
  if (type === 'voice') return (project.assets.voice || []).length;
  return 0;
}

function switchAssetExplorer(tab) {
  activeAssetTab = tab;
  selectedAsset = null; // Reset selection on switch
  renderAssetModal();
}

function renderExplorerItems() {
  let items = [];
  if (activeAssetTab === 'backgrounds') items = project.assets.backgrounds;
  else if (activeAssetTab === 'bgm') items = project.assets.bgm || [];
  else if (activeAssetTab === 'voice') items = project.assets.voice || [];

  if (items.length === 0) {
    return `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding-top: 50px; font-style: italic;">No items found. Upload one!</div>`;
  }

  return items.map(item => {
    const isSelected = selectedAsset === item.name;
    // Thumbnail logic
    let thumbContent = '';
    if (activeAssetTab === 'backgrounds') {
      thumbContent = `style="background-image: url('${item.url}')"`;
    } else {
      // Audio Icon with Play overlay if selected? logic can be simple icon
      thumbContent = `><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    }

    return `
            <div class="explorer-item ${isSelected ? 'selected' : ''}" onclick="selectAsset(event, '${item.name}')" ondblclick="previewAsset('${item.name}')">
                <div class="explorer-thumb" ${thumbContent}${activeAssetTab !== 'backgrounds' ? '' : '>'}
                   ${activeAssetTab !== 'backgrounds' ? `<div style="position:absolute; bottom:2px; right:2px; font-size:10px; color:#666;">🎵</div>` : ''}
                </div>
                <div class="explorer-label" title="${item.name}">${item.name}</div>
            </div>
        `;
  }).join("");
}

function selectAsset(e, name) {
  e.stopPropagation();
  selectedAsset = (selectedAsset === name) ? null : name; // Toggle if needed, or just set
  if (selectedAsset) {
    // Play audio preview if audio?
    if (activeAssetTab !== 'backgrounds') playAudioPreview(name);
  } else {
    stopAudioPreview();
  }
  renderAssetModal();
}

function deselectAsset(e) {
  if (e.target.id === 'explorerGrid') {
    selectedAsset = null;
    renderAssetModal();
    stopAudioPreview();
  }
}

// Drag and Drop Logic
function handleAssetDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const grid = document.getElementById("explorerGrid");
  if (grid) grid.style.background = "rgba(var(--primary-rgb), 0.1)";
}

function handleAssetDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const grid = document.getElementById("explorerGrid");
  if (grid) grid.style.background = "var(--bg-body)";
}

function handleAssetDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const grid = document.getElementById("explorerGrid");
  if (grid) grid.style.background = "var(--bg-body)";

  const files = Array.from(e.dataTransfer.files);
  if (!files || files.length === 0) return;

  files.forEach(file => {
    // Validate File Type
    if (activeAssetTab === 'backgrounds') {
      if (!file.type.startsWith("image/")) {
        console.warn("Skipped non-image file for backgrounds:", file.name);
        return;
      }
    } else {
      // Audio tabs (bgm, voice)
      if (!file.type.startsWith("audio/")) {
        console.warn("Skipped non-audio file for " + activeAssetTab + ":", file.name);
        return;
      }
    }

    // Auto-name (no prompt for bulk)
    const name = file.name.split('.')[0];

    readFileAsDataURL(file, (url, fn) => {
      if (activeAssetTab === "backgrounds") {
        project.assets.backgrounds.push({ name, url, fileName: fn });
      } else if (activeAssetTab === "bgm") {
        if (!project.assets.bgm) project.assets.bgm = [];
        project.assets.bgm.push({ name, url, fileName: fn });
      } else if (activeAssetTab === "voice") {
        if (!project.assets.voice) project.assets.voice = [];
        project.assets.voice.push({ name, url, fileName: fn });
      }

      scheduleAutoSave("add_" + activeAssetTab);
      renderAssetModal();
    });
  });
}


async function exportAssets() {
  if (typeof JSZip === 'undefined') {
    return alert("JSZip library not loaded. Please restart the app.");
  }

  const zip = new JSZip();
  let folderName = "";
  let assetsToExport = [];

  if (activeAssetTab === 'backgrounds') {
    folderName = "BackGround";
    assetsToExport = project.assets.backgrounds;
  } else if (activeAssetTab === 'bgm') {
    folderName = "Audio/Music";
    assetsToExport = project.assets.bgm || [];
  } else if (activeAssetTab === 'voice') {
    const chapter = getChapter();
    const chapterId = chapter ? chapter.id : "Unknown";
    folderName = `Audio/Voice/Chapter${chapterId}`;

    // Filter used assets
    const usedVoiceNames = new Set();
    if (chapter) {
      chapter.frames.forEach(f => {
        if (f.voiceOver && typeof f.voiceOver === 'object') {
          Object.values(f.voiceOver).forEach(v => usedVoiceNames.add(v));
        } else if (typeof f.voiceOver === 'string') {
          usedVoiceNames.add(f.voiceOver);
        }
      });
    }

    const allVoice = project.assets.voice || [];
    assetsToExport = allVoice.filter(a => usedVoiceNames.has(a.name));

    if (assetsToExport.length === 0) {
      return alert("No VoiceOver files are used in this chapter.");
    }
  }

  if (!assetsToExport || assetsToExport.length === 0) {
    return alert("No assets to export.");
  }

  if (typeof showLoading === 'function') showLoading("Zipping Assets...");

  try {
    const folder = zip.folder(folderName);

    // Process assets
    const promises = assetsToExport.map(async (asset) => {
      let data = asset.url;
      let filename = asset.fileName;

      if (!filename) {
        // Fallback if fileName missing
        let ext = "bin";
        if (data.startsWith("data:")) {
          const type = data.split(';')[0].split(':')[1];
          if (type.includes("jpeg")) ext = "jpg";
          else if (type.includes("png")) ext = "png";
          else if (type.includes("webp")) ext = "webp";
          else if (type.includes("mpeg")) ext = "mp3";
          else if (type.includes("wav")) ext = "wav";
          else if (type.includes("ogg")) ext = "ogg";
        }
        filename = `${asset.name}.${ext}`;
      }

      if (data.startsWith("data:")) {
        const content = data.split(',')[1];
        folder.file(filename, content, { base64: true });
      } else {
        // Try fetch for blob urls
        try {
          const resp = await fetch(data);
          const blob = await resp.blob();
          folder.file(filename, blob);
        } catch (e) {
          console.error("Failed to fetch asset", asset.name, e);
        }
      }
    });

    await Promise.all(promises);

    const content = await zip.generateAsync({ type: "blob" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = `${activeAssetTab}_Assets.zip`;
    a.click();

  } catch (err) {
    console.error(err);
    alert("Failed to export assets: " + err.message);
  } finally {
    if (typeof hideLoading === 'function') hideLoading();
  }
}

function triggerAssetUpload() {
  const input = document.getElementById('assetFileInput');
  if (activeAssetTab === 'backgrounds') input.accept = "image/*";
  else input.accept = "audio/*";

  input.onchange = (e) => handleAssetUpload(e, activeAssetTab);
  input.click();
}

function handleAssetUpload(e, type) {
  const file = e.target.files[0];
  if (!file) return;
  const name = prompt(`Enter name for this asset:`, file.name.split('.')[0]);
  if (!name) return;

  readFileAsDataURL(file, (url, fn) => {
    if (type === "backgrounds") {
      project.assets.backgrounds.push({ name, url, fileName: fn });
      scheduleAutoSave("add_background");
    } else if (type === "bgm") {
      if (!project.assets.bgm) project.assets.bgm = [];
      project.assets.bgm.push({ name, url, fileName: fn });
      scheduleAutoSave("add_bgm");
    } else if (type === "voice") {
      if (!project.assets.voice) project.assets.voice = [];
      project.assets.voice.push({ name, url, fileName: fn });
      scheduleAutoSave("add_voice");
    }
    renderAssetModal();
  });
  e.target.value = "";
}

function renameSelectedAsset() {
  if (!selectedAsset) return;
  const oldName = selectedAsset;
  const newName = prompt("Rename asset:", oldName);
  if (!newName || newName === oldName) return;

  // TODO: Update references (this is tricky, simplified for now to just update storage)
  // Actually existing rename logic handles ref update? No, existing logic was simple.
  // We will just rename the asset entry for now.

  let list = [];
  if (activeAssetTab === 'backgrounds') list = project.assets.backgrounds;
  else if (activeAssetTab === 'bgm') list = project.assets.bgm;
  else if (activeAssetTab === 'voice') list = project.assets.voice;

  const mk = list.find(x => x.name === oldName);
  if (mk) {
    mk.name = newName;
    scheduleAutoSave(`rename_${activeAssetTab}`);
    selectedAsset = newName; // Keep selection
    renderAssetModal();
  }
}

function deleteSelectedAsset() {
  if (!selectedAsset) return;
  if (!confirm(`Delete '${selectedAsset}'?`)) return;

  if (activeAssetTab === 'backgrounds') {
    project.assets.backgrounds = project.assets.backgrounds.filter(x => x.name !== selectedAsset);
    scheduleAutoSave("delete_bg");
  } else if (activeAssetTab === 'bgm') {
    project.assets.bgm = project.assets.bgm.filter(x => x.name !== selectedAsset);
    scheduleAutoSave("delete_bgm");
  } else if (activeAssetTab === 'voice') {
    project.assets.voice = project.assets.voice.filter(x => x.name !== selectedAsset);
    scheduleAutoSave("delete_voice");
  }
  selectedAsset = null;
  renderAssetModal();
}

// Audio Preview Helper
let previewAudioObj = null;
function playAudioPreview(name) {
  stopAudioPreview();
  let list = (activeAssetTab === 'bgm') ? project.assets.bgm : project.assets.voice;
  const asset = list.find(a => a.name === name);
  if (asset) {
    previewAudioObj = new Audio(asset.url);
    previewAudioObj.volume = 0.5;
    previewAudioObj.play();
  }
}

function stopAudioPreview() {
  if (previewAudioObj) {
    previewAudioObj.pause();
    previewAudioObj = null;
  }
}

function previewAsset(name) {
  // Double click action
  if (activeAssetTab === 'backgrounds') {
    // maybe show in modal or something? For now do nothing.
  } else {
    playAudioPreview(name);
  }
}


let currentAudio = null;
function toggleAudioPreview(btn, name) {
  if (currentAudio && currentAudio.name === name) {
    currentAudio.audio.pause();
    currentAudio = null;
    btn.textContent = "▶";
    return;
  }
  if (currentAudio) {
    currentAudio.audio.pause();
    document.querySelectorAll("#assetList button").forEach(b => { if (b.textContent === "■") b.textContent = "▶"; });
  }

  const asset = project.assets.audio.find(a => a.name === name);
  if (!asset) return;

  const audio = new Audio(asset.url);
  audio.play();
  audio.onended = () => {
    btn.textContent = "▶";
    currentAudio = null;
  };
  currentAudio = { name, audio };
  btn.textContent = "■";
}

function removeAudio(name) {
  if (!confirm("Remove this audio?")) return;
  project.assets.audio = project.assets.audio.filter(a => a.name !== name);
  renderAssetModal();
  scheduleAutoSave("remove_audio");
}

/* --- Advanced Export Logic --- */

let exportSettings = {
  exportAssets: true,
  includeUrls: true,
  autoRenameVoice: false
};

function loadExportSettings() {
  const raw = localStorage.getItem("vn_export_settings");
  if (raw) {
    try {
      exportSettings = JSON.parse(raw);
    } catch (e) { console.error("Failed to load export settings", e); }
  }

  // Apply to UI
  document.getElementById("expAssets").checked = exportSettings.exportAssets;
  document.getElementById("expUrls").checked = exportSettings.includeUrls;
  document.getElementById("expRenameVoice").checked = exportSettings.autoRenameVoice;
}

function saveExportSettings() {
  exportSettings.exportAssets = document.getElementById("expAssets").checked;
  exportSettings.includeUrls = document.getElementById("expUrls").checked;
  exportSettings.autoRenameVoice = document.getElementById("expRenameVoice").checked;

  localStorage.setItem("vn_export_settings", JSON.stringify(exportSettings));
}

function openExportModal() {
  loadExportSettings();
  openModal('exportConfigModal');
}

let activeMappingType = 'voice';

function openMappingModal() {
  // Only one modal at a time, so close config first? Or stack? 
  // Stacking is tricky with current modal logic (they use same class). 
  // But let's assume we can just open it.
  // Ideally we close config modal, open mapping.
  closeModal('exportConfigModal');
  openModal('mappingModal');
  renderMappingTable('voice'); // Default
}

function renderMappingTable(type) {
  activeMappingType = type;
  const container = document.getElementById('mappingTableContainer');

  // Highlight buttons
  const buttons = document.querySelectorAll('#mappingModal .modal-body > div:first-child button.primary-btn');
  buttons.forEach(b => {
    if (b.textContent.toLowerCase().includes(type === 'backgrounds' ? 'background' : type))
      b.style.opacity = "1";
    else
      b.style.opacity = "0.6";
  });

  let list = [];
  if (type === 'voice') list = project.assets.voice || [];
  else if (type === 'bgm') list = project.assets.bgm || [];
  else if (type === 'backgrounds') list = project.assets.backgrounds || [];

  if (list.length === 0) {
    container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted)">No assets found for ${type}</div>`;
    return;
  }

  let html = `<table class="mapping-table">
        <thead>
            <tr>
                <th style="width:40%">Original/Current Name</th>
                <th style="width:40%">Export Name (Editable)</th>
                <th style="width:20%">Status</th>
            </tr>
        </thead>
        <tbody>`;

  list.forEach((asset, idx) => {
    const isRenamed = asset.originalName && asset.originalName !== asset.name;
    html += `<tr>
            <td>${asset.originalName || asset.name}</td>
            <td>
                <input class="mapping-input" type="text" value="${asset.name}" 
                       onchange="updateAssetMapping('${type}', ${idx}, this.value)">
            </td>
            <td>
                ${isRenamed
        ? `<span class="status-badge status-changed">Renamed</span>`
        : `<span class="status-badge status-new">Original</span>`}
            </td>
        </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

function updateAssetMapping(type, idx, newName) {
  let list = [];
  if (type === 'voice') list = project.assets.voice;
  else if (type === 'bgm') list = project.assets.bgm;
  else if (type === 'backgrounds') list = project.assets.backgrounds;

  const asset = list[idx];
  if (!asset.originalName) asset.originalName = asset.name; // First edit init

  const oldName = asset.name;
  asset.name = newName;

  // Update References! (Simplified: naive find/replace in logic)
  // Ref update logic is complex. We'll reuse a generic ref updater.
  updateAssetReferences(type, oldName, newName);

  renderMappingTable(type);
  scheduleAutoSave("map_rename");
}

function updateAssetReferences(type, oldName, newName) {
  project.chapters.forEach(ch => {
    ch.frames.forEach(f => {
      if (type === 'backgrounds') {
        if (f.background === oldName) f.background = newName;
      } else if (type === 'bgm') {
        if (f.bgm === oldName) f.bgm = newName;
      } else if (type === 'voice') {
        if (typeof f.voiceOver === 'object') {
          for (let lang in f.voiceOver) {
            if (f.voiceOver[lang] === oldName) f.voiceOver[lang] = newName;
          }
        } else if (f.voiceOver === oldName) {
          f.voiceOver = newName;
        }
      }
    });
  });
}

function revertAllNames() {
  if (!confirm("Revert all asset names to their originals?")) return;

  ['backgrounds', 'bgm', 'voice'].forEach(type => {
    const list = (type === 'backgrounds') ? project.assets.backgrounds : project.assets[type];
    if (!list) return;

    list.forEach(asset => {
      if (asset.originalName) {
        const curName = asset.name;
        const orgName = asset.originalName;
        if (curName !== orgName) {
          asset.name = orgName;
          updateAssetReferences(type, curName, orgName);
          delete asset.originalName;
        }
      }
    });
  });

  renderMappingTable(activeMappingType);
  scheduleAutoSave("revert_all_names");
  if (typeof showToast === 'function') showToast("All names reverted", "success");
}

async function advancedExport() {
  closeModal('exportConfigModal');
  if (!window.JSZip) return alert("JSZip not loaded");

  if (exportSettings.autoRenameVoice) {
    performAutoRenameVoice();
  }

  if (typeof showLoading === 'function') showLoading("Building Project Package...");

  try {
    const zip = new JSZip();

    // 1. Prepare Data
    const data = deepClone(project);

    // 2. Process Assets for Zip and Data Cleaning
    if (exportSettings.exportAssets) {
      // Backgrounds
      const bgFolder = zip.folder("BackGround");
      for (const bg of data.assets.backgrounds) {
        if (bg.url && bg.url.startsWith("data:")) {
          const ext = getExt(bg.url) || "png";
          bgFolder.file(`${bg.name}.${ext}`, bg.url.split(',')[1], { base64: true });
          // Strip URL from JSON if configured
          if (!exportSettings.includeUrls) bg.url = `BackGround/${bg.name}.${ext}`;
        }
      }

      // BGM
      if (data.assets.bgm) {
        const musicFolder = zip.folder("Audio/Music");
        for (const m of data.assets.bgm) {
          if (m.url && m.url.startsWith("data:")) {
            const ext = getExt(m.url) || "mp3";
            musicFolder.file(`${m.name}.${ext}`, m.url.split(',')[1], { base64: true });
            if (!exportSettings.includeUrls) m.url = `Audio/Music/${m.name}.${ext}`;
          }
        }
      }

      // Voice
      if (data.assets.voice) {
        // Voice needs to go into chapter folders? Or just Audio/Voice flat?
        // Request said: "VoiceOver also 'Audio/Voice/Chapter{ID}/'" when exporting specific assets.
        // For FULL PROJECT export, structurally it's better to organize by chapter IF possible, 
        // but assets list is global. 
        // Let's assume a flat Audio/Voice for project export unless we want to duplicate.
        // Actually user request "Auto rename to match standard". 
        // Let's use Audio/Voice root for project package to avoid complexity of detecting usage again,
        // OR we can organize if we renamed them to include Chapter ID.

        const voiceFolder = zip.folder("Audio/Voice");
        for (const v of data.assets.voice) {
          if (v.url && v.url.startsWith("data:")) {
            const ext = getExt(v.url) || "mp3";
            voiceFolder.file(`${v.name}.${ext}`, v.url.split(',')[1], { base64: true });
            if (!exportSettings.includeUrls) v.url = `Audio/Voice/${v.name}.${ext}`;
          }
        }
      }

      // Characters (Bodies & Faces)
      if (data.characters) {
        const charFolder = zip.folder("Characters");
        for (const char of data.characters) {
          const safeName = char.name.replace(/[^a-zA-Z0-9-_]/g, '_');
          const cFolder = charFolder.folder(safeName);

          // Bodies
          if (char.bodies) {
            for (const b of char.bodies) {
              if (b.url && b.url.startsWith("data:")) {
                const ext = getExt(b.url) || "png";
                cFolder.file(`${b.name}.${ext}`, b.url.split(',')[1], { base64: true });
                if (!exportSettings.includeUrls) b.url = `Characters/${safeName}/${b.name}.${ext}`;
              }
            }
          }

          // Faces
          if (char.faces) {
            for (const f of char.faces) {
              if (f.url && f.url.startsWith("data:")) {
                const ext = getExt(f.url) || "png";
                cFolder.file(`${f.name}.${ext}`, f.url.split(',')[1], { base64: true });
                if (!exportSettings.includeUrls) f.url = `Characters/${safeName}/${f.name}.${ext}`;
              }
            }
          }
        }
      }
    }

    // 3. Add Project JSON
    zip.file("project.json", JSON.stringify(data, null, 2));

    // 4. Download
    const content = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = `Project_Export_${Date.now()}.zip`;
    a.click();

  } catch (e) {
    console.error(e);
    alert("Export failed: " + e.message);
  } finally {
    if (typeof hideLoading === 'function') hideLoading();
  }
}

function closeMappingModal() {
  closeModal('mappingModal');
  openModal('exportConfigModal');
}

function triggerAutoRename() {
  performAutoRenameVoice();
  renderMappingTable(activeMappingType);
}

function performAutoRenameVoice() {
  // Iterate all chapters, rename used voice files to ChX_FrY_Name
  const usedAssets = new Map(); // Name -> { firstUsage: "ChX_FrY", original: "..." }

  project.chapters.forEach(ch => {
    ch.frames.forEach((iframe, fIdx) => {
      const processVoice = (vName) => {
        if (!vName || usedAssets.has(vName)) return;
        usedAssets.set(vName, `Ch${ch.id}_Fr${fIdx + 1}`);
      };

      if (typeof iframe.voiceOver === 'object') {
        Object.values(iframe.voiceOver).forEach(processVoice);
      } else if (typeof iframe.voiceOver === 'string') {
        processVoice(iframe.voiceOver);
      }
    });
  });

  if (!project.assets.voice) return;

  let count = 0;
  project.assets.voice.forEach((v, idx) => {
    const prefix = usedAssets.get(v.name);
    if (prefix) {
      // It is used, rename it
      if (!v.originalName) v.originalName = v.name;
      const cleanName = v.originalName.replace(/\s+/g, '_');
      const newName = `${prefix}_${cleanName}`;

      // Apply rename
      updateAssetReferences('voice', v.name, newName);
      v.name = newName;
      count++;
    }
  });

  if (count > 0 && typeof showToast === 'function')
    showToast(`Auto-renamed ${count} voice files`, 'success');
}

function getExt(dataUrl) {
  if (!dataUrl) return "";
  const type = dataUrl.split(';')[0].split(':')[1];
  if (type.includes("jpeg")) return "jpg";
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("mpeg")) return "mp3";
  if (type.includes("wav")) return "wav";
  if (type.includes("ogg")) return "ogg";
  return "bin";
}

function renameBackground(oldName) {
  const newName = prompt("Enter new name for background:", oldName);
  if (!newName || newName === oldName) return;

  // Check duplicates
  if (project.assets.backgrounds.some(b => b.name === newName)) {
    return alert("A background with this name already exists.");
  }

  // Update Asset
  const bg = project.assets.backgrounds.find(b => b.name === oldName);
  if (bg) bg.name = newName;

  // Update References
  project.chapters.forEach(ch => {
    ch.frames.forEach(f => {
      if (f.background === oldName) {
        f.background = newName;
      }
    });
  });

  renderAssetModal();
  renderInspector(); // Refresh properties if current frame uses this bg
  scheduleAutoSave("rename_background");
}

function triggerBgReplacement(name) {
  const input = document.getElementById("bgReplaceInput");
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    readFileAsDataURL(file, (url, fn) => {
      const bg = project.assets.backgrounds.find(b => b.name === name);
      if (bg) {
        bg.url = url;
        bg.fileName = fn;
        renderAssetModal();
        renderStage(); // Update stage if current frame uses this bg
        scheduleAutoSave("replace_background_image");
      }
    });
    input.value = ""; // Reset
  };
  input.click();
}

function removeBackground(name) {
  project.assets.backgrounds = project.assets.backgrounds.filter(
    (b) => b.name !== name,
  );
  renderAssetModal();
  renderInspector();
  renderStage();
}

function renderChapterMgmt() {
  const list = document.getElementById("chapterMgmtList");
  list.innerHTML = project.chapters
    .map(
      (ch) => `
    <div class="list-item ${ch.id === activeChapterId ? "selected" : ""}" style="cursor: default; gap: 10px;">
      <input type="text" value="${ch.title}" 
             onclick="event.stopPropagation()" 
             onchange="project.chapters.find(c => c.id === ${ch.id}).title = this.value; scheduleAutoSave('rename_chapter');"
             style="flex:1;">
      <button class="primary-btn small" onclick="loadChapter(${ch.id}); closeModal('chapterModal');">Open</button>
      <button class="danger small" onclick="deleteChapter(${ch.id})">Delete</button>
    </div>`,
    )
    .join("");
}

async function init() {
  await restoreProjectData();

  renderCastPalette();

  loadChapter(activeChapterId || 1);

  if (!project.assets.backgrounds.length)
    project.assets.backgrounds.push({
      name: "default_bg",
      url: "",
    });

  if (!project.assets.audio) project.assets.audio = [];

  initOverlayEditorEvents();

  document.addEventListener("click", (e) => {
    if (!document.getElementById("slideContextMenu").contains(e.target))
      hideSlideContextMenu();
  });

  document.getElementById("bgFileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const name = prompt("Background name:");
    if (!name) return;
    readFileAsDataURL(file, (url, fn) => {
      project.assets.backgrounds.push({
        name,
        url,
        fileName: fn,
      });
      renderAssetModal();
      scheduleAutoSave("add_background");
    });
  });

  renderInspector();
  renderFilmstrip();
  renderStage();

  scheduleAutoSave("init");

  if (typeof initSettingsModal === "function") {
    initSettingsModal();
  }
  if (typeof initSettingsModal === "function") {
    initSettingsModal();
  }
  initStageViewEvents();
  initFilmstripEvents();
}

function initFilmstripEvents() {
  const filmstrip = document.getElementById("filmstrip");
  if (filmstrip) {
    filmstrip.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        filmstrip.scrollLeft += e.deltaY;
      },
      { passive: false }
    );
  }
}

function initStageViewEvents() {
  const wrapper = document.getElementById("stageWrapper");
  const stage = document.getElementById("visualStage");

  wrapper.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      let newScale = stageView.scale + delta;

      newScale = Math.max(0.1, Math.min(5, newScale));
      stageView.scale = newScale;
      updateStageTransform();
    },
    { passive: false },
  );

  wrapper.addEventListener("mousedown", (e) => {
    if (e.button === 1 || (e.button === 0 && e.code === "Space")) {
      e.preventDefault();
      stageView.isPanning = true;
      stageView.startX = e.clientX - stageView.x;
      stageView.startY = e.clientY - stageView.y;
      wrapper.style.cursor = "grabbing";
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!stageView.isPanning) return;
    e.preventDefault();
    stageView.x = e.clientX - stageView.startX;
    stageView.y = e.clientY - stageView.startY;
    updateStageTransform();
  });

  window.addEventListener("mouseup", () => {
    if (stageView.isPanning) {
      stageView.isPanning = false;
      wrapper.style.cursor = "default";
    }
  });

  window.addEventListener("keydown", (e) => {
    if (
      e.code === "Space" &&
      !e.repeat &&
      document.activeElement === document.body
    ) {
      wrapper.style.cursor = "grab";
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      wrapper.style.cursor = "default";
    }
  });
}

function updateStageTransform() {
  const stage = document.getElementById("visualStage");
  const wrapper = document.getElementById("stageWrapper");

  if (stage && wrapper) {
    const wrapperRect = wrapper.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();

    const VISIBLE_MARGIN = 100 * stageView.scale;

    const minX =
      -(900 * stageView.scale) / 2 - wrapperRect.width / 2 + VISIBLE_MARGIN;
    const maxX =
      (900 * stageView.scale) / 2 + wrapperRect.width / 2 - VISIBLE_MARGIN;

    const scaledWidth = 900 * stageView.scale;
    const scaledHeight = 550 * stageView.scale;

    let xRange = 0;
    if (scaledWidth > wrapperRect.width) {
      xRange = (scaledWidth - wrapperRect.width) / 2;
    } else {
      xRange = (wrapperRect.width - scaledWidth) / 2;
    }

    const limitX = Math.max(0, scaledWidth / 2 + wrapperRect.width / 2 - 50);
    const limitY = Math.max(0, scaledHeight / 2 + wrapperRect.height / 2 - 50);

    stageView.x = Math.max(-limitX, Math.min(limitX, stageView.x));
    stageView.y = Math.max(-limitY, Math.min(limitY, stageView.y));
  }

  stage.style.transform = `translate(${stageView.x}px, ${stageView.y}px) scale(${stageView.scale})`;

  const label = document.getElementById("stageZoomLabel");
  if (label) label.textContent = Math.round(stageView.scale * 100) + "%";
}

function resetStageView() {
  stageView.scale = 1;
  stageView.x = 0;
  stageView.y = 0;
  updateStageTransform();
}

init();

function showLoading(text = "Processing...") {
  const modal = document.getElementById("loadingModal");
  if (modal) {
    document.getElementById("loadingText").innerText = text;
    modal.classList.add("visible");
  }
}

function hideLoading() {
  const modal = document.getElementById("loadingModal");
  if (modal) modal.classList.remove("visible");
}

function newProject() {
  if (confirm("Create a new project? Any unsaved changes will be lost.")) {
    project = {
      assets: { backgrounds: [], bgm: [], voice: [] },
      characters: [],
      chapters: [
        {
          id: 1,
          title: "Episode 1",
          startFrameId: null,
          frames: [
            {
              id: 100,
              text: { EN: "Start here..." },
              speakerId: "",
              background: "none",
              slots: [null, null, null, null],
            },
          ],
        },
      ],
    };

    activeChapterId = 1;
    activeFrameIndex = 0;
    selectedSlotIndex = -1;

    loadChapter(1);
    showToast("New project created", "success");
    scheduleAutoSave("new_project");
  }
}
