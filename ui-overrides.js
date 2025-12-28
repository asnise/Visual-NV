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
    .loading-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: none;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      backdrop-filter: blur(2px);
    }

    .loading-modal.visible {
      display: flex;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid var(--primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 10px;
    }

    #loadingText {
      color: white;
      font-weight: 500;
      font-size: 16px;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .node-header.type-start {
      background: var(--success);
      color: white;
    }

    .node-header.type-end {
      background: var(--danger);
      color: white;
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

  function showLoading(text = "Processing...") {
    const el = document.getElementById("loadingModal");
    if (!el) return;
    const txt = document.getElementById("loadingText");
    if (txt) txt.textContent = text;
    el.classList.add("visible");
  }

  function hideLoading() {
    const el = document.getElementById("loadingModal");
    if (!el) return;
    el.classList.remove("visible");
  }

  window.showToast = showToast;
  window.showLoading = showLoading;
  window.hideLoading = hideLoading;

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
    if (typeof showLoading === "function") showLoading("Loading project...");
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
    if (typeof hideLoading === "function") hideLoading();
  };

  window.openNodeGraph = function () {
    window.openNodeGraphV2();
  };

  window.openNodeGraphV2 = function () {
    if (window.NodeGraphV2 && typeof window.NodeGraphV2.open === "function") {
      window.NodeGraphV2.open(
        typeof activeChapterId !== "undefined" ? activeChapterId : null,
      );
      return;
    }

    const existing = document.querySelector('script[src="node-graph-v2.js"]');
    if (!existing) {
      const s = document.createElement("script");
      s.src = "node-graph-v2.js";
      s.onload = () => {
        if (typeof hideLoading === "function") hideLoading();
        if (
          window.NodeGraphV2 &&
          typeof window.NodeGraphV2.open === "function"
        ) {
          window.NodeGraphV2.open(
            typeof activeChapterId !== "undefined" ? activeChapterId : null,
          );
        } else {
          showToast("Node Graph V2 failed to load", "error");
        }
      };
      s.onerror = () => {
        if (typeof hideLoading === "function") hideLoading();
        showToast("Failed to load node-graph-v2.js", "error");
      };
      document.head.appendChild(s);
      if (typeof showLoading === "function")
        showLoading("Loading Node Graph V2...");
      return;
    }

    showToast("Node Graph V2 is not available", "error");
  };

  window.addEventListener("keydown", (e) => {
    if (e.shiftKey && (e.key === "G" || e.key === "g")) {
      window.openNodeGraphV2();
    }
  });

  function ensureRotateOverlay() {
    if (document.querySelector(".rotate-to-landscape")) return;
    const el = document.createElement("div");
    el.className = "rotate-to-landscape";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
      <div style="max-width:520px; padding:20px; border-radius:10px; background:rgba(0,0,0,0.6);">
        <div style="font-size:20px; font-weight:600; margin-bottom:8px">Rotate your device</div>
        <div style="font-size:14px; opacity:0.95">For best experience this editor is optimized for landscape (LANspace) layout. Please rotate your device to landscape or use a wider screen.</div>
      </div>
    `;
    document.body.appendChild(el);
  }

  function updateLandscapeOverlay() {
    ensureRotateOverlay();
    const overlay = document.querySelector(".rotate-to-landscape");
    if (!overlay) return;
    const shouldShow =
      window.innerWidth <= 800 &&
      window.matchMedia("(orientation: portrait)").matches;
    overlay.style.display = shouldShow ? "flex" : "none";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.textAlign = "center";
    if (shouldShow) {
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-label", "Rotate to landscape");
      document.body.classList.add("mobile-overlay-active");
    } else {
      overlay.removeAttribute("role");
      overlay.removeAttribute("aria-label");
      document.body.classList.remove("mobile-overlay-active");
    }
  }

  function createMobilePanelToggle() {
    const header = document.querySelector("header");
    if (!header) return;
    const actions = header.querySelector(".actions");
    if (!actions) return;
    if (document.getElementById("mobilePanelToggle")) return;
    const btn = document.createElement("button");
    btn.id = "mobilePanelToggle";
    btn.style.marginRight = "8px";
    btn.setAttribute("aria-label", "Toggle side panels");
    btn.textContent = "Inspector";
    btn.className = "primary-btn";
    btn.onclick = () => {
      document.body.classList.toggle("mobile-panels-hidden");
    };
    actions.insertBefore(btn, actions.firstChild);
  }

  try {
    createMobilePanelToggle();
    updateLandscapeOverlay();
    window.addEventListener("resize", updateLandscapeOverlay);
    window.addEventListener("orientationchange", updateLandscapeOverlay);
  } catch (err) {
    console.warn("Mobile helpers init failed", err);
  }

  function initMobileNav() {
    if (document.getElementById("mobileMenuBtn")) return;

    const header = document.querySelector("header");
    const menuBar = document.querySelector(".menu-bar");

    if (!header || !menuBar) return;

    const burgerBtn = document.createElement("button");
    burgerBtn.id = "mobileMenuBtn";
    burgerBtn.innerHTML = "&#9776;";
    burgerBtn.setAttribute("aria-label", "Toggle Menu");

    header.insertBefore(burgerBtn, menuBar);

    burgerBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      menuBar.classList.toggle("show-mobile");

      if (!menuBar.classList.contains("show-mobile")) {
        document.querySelectorAll(".dropdown-content").forEach((el) => {
          el.classList.remove("mobile-expanded");
        });
      }
    });

    const menuItems = document.querySelectorAll(".menu-item");

    menuItems.forEach((item) => {
      item.addEventListener("click", function (e) {
        if (window.innerWidth > 1024) return;

        const dropdown = this.querySelector(".dropdown-content");
        if (!dropdown) return;

        if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") {
          setTimeout(() => {
            menuBar.classList.remove("show-mobile");
            dropdown.classList.remove("mobile-expanded");
          }, 100);
          return;
        }

        const wasOpen = dropdown.classList.contains("mobile-expanded");

        document.querySelectorAll(".dropdown-content").forEach((el) => {
          el.classList.remove("mobile-expanded");
        });

        if (!wasOpen) {
          dropdown.classList.add("mobile-expanded");
        }
      });
    });

    document.addEventListener("click", function (e) {
      if (window.innerWidth <= 1024) {
        if (!menuBar.contains(e.target) && e.target !== burgerBtn) {
          menuBar.classList.remove("show-mobile");
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMobileNav);
  } else {
    initMobileNav();
  }

  window.addEventListener("DOMContentLoaded", () => {
    // === Stage View ===
    if (window.stageView && window.updateStageTransform) {
      __enablePinchZoom({
        el: document.getElementById("stageWrapper"),
        getState: () => ({
          zoom: stageView.scale,
          x: stageView.x,
          y: stageView.y,
        }),
        setState: ({ zoom, x, y }) => {
          stageView.scale = zoom;
          stageView.x = x;
          stageView.y = y;
        },
        min: 0.1,
        max: 5,
        onUpdate: updateStageTransform,
      });
    }

    // === Overlay / Graphic Editor ===
    if (window.editorState && window.updateOverlayEditorTransform) {
      __enablePinchZoom({
        el: document.getElementById("overlayEditorContainer"),
        getState: () => ({
          zoom: editorState.zoom,
          x: editorState.panX,
          y: editorState.panY,
        }),
        setState: ({ zoom, x, y }) => {
          editorState.zoom = zoom;
          editorState.panX = x;
          editorState.panY = y;
        },
        min: 0.3,
        max: 6,
        onUpdate: updateOverlayEditorTransform,
      });
    }

    // === Node Graph (ถ้ามี container) ===
    if (window.nodeView && window.updateNodeTransform) {
      __enablePinchZoom({
        el: document.getElementById("nodeGraphContainer"),
        getState: () => ({
          zoom: nodeView.scale,
          x: nodeView.x,
          y: nodeView.y,
        }),
        setState: ({ zoom, x, y }) => {
          nodeView.scale = zoom;
          nodeView.x = x;
          nodeView.y = y;
        },
        min: 0.2,
        max: 4,
        onUpdate: updateNodeTransform,
      });
    }
  });
})();
