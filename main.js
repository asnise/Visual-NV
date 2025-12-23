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

let activeChapterId = 1;
let activeFrameIndex = 0;
let selectedSlotIndex = -1;
let previewCurrentIndex = 0;
let editingCharId = null;
let editingOverlayIdx = -1;
let frameClipboard = null;

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
}

function deleteChapter(id) {
  if (project.chapters.length <= 1) return alert("Cannot delete last chapter");
  project.chapters = project.chapters.filter((c) => c.id !== id);
  loadChapter(project.chapters[0].id);
  renderChapterMgmt();
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
  chapter.frames.push(createFrameFromTemplate(template));
  switchFrame(chapter.frames.length - 1);
}

function deleteFrame() {
  removeFrameAt(activeFrameIndex);
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
}

function updateText(val) {
  getFrame().text = val;
  renderStage();
  renderFilmstrip();
}

function updateSpeaker(val) {
  getFrame().speakerId = val;
  renderStage();
}

function updateBackground(val) {
  getFrame().background = val;
  renderStage();
}

function loadChapter(id) {
  activeChapterId = id;
  activeFrameIndex = 0;
  selectedSlotIndex = -1;
  closeModal("chapterModal");
  if (getChapter().frames.length === 0) addFrame();
  switchFrame(0);
}

function switchFrame(index) {
  activeFrameIndex = index;
  selectedSlotIndex = -1;
  renderStage();
  renderInspector();
  renderFilmstrip();
}

function selectSlot(index) {
  selectedSlotIndex = index;
  renderStage();
  renderInspector();
}

function clearSlot(index) {
  getFrame().slots[index] = null;
  selectedSlotIndex = -1;
  renderStage();
  renderInspector();
  renderFilmstrip();
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
  };
  selectedSlotIndex = index;
  renderStage();
  renderInspector();
  renderFilmstrip();
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
    wrapper.style.transform = `translate(${slot.x || 0}px, ${slot.y || 0}px) scale(${slot.scale || 1})`;

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
      closeBtn.className = "char-remove-btn";
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
  let html = chapter.frames
    .map((f, idx) => {
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
  const frame = getFrame();

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
    container.innerHTML = `
      <div class="form-group"><label>Speaker</label><select onchange="updateSpeaker(this.value)"><option value="">(Narrator)</option>${speakerOpts}</select></div>
      <div class="form-group"><label>Dialogue Text</label><textarea oninput="updateText(this.value)">${frame.text || ""}</textarea></div>
      <div class="form-group"><label>Background</label><select onchange="updateBackground(this.value)">${bgOpts}</select><button class="text-btn" onclick="openModal('assetsModal')">Manage</button></div>
      <button class="delete-slide-btn" onclick="deleteFrame()">Delete Slide</button>`;
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
    <div style="margin-bottom:15px;padding-bottom:10px;border-bottom:1px solid #eee;"><strong>${char.name}</strong> (Slot ${selectedSlotIndex})</div>
    <div class="form-group"><label>Body Sprite (Base Layer)</label><select onchange="updateSlotProp('body',this.value)">${bodyOpts}</select></div>
    <div class="form-group"><label>Face Expression (Overlay Layer)</label><select onchange="updateSlotProp('face',this.value)">${faceOpts}</select></div>
    <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div><label>Scale</label><input type="number" step="0.1" value="${slot.scale || 1}" onchange="updateSlotProp('scale',this.value)"></div>
      <div><label>Layer Index</label><input type="number" step="1" value="${slot.zIndex !== undefined ? slot.zIndex : 0}" onchange="updateSlotProp('zIndex',this.value)"></div>
    </div>
    <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div><label>Pos X</label><input type="number" step="10" value="${slot.x || 0}" onchange="updateSlotProp('x',this.value)"></div>
      <div><label>Pos Y</label><input type="number" step="10" value="${slot.y || 0}" onchange="updateSlotProp('y',this.value)"></div>
    </div>
    <div class="form-group"><label>Entrance Animation</label><select onchange="updateSlotProp('anim',this.value)">
      <option value="none" ${slot.anim === "none" ? "selected" : ""}>None</option>
      <option value="fade_in" ${slot.anim === "fade_in" ? "selected" : ""}>Fade In</option>
      <option value="slide_left" ${slot.anim === "slide_left" ? "selected" : ""}>Slide Left</option>
      <option value="slide_right" ${slot.anim === "slide_right" ? "selected" : ""}>Slide Right</option>
    </select></div>
    <button class="delete-slide-btn" onclick="clearSlot(${selectedSlotIndex})">Remove Character</button>`;
}

function updatePreviewRatio() {
  const select = document.getElementById("previewRatio");
  const customInput = document.getElementById("customRatio");
  const vp = document.getElementById("pViewport");
  if (select.value === "custom") {
    customInput.style.display = "inline-block";
    applyCustomRatio();
  } else {
    customInput.style.display = "none";
    const ratio = select.value.split(":");
    const w = parseInt(ratio[0]);
    const h = parseInt(ratio[1]);
    vp.style.aspectRatio = `${w}/${h}`;
  }
}

function applyCustomRatio() {
  const input = document.getElementById("customRatio").value.trim();
  const vp = document.getElementById("pViewport");
  if (/^\d+:\d+$/.test(input)) {
    vp.style.aspectRatio = input.replace(":", "/");
  }
}

function renderPreviewFrame() {
  const chapter = getChapter();
  const frame = chapter.frames[previewCurrentIndex];
  const bgObj = project.assets.backgrounds.find(
    (b) => b.name === frame.background,
  );
  const vp = document.getElementById("pViewport");
  vp.style.backgroundImage = bgObj?.url ? `url('${bgObj.url}')` : "none";

  const speaker = project.characters.find((c) => c.id === frame.speakerId);
  document.getElementById("pSpeaker").textContent = speaker
    ? speaker.name
    : "Narrator";
  document.getElementById("pSpeaker").style.color = speaker
    ? speaker.color
    : "#fff";

  let text = frame.text || "";
  text = text.replace(
    /\{([^}]+)\}/g,
    '<span style="color:#3b82f6;font-weight:bold;">[$1]</span>',
  );
  document.getElementById("pText").innerHTML = text;

  const dialogueLayer = document.querySelector(".p-dialogue-layer");
  dialogueLayer.classList.toggle("visible", !!frame.text);

  for (let i = 0; i < 4; i++) {
    const slotEl = document.getElementById(`pSlot${i}`);
    slotEl.innerHTML = "";
    const slot = frame.slots[i];
    if (!slot) continue;

    const char = project.characters.find((c) => c.id === slot.charId);
    if (!char) continue;

    const body =
      char.bodies.find((b) => b.name === slot.body) || char.bodies[0];
    const face =
      slot.face && slot.face !== "none"
        ? char.faces.find((f) => f.name === slot.face)
        : null;

    const charDiv = document.createElement("div");
    charDiv.className = "p-char";

    const visual = document.createElement("div");
    visual.className = "p-char-visual";
    visual.style.transform = `translate(${slot.x || 0}px, ${slot.y || 0}px) scale(${slot.scale || 1})`;

    if (slot.anim && slot.anim !== "none") {
      let animClass = "preview-char-enter-fade";
      if (slot.anim === "slide_left") animClass = "preview-char-enter-left";
      if (slot.anim === "slide_right") animClass = "preview-char-enter-right";
      visual.classList.add(animClass);
    }

    if (body?.url) {
      const img = document.createElement("img");
      img.src = body.url;
      img.className = "p-char-img";
      img.style.position = "relative";
      img.style.zIndex = "1";
      visual.appendChild(img);
    }

    if (face?.url) {
      const faceEl = document.createElement("div");
      faceEl.className = "p-char-face";
      const size = OVERLAY_BASE_SIZE * (face.scale || 1);
      faceEl.style.left = `${face.x}%`;
      faceEl.style.top = `${face.y}%`;
      faceEl.style.width = `${size}px`;
      faceEl.style.height = `${size}px`;
      faceEl.style.backgroundImage = `url('${face.url}')`;
      faceEl.style.zIndex = "2";
      visual.appendChild(faceEl);
    }

    charDiv.appendChild(visual);
    slotEl.appendChild(charDiv);
  }
}

function openPreview() {
  previewCurrentIndex = activeFrameIndex;
  openModal("previewModal");
  renderPreviewFrame();
}

function nextPreview() {
  const chapter = getChapter();
  if (previewCurrentIndex < chapter.frames.length - 1) {
    previewCurrentIndex++;
    renderPreviewFrame();
  } else closeModal("previewModal");
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
  const target = ev.target.closest(".slot-zone");
  if (!target) return;
  target.classList.add("drag-over");
}

function drop(ev) {
  ev.preventDefault();
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

function contextMenuAction(act) {
  if (contextFrameIndex === null) return;
  if (act === "copy") copyFrameAt(contextFrameIndex);
  if (act === "cut") cutFrameAt(contextFrameIndex);
  if (act === "duplicate") duplicateFrameAt(contextFrameIndex);
  if (act === "remove") removeFrameAt(contextFrameIndex);
  hideSlideContextMenu();
}

function readFileAsDataURL(file, cb) {
  const reader = new FileReader();
  reader.onload = (e) => cb(e.target.result, file.name);
  reader.readAsDataURL(file);
}

function saveJSON() {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "vn-project-save.json";
  a.click();
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

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (imported.characters && imported.chapters) {
        project = imported;
        if (!project.assets)
          project.assets = {
            backgrounds: [],
          };
        activeChapterId = project.chapters[0].id;
        loadChapter(activeChapterId);
        renderCastPalette();
      } else alert("Invalid format");
    } catch {
      alert("Parse error");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function openModal(id) {
  document.getElementById(id).style.display = "flex";
  if (id === "characterModal") renderCharModal();
  if (id === "assetsModal") renderAssetModal();
  if (id === "chapterModal") renderChapterMgmt();
  if (id === "previewModal") updatePreviewRatio();
}

function closeModal(id) {
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
              <button class="list-item-del-btn" onclick="event.stopPropagation(); deleteCharacter('${c.id}')" title="Delete Character">Remove</button>
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
        <label class="upload-btn">Upload<input type="file" onchange="uploadLayerImage('bodies',${i},this)" hidden accept="image/*"></label>
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
        <label class="upload-btn">Upload<input type="file" onchange="uploadLayerImage('faces',${i},this)" hidden accept="image/*"></label>
        <button class="primary-btn" onclick="openOverlayEditor(${i})" ">Graphic Editor</button>
        <button class="danger" onclick="removeCharLayer('faces',${i})" title="Remove">Remove</button>
      </div>`,
    )
    .join("");

  editPane.innerHTML = `
    <div style="padding:15px;background:#fff;">
      <label style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">Character Name</label>
      <input type="text" value="${char.name}" onchange="updateCharPropEditor('name',this.value)" style="font-size:18px;font-weight:600;width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
    </div>

    <div class="chrome-tabs">
      <div class="chrome-tab active" onclick="showLayerTab('bodies')">Body Sprites (Base)</div>
      <div class="chrome-tab" onclick="showLayerTab('faces')">Expressions (Overlays)</div>
    </div>

    <div class="edit-scroll-area" style="padding:15px; overflow-y:auto; flex:1;">
        <div id="tab-bodies-content" style="display:block;">
            <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <h4 style="margin:0;font-size:14px;color:#333;">Body Sprites (Base)</h4>
                <button class="text-btn" onclick="addCharLayer('bodies')">+ Add Body</button>
            </div>
            <div class="layers-list" style="margin-bottom:20px;">
                ${bodiesHtml}
            </div>
        </div>

        <div id="tab-faces-content" style="display:none;">
            <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <h4 style="margin:0;font-size:14px;color:#333;">Expressions (Overlays)</h4>
                <button class="text-btn" onclick="addCharLayer('faces')">+ Add Expression</button>
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
      <button onclick="event.stopPropagation(); deleteChapter(${ch.id})">Delete</button>
    </div>`,
    )
    .join("");
}

function init() {
  renderCastPalette();
  loadChapter(1);
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
    });
  });
  renderInspector();
  renderFilmstrip();
  renderStage();
}

init();
