(function () {
  "use strict";

  const NodeGraphV2 = (() => {
    const STORAGE_KEY = "graphV2";
    const VERSION = 1;

    const CFG = {
      grid: 24,
      minScale: 0.35,
      maxScale: 2.5,

      node: {
        w: 300,
        headerH: 34,
        pad: 10,
        rowH: 28,
        corner: 12,
      },

      port: {
        r: 7,
        hit: 18,
      },

      colors: {
        bg: "var(--bg-app)",
        panel: "var(--bg-panel)",
        panel2: "var(--bg-panel)",
        border: "var(--border)",
        text: "var(--text-main)",
        muted: "var(--text-muted)",

        accent: "var(--primary)",
        ok: "var(--success)",
        danger: "var(--danger)",
        warn: "var(--warning)",

        choice: "#a855f7",

        link: "var(--primary)",
        linkSoft: "var(--slot-drag)",
        linkNext: "var(--success)",
        linkChoice: "#a855f7",
      },
    };

    const STATE = {
      open: false,
      chapterId: null,

      nodes: [],
      links: [],
      startFrameId: null,
      endFrameId: null,

      selectedNodeIds: new Set(), // Multi-select support
      selectionBox: null, // {x, y, w, h} in screen coords for rendering
      selectingFrom: null,
      hoverPort: null,
      hoverNodeId: null,
      hoverLinkId: null,

      viewport: { x: 0, y: 0, scale: 1 },

      drag: null,

      ui: {
        overlay: null,
        modal: null,
        headerTitle: null,
        canvasWrap: null,
        canvas: null,
        svg: null,
        toast: null,
      },

      _cssInjected: false,
      _autosaveTimer: null,
    };

    function clamp(n, a, b) {
      return Math.max(a, Math.min(b, n));
    }

    function intersectRect(r1, r2) {
      return !(r2.x > r1.x + r1.w ||
        r2.x + r2.w < r1.x ||
        r2.y > r1.y + r1.h ||
        r2.y + r2.h < r1.y);
    }

    function snap(n, step) {
      return Math.round(n / step) * step;
    }

    function safeId(x) {
      return String(x ?? "");
    }

    function nowId(prefix = "id") {
      return (
        prefix +
        "-" +
        Math.floor(Math.random() * 1e9).toString(36) +
        "-" +
        Date.now().toString(36)
      );
    }

    function getProject() {
      if (typeof project === "undefined") return null;
      return project;
    }

    function getChapter() {
      const p = getProject();
      if (!p) return null;

      const id =
        STATE.chapterId ??
        (typeof activeChapterId !== "undefined" ? activeChapterId : null);

      if (!id) return p.chapters?.[0] ?? null;
      return p.chapters?.find((c) => c.id === id) ?? null;
    }

    function getFrames() {
      const ch = getChapter();
      return ch?.frames ?? [];
    }

    function getFrameById(frameId) {
      const frames = getFrames();
      const idNum = Number(frameId);
      return frames.find((f) => Number(f?.id) === idNum) ?? null;
    }

    function frameType(frame) {
      const t = (frame?.frameType || "main").toLowerCase();
      return t;
    }

    function ensureChoiceIds() {
      const frames = getFrames();
      let mutated = false;

      for (const f of frames) {
        const choices = Array.isArray(f?.choices) ? f.choices : null;
        if (!choices) continue;

        for (const c of choices) {
          if (!c || typeof c !== "object") continue;

          const type = (c.type || "jump").toLowerCase();
          if (type !== "jump") continue;

          if (!c.id) {
            c.id = nowId("choice");
            mutated = true;
          } else {
            c.id = String(c.id);
          }
        }
      }

      if (mutated) {
        scheduleAutosave("ensure_choice_ids");
        try {
          applyGraphLinksToFrames();
        } catch (e) { }
      }
    }

    function ensureFrameAttributes(frame) {
      if (!frame || typeof frame !== "object") return;
      if (!frame.attributes || typeof frame.attributes !== "object") {
        frame.attributes = {};
      }
    }

    function applyGraphLinksToFrames() {
      const frames = getFrames();
      if (!frames || !frames.length) return { ok: false, reason: "No frames." };

      const nodeToFrameId = new Map();
      for (const n of STATE.nodes || []) {
        if (!n || n.type !== "frame") continue;
        if (!Number.isFinite(Number(n.frameId))) continue;
        nodeToFrameId.set(safeId(n.id), Number(n.frameId));
      }

      const frameById = new Map();
      for (const f of frames) {
        if (!f) continue;
        const fid = Number(f.id);
        if (!Number.isFinite(fid)) continue;
        frameById.set(fid, f);
      }

      for (const f of frames) {
        if (!f) continue;
        ensureFrameAttributes(f);

        f.attributes.next = "";

        const choices = Array.isArray(f.choices) ? f.choices : [];
        for (const c of choices) {
          if (!c || typeof c !== "object") continue;
          const type = (c.type || "jump").toLowerCase();
          if (type !== "jump") continue;

          c.target = "";
        }
      }

      for (const l of STATE.links || []) {
        const fromNodeId = safeId(l?.from?.nodeId);
        const toNodeId = safeId(l?.to?.nodeId);
        const fromPortId = safeId(l?.from?.portId);

        const fromFrameId = nodeToFrameId.get(fromNodeId);
        const toFrameId = nodeToFrameId.get(toNodeId);
        if (
          !Number.isFinite(Number(fromFrameId)) ||
          !Number.isFinite(Number(toFrameId))
        )
          continue;

        const fromFrame = frameById.get(Number(fromFrameId));
        const toFrame = frameById.get(Number(toFrameId));
        if (!fromFrame || !toFrame) continue;

        ensureFrameAttributes(fromFrame);

        if (fromPortId === "next") {
          fromFrame.attributes.next = String(toFrame.id);
          continue;
        }

        if (fromPortId.startsWith("choice:")) {
          const choiceId = fromPortId.slice("choice:".length);
          if (!choiceId) continue;

          const choices = Array.isArray(fromFrame.choices)
            ? fromFrame.choices
            : [];
          let matched = false;

          for (const c of choices) {
            if (!c || typeof c !== "object") continue;
            const type = (c.type || "jump").toLowerCase();
            if (type !== "jump") continue;
            if (safeId(c.id) === safeId(choiceId)) {
              c.target = String(toFrame.id);
              matched = true;
              break;
            }
          }

          if (!matched) continue;
        }
      }

      // determine start/end markers from links involving special nodes
      try {
        let start = null;
        let end = null;
        const nodeById = new Map(STATE.nodes.map((n) => [safeId(n.id), n]));
        for (const l of STATE.links || []) {
          const fromN = nodeById.get(safeId(l?.from?.nodeId));
          const toN = nodeById.get(safeId(l?.to?.nodeId));
          if (fromN && fromN.type === "start" && toN && toN.type === "frame")
            start = Number(toN.frameId);
          if (toN && toN.type === "end" && fromN && fromN.type === "frame")
            end = Number(fromN.frameId);
        }
        STATE.startFrameId = start != null ? start : STATE.startFrameId;
        STATE.endFrameId = end != null ? end : STATE.endFrameId;
      } catch (e) { }

      scheduleAutosave("node_graph_v2:apply_to_frames");
      return { ok: true, reason: "" };
    }

    function ensureStorage(ch) {
      if (!ch) return null;
      if (!ch[STORAGE_KEY] || typeof ch[STORAGE_KEY] !== "object") {
        ch[STORAGE_KEY] = {
          v: VERSION,
          nodes: [],
          links: [],
          startFrameId: null,
          endFrameId: null,
          viewport: { x: 0, y: 0, scale: 1 },
        };
      }
      if (ch[STORAGE_KEY].v !== VERSION) {
        ch[STORAGE_KEY] = {
          v: VERSION,
          nodes: [],
          links: [],
          startFrameId: null,
          endFrameId: null,
          viewport: { x: 0, y: 0, scale: 1 },
        };
      }
      return ch[STORAGE_KEY];
    }

    function scheduleAutosave(reason = "node_graph_v2") {
      if (STATE._autosaveTimer) clearTimeout(STATE._autosaveTimer);
      STATE._autosaveTimer = setTimeout(() => {
        try {
          if (typeof window.scheduleAutoSave === "function") {
            window.scheduleAutoSave(reason);
          }
        } catch (e) { }
        STATE._autosaveTimer = null;
      }, 200);
    }

    function worldToScreen(p) {
      return {
        x: p.x * STATE.viewport.scale + STATE.viewport.x,
        y: p.y * STATE.viewport.scale + STATE.viewport.y,
      };
    }

    function screenToWorld(p) {
      return {
        x: (p.x - STATE.viewport.x) / STATE.viewport.scale,
        y: (p.y - STATE.viewport.y) / STATE.viewport.scale,
      };
    }

    function ensureNodesForFrames() {
      const frames = getFrames();
      const existingByFrame = new Map();
      for (const n of STATE.nodes) {
        if (n && n.type === "frame" && Number.isFinite(Number(n.frameId))) {
          existingByFrame.set(Number(n.frameId), n);
        }
      }

      let i = 0;
      for (const f of frames) {
        const fid = Number(f?.id);
        if (!Number.isFinite(fid)) continue;

        if (!existingByFrame.has(fid)) {
          const col = i % 4;
          const row = Math.floor(i / 4);
          STATE.nodes.push({
            id: nowId("node"),
            type: "frame",
            frameId: fid,
            x: 200 + col * (CFG.node.w + 120),
            y: 140 + row * 140,
          });
        }
        i++;
      }
    }

    function normalizeAgainstFrames() {
      const frames = getFrames();
      const frameIds = new Set(frames.map((f) => Number(f?.id)));

      // Keep non-frame nodes (start/end) and only validate frame nodes against frames
      STATE.nodes = (STATE.nodes || []).filter((n) => {
        if (!n) return false;
        if (n.type && n.type !== "frame") return true;
        if (n.type === "frame") return frameIds.has(Number(n.frameId));
        return false;
      });

      const nodeIdSet = new Set(STATE.nodes.map((n) => safeId(n.id)));
      STATE.links = (STATE.links || []).filter((l) => {
        if (!l || !l.from || !l.to) return false;
        if (!nodeIdSet.has(safeId(l.from.nodeId))) return false;
        if (!nodeIdSet.has(safeId(l.to.nodeId))) return false;

        if (safeId(l.to.portId) !== "in") return false;
        return true;
      });

      if (
        STATE.startFrameId != null &&
        !frameIds.has(Number(STATE.startFrameId))
      )
        STATE.startFrameId = null;
      if (STATE.endFrameId != null && !frameIds.has(Number(STATE.endFrameId)))
        STATE.endFrameId = null;
    }

    function getNode(nodeId) {
      const id = safeId(nodeId);
      return STATE.nodes.find((n) => safeId(n.id) === id) ?? null;
    }

    function getNodeByFrameId(frameId) {
      const fid = Number(frameId);
      return STATE.nodes.find((n) => Number(n.frameId) === fid) ?? null;
    }

    function getPortsForNode(node) {
      if (!node || !node.type) return { inputs: [], outputs: [] };
      if (node.type === "frame") {
        const frame = getFrameById(node.frameId);

        const inputs = [{ id: "in", label: "In", kind: "in" }];

        const outputs = [];

        const choices = Array.isArray(frame?.choices) ? frame.choices : [];

        for (const c of choices) {
          if (!c || typeof c !== "object") continue;
          const type = (c.type || "jump").toLowerCase();
          if (type !== "jump") continue;

          const cid = safeId(c.id);
          // resolve localized choice text
          let rawText = "";
          if (c.text && typeof c.text === "object") {
            const lang = window.editorLanguage || "EN";
            rawText = c.text[lang] || c.text["EN"] || "";
          } else {
            rawText = String(c.text || "Choice");
          }
          const text = rawText.trim();
          outputs.push({
            id: `choice:${cid}`,
            label: `Choice: ${text || "(empty)"}`,
            kind: "choice",
          });
        }

        if (outputs.length === 0) {
          outputs.push({ id: "next", label: "Next", kind: "next" });
        }

        return { inputs, outputs };
      }

      if (node.type === "start") {
        return {
          inputs: [],
          outputs: [{ id: "next", label: "Out", kind: "next" }],
        };
      }

      if (node.type === "end") {
        return { inputs: [{ id: "in", label: "In", kind: "in" }], outputs: [] };
      }

      return { inputs: [], outputs: [] };
    }

    function validateConnection(from, to) {
      if (!from || !to) return { ok: false, reason: "Invalid endpoint." };

      if (safeId(from.nodeId) === safeId(to.nodeId))
        return { ok: false, reason: "Cannot connect a node to itself." };

      if (safeId(from.portId) === "")
        return { ok: false, reason: "Invalid from port." };
      if (safeId(to.portId) !== "in")
        return { ok: false, reason: "Invalid to port." };

      const fp = safeId(from.portId);
      if (fp !== "next" && !fp.startsWith("choice:"))
        return {
          ok: false,
          reason: "Only Next/Choice outputs are connectable.",
        };

      const fromNode = getNode(from.nodeId);
      if (!fromNode) return { ok: false, reason: "From node missing." };
      const ports = getPortsForNode(fromNode).outputs;
      if (!ports.some((p) => safeId(p.id) === fp))
        return { ok: false, reason: "From port no longer exists." };

      return { ok: true, reason: "" };
    }

    function removeLinksWhere(pred) {
      const before = STATE.links.length;
      STATE.links = STATE.links.filter((l) => !pred(l));
      return before !== STATE.links.length;
    }

    function findExistingFromLink(fromNodeId, fromPortId) {
      const a = safeId(fromNodeId);
      const b = safeId(fromPortId);
      return STATE.links.find(
        (l) => safeId(l?.from?.nodeId) === a && safeId(l?.from?.portId) === b,
      );
    }

    function findIncomingToNode(toNodeId) {
      const b = safeId(toNodeId);
      return STATE.links.find(
        (l) => safeId(l?.to?.nodeId) === b && safeId(l?.to?.portId) === "in",
      );
    }

    function upsertLink(from, to) {
      const ok = validateConnection(from, to);
      if (!ok.ok) return ok;
      removeLinksWhere(
        (l) =>
          safeId(l?.from?.nodeId) === safeId(from.nodeId) &&
          safeId(l?.from?.portId) === safeId(from.portId),
      );

      STATE.links.push({
        id: nowId("link"),
        from: { nodeId: safeId(from.nodeId), portId: safeId(from.portId) },
        to: { nodeId: safeId(to.nodeId), portId: "in" },
      });

      recomputeStartEndFromLinks();

      return { ok: true, reason: "" };
    }

    function deleteLink(linkId) {
      const id = safeId(linkId);
      const changed = removeLinksWhere((l) => safeId(l?.id) === id);
      if (changed) recomputeStartEndFromLinks();
      return changed;
    }

    function recomputeStartEndFromLinks() {
      let start = null;
      let end = null;
      const nodeById = new Map(STATE.nodes.map((n) => [safeId(n.id), n]));
      for (const l of STATE.links) {
        const fromN = nodeById.get(safeId(l?.from?.nodeId));
        const toN = nodeById.get(safeId(l?.to?.nodeId));
        if (fromN && fromN.type === "start" && toN && toN.type === "frame") {
          start = Number(toN.frameId);
        }
        if (toN && toN.type === "end" && fromN && fromN.type === "frame") {
          end = Number(fromN.frameId);
        }
      }
      STATE.startFrameId = start != null ? start : null;
      STATE.endFrameId = end != null ? end : null;
    }

    function saveToChapter(reason = "save") {
      const ch = getChapter();
      if (!ch) return;

      const g = ensureStorage(ch);

      g.nodes = (STATE.nodes || []).map((n) => ({
        id: safeId(n.id),
        type: safeId(n.type) || "frame",
        frameId: n.type === "frame" ? Number(n.frameId) : null,
        x: Number(n.x) || 0,
        y: Number(n.y) || 0,
      }));

      g.links = (STATE.links || []).map((l) => ({
        id: safeId(l.id) || nowId("link"),
        from: { nodeId: safeId(l.from.nodeId), portId: safeId(l.from.portId) },
        to: { nodeId: safeId(l.to.nodeId), portId: "in" },
      }));

      g.startFrameId =
        STATE.startFrameId != null ? Number(STATE.startFrameId) : null;
      g.endFrameId = STATE.endFrameId != null ? Number(STATE.endFrameId) : null;
      g.viewport = {
        x: Number(STATE.viewport.x) || 0,
        y: Number(STATE.viewport.y) || 0,
        scale: Number(STATE.viewport.scale) || 1,
      };

      try {
        applyGraphLinksToFrames();
      } catch (e) { }

      scheduleAutosave("node_graph_v2:" + reason);
    }

    function loadFromChapter(chapterId) {
      STATE.chapterId = chapterId ?? null;

      ensureChoiceIds();

      const ch = getChapter();
      if (!ch) return;

      const g = ensureStorage(ch);

      STATE.nodes = (g.nodes || []).map((n) => ({
        id: safeId(n.id) || nowId("node"),
        type: safeId(n.type) || "frame",
        frameId: n.frameId != null ? Number(n.frameId) : null,
        x: Number(n.x) || 200,
        y: Number(n.y) || 140,
      }));

      STATE.links = (g.links || []).map((l) => ({
        id: safeId(l.id) || nowId("link"),
        from: {
          nodeId: safeId(l?.from?.nodeId),
          portId: safeId(l?.from?.portId),
        },
        to: { nodeId: safeId(l?.to?.nodeId), portId: "in" },
      }));

      STATE.startFrameId =
        g.startFrameId != null ? Number(g.startFrameId) : null;
      STATE.endFrameId = g.endFrameId != null ? Number(g.endFrameId) : null;

      if (g.viewport && typeof g.viewport === "object") {
        STATE.viewport.x = Number(g.viewport.x) || 0;
        STATE.viewport.y = Number(g.viewport.y) || 0;
        STATE.viewport.scale = clamp(
          Number(g.viewport.scale) || 1,
          CFG.minScale,
          CFG.maxScale,
        );
      }

      ensureNodesForFrames();
      normalizeAgainstFrames();
      ensureStartEndNodes();
    }

    function injectCss() {
      if (STATE._cssInjected) return;

      const style = document.createElement("style");
      style.textContent = `
.ngv2-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(1px);
}

.ngv2-modal {
  width: min(92vw, 1200px);
  height: min(88vh, 900px);
  background: ${CFG.colors.bg};
  border: none;
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  display: grid;
  grid-template-rows: 52px 1fr;
  overflow: visible;
  color: ${CFG.colors.text};
}

.ngv2-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: ${CFG.colors.panel2};
  border-bottom: 1px solid ${CFG.colors.border};
  border-radius: 15px 15px 0 0;
}

.ngv2-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ngv2-title b { font-size: 14px; font-weight: 700; letter-spacing: 0.2px; }
.ngv2-title span { font-size: 12px; color: ${CFG.colors.muted}; }

.ngv2-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ngv2-btn {
  appearance: none;
  border: 1px solid ${CFG.colors.border};
  background: ${CFG.colors.panel};
  color: ${CFG.colors.text};
  padding: 7px 10px;
  border-radius: var(--radius-xl);
  cursor: pointer;
  font-size: 12px;
  user-select: none;
  box-shadow: var(--shadow-sm);
}
.ngv2-btn:hover { background: var(--hover-bg); }
.ngv2-btn.primary { border-color: var(--primary); background: var(--selected-bg); }
.ngv2-btn.danger { border-color: var(--danger); background: rgba(239, 68, 68, 0.12); }

.ngv2-body {
  display: grid;
  grid-template-columns: 1fr;
  min-height: 0;
}

.ngv2-canvasWrap {

  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0) 0 0 / ${CFG.grid}px ${CFG.grid}px,
    ${CFG.colors.bg};
  cursor: grab;
  border-radius: 15px;
}


.ngv2-canvas {
  position: absolute;
  inset: 0;
  background: ${CFG.colors.bg};
}

.ngv2-svg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
}

.ngv2-inspector {
  display: none;
}

.ngv2-card {
  border: 1px solid ${CFG.colors.border};
  background: ${CFG.colors.panel};
  border-radius: var(--radius-xl);
  padding: 10px;
  margin-bottom: 10px;
  box-shadow: var(--shadow-sm);
}

.ngv2-kv { display:flex; flex-direction:column; gap:6px; font-size:12px; }
.ngv2-kv label { color: ${CFG.colors.muted}; font-size: 11px; }
.ngv2-kv input {
  width: 100%;
  border: 1px solid ${CFG.colors.border};
  background: rgba(255,255,255,0.05);
  color: ${CFG.colors.text};
  padding: 7px 8px;
  border-radius: 10px;
  outline: none;
}
.ngv2-kv input:focus { border-color: rgba(59,130,246,0.55); box-shadow: 0 0 0 3px rgba(59,130,246,0.18); }

.ngv2-toast {
  position: absolute;
  bottom: 12px;
  left: 12px;
  max-width: 520px;
  background: rgba(0,0,0,0.55);
  border: 1px solid ${CFG.colors.border};
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 12px;
  color: ${CFG.colors.text};
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 120ms ease, transform 120ms ease;
  pointer-events: none;
}
.ngv2-toast.show { opacity: 1; transform: translateY(0); }

.ngv2-node {
  position: absolute;
  min-width: ${CFG.node.w}px;
  width: ${CFG.node.w}px;
  max-width: ${CFG.node.w}px;
  border-radius: var(--radius-xl);
  border: 1px solid ${CFG.colors.border};
  background: ${CFG.colors.panel};
  box-shadow: var(--shadow-lg);
  transform-origin: top left;
  user-select: none;
}

.ngv2-node.selected {
  border-color: rgba(59,130,246,0.65);
  box-shadow: 0 10px 36px rgba(59,130,246,0.12), 0 10px 36px rgba(0,0,0,0.35);
}

.ngv2-nodeHeader {
  height: ${CFG.node.headerH}px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px ${CFG.node.pad}px;
  border-bottom: 1px solid ${CFG.colors.border};
  background: ${CFG.colors.panel2};
  border-top-left-radius: var(--radius-xl);
  border-top-right-radius: var(--radius-xl);
}

.ngv2-nodeHeader.type-start { background: var(--success); color: white; }
.ngv2-nodeHeader.type-end { background: var(--danger); color: white; }

.ngv2-nodeTitle {
  display:flex;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
}
.ngv2-nodeTitle b {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ngv2-nodeTitle span {
  font-size: 11px;
  color: ${CFG.colors.muted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ngv2-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid ${CFG.colors.border};
  background: rgba(255,255,255,0.06);
  color: ${CFG.colors.text};
}
  .ngv2-badge.start { border-color: rgba(34,197,94,0.5); background: rgba(34,197,94,0.12); }
  .ngv2-badge.end { border-color: rgba(239,68,68,0.5); background: rgba(239,68,68,0.08); }
.ngv2-badge.instant { border-color: rgba(245,158,11,0.5); background: rgba(245,158,11,0.12); }

.ngv2-nodeBody { padding: ${CFG.node.pad}px; display:flex; flex-direction: column; gap: 8px; background: ${CFG.colors.bg}; border-radius: 0 0 var(--radius-xl) var(--radius-xl);}


.ngv2-portsGrid{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-items: start;
}
.ngv2-portCol{
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.ngv2-portColTitle{
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${CFG.colors.muted};
  padding: 0 6px;
  margin-bottom: 2px;
  user-select: none;
}
.ngv2-portColTitle.in{ text-align: left; }
.ngv2-portColTitle.out{ text-align: right; }
.ngv2-portCol.out{ align-items: flex-end; }
.ngv2-portCol.out .ngv2-port{ justify-content: flex-end; text-align: right; }

.ngv2-portCol.out .ngv2-dot { order: 2; }
.ngv2-portCol.out .ngv2-portLabel { order: 1; }


.ngv2-row { display:flex; align-items:center; justify-content: space-between; gap: 8px; height: ${CFG.node.rowH}px; }

.ngv2-port {
  display:flex;
  align-items:center;
  gap: 8px;
  cursor: pointer;
  padding: 5px 8px;
  border-radius: var(--radius-xl);
  border: 1px solid transparent;
  background: var(--hover-bg);
}
.ngv2-port:hover {
  border-color: ${CFG.colors.border};
  background: var(--selected-bg);
}

.ngv2-portLabel { font-size: 12px; color: ${CFG.colors.text}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px; }
.ngv2-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 2px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.08);
  box-shadow: 0 0 0 2px rgba(0,0,0,0.25);
  flex: 0 0 auto;
}

.ngv2-dot.in { background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.18); }
.ngv2-dot.next { background: rgba(34,197,94,0.75); border-color: rgba(34,197,94,0.95); }
.ngv2-dot.choice { background: rgba(168,85,247,0.75); border-color: rgba(168,85,247,0.95); }

.ngv2-port.selected {
  border-color: rgba(59,130,246,0.55);
  box-shadow: 0 0 0 3px rgba(59,130,246,0.18);
}

.ngv2-port.connectable {
  border-color: rgba(34,197,94,0.55);
  box-shadow: 0 0 0 3px rgba(34,197,94,0.15);
}
.ngv2-port.disabled { opacity: 0.55; filter: grayscale(0.35); cursor: not-allowed; }
`;
      document.head.appendChild(style);
      STATE._cssInjected = true;
    }

    function switchLanguage(lang) {
      window.editorLanguage = lang;
      const label = document.getElementById("ngv2-curr-lang-label");
      if (label) label.textContent = lang;

      const frames = getFrames();
      const samples = {
        EN: "Sample Text",
        TH: "ข้อความตัวอย่าง",
        JP: "サンプルテキスト",
        CN: "示例文本",
      };

      let modified = false;
      for (const f of frames) {
        if (!f) continue;
        if (!f.text || typeof f.text !== "object") {
          // Convert string to object if necessary
          const oldVal =
            typeof f.text === "string" ? f.text : f.text?.["EN"] || "";
          f.text = { EN: oldVal };
        }

        if (!f.text[lang]) {
          if (samples[lang]) {
            f.text[lang] = samples[lang];
          } else {
            f.text[lang] = "empty..";
          }
          modified = true;
        }
      }

      if (modified) saveToChapter("lang_switch");
      render();
    }

    function ensureUI() {
      injectCss();

      if (STATE.ui.overlay) return;

      const overlay = document.createElement("div");
      overlay.className = "ngv2-overlay";
      overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) close();
      });

      const modal = document.createElement("div");
      modal.className = "ngv2-modal";

      const header = document.createElement("div");
      header.className = "ngv2-header";

      const title = document.createElement("div");
      title.className = "ngv2-title";
      const titleB = document.createElement("b");
      titleB.textContent = "Storyline Node Editor (V2)";
      const titleS = document.createElement("span");
      title.appendChild(titleB);
      title.appendChild(titleS);

      const actions = document.createElement("div");
      actions.className = "ngv2-actions";

      // Language Dropdown
      const langWrap = document.createElement("div");
      langWrap.className = "menu-item";
      langWrap.style.height = "28px";
      langWrap.style.marginRight = "10px";
      langWrap.innerHTML = `
        <span id="ngv2-curr-lang-label">${window.editorLanguage || "EN"
        }</span> <span style="font-size:10px; margin-left:4px;">▼</span>
        <div class="dropdown-content" style="top:100%; right:0; left:auto; width: 140px;">
             <button onclick="window.NodeGraphV2.switchLanguage('EN')">English (EN)</button>
             <button onclick="window.NodeGraphV2.switchLanguage('TH')">Thai (TH)</button>
             <button onclick="window.NodeGraphV2.switchLanguage('JP')">Japanese (JP)</button>
             <button onclick="window.NodeGraphV2.switchLanguage('CN')">Chinese (CN)</button>
        </div>
      `;
      actions.appendChild(langWrap);

      const btnClose = document.createElement("button");
      btnClose.textContent = "×";
      btnClose.onclick = () => close();

      actions.appendChild(btnClose);

      header.appendChild(title);
      header.appendChild(actions);

      const body = document.createElement("div");
      body.className = "ngv2-body";

      const canvasWrap = document.createElement("div");
      canvasWrap.className = "ngv2-canvasWrap";
      canvasWrap.tabIndex = 0;

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("ngv2-svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");

      const canvas = document.createElement("div");
      canvas.className = "ngv2-canvas";

      const toastEl = document.createElement("div");
      toastEl.className = "ngv2-toast";

      canvasWrap.appendChild(svg);
      canvasWrap.appendChild(canvas);
      canvasWrap.appendChild(toastEl);

      body.appendChild(canvasWrap);

      modal.appendChild(header);
      modal.appendChild(body);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      STATE.ui.overlay = overlay;
      STATE.ui.modal = modal;
      STATE.ui.headerTitle = titleB;
      STATE.ui.canvasWrap = canvasWrap;
      STATE.ui.canvas = canvas;
      STATE.ui.svg = svg;
      STATE.ui.toast = toastEl;

      wireEvents();
    }

    function toast(msg) {
      const el = STATE.ui.toast;
      if (!el) return;
      el.textContent = String(msg ?? "");
      el.classList.add("show");
      setTimeout(() => el.classList.remove("show"), 1300);
    }

    function nodeScreenRect(node) {
      const p = worldToScreen({ x: node.x, y: node.y });
      return {
        x: p.x,
        y: p.y,
        w: CFG.node.w * STATE.viewport.scale,
        h: 60 * STATE.viewport.scale,
      };
    }

    function portWorldPos(node, side, index, count) {
      const titleOffset = CFG.node.rowH;
      const baseY =
        node.y +
        CFG.node.headerH +
        CFG.node.pad +
        titleOffset +
        CFG.node.rowH / 2;
      const y = baseY + index * CFG.node.rowH;
      const x = side === "in" ? node.x - 16 : node.x + CFG.node.w + 16;

      return { x, y };
    }

    function portScreenPosFromDom(portEl) {
      const wrap = STATE.ui.canvasWrap;
      if (!wrap || !portEl) return null;

      const wrapRect = wrap.getBoundingClientRect();
      const r = portEl.getBoundingClientRect();

      // Anchor at the dot center if possible; otherwise fall back to the port row center.
      const dot = portEl.querySelector(".ngv2-dot");
      if (dot) {
        const dr = dot.getBoundingClientRect();
        return {
          x: dr.left - wrapRect.left + dr.width / 2,
          y: dr.top - wrapRect.top + dr.height / 2,
        };
      }

      return {
        x: r.left - wrapRect.left + r.width / 2,
        y: r.top - wrapRect.top + r.height / 2,
      };
    }

    function getPortElement(nodeId, portId, side) {
      const wrap = STATE.ui.canvasWrap;
      if (!wrap) return null;

      const nid = safeId(nodeId);
      const pid = safeId(portId);
      const s = safeId(side);

      const els = wrap.querySelectorAll("[data-port][data-node][data-side]");
      for (const el of els) {
        if (
          safeId(el.getAttribute("data-node")) === nid &&
          safeId(el.getAttribute("data-port")) === pid &&
          safeId(el.getAttribute("data-side")) === s
        ) {
          return el;
        }
      }
      return null;
    }

    function getLinkColor(portId) {
      const pid = safeId(portId);
      if (pid === "next") return CFG.colors.linkNext;
      if (pid.startsWith("choice:")) return CFG.colors.linkChoice;
      return CFG.colors.link;
    }

    function renderLinks() {
      const svg = STATE.ui.svg;
      if (!svg) return;

      while (svg.firstChild) svg.removeChild(svg.firstChild);

      const ns = "http://www.w3.org/2000/svg";

      const nodeById = new Map();
      for (const n of STATE.nodes) nodeById.set(safeId(n.id), n);

      for (const l of STATE.links) {
        const fromN = nodeById.get(safeId(l?.from?.nodeId));
        const toN = nodeById.get(safeId(l?.to?.nodeId));
        if (!fromN || !toN) continue;

        const fromEl = getPortElement(l.from.nodeId, l.from.portId, "out");
        const toEl = getPortElement(l.to.nodeId, "in", "in");

        // Prefer DOM-accurate anchors; fall back to math-based anchors if DOM isn't available yet.
        const p1s = fromEl ? portScreenPosFromDom(fromEl) : null;
        const p2s = toEl ? portScreenPosFromDom(toEl) : null;

        const p1 = p1s
          ? p1s
          : worldToScreen(
            portWorldPos(
              fromN,
              "out",
              0,
              Math.max(1, getPortsForNode(fromN).outputs.length),
            ),
          );
        const p2 = p2s ? p2s : worldToScreen(portWorldPos(toN, "in", 0, 1));

        const dx = Math.max(60, Math.abs(p2.x - p1.x) * 0.45);
        const c1 = { x: p1.x + dx, y: p1.y };
        const c2 = { x: p2.x - dx, y: p2.y };

        const path = document.createElementNS(ns, "path");
        const d = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", getLinkColor(l.from.portId));
        path.setAttribute("stroke-width", String(3 * STATE.viewport.scale));
        path.setAttribute("opacity", "0.95");

        svg.appendChild(path);

        const arrow = document.createElementNS(ns, "circle");
        arrow.setAttribute("cx", String(p2.x));
        arrow.setAttribute("cy", String(p2.y));
        arrow.setAttribute("r", String(4.5 * STATE.viewport.scale));
        arrow.setAttribute("fill", getLinkColor(l.from.portId));
        arrow.setAttribute("opacity", "0.95");
        svg.appendChild(arrow);
      }

      if (STATE.selectingFrom && STATE._mouseWorld) {
        const fromN = nodeById.get(safeId(STATE.selectingFrom.nodeId));
        if (fromN) {
          const fromEl = getPortElement(
            STATE.selectingFrom.nodeId,
            STATE.selectingFrom.portId,
            "out",
          );

          const p1s = fromEl ? portScreenPosFromDom(fromEl) : null;
          const p1 = p1s
            ? p1s
            : worldToScreen(
              portWorldPos(
                fromN,
                "out",
                0,
                Math.max(1, getPortsForNode(fromN).outputs.length),
              ),
            );

          const p2 = worldToScreen(STATE._mouseWorld);

          const dx = Math.max(60, Math.abs(p2.x - p1.x) * 0.45);
          const c1 = { x: p1.x + dx, y: p1.y };
          const c2 = { x: p2.x - dx, y: p2.y };

          const ns = "http://www.w3.org/2000/svg";
          const path = document.createElementNS(ns, "path");
          const d = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
          path.setAttribute("d", d);
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", getLinkColor(STATE.selectingFrom.portId));
          path.setAttribute("stroke-width", String(2.5 * STATE.viewport.scale));
          path.setAttribute("opacity", "0.35");
          path.setAttribute(
            "stroke-dasharray",
            `${8 * STATE.viewport.scale} ${6 * STATE.viewport.scale}`,
          );
          svg.appendChild(path);
        }
      }
    }

    function renderNode(node) {
      const frame = getFrameById(node.frameId);

      const el = document.createElement("div");
      el.className = "ngv2-node";
      el.setAttribute("data-node", safeId(node.id));

      const sc = STATE.viewport.scale;
      const p = worldToScreen({ x: node.x, y: node.y });
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.transform = `scale(${sc})`;

      if (STATE.selectedNodeIds.has(safeId(node.id)))
        el.classList.add("selected");

      const header = document.createElement("div");
      header.className = "ngv2-nodeHeader";
      if (node.type === "start") header.classList.add("type-start");
      if (node.type === "end") header.classList.add("type-end");

      const title = document.createElement("div");
      title.className = "ngv2-nodeTitle";
      const b = document.createElement("b");

      let titleText = "";
      if (node.type === "start") titleText = "Start";
      else if (node.type === "end") titleText = "End";
      else {
        let rawText = "";
        if (typeof window.getLocalizedFrameText === "function") {
          rawText = window.getLocalizedFrameText(frame);
        } else {
          // Fallback manual resolution
          if (frame?.text && typeof frame.text === "object") {
            const lang = window.editorLanguage || "EN";
            rawText = frame.text[lang] || frame.text["EN"] || "";
          } else {
            rawText = String(frame?.text || "");
          }
        }

        rawText = rawText.trim().replace(/\s+/g, " ");
        const MAX = 25;
        titleText =
          rawText.length > MAX ? rawText.slice(0, MAX) + "..." : rawText;
      }

      b.textContent = titleText || "";

      title.appendChild(b);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "6px";

      if (
        STATE.startFrameId != null &&
        Number(STATE.startFrameId) === Number(node.frameId)
      ) {
        const badge = document.createElement("span");
        badge.className = "ngv2-badge start";
        badge.textContent = "START";
        right.appendChild(badge);
      }

      if (
        STATE.endFrameId != null &&
        Number(STATE.endFrameId) === Number(node.frameId)
      ) {
        const badge = document.createElement("span");
        badge.className = "ngv2-badge end";
        badge.textContent = "END";
        right.appendChild(badge);
      }

      if (frameType(frame) === "instant") {
        const badge = document.createElement("span");
        badge.className = "ngv2-badge instant";
        badge.textContent = "INSTANT";
        right.appendChild(badge);
      }

      header.appendChild(title);
      header.appendChild(right);

      const body = document.createElement("div");
      body.className = "ngv2-nodeBody";

      const ports = getPortsForNode(node);

      const portsGrid = document.createElement("div");
      portsGrid.className = "ngv2-portsGrid";

      const inCol = document.createElement("div");
      inCol.className = "ngv2-portCol in";

      const inTitle = document.createElement("div");
      inTitle.className = "ngv2-portColTitle in";
      inTitle.textContent = "IN";
      inCol.appendChild(inTitle);

      for (const pIn of ports.inputs) {
        inCol.appendChild(renderPort(node, "in", pIn));
      }

      const outCol = document.createElement("div");
      outCol.className = "ngv2-portCol out";

      const outTitle = document.createElement("div");
      outTitle.className = "ngv2-portColTitle out";
      outTitle.textContent = "OUT";
      outCol.appendChild(outTitle);

      for (const pOut of ports.outputs) {
        outCol.appendChild(renderPort(node, "out", pOut));
      }

      portsGrid.appendChild(inCol);
      portsGrid.appendChild(outCol);

      body.appendChild(portsGrid);

      el.appendChild(header);
      el.appendChild(body);

      return el;
    }

    function renderPort(node, side, port) {
      const el = document.createElement("div");
      el.className = "ngv2-port";
      el.setAttribute("data-port", safeId(port.id));
      el.setAttribute("data-node", safeId(node.id));
      el.setAttribute("data-side", side);

      const dot = document.createElement("div");
      dot.className = "ngv2-dot";
      if (side === "in") dot.classList.add("in");
      if (port.kind === "next") dot.classList.add("next");
      if (port.kind === "choice") dot.classList.add("choice");

      const label = document.createElement("div");
      label.className = "ngv2-portLabel";
      label.textContent = port.label;

      el.appendChild(dot);
      el.appendChild(label);

      if (STATE.selectingFrom) {
        if (side === "in") {
          const ok = validateConnection(
            {
              nodeId: STATE.selectingFrom.nodeId,
              portId: STATE.selectingFrom.portId,
            },
            { nodeId: node.id, portId: "in" },
          );
          if (ok.ok) el.classList.add("connectable");
          else el.classList.add("disabled");
        } else {
        }
      }

      if (
        STATE.selectingFrom &&
        side === "out" &&
        safeId(STATE.selectingFrom.nodeId) === safeId(node.id) &&
        safeId(STATE.selectingFrom.portId) === safeId(port.id)
      ) {
        el.classList.add("selected");
      }

      return el;
    }

    function renderInspector() {
      return;
    }

    function shortPortLabel(from) {
      const n = getNode(from.nodeId);
      const f = n ? getFrameById(n.frameId) : null;
      const pid = safeId(from.portId);

      let p = pid;
      if (pid === "next") p = "Next";
      else if (pid.startsWith("choice:")) p = "Choice";

      return `#${f?.id ?? n?.frameId ?? "?"} (${p})`;
    }

    function render() {
      if (!STATE.open) return;
      const canvas = STATE.ui.canvas;
      if (!canvas) return;

      canvas.innerHTML = "";

      for (const node of STATE.nodes) {
        const el = renderNode(node);
        canvas.appendChild(el);
      }

      renderLinks();

      if (STATE.selectionBox) {
        const div = document.createElement("div");
        div.className = "ngv2-selection-box";
        div.style.left = STATE.selectionBox.x + "px";
        div.style.top = STATE.selectionBox.y + "px";
        div.style.width = STATE.selectionBox.w + "px";
        div.style.height = STATE.selectionBox.h + "px";
        canvas.appendChild(div);
      }
    }

    function ensureStartEndNodes() {
      const hasStart = STATE.nodes.some((n) => n.type === "start");
      const hasEnd = STATE.nodes.some((n) => n.type === "end");

      if (!hasStart) {
        STATE.nodes.push({
          id: nowId("node"),
          type: "start",
          x: 100,
          y: 200,
        });
      }

      if (!hasEnd) {
        STATE.nodes.push({
          id: nowId("node"),
          type: "end",
          x: 1000,
          y: 200,
        });
      }
    }

    function fitToContent() {
      const wrap = STATE.ui.canvasWrap;
      if (!wrap) return;

      if (!STATE.nodes.length) return;

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      for (const n of STATE.nodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + CFG.node.w);
        maxY = Math.max(maxY, n.y + CFG.node.headerH + 6 * CFG.node.rowH);
      }

      const pad = 140;
      minX -= pad;
      minY -= pad;
      maxX += pad;
      maxY += pad;

      const rect = wrap.getBoundingClientRect();
      const vpW = rect.width;
      const vpH = rect.height;

      const contentW = Math.max(1, maxX - minX);
      const contentH = Math.max(1, maxY - minY);

      const scale = clamp(
        Math.min(vpW / contentW, vpH / contentH),
        CFG.minScale,
        CFG.maxScale,
      );

      STATE.viewport.scale = scale;
      STATE.viewport.x = vpW / 2 - ((minX + maxX) / 2) * scale;
      STATE.viewport.y = vpH / 2 - ((minY + maxY) / 2) * scale;

      saveToChapter("fit");
      render();
    }

    function autoLayout() {
      const frames = getFrames();
      const byId = new Map(frames.map((f) => [Number(f?.id), f]));
      const orderedNodes = [...STATE.nodes].sort(
        (a, b) => Number(a.frameId) - Number(b.frameId),
      );

      let x = 180;
      let yMain = 160;
      let yInstant = 360;

      for (const n of orderedNodes) {
        const f = byId.get(Number(n.frameId));
        const t = frameType(f);
        n.x = x;
        n.y = t === "instant" ? yInstant : yMain;
        x += CFG.node.w + 140;
      }
    }

    function getPortFromTarget(target) {
      const el = target?.closest?.("[data-port][data-node][data-side]");
      if (!el) return null;
      return {
        nodeId: el.getAttribute("data-node"),
        portId: el.getAttribute("data-port"),
        side: el.getAttribute("data-side"),
      };
    }

    function wireEvents() {
      const wrap = STATE.ui.canvasWrap;
      if (!wrap) return;

      const getClient = (e) => ({ x: e.clientX, y: e.clientY });

      wrap.addEventListener(
        "wheel",
        (e) => {
          if (!STATE.open) return;
          e.preventDefault();

          const rect = wrap.getBoundingClientRect();
          const mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          const before = screenToWorld(mouse);

          const delta = e.deltaY;
          const factor = delta > 0 ? 0.92 : 1.08;
          const nextScale = clamp(
            STATE.viewport.scale * factor,
            CFG.minScale,
            CFG.maxScale,
          );
          STATE.viewport.scale = nextScale;

          const after = screenToWorld(mouse);

          STATE.viewport.x += (after.x - before.x) * STATE.viewport.scale;
          STATE.viewport.y += (after.y - before.y) * STATE.viewport.scale;

          saveToChapter("zoom");
          render();
        },
        { passive: false },
      );

      wrap.addEventListener("mousedown", (e) => {
        if (!STATE.open) return;

        if (e.button === 1) {
          e.preventDefault();
          const mouse = getClient(e);
          STATE.drag = {
            mode: "pan",
            start: { x: mouse.x, y: mouse.y },
            origin: { x: STATE.viewport.x, y: STATE.viewport.y },
          };
          wrap.style.cursor = "grabbing";
          return;
        }

        if (e.button === 0 && e.getModifierState && e.getModifierState(" ")) {
        }

        const target = e.target;

        const port = getPortFromTarget(target);
        if (port) {
          e.preventDefault();
          e.stopPropagation();

          if (!STATE.selectingFrom && port.side === "in") {
            const removed = removeLinksWhere(
              (l) =>
                safeId(l?.to?.nodeId) === safeId(port.nodeId) &&
                safeId(l?.to?.portId) === "in",
            );
            if (removed) {
              saveToChapter("disconnect_incoming");
              render();
              toast("Disconnected incoming links.");
            } else {
              toast("Drag from an output (Next/Choice) to connect.");
            }
            return;
          }

          if (port.side === "out") {
            // Drag-to-link: mousedown on OUT arms connection immediately.
            // Mouseup on an IN port will commit the link; mouseup elsewhere cancels.
            STATE.selectingFrom = { nodeId: port.nodeId, portId: port.portId };
            STATE.drag = null; // ensure we don't start node drag
            renderLinks();
            return;
          }

          return;
        }

        const nodeEl = target.closest?.("[data-node]:not([data-port])");
        const rect = wrap.getBoundingClientRect();
        const mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const world = screenToWorld(mouse);

        if (nodeEl) {
          const nodeId = nodeEl.getAttribute("data-node");
          const node = getNode(nodeId);
          if (!node) return;

          // Multi-Select Logic
          if (e.shiftKey) {
            // Toggle functionality
            if (STATE.selectedNodeIds.has(nodeId)) {
              STATE.selectedNodeIds.delete(nodeId);
            } else {
              STATE.selectedNodeIds.add(nodeId);
            }
          } else {
            // If clicking an unselected node without shift, select ONLY this node
            if (!STATE.selectedNodeIds.has(nodeId)) {
              STATE.selectedNodeIds.clear();
              STATE.selectedNodeIds.add(nodeId);
            }
            // If clicking an ALREADY selected node, do NOT clear (allows dragging the group)
          }

          // Capture initial positions of ALL selected nodes for dragging
          const initialPositions = {};
          for (const nid of STATE.selectedNodeIds) {
            const n = getNode(nid);
            if (n) initialPositions[nid] = { x: n.x, y: n.y };
          }

          STATE.drag = {
            mode: "multi_node",
            start: { x: world.x, y: world.y }, // World start
            initialPositions: initialPositions
          };
          render();
          return;
        }

        // Clicked on background
        // Start Box Selection
        if (!e.shiftKey) {
          STATE.selectedNodeIds.clear();
        }

        STATE.drag = {
          mode: "box_select",
          start: { x: mouse.x, y: mouse.y }, // Screen co-ords for box drawing
          origin: { x: mouse.x, y: mouse.y }
        };
        // No node selected
        render();
      });

      window.addEventListener("mousemove", (e) => {
        if (!STATE.open) return;

        const wrap = STATE.ui.canvasWrap;
        if (!wrap) return;

        const rect = wrap.getBoundingClientRect();
        const mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const world = screenToWorld(mouse);

        STATE._mouseWorld = world;
        STATE.hoverPort = getPortFromTarget(e.target);

        if (STATE.drag?.mode === "pan") {
          const client = getClient(e);
          STATE.viewport.x =
            STATE.drag.origin.x + (client.x - STATE.drag.start.x);
          STATE.viewport.y =
            STATE.drag.origin.y + (client.y - STATE.drag.start.y);
          render();
          return;
        }

        if (STATE.drag?.mode === "multi_node") {
          const dx = world.x - STATE.drag.start.x;
          const dy = world.y - STATE.drag.start.y;

          for (const nid of STATE.selectedNodeIds) {
            const node = getNode(nid);
            const initPos = STATE.drag.initialPositions[nid];
            if (node && initPos) {
              node.x = snap(initPos.x + dx, CFG.grid);
              node.y = snap(initPos.y + dy, CFG.grid);
            }
          }
          render();
          return;
        }

        if (STATE.drag?.mode === "box_select") {
          const currentX = e.clientX - rect.left;
          const currentY = e.clientY - rect.top;

          const startX = STATE.drag.start.x;
          const startY = STATE.drag.start.y;

          const minX = Math.min(startX, currentX);
          const minY = Math.min(startY, currentY);
          const w = Math.abs(currentX - startX);
          const h = Math.abs(currentY - startY);

          STATE.selectionBox = { x: minX, y: minY, w, h };

          // Convert selection box to world coords to check intersection
          // Note: simple box intersection check
          const boxWorldMin = screenToWorld({ x: minX, y: minY });
          const boxWorldMax = screenToWorld({ x: minX + w, y: minY + h });

          // Normalize world rect (handle scale flipping if negative? screenToWorld handles basic scaling)
          const selRect = {
            x: boxWorldMin.x,
            y: boxWorldMin.y,
            w: boxWorldMax.x - boxWorldMin.x,
            h: boxWorldMax.y - boxWorldMin.y
          };

          // Select nodes
          if (!e.shiftKey) STATE.selectedNodeIds.clear();

          for (const node of STATE.nodes) {
            // Approximate node rect (w=300, h= ~100? use CFG.node.w)
            // For better accuracy, we could store node sizes. 
            // Using hardcoded approximation based on CFG
            const nodeRect = {
              x: node.x,
              y: node.y,
              w: CFG.node.w,
              h: 120 // Approximation or check nodeScreenRect logic
            };

            if (intersectRect(selRect, nodeRect)) {
              STATE.selectedNodeIds.add(safeId(node.id));
            }
          }

          render();
          return;
        }

        if (STATE.selectingFrom) {
          renderLinks();
        }
      });

      window.addEventListener("mouseup", (e) => {
        if (!STATE.open) return;

        const wrap = STATE.ui.canvasWrap;
        if (!wrap) return;

        // Drag-to-link commit/cancel
        if (STATE.selectingFrom) {
          const port = getPortFromTarget(e.target);
          if (port && port.side === "in") {
            const ok = upsertLink(
              {
                nodeId: STATE.selectingFrom.nodeId,
                portId: STATE.selectingFrom.portId,
              },
              { nodeId: port.nodeId, portId: "in" },
            );

            STATE.selectingFrom = null;

            if (!ok.ok) {
              toast(ok.reason);
              render();
              return;
            }

            saveToChapter("connect");
            render();
            toast("Connected.");
            return;
          }

          // Mouseup not on an input: cancel the drag-to-link
          STATE.selectingFrom = null;
          render();
          return;
        }

        if (STATE.drag) {
          const mode = STATE.drag.mode;
          STATE.drag = null;
          STATE.selectionBox = null; // Clear selection box
          wrap.style.cursor = "grab";

          if (mode === "multi_node") {
            saveToChapter("move_nodes");
          } else if (mode === "pan") {
            saveToChapter("pan");
          } else if (mode === "box_select") {
            // Selection only, no save needed
          }

          render();
        }
      });

      window.addEventListener("keydown", (e) => {
        if (!STATE.open) return;

        if (e.key === "Escape") {
          if (STATE.selectingFrom) {
            STATE.selectingFrom = null;
            render();
            toast("Canceled.");
            return;
          }
        }

        if (e.key === "Delete" || e.key === "Backspace") {
          if (STATE.selectedNodeIds.size === 0) return;

          const idsToCheck = new Set(STATE.selectedNodeIds); // Copy

          const changed = removeLinksWhere(
            (l) =>
              idsToCheck.has(safeId(l?.from?.nodeId)) ||
              idsToCheck.has(safeId(l?.to?.nodeId))
          );
          if (changed) {
            saveToChapter("delete_links_for_node");
            render();
            toast("Links removed.");
          }
          return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "0") {
          STATE.viewport.scale = 1;
          STATE.viewport.x = 0;
          STATE.viewport.y = 0;
          saveToChapter("reset_view");
          render();
        }
      });
    }

    function open(chapterId) {
      ensureUI();

      STATE.open = true;
      STATE.selectedNodeId = null;
      STATE.selectingFrom = null;
      STATE.hoverPort = null;
      STATE._mouseWorld = null;

      loadFromChapter(chapterId);

      const ch = getChapter();
      if (STATE.ui.headerTitle) {
        STATE.ui.headerTitle.textContent =
          "Storyline Node Editor " + (ch ? ` - ${ch.title || "Chapter"}` : "");
      }

      STATE.ui.overlay.style.display = "flex";
      render();

      if (
        (!STATE.viewport.x &&
          !STATE.viewport.y &&
          STATE.viewport.scale === 1) ||
        (getChapter()?.[STORAGE_KEY]?.nodes?.length ?? 0) === 0
      ) {
        fitToContent();
      }
    }

    function close() {
      if (!STATE.ui.overlay) return;
      STATE.open = false;
      STATE.selectingFrom = null;
      STATE.drag = null;
      STATE.ui.overlay.style.display = "none";
    }

    function isOpen() {
      return !!STATE.open;
    }

    return {
      open,
      close,
      isOpen,
      switchLanguage,
      _state: STATE,
    };
  })();

  window.NodeGraphV2 = NodeGraphV2;

  if (typeof window.openNodeGraphV2 !== "function") {
    window.openNodeGraphV2 = function () {
      if (window.NodeGraphV2 && typeof window.NodeGraphV2.open === "function") {
        window.NodeGraphV2.open(
          typeof activeChapterId !== "undefined" ? activeChapterId : null,
        );
      }
    };
  }
})();
