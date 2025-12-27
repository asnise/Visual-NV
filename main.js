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
          text: "Welcome! Drag characters to the slots.",
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

let __saveTimer = null;
function scheduleAutoSave(reason = "") {
  if (__saveTimer) clearTimeout(__saveTimer);
  __saveTimer = setTimeout(() => {
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
          },
        },
      };
      localStorage.setItem(VN_LOCAL_PROJECT_KEY, JSON.stringify(payload));
    } catch (e) {}
  }, 200);
}

try {
  window.scheduleAutoSave = scheduleAutoSave;
} catch (e) {}

function tryRestoreFromLocalStorage() {
  try {
    const raw = localStorage.getItem(VN_LOCAL_PROJECT_KEY);
    if (!raw) return false;

    const payload = JSON.parse(raw);
    if (!payload || payload.v !== VN_LOCAL_PROJECT_VERSION) return false;
    if (!payload.data || !payload.data.project) return false;

    project = payload.data.project;

    const ui = payload.data.ui || {};
    if (typeof ui.activeChapterId === "number")
      activeChapterId = ui.activeChapterId;
    if (typeof ui.activeFrameIndex === "number")
      activeFrameIndex = ui.activeFrameIndex;
    if (typeof ui.selectedSlotIndex === "number")
      selectedSlotIndex = ui.selectedSlotIndex;
    if (typeof ui.activeFilmstripTab === "string")
      activeFilmstripTab = ui.activeFilmstripTab;

    if (ui.stageView && typeof ui.stageView === "object")
      stageView = { ...stageView, ...ui.stageView };
    if (ui.editorState && typeof ui.editorState === "object")
      editorState = { ...editorState, ...ui.editorState };

    return true;
  } catch (e) {
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
  return ch ? ch.frames[activeFrameIndex] : null;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createFrameFromTemplate(templateFrame) {
  const clone = deepClone(templateFrame);
  clone.id = Date.now() + Math.floor(Math.random() * 1000);
  if (!Array.isArray(clone.slots)) clone.slots = [null, null, null, null];
  clone.slots = clone.slots.slice(0, 4);
  while (clone.slots.length < 4) clone.slots.push(null);
  clone.slots.forEach((s) => {
    if (s) s.anim = "none";
  });
  if (!clone.choices) clone.choices = [];
  if (!clone.attributes) clone.attributes = {};
  if (!clone.frameType) clone.frameType = "main";
  if (clone.frameType === "instant" && !clone.returnToFrame) {
    clone.returnToFrame = "end";
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
    text: "Chapter Start",
    speakerId: "",
    background: "none",
    slots: [null, null, null, null],
  });
  renderChapterMgmt();
  loadChapter(id);
  scheduleAutoSave("add_chapter");
}

function newProject() {
  const ok = confirm("Create a new project? Unsaved changes will be lost.");
  if (!ok) return;

  project = {
    assets: { backgrounds: [] },
    characters: [],
    chapters: [
      {
        id: Date.now(),
        title: "New Project",
        frames: [
          { id: Date.now() + 1, text: "Start", speakerId: "", background: "none", slots: [null, null, null, null] },
        ],
      },
    ],
  };

  activeChapterId = project.chapters[0].id;
  loadChapter(activeChapterId);
  renderCastPalette();
  scheduleAutoSave("new_project");
  if (typeof showToast === "function") showToast("New project created", "success");
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
        text: "",
        speakerId: "",
        background: "none",
        slots: [null, null, null, null],
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
  getFrame().text = val;
  renderStage();
  renderFilmstrip();
  scheduleAutoSave("update_text");
}

function updateFrameChoice(index, key, val) {
  const frame = getFrame();
  if (!frame.choices) frame.choices = [];
  if (frame.choices[index]) {
    frame.choices[index][key] = val;
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
  selectedSlotIndex = -1;
  renderStage();
  renderInspector();
  renderFilmstrip();
  scheduleAutoSave("switch_frame");
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
  for (let i = 0; i < 4; i++)
    if (frame.slots[i]?.charId === charId) frame.slots[i] = null;
  const char = project.characters.find((c) => c.id === charId);
  const defaultBody = char?.bodies[0]?.name || "default";
  const defaultFace = char?.faces[0]?.name || "none";
  frame.slots[index] = {
    charId,
    body: defaultBody,
    face: defaultFace,
    anim: "fade_in",
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

  let text = frame.text || "Click here to edit text...";
  text = text.replace(
    /\{([^}]+)\}/g,
    '<span style="color:#3b82f6;font-weight:bold;">[$1]</span>',
  );
  document.getElementById("overlayText").innerHTML = text;

  for (let i = 0; i < 4; i++) {
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
      return `<div class="film-frame ${idx === activeFrameIndex ? "active" : ""}" data-idx="${idx}"
             draggable="true" onclick="switchFrame(${idx})"
             ondragstart="onFrameDragStart(event)" ondragover="onFrameDragOver(event)"
             ondrop="onFrameDrop(event)" ondragend="onFrameDragEnd(event)"
             oncontextmenu="onFrameContextMenu(event)">
      <div class="frame-num">${idx + 1}</div>
      <div class="thumb-preview">${dots}</div>
      <div class="frame-caption">${f.text || "..."}</div>
    </div>`;
    })
    .join("");

  html += `<div class="film-frame film-frame-add" onclick="addFrame()">
            <div class="plus-icon">+</div>
          </div>`;

  reel.innerHTML = html;
}

function renderInspector() {
  const container = document.getElementById("inspectorContent");

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

  const frame = getFrame();

  const iconExpanded = `
    <svg class="icon-expanded" style="width:16px; height:16px; margin-right:5px;" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 9-7 7-7-7"/>
    </svg>`;

  const iconCollapsed = `
    <svg class="icon-collapsed" style="width:16px; height:16px; margin-right:5px;" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 5 7 7-7 7"/>
    </svg>`;

  const styles = `
    <style>
        details > summary {
            list-style: none;
            cursor: pointer;
            font-weight: 600;
            margin-bottom: 10px;
            user-select: none;
            display: flex;
            align-items: center;
            outline: none;
        }
        details > summary::-webkit-details-marker { display: none; }


        details[open] .icon-collapsed { display: none; }
        details:not([open]) .icon-expanded { display: none; }
    </style>`;

  if (selectedSlotIndex === -1) {
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

    let instantControls = "";

    container.innerHTML = `
      ${styles}
      <div class="form-group">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <label>Speaker</label>
            <span style="font-size:10px; color:var(--text-muted);">ID: ${frame.id}</span>
        </div>
        <select onchange="updateSpeaker(this.value)"><option value="">(Narrator)</option>${speakerOpts}</select>
      </div>

      <div class="form-group"><label>Dialogue Text</label><textarea oninput="updateText(this.value)">${frame.text || ""}</textarea></div>

      ${instantControls}

      <details id="details-choices" class="form-group" style="border-top:1px solid var(--border); margin-top:10px; padding-top:10px;" ${choicesOpen ? "open" : ""}>
          <summary>
            ${iconExpanded}
            ${iconCollapsed}
            Choices
          </summary>
          ${(frame.choices || [])
            .map((c, i) => {
              const type = c.type || "jump";
              const targetLabel =
                type === "jump"
                  ? "Target Frame (via Node Graph)"
                  : "Function Name";
              const targetPlaceholder =
                type === "jump" ? "Frame ID" : "myFunction()";

              const isOpen = !!choiceOpenMap[String(i)];

              return `
              <details data-choice-open="${isOpen ? i : ""}" style="background: rgba(0,0,0,0.05); padding: 8px; border-radius: 4px; margin-bottom: 8px; border: 1px solid var(--border);" ${isOpen ? "open" : ""}>
                  <summary style="list-style:none; cursor:pointer; user-select:none; display:flex; align-items:center; gap:6px; margin-bottom: 8px;">
                    <span style="font-weight:700;">Choice ${i + 1}</span>
                    <span style="font-size:11px; opacity:0.7; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${(c.text || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>
                  </summary>

                  <div style="margin-bottom: 4px;">
                      <label style="font-size: 11px; opacity: 0.7;">Type</label>
                      <select class="inspector-input" onchange="updateFrameChoice(${i}, 'type', this.value)" style="width: 100%; box-sizing: border-box;">
                          <option value="jump" ${type === "jump" ? "selected" : ""}>Jump Frame</option>
                          <option value="exec" ${type === "exec" ? "selected" : ""}>Execute Function</option>
                      </select>
                  </div>
                  <div style="margin-bottom: 4px;">
                      <label style="font-size: 11px; opacity: 0.7;">Choice Text</label>
                      <input class="inspector-input" type="text" value="${c.text}" onchange="updateFrameChoice(${i}, 'text', this.value)" style="width: 100%; box-sizing: border-box;">
                  </div>
                  ${
                    type === "jump"
                      ? `<div style="margin-bottom: 4px;">
                          <label style="font-size: 11px; opacity: 0.7;">${targetLabel}</label>
                          <button class="primary-btn small" type="button" onclick="openNodeGraphV2()" style="width: 100%;">
                            Open Storyline Node Editor
                          </button>
                        </div>`
                      : `<div style="margin-bottom: 4px;">
                          <label style="font-size: 11px; opacity: 0.7;">${targetLabel}</label>
                          <input class="inspector-input" type="text" value="${c.target || ""}" onchange="updateFrameChoice(${i}, 'target', this.value)" style="width: 100%; box-sizing: border-box;" placeholder="${targetPlaceholder}">
                        </div>`
                  }
                  <button class="danger small" onclick="removeFrameChoice(${i})" style="width: 100%; margin-top: 4px;">Remove</button>
              </details>`;
            })
            .join("")}
          <button class="primary-btn small" onclick="addFrameChoice()" style="width: 100%;">+ Add Choice</button>
      </details>

      <details id="details-exec" class="form-group" style="border-top:1px solid var(--border); margin-top:10px; padding-top:10px;" ${execOpen ? "open" : ""}>
          <summary>
            ${iconExpanded}
            ${iconCollapsed}
            Execute Function
          </summary>
          ${(frame.executeFunctions || [])
            .map(
              (val, i) => `
              <div style="background: rgba(0,0,0,0.05); padding: 8px; border-radius: 4px; margin-bottom: 8px; border: 1px solid var(--border);">
                  <div style="margin-bottom: 4px;">
                      <input class="inspector-input" type="text" value="${val}" oninput="updateExecuteFunction(${i}, this.value)" style="width: 100%; box-sizing: border-box;" placeholder="FunctionName()">
                  </div>
                  <button class="danger small" onclick="deleteExecuteFunction(${i})" style="width: 100%; margin-top: 4px;">Remove</button>
              </div>
          `,
            )
            .join("")}
          <button class="primary-btn small" onclick="addExecuteFunction()" style="width: 100%;">+ Add Function</button>
      </details>

      <div class="form-group" style="border-top:1px solid var(--border); margin-top:10px; padding-top:10px;">
        <label>Background</label>
        <select onchange="updateBackground(this.value)">${bgOpts}</select>
        <button class="primary-btn" onclick="openModal('assetsModal')" style="margin-top:5px;">Manage Assets</button>
      </div>

      <button class="danger" onclick="deleteFrame()" style="margin-top:20px;">Delete Slide</button>`;
    return;
  }

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
      <div class="form-group"><label>Body Sprite (Base Layer)</label><select onchange="updateSlotProp('body',this.value)">${bodyOpts}</select></div>
      <div class="form-group"><label>Face Expression (Overlay Layer)</label><select onchange="updateSlotProp('face',this.value)">${faceOpts}</select></div>
      <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div><label>Scale</label><input type="number" step="0.1" value="${slot.scale}" onchange="updateSlotProp('scale',this.value)"></div>
        <div><label>Z-Index</label><input type="number" step="1" value="${slot.zIndex}" onchange="updateSlotProp('zIndex',this.value)"></div>
        <div><label>X Offset</label><input type="number" step="10" value="${slot.x}" onchange="updateSlotProp('x',this.value)"></div>
        <div><label>Y Offset</label><input type="number" step="10" value="${slot.y}" onchange="updateSlotProp('y',this.value)"></div>
      </div>
      <div class="form-group">
        <label>Effects</label>
        <label class="primary-btn small" style="width:100%;justify-content:center;">
           <input type="checkbox" ${slot.mirror ? "checked" : ""} onchange="updateSlotProp('mirror', this.checked)"> Mirror (Flip X)
        </label>
      </div>
      <div class="form-group"><label>Animation</label>
        <select onchange="updateSlotProp('anim',this.value)">
            <option value="none" ${slot.anim === "none" ? "selected" : ""}>None</option>
            <option value="fade_in" ${slot.anim === "fade_in" ? "selected" : ""}>Fade In</option>
            <option value="slide_left" ${slot.anim === "slide_left" ? "selected" : ""}>Slide In Left</option>
            <option value="slide_right" ${slot.anim === "slide_right" ? "selected" : ""}>Slide In Right</option>
            <option value="shake" ${slot.anim === "shake" ? "selected" : ""}>Shake</option>
        </select>
      </div>`;
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

function onFrameDragEnd(e) {}

let contextFrameIndex = null;

function hideSlideContextMenu() {
  document.getElementById("slideContextMenu").style.display = "none";
}

function showSlideContextMenu(x, y) {
  const menu = document.getElementById("slideContextMenu");
  menu.style.display = "block";
  menu.style.left = x + 20 + "px";
  menu.style.top = y - 30 + "px";
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

    if (window.CompressionStream) {
      const stream = new Blob([jsonString]).stream();
      const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
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
      if (!project.assets)
        project.assets = {
          backgrounds: [],
        };
      activeChapterId = project.chapters[0].id;
      loadChapter(activeChapterId);
      renderCastPalette();
      scheduleAutoSave("import_project");
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

  listPane.innerHTML = project.characters
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
              <div class="layers-list">
                  ${facesHtml}
              </div>
          </div>
      </div>`;
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

function renderAssetModal() {
  const list = document.getElementById("assetList");
  list.innerHTML = project.assets.backgrounds
    .map(
      (b) => `
    <div class="asset-item">
      <div class="asset-thumb" style="background-image:url('${b.url}')"></div>
      <span>${b.name}</span>
      <button onclick="removeBackground('${b.name}')">Remove</button>
    </div>`,
    )
    .join("");
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
    <div class="list-item ${ch.id === activeChapterId ? "selected" : ""}" onclick="loadChapter(${ch.id})">
      <input type="text" value="${ch.title}" onchange="project.chapters.find(c => c.id === ${ch.id}).title = this.value">
      <button class="danger" onclick="event.stopPropagation(); deleteChapter(${ch.id})">Delete</button>
    </div>`,
    )
    .join("");
}

function init() {
  tryRestoreFromLocalStorage();

  renderCastPalette();

  loadChapter(activeChapterId || 1);

  if (!project.assets.backgrounds.length)
    project.assets.backgrounds.push({
      name: "default_bg",
      url: "",
    });

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
  initStageViewEvents();
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

// เพิ่ม Helper Functions สำหรับ Loading
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

// ฟังก์ชัน New Project
function newProject() {
  if (confirm("Create a new project? Any unsaved changes will be lost.")) {
    // รีเซ็ตค่า Project เป็นค่าเริ่มต้น
    project = {
      assets: { backgrounds: [] },
      characters: [],
      chapters: [
        {
          id: 1,
          title: "Episode 1",
          startFrameId: null, // เพิ่ม startFrameId
          frames: [
            {
              id: 100,
              text: "Start here...",
              speakerId: "",
              background: "none",
              slots: [null, null, null, null],
            },
          ],
        },
      ],
    };

    // รีเซ็ต UI State
    activeChapterId = 1;
    activeFrameIndex = 0;
    selectedSlotIndex = -1;

    // โหลดหน้าจอใหม่
    loadChapter(1);
    showToast("New project created", "success");
    scheduleAutoSave("new_project");
  }
}
