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

        const saveBtn = document.getElementById("btnSaveDialogue");
        if (count > limit) {
            counterEl.classList.add("over-limit");
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.classList.add("disabled");
                saveBtn.style.opacity = "0.5";
                saveBtn.style.cursor = "not-allowed";
            }
        } else {
            counterEl.classList.remove("over-limit");
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.classList.remove("disabled");
                saveBtn.style.opacity = "1";
                saveBtn.style.cursor = "pointer";
            }
        }
    }
}

function toggleEditorMode(isRich) {
    isRichMode = isRich;
    const input = document.getElementById("modalTextInput");
    const toolbar = document.querySelector(".rte-toolbar-horizontal");

    // Toolbar always enabled
    toolbar.style.opacity = "1";
    toolbar.style.pointerEvents = "auto";

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


function showSyntaxInput(onConfirm) {
    const uiModal = document.getElementById("uiGenericModal");
    const uiTitle = document.getElementById("uiModalTitle");
    const uiMessage = document.getElementById("uiModalMessage");
    const uiContent = document.getElementById("uiModalContent");
    const btnConfirm = document.getElementById("uiModalConfirm");
    const btnCancel = document.getElementById("uiModalCancel");

    if (!uiModal) return;

    uiTitle.textContent = "Insert Syntax Tag";
    uiMessage.textContent = "Enter Key and Value:";
    uiContent.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "10px";

    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = "ui-modal-input";
    keyInput.style.margin = "0";
    keyInput.placeholder = "Key (e.g. speed)";

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.className = "ui-modal-input";
    valueInput.style.margin = "0";
    valueInput.placeholder = "Value (e.g. 0.5)";

    wrapper.appendChild(keyInput);
    wrapper.appendChild(valueInput);
    uiContent.appendChild(wrapper);

    uiModal.style.display = "flex";
    keyInput.focus();

    btnConfirm.onclick = () => {
        if (keyInput.value && valueInput.value) {
            onConfirm(keyInput.value, valueInput.value);
            uiModal.style.display = "none";
        } else {
            window.showToast("Both Key and Value are required", "error");
        }
    };

    btnCancel.onclick = () => {
        uiModal.style.display = "none";
    };
}


function editorInsertTag(command) {
    const input = document.getElementById("modalTextInput");
    input.focus();

    // Helper to insert raw tags around selection
    const insertRawTag = (startTag, endTag) => {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const selectedText = range.toString();
        const replacement = `${startTag}${selectedText}${endTag}`;
        document.execCommand("insertText", false, replacement);
    };

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
                if (!isRichMode) {
                    insertRawTag(`<color=${color}>`, `</color>`);
                } else {
                    document.execCommand("foreColor", false, color);
                }
                onModalTextChange();
            });
        }

        colorInput.click();
        return;
    }

    if (command === "size") {
        const size = prompt("Enter font size (e.g., 18, 24, 32):");
        if (size) {
            input.focus();
            if (!isRichMode) {
                insertRawTag(`<size=${size}>`, `</size>`);
            } else {
                document.execCommand("fontSize", false, "7");
                const fontElements = input.querySelectorAll('font[size="7"]');
                fontElements.forEach((el) => {
                    el.removeAttribute("size");
                    el.style.fontSize = size + "px";
                });
            }
            onModalTextChange();
        }
        return;
    }

    if (command === "syntax") {
        // Save the current selection range before opening the modal
        const selection = window.getSelection();
        const savedRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

        showSyntaxInput((key, value) => {
            const tag = `{${key}:${value}}`;
            input.focus();

            // Restore the selection range
            if (savedRange) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(savedRange);
            }

            document.execCommand("insertText", false, tag);
            onModalTextChange();
        });
        return;
    }

    if (command === "removeFormat") {
        document.execCommand("removeFormat", false, null);
        onModalTextChange();
        return;
    }

    if (command === "b") {
        if (!isRichMode) insertRawTag("<b>", "</b>");
        else document.execCommand("bold", false, null);
    }
    if (command === "i") {
        if (!isRichMode) insertRawTag("<i>", "</i>");
        else document.execCommand("italic", false, null);
    }
    if (command === "u") {
        if (!isRichMode) insertRawTag("<u>", "</u>");
        else document.execCommand("underline", false, null);
    }
    if (command === "s") {
        if (!isRichMode) insertRawTag("<s>", "</s>");
        else document.execCommand("strikethrough", false, null);
    }

    onModalTextChange();
}

// Function to update preview when typing
function onTmInput(val) {
    updateText(val);
    const previewEl = document.getElementById("tmPreview");
    if (previewEl) previewEl.innerHTML = unityToHtml(val);
}
