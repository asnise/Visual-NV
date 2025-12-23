let previewCurrentIndex = 0;
let previousCharRects = new Map();
let typingTimer = null;

function updatePreviewRatio() {
  const vp = document.getElementById("pViewport");
  if (!vp) return;

  const parent = vp.parentElement;
  if (parent) {
    const maxWidth = parent.clientWidth;
    const height = Math.min(parent.clientHeight, maxWidth * (9 / 16));
    const width = height * (16 / 9);

    vp.style.width = `${width}px`;
    vp.style.height = `${height}px`;
  }
}

function typeWriter(element, htmlString) {
  if (typingTimer) clearTimeout(typingTimer);
  element.innerHTML = "";

  let i = 0;
  const speed = 25;

  function type() {
    if (i < htmlString.length) {
      if (htmlString.charAt(i) === "<") {
        let tagEnd = htmlString.indexOf(">", i);
        if (tagEnd !== -1) {
          element.innerHTML += htmlString.substring(i, tagEnd + 1);
          i = tagEnd + 1;
        } else {
          element.innerHTML += htmlString.charAt(i);
          i++;
        }
      } else {
        element.innerHTML += htmlString.charAt(i);
        i++;
      }

      element.scrollTop = element.scrollHeight;
      typingTimer = setTimeout(type, speed);
    }
  }

  type();
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
  const speakerEl = document.getElementById("pSpeaker");
  speakerEl.textContent = speaker ? speaker.name : "Narrator";
  speakerEl.style.color = speaker ? speaker.color : "#fff";

  let text = frame.text || "";
  text = text.replace(
    /\{([^}]+)\}/g,
    '<span style="color:#3b82f6;font-weight:bold;">[$1]</span>',
  );

  const textElement = document.getElementById("pText");
  typeWriter(textElement, text);

  const dialogueLayer = document.querySelector(".p-dialogue-layer");
  dialogueLayer.classList.toggle("visible", !!frame.text);

  const newSlotCharIds = new Set();
  frame.slots.forEach((s) => {
    if (s && s.charId) newSlotCharIds.add(s.charId);
  });

  const oldRects = new Map(previousCharRects);
  previousCharRects.clear();

  oldRects.forEach((rect, charId) => {
    if (!newSlotCharIds.has(charId)) {
      const existingEl = document.querySelector(`[data-char-id="${charId}"]`);
      if (existingEl) {
        const clone = existingEl.cloneNode(true);
        const computed = existingEl.getBoundingClientRect();

        clone.style.position = "fixed";
        clone.style.left = `${computed.left}px`;
        clone.style.top = `${computed.top}px`;
        clone.style.width = `${computed.width}px`;
        clone.style.height = `${computed.height}px`;
        clone.style.margin = "0";
        clone.style.pointerEvents = "none";
        clone.style.zIndex = "100";
        clone.style.transition = "opacity 0.4s ease, transform 0.4s ease";
        clone.style.opacity = "1";
        clone.style.transform = "scale(1)";
        document.body.appendChild(clone);

        requestAnimationFrame(() => {
          clone.style.opacity = "0";
          clone.style.transform = "scale(0.95)";
        });
        setTimeout(() => clone.remove(), 400);
      }
    }
  });

  for (let i = 0; i < 4; i++) {
    const slotEl = document.getElementById(`pSlot${i}`);
    slotEl.innerHTML = "";
    const slot = frame.slots[i];

    if (slot && slot.zIndex !== undefined) {
      slotEl.style.zIndex = slot.zIndex;
    } else {
      slotEl.style.zIndex = "";
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

    const charDiv = document.createElement("div");
    charDiv.className = "p-char";
    charDiv.setAttribute("data-char-id", char.id);

    const visual = document.createElement("div");
    visual.className = "p-char-visual";
    visual.style.transform = `translate(${slot.x || 0}px, ${slot.y || 0}px) scale(${slot.scale || 1}) scaleX(${slot.mirror ? -1 : 1})`;

    if (body?.url) {
      const img = document.createElement("img");
      img.src = body.url;
      img.className = "p-char-img";
      img.style.position = "relative";
      img.style.zIndex = "1";
      visual.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.style.width = "100px";
      placeholder.style.height = "250px";
      placeholder.style.backgroundColor = body?.color || char.color;
      placeholder.style.borderRadius = "6px";
      placeholder.style.position = "relative";
      placeholder.style.zIndex = "1";
      visual.appendChild(placeholder);
    }

    if (face?.url) {
      const faceEl = document.createElement("div");
      faceEl.className = "p-char-face";
      const baseSize =
        typeof OVERLAY_BASE_SIZE !== "undefined" ? OVERLAY_BASE_SIZE : 100;
      const size = baseSize * (face.scale || 1);

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

    const newRect = charDiv.getBoundingClientRect();
    previousCharRects.set(char.id, newRect);

    if (oldRects.has(char.id)) {
      const oldRect = oldRects.get(char.id);
      const dx = oldRect.left - newRect.left;
      const dy = oldRect.top - newRect.top;

      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        charDiv.style.transition = "none";
        charDiv.style.transform = `translate(${dx}px, ${dy}px)`;

        requestAnimationFrame(() => {
          charDiv.style.transition = "transform 0.5s ease-in-out";
          charDiv.style.transform = "translate(0, 0)";
        });
      }
    } else {
      if (slot.anim && slot.anim !== "none") {
        let animClass = "preview-char-enter-fade";
        if (slot.anim === "slide_left") animClass = "preview-char-enter-left";
        if (slot.anim === "slide_right") animClass = "preview-char-enter-right";
        visual.classList.add(animClass);
      }
    }
  }
}

function openPreview() {
  previewCurrentIndex = activeFrameIndex;
  previousCharRects.clear();
  openModal("previewModal");
  updatePreviewRatio();
  renderPreviewFrame();
  window.addEventListener("resize", updatePreviewRatio);
}

function nextPreview() {
  const chapter = getChapter();
  if (previewCurrentIndex < chapter.frames.length - 1) {
    previewCurrentIndex++;
    renderPreviewFrame();
  } else {
    closeModal("previewModal");
    window.removeEventListener("resize", updatePreviewRatio);
    if (typingTimer) clearTimeout(typingTimer);
  }
}

function prevPreview() {
  if (previewCurrentIndex > 0) {
    previewCurrentIndex--;
    renderPreviewFrame();
  }
}
