(() => {
  const css = `
    .ui-toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    }
    .ui-toast {
      background: #333;
      color: #fff;
      padding: 12px 20px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-size: 14px;
      opacity: 0;
      transform: translateY(-20px);
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 250px;
      pointer-events: auto;
    }
    .ui-toast.visible {
      opacity: 1;
      transform: translateY(0);
    }
    .ui-toast.success { border-left: 4px solid #10b981; }
    .ui-toast.error { border-left: 4px solid #ef4444; }
    .ui-toast.info { border-left: 4px solid #3b82f6; }

    .ui-modal-input {
      width: 100%;
      padding: 10px;
      margin: 10px 0 20px 0;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    }
    .ui-modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
  `;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const toastContainer = document.createElement("div");
  toastContainer.className = "ui-toast-container";
  document.body.appendChild(toastContainer);

  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `ui-toast ${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("visible"));

    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  const genericModalHtml = `
    <div id="uiGenericModal" class="modal-overlay" style="z-index:9999;">
      <div class="modal-box" style="max-width:400px;">
        <div class="modal-header">
          <h3 id="uiModalTitle">Title</h3>
          <button class="primary-btn" id="uiModalClose">&times;</button>
        </div>
        <div class="modal-body">
          <p id="uiModalMessage" style="margin-bottom:15px; color:#555;"></p>
          <div id="uiModalContent"></div>
          <div class="ui-modal-actions">
            <button class="primary-btn" id="uiModalCancel">Cancel</button>
            <button class="primary-btn" id="uiModalConfirm">Confirm</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const modalWrapper = document.createElement("div");
  modalWrapper.innerHTML = genericModalHtml;
  document.body.appendChild(modalWrapper.firstElementChild);

  const uiModal = document.getElementById("uiGenericModal");
  const uiTitle = document.getElementById("uiModalTitle");
  const uiMessage = document.getElementById("uiModalMessage");
  const uiContent = document.getElementById("uiModalContent");
  const btnConfirm = document.getElementById("uiModalConfirm");
  const btnCancel = document.getElementById("uiModalCancel");
  const btnClose = document.getElementById("uiModalClose");

  let currentConfirmCallback = null;
  let currentCancelCallback = null;

  function closeUiModal() {
    uiModal.style.display = "none";
    if (currentCancelCallback) currentCancelCallback();
    cleanupModal();
  }

  function cleanupModal() {
    currentConfirmCallback = null;
    currentCancelCallback = null;
    uiContent.innerHTML = "";
    btnConfirm.onclick = null;
    btnCancel.onclick = null;
    btnConfirm.style.display = "inline-block";
    btnCancel.style.display = "inline-block";
  }

  btnClose.onclick = closeUiModal;

  window.alert = function (message) {
    showToast(message, "info");
  };

  function showConfirm(title, message, onConfirm, onCancel) {
    cleanupModal();
    uiTitle.textContent = title;
    uiMessage.textContent = message;
    uiModal.style.display = "flex";
    btnConfirm.textContent = "Confirm";
    btnConfirm.className = "primary-btn";

    btnConfirm.onclick = () => {
      uiModal.style.display = "none";
      if (onConfirm) onConfirm();
    };

    btnCancel.onclick = () => {
      uiModal.style.display = "none";
      if (onCancel) onCancel();
    };
  }

  function showPrompt(title, message, onConfirm, defaultValue = "") {
    cleanupModal();
    uiTitle.textContent = title;
    uiMessage.textContent = message;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "ui-modal-input";
    input.value = defaultValue;
    uiContent.appendChild(input);

    uiModal.style.display = "flex";
    input.focus();

    const confirmAction = () => {
      uiModal.style.display = "none";
      if (onConfirm) onConfirm(input.value);
    };

    btnConfirm.onclick = confirmAction;

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmAction();
    });

    btnCancel.onclick = () => {
      uiModal.style.display = "none";
    };
  }

  window.deleteCharacter = function (id) {
    showConfirm(
      "Delete Character",
      "Are you sure you want to delete this character? This cannot be undone.",
      () => {
        if (typeof project === "undefined") return;
        project.characters = project.characters.filter((c) => c.id !== id);
        if (editingCharId === id) {
          editingCharId =
            project.characters.length > 0 ? project.characters[0].id : null;
        }
        if (typeof renderCharModal === "function") renderCharModal();
        if (typeof renderCastPalette === "function") renderCastPalette();
        if (typeof renderStage === "function") renderStage();
        if (typeof renderFilmstrip === "function") renderFilmstrip();
        showToast("Character deleted successfully", "success");
      },
    );
  };

  window.deleteChapter = function (id) {
    if (project.chapters.length <= 1) {
      showToast("Cannot delete the last chapter", "error");
      return;
    }
    showConfirm(
      "Delete Chapter",
      "Delete this chapter and all its frames?",
      () => {
        project.chapters = project.chapters.filter((c) => c.id !== id);
        loadChapter(project.chapters[0].id);
        renderChapterMgmt();
        showToast("Chapter deleted", "success");
      },
    );
  };

  window.removeFrameAt = function (idx) {
    const chapter = getChapter();
    if (chapter.frames.length <= 1) {
      showToast("Cannot delete the last frame", "error");
      return;
    }
    chapter.frames.splice(idx, 1);
    if (activeFrameIndex >= chapter.frames.length)
      activeFrameIndex = chapter.frames.length - 1;
    switchFrame(activeFrameIndex);
  };

  window.createNewCharacter = function () {
    const nameInput = document.getElementById("newCharName");
    const name = nameInput.value.trim();
    const fileInput = document.getElementById("newCharSprite");

    if (!name) {
      showToast("Character Name is required", "error");
      nameInput.focus();
      return;
    }

    const newChar = {
      id: "c" + Date.now(),
      name,
      color: "#3b82f6",
      bodies: [
        { name: "default", color: "#3b82f6", url: null, fileName: null },
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

    const finish = () => {
      editingCharId = newChar.id;
      closeModal("addCharModal");
      openModal("characterModal");
      renderCastPalette();
      nameInput.value = "";
      fileInput.value = "";
      showToast(`Character "${name}" created`, "success");
    };

    if (fileInput.files[0]) {
      readFileAsDataURL(fileInput.files[0], (url, fileName) => {
        newChar.bodies[0].url = url;
        newChar.bodies[0].fileName = fileName;
        renderCastPalette();
        renderStage();
        finish();
      });
    } else {
      finish();
    }
  };

  const oldBgInput = document.getElementById("bgFileInput");
  if (oldBgInput) {
    const newBgInput = oldBgInput.cloneNode(true);
    oldBgInput.parentNode.replaceChild(newBgInput, oldBgInput);

    newBgInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      showPrompt(
        "Background Name",
        "Enter a name for this background:",
        (name) => {
          if (!name) {
            showToast("Background upload cancelled", "info");
            e.target.value = "";
            return;
          }
          readFileAsDataURL(file, (url, fn) => {
            project.assets.backgrounds.push({
              name,
              url,
              fileName: fn,
            });
            renderAssetModal();
            showToast("Background added", "success");
            e.target.value = "";
          });
        },
        "New Background",
      );
    });
  }

  const originalImportJSON = window.importJSON;
  window.importJSON = async function (e) {
    const file = e.target.files[0];
    if (!file) return;

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
        activeChapterId = project.chapters[0].id;
        loadChapter(activeChapterId);
        renderCastPalette();
        showToast("Project loaded successfully", "success");
      } else {
        showToast("Invalid project file format", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error parsing project file", "error");
    }
    e.target.value = "";
  };

  window.openNodeGraph = function () {
    if (window.NodeGraph && typeof window.NodeGraph.open === "function") {
      window.NodeGraph.open(
        typeof activeChapterId !== "undefined" ? activeChapterId : null,
      );
      return;
    }

    const existing = document.querySelector('script[src="node-graph.js"]');
    if (!existing) {
      const s = document.createElement("script");
      s.src = "node-graph.js";
      s.onload = () => {
        if (window.NodeGraph && typeof window.NodeGraph.open === "function") {
          window.NodeGraph.open(
            typeof activeChapterId !== "undefined" ? activeChapterId : null,
          );
        } else {
          showToast("Node Graph failed to load", "error");
        }
      };
      s.onerror = () => showToast("Failed to load node-graph.js", "error");
      document.head.appendChild(s);
      showToast("Loading Node Graph…", "info");
      return;
    }

    showToast("Node Graph is not available", "error");
  };
})();
