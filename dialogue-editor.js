// Dialogue Editor & Character Limit Logic

let isRichMode = true; // Default to Preview/Rich mode
let tempEditorText = ""; // Temp text before save

// Thai Character Count Logic
// Counts characters excluding Thai vowels/diacritics that sit above/below
// Range: \u0E31, \u0E34-\u0E3A, \u0E47-\u0E4E
function getThaiCharCount(text) {
    if (!text) return 0;
    // Regex matches characters that are NOT in the exclusion range
    // effectively counting base chars + english + symbols, but ignoring floating vowels/tone marks
    const clean = text.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, "");
    return clean.length;
}

function updateCharCounter(text) {
    const limit = 300;
    const count = getThaiCharCount(text);
    const counterEl = document.getElementById("charCounter");
    if (counterEl) {
        counterEl.textContent = `${count}/${limit}`;
        if (count > limit) {
            counterEl.classList.add("over-limit");
        } else {
            counterEl.classList.remove("over-limit");
        }
    }
}

function toggleEditorMode(isRich) {
    isRichMode = isRich;
    const input = document.getElementById("modalTextInput");
    const toolbar = document.querySelector(".rte-toolbar-horizontal");

    // Disable/Enable Toolbar based on mode
    if (!isRichMode) {
        toolbar.style.opacity = "0.5";
        toolbar.style.pointerEvents = "none";
    } else {
        toolbar.style.opacity = "1";
        toolbar.style.pointerEvents = "auto";
    }

    if (!isRichMode) {
        // Switch to Raw: Convert HTML visual to Unity String
        const raw = htmlToUnity(input.innerHTML);
        input.innerText = raw;
    } else {
        // Switch to Rich: Convert Raw String to HTML visual
        const raw = input.innerText;
        const rich = unityToHtml(raw);
        input.innerHTML = rich;
    }
}

function openTextEditor() {
    const frame = getFrame();
    if (!frame) return;

    const currentText = getLocalizedFrameText(frame);
    const input = document.getElementById("modalTextInput");

    const toggle = document.getElementById("editorModeToggle");
    if (toggle) {
        toggle.checked = true;
        toggleEditorMode(true);
    }

    // Initial Load
    input.innerHTML = unityToHtml(currentText);

    // Initial Count
    // We want to count the raw text content (not HTML tags for counting?? 
    // User request assumes counting the logical characters. 
    // Usually we count the plain text content or the UNITY raw content? 
    // "Dialogue text" usually implies the end result.
    // Converting to raw unity text first seems safest for accurate count of "content" 
    // but if we count textContent of HTML, we miss <syntax> values etc.
    // Let's count the RAW UNITY TEXT equivalent.
    updateCharCounter(currentText);

    openModal("textEditorModal");

    setTimeout(() => {
        input.focus();
        if (
            typeof window.getSelection !== "undefined" &&
            typeof document.createRange !== "undefined"
        ) {
            const range = document.createRange();
            range.selectNodeContents(input);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }, 100);
}

function onModalTextChange() {
    const input = document.getElementById("modalTextInput");
    let html = "";
    let rawTextForCount = "";

    if (isRichMode) {
        html = input.innerHTML;
        // To count properly, we might need to convert to unity text implicitly
        rawTextForCount = htmlToUnity(html);
    } else {
        rawTextForCount = input.innerText;
        html = unityToHtml(rawTextForCount);
    }

    updateCharCounter(rawTextForCount);

    const workspaceText = document.getElementById("overlayText");
    if (workspaceText) {
        workspaceText.innerHTML = html || "<span style='opacity:0.5'>...</span>";
    }

    const previewText = document.getElementById("pText");
    if (previewText) {
        previewText.innerHTML = html;
    }
}

function saveTextEditor() {
    const input = document.getElementById("modalTextInput");
    let rawUnityText = "";

    if (isRichMode) {
        rawUnityText = htmlToUnity(input.innerHTML);
    } else {
        rawUnityText = input.innerText;
    }

    updateText(rawUnityText);
    closeModal("textEditorModal");
    renderInspector();
}

function showColorPicker(onSelect) {
    const uiModal = document.getElementById("uiGenericModal");
    const uiTitle = document.getElementById("uiModalTitle");
    const uiMessage = document.getElementById("uiModalMessage");
    const uiContent = document.getElementById("uiModalContent");
    const btnConfirm = document.getElementById("uiModalConfirm");
    const btnCancel = document.getElementById("uiModalCancel");

    if (!uiModal) return;

    uiTitle.textContent = "Select Color";
    uiMessage.textContent = "Choose a color or enter hex code:";
    uiContent.innerHTML = "";

    btnConfirm.style.display = "none";

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(5, 1fr)";
    grid.style.gap = "8px";
    grid.style.marginBottom = "15px";

    const colors = [
        "#ffffff", "#000000", "#ef4444", "#f97316", "#f59e0b",
        "#10b981", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
        "#64748b", "#a1a1aa", "#fee2e2", "#dbeafe", "#d1fae5",
    ];

    colors.forEach((c) => {
        const btn = document.createElement("div");
        btn.style.backgroundColor = c;
        btn.style.height = "32px";
        btn.style.borderRadius = "4px";
        btn.style.cursor = "pointer";
        btn.style.border = "1px solid #ddd";
        btn.title = c;

        btn.onclick = () => {
            onSelect(c);
            uiModal.style.display = "none";
            btnConfirm.style.display = "inline-block";
        };
        grid.appendChild(btn);
    });

    uiContent.appendChild(grid);

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.gap = "8px";
    wrapper.style.alignItems = "center";

    const inputEl = document.createElement("input");
    inputEl.type = "text";
    inputEl.className = "ui-modal-input";
    inputEl.style.margin = "0";
    inputEl.style.flex = "1";
    inputEl.placeholder = "Hex (#RRGGBB)";

    const okBtn = document.createElement("button");
    okBtn.className = "primary-btn";
    okBtn.textContent = "Use Hex";
    okBtn.onclick = () => {
        if (inputEl.value) {
            onSelect(inputEl.value);
            uiModal.style.display = "none";
            btnConfirm.style.display = "inline-block";
        }
    };

    wrapper.appendChild(inputEl);
    wrapper.appendChild(okBtn);
    uiContent.appendChild(wrapper);

    uiModal.style.display = "flex";
    inputEl.focus();

    btnCancel.onclick = () => {
        uiModal.style.display = "none";
        btnConfirm.style.display = "inline-block";
    };
}

function editorInsertTag(command) {
    const input = document.getElementById("modalTextInput");
    input.focus();

    if (command === "color") {
        let colorInput = document.getElementById("hiddenColorInput");
        if (!colorInput) {
            colorInput = document.createElement("input");
            colorInput.type = "color";
            colorInput.id = "hiddenColorInput";
            colorInput.style.position = "absolute";
            colorInput.style.opacity = "0";
            colorInput.style.pointerEvents = "none";
            document.body.appendChild(colorInput);

            colorInput.addEventListener("change", (e) => {
                const color = e.target.value;
                input.focus();
                document.execCommand("foreColor", false, color);
                onModalTextChange();
            });
        }

        colorInput.click();
        return;
    }

    if (command === "size") {
        const size = prompt("Enter font size (e.g., 18, 24, 32):");
        if (size) {
            document.execCommand("fontSize", false, "7");
            const fontElements = input.querySelectorAll('font[size="7"]');
            fontElements.forEach((el) => {
                el.removeAttribute("size");
                el.style.fontSize = size + "px";
            });
            onModalTextChange();
        }
        return;
    }

    if (command === "removeFormat") {
        document.execCommand("removeFormat", false, null);
        onModalTextChange();
        return;
    }

    if (command === "b") document.execCommand("bold", false, null);
    if (command === "i") document.execCommand("italic", false, null);
    if (command === "u") document.execCommand("underline", false, null);
    if (command === "s") document.execCommand("strikethrough", false, null);

    onModalTextChange();
}

// Function to update preview when typing
function onTmInput(val) {
    updateText(val);
    const previewEl = document.getElementById("tmPreview");
    if (previewEl) previewEl.innerHTML = unityToHtml(val);
}
