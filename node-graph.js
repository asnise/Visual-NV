(function () {
  "use strict";

  const NodeGraph = (() => {
    const STATE = {
      open: false,
      chapterId: null,

      nodes: [],
      links: [],
      derivedLinks: [],
      selectingLinkFrom: null,
      hoverPort: null,

      _lastClickedPortEl: null,
      _portFlashTimer: null,
      _portFlashCssInjected: false,

      viewport: { x: 0, y: 0, scale: 1 },
      drag: null,

      startFrameId: null,

      ui: {
        overlay: null,
        modal: null,
        headerTitle: null,
        canvasWrap: null,
        canvas: null,
        svg: null,
        toast: null,
        theme: null,
      },
    };

    const CFG = {
      grid: 24,
      minScale: 0.35,
      maxScale: 2.25,

      node: {
        w: 260,
        headerH: 32,
        pad: 10,
        rowH: 28,
        corner: 10,
      },

      port: {
        r: 7,
        hit: 18,
      },

      theme: {
        useCssVars: true,
      },

      colors: {
        bg: "rgba(8, 10, 16, 0.92)",
        panel: "rgba(20, 24, 34, 0.95)",
        panel2: "rgba(28, 34, 48, 0.95)",
        border: "rgba(255,255,255,0.10)",
        text: "rgba(255,255,255,0.92)",
        muted: "rgba(255,255,255,0.65)",
        accent: "#3b82f6",
        danger: "#ef4444",
        warn: "#f59e0b",
        ok: "#10b981",
        link: "rgba(59,130,246,0.85)",
        linkSoft: "rgba(59,130,246,0.35)",
      },

      modal: {
        maxW: 1200,
        maxH: 900,
        w: "90vw",
        h: "85vh",
      },
    };

    function clamp(n, a, b) {
      return Math.max(a, Math.min(b, n));
    }

    function safeId(x) {
      return String(x ?? "");
    }

    function nowId() {
      return (
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
      return frames.find((f) => Number(f.id) === idNum) ?? null;
    }

    function frameType(frame) {
      return frame?.frameType || "main";
    }

    function ensureGraphStorage(chapter) {
      if (!chapter) return null;
      if (!chapter.nodeGraph)
        chapter.nodeGraph = { nodes: [], links: [], startFrameId: null };
      if (!Array.isArray(chapter.nodeGraph.nodes)) chapter.nodeGraph.nodes = [];
      if (!Array.isArray(chapter.nodeGraph.links)) chapter.nodeGraph.links = [];
      return chapter.nodeGraph;
    }

    function validateLink(link) {
      if (!link || typeof link !== "object") return false;
      if (!link.from || !link.to) return false;
      if (!safeId(link.from.nodeId) || !safeId(link.to.nodeId)) return false;
      if (!safeId(link.from.portId) || !safeId(link.to.portId)) return false;
      return true;
    }

    function sameEndpoint(a, b) {
      return (
        safeId(a?.nodeId) === safeId(b?.nodeId) &&
        safeId(a?.portId) === safeId(b?.portId)
      );
    }

    function findLinkIndex(from, to) {
      return STATE.links.findIndex(
        (l) => sameEndpoint(l.from, from) && sameEndpoint(l.to, to),
      );
    }

    function addOrReplaceLink(from, to, kind) {
      // enforce: one incoming link per target input
      STATE.links = STATE.links.filter((l) => !sameEndpoint(l.to, to));
      // avoid duplicates
      const idx = findLinkIndex(from, to);
      if (idx >= 0) return;

      STATE.links.push({
        id: "l-" + nowId(),
        from: { nodeId: safeId(from.nodeId), portId: safeId(from.portId) },
        to: { nodeId: safeId(to.nodeId), portId: safeId(to.portId) },
        kind: kind || "user",
      });
    }

    function cancelLinkDrag() {
      STATE.selectingLinkFrom = null;

      if (STATE._portFlashTimer) {
        clearTimeout(STATE._portFlashTimer);
        STATE._portFlashTimer = null;
      }

      const wrap = STATE.ui.canvasWrap;
      if (wrap) {
        const flashed = wrap.querySelectorAll(".ng-flash");
        flashed.forEach((el) => el.classList.remove("ng-flash"));

        const selected = wrap.querySelectorAll(".ng-selected");
        selected.forEach((el) => el.classList.remove("ng-selected"));
      }

      STATE._lastClickedPortEl = null;

      render();
    }

    function removeOutgoingLinks(fromNodeId, fromPortId) {
      const a = safeId(fromNodeId);
      const b = safeId(fromPortId);
      const before = STATE.links.length;
      STATE.links = (STATE.links || []).filter((l) => {
        if (!validateLink(l)) return false;
        if (safeId(l.from.nodeId) !== a) return true;
        if (safeId(l.from.portId) !== b) return true;
        return false;
      });
      return before !== STATE.links.length;
    }

    function getOutgoingTarget(fromNodeId, fromPortId) {
      const a = safeId(fromNodeId);
      const b = safeId(fromPortId);
      for (const l of STATE.links || []) {
        if (!validateLink(l)) continue;
        if (safeId(l.from.nodeId) !== a) continue;
        if (safeId(l.from.portId) !== b) continue;
        return { nodeId: safeId(l.to.nodeId), portId: safeId(l.to.portId) };
      }
      return null;
    }

    function removeMostRecentIncomingLink(toNodeId, toPortId) {
      const toN = safeId(toNodeId);
      const toP = safeId(toPortId);

      for (let i = (STATE.links?.length || 0) - 1; i >= 0; i--) {
        const l = STATE.links[i];
        if (!validateLink(l)) continue;
        if (safeId(l.to.nodeId) !== toN) continue;
        if (safeId(l.to.portId) !== toP) continue;

        STATE.links.splice(i, 1);
        return true;
      }

      return false;
    }

    function countIncomingLinks(toNodeId, toPortId) {
      const toN = safeId(toNodeId);
      const toP = safeId(toPortId);
      let c = 0;

      for (const l of STATE.links || []) {
        if (!validateLink(l)) continue;
        if (safeId(l.to.nodeId) !== toN) continue;
        if (safeId(l.to.portId) !== toP) continue;
        c++;
      }

      return c;
    }

    function getPortIndexForNode(node, portId, side) {
      const ports = getPortsForNode(node);
      const list = side === "out" ? ports.outputs : ports.inputs;
      return list.findIndex((p) => safeId(p.id) === safeId(portId));
    }

    function portWorldPosById(nodeId, portId, side) {
      const node = getNode(nodeId);
      if (!node) return null;

      const isOutput = side === "out";
      const index = getPortIndexForNode(node, portId, isOutput ? "out" : "in");
      if (index < 0) return null;

      const ports = getPortsForNode(node);
      const list = isOutput ? ports.outputs : ports.inputs;
      const port = list[index];
      return portWorldPos(node, port, isOutput, index);
    }

    function getPortFromEventTarget(target) {
      const portEl = target?.closest?.("[data-port][data-node][data-side]");
      if (!portEl) return null;
      return {
        nodeId: portEl.getAttribute("data-node"),
        portId: portEl.getAttribute("data-port"),
        side: portEl.getAttribute("data-side"),
      };
    }

    function canConnect(from, to) {
      // basic rules: out -> in only, and not same node
      if (!from || !to) return { ok: false, reason: "Missing endpoint." };
      if (from.side !== "out" || to.side !== "in")
        return { ok: false, reason: "Connect from output to input." };
      if (safeId(from.nodeId) === safeId(to.nodeId))
        return { ok: false, reason: "Can't connect to itself." };
      return { ok: true, reason: "" };
    }

    function applyLinksToFrames() {
      const frames = getFrames();

      const nodeById = new Map();
      for (const n of STATE.nodes) nodeById.set(safeId(n.id), n);

      const frameByNodeId = (nodeId) => {
        const n = nodeById.get(safeId(nodeId));
        if (!n) return null;
        return getFrameById(n.frameId);
      };

      // Build a map of outgoing targets per frame from current links
      // nextByFrameId: frameId -> toFrameId
      // choiceByFrameId: frameId -> Map(choiceIdx -> toFrameId)
      const nextByFrameId = new Map();
      const choiceByFrameId = new Map();

      for (const link of STATE.links) {
        if (!validateLink(link)) continue;
        if (safeId(link.to.portId) !== "in") continue;

        const fromFrame = frameByNodeId(link.from.nodeId);
        const toFrame = frameByNodeId(link.to.nodeId);
        if (!fromFrame || !toFrame) continue;

        const fromPortId = safeId(link.from.portId);

        if (fromPortId === "next") {
          nextByFrameId.set(Number(fromFrame.id), Number(toFrame.id));
          continue;
        }

        if (fromPortId.startsWith("choice:")) {
          const idx = Number(fromPortId.split(":")[1]);
          if (!Number.isFinite(idx)) continue;

          const fid = Number(fromFrame.id);
          let m = choiceByFrameId.get(fid);
          if (!m) {
            m = new Map();
            choiceByFrameId.set(fid, m);
          }
          m.set(idx, Number(toFrame.id));
          continue;
        }

        if (fromPortId === "start") {
          STATE.startFrameId = Number(fromFrame.id);
          continue;
        }
      }

      // Apply + clear on the underlying frame objects
      for (const f of frames) {
        if (!f) continue;
        if (!f.attributes) f.attributes = {};

        const fid = Number(f.id);

        // NEXT: set if exists, otherwise clear
        if (nextByFrameId.has(fid)) {
          f.attributes.nextFrameId = Number(nextByFrameId.get(fid));
        } else {
          if ("nextFrameId" in f.attributes) delete f.attributes.nextFrameId;
        }

        // CHOICES: ensure array exists if needed; clear disconnected targets
        const choices = Array.isArray(f.choices) ? f.choices : [];
        const activeChoiceMap = choiceByFrameId.get(fid) || null;

        for (let i = 0; i < choices.length; i++) {
          const c = choices[i];
          if (!c || typeof c !== "object") continue;

          if (activeChoiceMap && activeChoiceMap.has(i)) {
            c.target = Number(activeChoiceMap.get(i));
          } else {
            if ("target" in c) delete c.target;
          }
        }
      }
    }

    function frameLabel(frame) {
      if (!frame) return "(missing)";
      const t = frameType(frame);
      const id = safeId(frame.id);
      const text = (frame.text || "").trim();
      const short = text.length > 28 ? text.slice(0, 28) + "…" : text;
      return `${t.toUpperCase()} #${id}${short ? " — " + short : ""}`;
    }

    function ensureNodeForFrame(frameId) {
      const fid = Number(frameId);
      if (!Number.isFinite(fid)) return null;

      let node = STATE.nodes.find(
        (n) => n.type === "frame" && Number(n.frameId) === fid,
      );
      if (node) return node;

      const frames = getFrames();
      const idx = frames.findIndex((f) => Number(f.id) === fid);

      const baseX = 200 + (idx % 5) * 320;
      const baseY = 140 + Math.floor(idx / 5) * 200;

      node = {
        id: "n-" + nowId(),
        type: "frame",
        frameId: fid,
        x: baseX,
        y: baseY,
      };
      STATE.nodes.push(node);
      return node;
    }

    function ensureNodesForChapter() {
      const frames = getFrames();
      frames.forEach((f) => ensureNodeForFrame(f.id));
    }

    function persistToChapter() {
      const ch = getChapter();
      if (!ch) return;
      const g = ensureGraphStorage(ch);

      g.nodes = STATE.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        frameId: n.frameId,
        x: n.x,
        y: n.y,
      }));

      g.links = (STATE.links || []).filter(validateLink).map((l) => ({
        id: safeId(l.id) || "l-" + nowId(),
        from: { nodeId: safeId(l.from.nodeId), portId: safeId(l.from.portId) },
        to: { nodeId: safeId(l.to.nodeId), portId: safeId(l.to.portId) },
        kind: l.kind || "user",
      }));

      if (STATE.startFrameId != null) g.startFrameId = STATE.startFrameId;
    }

    function rebuildDerivedLinks() {
      const frames = getFrames();
      const nodeByFrameId = new Map();
      for (const n of STATE.nodes) {
        if (n.type === "frame" && Number.isFinite(Number(n.frameId))) {
          nodeByFrameId.set(Number(n.frameId), n);
        }
      }

      const derived = [];
      const pushDerived = (kind, fromFrameId, fromPortId, toFrameId) => {
        const fromNode = nodeByFrameId.get(Number(fromFrameId));
        const toNode = nodeByFrameId.get(Number(toFrameId));
        if (!fromNode || !toNode) return;

        derived.push({
          id: `d-${kind}-${String(fromFrameId)}-${String(fromPortId)}-${String(
            toFrameId,
          )}`,
          from: { nodeId: fromNode.id, portId: String(fromPortId) },
          to: { nodeId: toNode.id, portId: "in" },
          kind,
        });
      };

      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        if (!f) continue;

        const fromId = Number(f.id);
        if (!Number.isFinite(fromId)) continue;

        let nextMain = null;
        for (let j = i + 1; j < frames.length; j++) {
          const nf = frames[j];
          if (!nf) continue;
          const t = frameType(nf);
          if (t === "main" || !nf.frameType) {
            nextMain = nf;
            break;
          }
        }
        if (nextMain) {
          pushDerived("next", fromId, "next", Number(nextMain.id));
        }

        const choices = Array.isArray(f.choices) ? f.choices : [];
        for (let cIdx = 0; cIdx < choices.length; cIdx++) {
          const c = choices[cIdx] || {};
          if ((c.type || "jump") !== "jump") continue;
          const targetId = Number(c.target);
          if (!Number.isFinite(targetId)) continue;
          pushDerived("choice", fromId, `choice:${cIdx}`, targetId);
        }
      }

      STATE.derivedLinks = derived;
    }

    function loadFromChapter() {
      const ch = getChapter();
      if (!ch) return;
      const g = ensureGraphStorage(ch);

      STATE.nodes = (g.nodes || []).map((n) => ({
        id: safeId(n.id) || "n-" + nowId(),
        type: n.type || "frame",
        frameId: Number(n.frameId),
        x: Number(n.x) || 200,
        y: Number(n.y) || 140,
      }));

      STATE.links = (g.links || []).filter(validateLink).map((l) => ({
        id: safeId(l.id) || "l-" + nowId(),
        from: { nodeId: safeId(l.from.nodeId), portId: safeId(l.from.portId) },
        to: { nodeId: safeId(l.to.nodeId), portId: safeId(l.to.portId) },
        kind: l.kind || "user",
      }));

      STATE.startFrameId =
        g.startFrameId != null ? Number(g.startFrameId) : null;

      normalizeGraphAgainstFrames();
      persistToChapter();
    }

    function normalizeGraphAgainstFrames() {
      const frames = getFrames();
      const frameIds = new Set(frames.map((f) => Number(f.id)));

      STATE.nodes = STATE.nodes.filter((n) => {
        if (n.type !== "frame") return true;
        return frameIds.has(Number(n.frameId));
      });

      // drop links pointing to missing nodes/frames
      const nodeIdSet = new Set(STATE.nodes.map((n) => safeId(n.id)));
      STATE.links = (STATE.links || []).filter((l) => {
        if (!validateLink(l)) return false;
        if (!nodeIdSet.has(safeId(l.from.nodeId))) return false;
        if (!nodeIdSet.has(safeId(l.to.nodeId))) return false;
        return true;
      });

      if (
        STATE.startFrameId != null &&
        !frameIds.has(Number(STATE.startFrameId))
      ) {
        STATE.startFrameId = null;
      }
    }

    function getNode(frameNodeId) {
      return STATE.nodes.find((n) => n.id === frameNodeId) ?? null;
    }

    function getPortsForNode(node) {
      if (!node || node.type !== "frame") return { inputs: [], outputs: [] };

      const frame = getFrameById(node.frameId);
      const outputs = [];
      const inputs = [{ id: "in", label: "In", kind: "in" }];

      const isMain = frameType(frame) === "main";
      const isInstant = frameType(frame) === "instant";

      outputs.push({ id: "next", label: "Continue →", kind: "next" });

      const choices = Array.isArray(frame?.choices) ? frame.choices : [];
      for (let i = 0; i < choices.length; i++) {
        const c = choices[i] || {};
        const text = (c.text || `Choice ${i + 1}`).trim();
        outputs.push({
          id: `choice:${i}`,
          label: `Choice: ${text}`,
          kind: "choice",
        });
      }

      if (isInstant) {
        outputs.push({
          id: "return",
          label: "Return (preview)",
          kind: "return",
        });
      }

      if (isMain) {
        outputs.push({ id: "start", label: "Start Here", kind: "start" });
      }

      return { inputs, outputs };
    }

    function portWorldPos(node, port, isOutput, index) {
      const w = CFG.node.w;
      const x = node.x + (isOutput ? w : 0);
      const baseY =
        node.y + CFG.node.headerH + CFG.node.pad + index * (CFG.node.rowH + 6);
      const px = isOutput ? x + 10 : x - 10;
      const py = baseY + CFG.node.rowH / 2;
      return { x: px, y: py };
    }

    function worldToScreen(pt) {
      return {
        x: pt.x * STATE.viewport.scale + STATE.viewport.x,
        y: pt.y * STATE.viewport.scale + STATE.viewport.y,
      };
    }

    function screenToWorld(pt) {
      return {
        x: (pt.x - STATE.viewport.x) / STATE.viewport.scale,
        y: (pt.y - STATE.viewport.y) / STATE.viewport.scale,
      };
    }

    function ensureUI() {
      if (STATE.ui.overlay) return;

      const resolveTheme = () => {
        const cssVar = (name, fallback) => {
          if (!CFG.theme.useCssVars) return fallback;
          return (
            getComputedStyle(document.documentElement)
              .getPropertyValue(name)
              ?.trim() || fallback
          );
        };

        return {
          border: cssVar("--border", CFG.colors.border),
          panel: cssVar("--bg-panel", CFG.colors.panel),
          panel2: cssVar("--bg-secondary", CFG.colors.panel2),
          text: cssVar("--text-main", CFG.colors.text),
          muted: cssVar("--text-muted", CFG.colors.muted),
          accent: cssVar("--primary", CFG.colors.accent),
          appBg: cssVar("--bg-app", CFG.colors.bg),
          hover: cssVar("--hover-bg", "rgba(255,255,255,0.06)"),
        };
      };

      const theme = resolveTheme();
      STATE.ui.theme = theme;

      const overlay = document.createElement("div");
      overlay.id = "storylineNodeEditorModal";
      overlay.style.display = "none";
      overlay.style.position = "fixed";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.background = "rgba(0, 0, 0, 0.4)";
      overlay.style.backdropFilter = "blur(2px)";
      overlay.style.zIndex = "10000";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";

      const modal = document.createElement("div");
      modal.style.background = theme.panel;
      modal.style.width = CFG.modal.w;
      modal.style.height = CFG.modal.h;
      modal.style.maxWidth = CFG.modal.maxW + "px";
      modal.style.maxHeight = CFG.modal.maxH + "px";
      modal.style.borderRadius = "8px";
      modal.style.boxShadow =
        "0 20px 25px -5px rgba(0, 0, 0, 0.35), 0 10px 10px -5px rgba(0, 0, 0, 0.18)";
      modal.style.display = "flex";
      modal.style.flexDirection = "column";
      modal.style.overflow = "hidden";
      modal.style.border = `1px solid ${theme.border}`;

      const header = document.createElement("div");
      header.style.height = "52px";
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";
      header.style.padding = "0 12px";
      header.style.borderBottom = `1px solid ${theme.border}`;
      header.style.background = theme.panel;
      header.style.backdropFilter = "blur(8px)";

      const headerLeft = document.createElement("div");
      headerLeft.style.display = "flex";
      headerLeft.style.alignItems = "baseline";
      headerLeft.style.gap = "10px";
      headerLeft.style.minWidth = "0";

      const title = document.createElement("div");
      title.style.fontWeight = "800";
      title.style.letterSpacing = "0.2px";
      title.style.whiteSpace = "nowrap";
      title.textContent = "Storyline Node Editor";
      STATE.ui.headerTitle = title;

      const subtitle = document.createElement("div");
      subtitle.style.fontSize = "12px";
      subtitle.style.opacity = "0.7";
      subtitle.style.whiteSpace = "nowrap";
      subtitle.style.overflow = "hidden";
      subtitle.style.textOverflow = "ellipsis";
      subtitle.textContent =
        "Connect frames to define storytelling flow (order / choices).";

      headerLeft.appendChild(title);
      headerLeft.appendChild(subtitle);

      const headerRight = document.createElement("div");
      headerRight.style.display = "flex";
      headerRight.style.alignItems = "center";
      headerRight.style.gap = "8px";

      const btn = (label, onClick, primary) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.border = `1px solid ${theme.border}`;
        b.style.background = primary ? theme.accent : theme.panel2;
        b.style.color = primary ? "#fff" : theme.text;
        b.style.borderRadius = "8px";
        b.style.padding = "8px 10px";
        b.style.fontSize = "13px";
        b.style.cursor = "pointer";
        b.onmouseenter = () => (b.style.filter = "brightness(1.08)");
        b.onmouseleave = () => (b.style.filter = "none");
        b.onclick = onClick;
        return b;
      };

      const saveBtn = btn("Save", () => saveAndClose(false), true);
      const closeBtn = btn("Close", () => saveAndClose(true), false);

      headerRight.appendChild(saveBtn);
      headerRight.appendChild(closeBtn);

      header.appendChild(headerLeft);
      header.appendChild(headerRight);

      const body = document.createElement("div");
      body.style.flex = "1";
      body.style.position = "relative";
      body.style.overflow = "hidden";
      body.style.background = theme.appBg;

      const canvasWrap = document.createElement("div");
      canvasWrap.style.position = "absolute";
      canvasWrap.style.inset = "0";
      canvasWrap.style.overflow = "hidden";
      canvasWrap.style.cursor = "grab";

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.style.position = "absolute";
      svg.style.inset = "0";
      svg.style.pointerEvents = "none";
      svg.style.transformOrigin = "0 0";

      const canvas = document.createElement("div");
      canvas.style.position = "absolute";
      canvas.style.inset = "0";
      canvas.style.transformOrigin = "0 0";

      canvasWrap.appendChild(svg);
      canvasWrap.appendChild(canvas);

      const toast = document.createElement("div");
      toast.style.position = "absolute";
      toast.style.left = "12px";
      toast.style.bottom = "12px";
      toast.style.padding = "10px 12px";
      toast.style.borderRadius = "10px";
      toast.style.background = "rgba(0,0,0,0.65)";
      toast.style.border = `1px solid ${theme.border}`;
      toast.style.backdropFilter = "blur(8px)";
      toast.style.fontSize = "12px";
      toast.style.opacity = "0";
      toast.style.transition = "opacity 180ms ease";
      toast.style.pointerEvents = "none";

      body.appendChild(canvasWrap);
      body.appendChild(toast);

      modal.appendChild(header);
      modal.appendChild(body);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      STATE.ui.overlay = overlay;
      STATE.ui.modal = modal;
      STATE.ui.canvasWrap = canvasWrap;
      STATE.ui.canvas = canvas;
      STATE.ui.svg = svg;
      STATE.ui.toast = toast;

      wireEvents(canvasWrap);
    }

    function showToast(msg) {
      const t = STATE.ui.toast;
      if (!t) return;
      t.textContent = msg;
      t.style.opacity = "1";
      clearTimeout(t._to);
      t._to = setTimeout(() => {
        t.style.opacity = "0";
      }, 1400);
    }

    function wireEvents(canvasWrap) {
      const getClient = (e) => ({ x: e.clientX, y: e.clientY });

      canvasWrap.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();

          const mouse = getClient(e);

          // Zoom anchored at cursor (correct math)
          const oldScale = STATE.viewport.scale;
          const delta = e.deltaY > 0 ? -0.08 : 0.08;
          const nextScale = clamp(
            oldScale * (1 + delta),
            CFG.minScale,
            CFG.maxScale,
          );

          if (nextScale === oldScale) return;

          const worldBefore = screenToWorld(mouse);
          STATE.viewport.scale = nextScale;
          const worldAfter = screenToWorld(mouse);

          STATE.viewport.x += (worldAfter.x - worldBefore.x) * nextScale;
          STATE.viewport.y += (worldAfter.y - worldBefore.y) * nextScale;

          render();
        },
        { passive: false },
      );

      canvasWrap.addEventListener("mousedown", (e) => {
        const target = e.target;

        if (e.button === 1) {
          e.preventDefault();
          const mouse = getClient(e);
          STATE.drag = {
            mode: "pan",
            start: { x: mouse.x, y: mouse.y },
            origin: { x: STATE.viewport.x, y: STATE.viewport.y },
          };
          canvasWrap.style.cursor = "grabbing";
          return;
        }

        if (e.button !== 0) return;

        const mouse = getClient(e);

        const port = getPortFromEventTarget(target);
        if (port) {
          e.preventDefault();
          e.stopPropagation();

          const theme = STATE.ui.theme || {
            border: CFG.colors.border,
            panel: CFG.colors.panel,
            panel2: CFG.colors.panel2,
            text: CFG.colors.text,
            muted: CFG.colors.muted,
            accent: CFG.colors.accent,
          };

          const ensurePortFlashCss = () => {
            if (STATE._portFlashCssInjected) return;
            const style = document.createElement("style");
            style.textContent = `
@keyframes ngPortPulse {
  0%   { outline-color: rgba(59,130,246,0.10); box-shadow: 0 0 0 0 rgba(59,130,246,0.00); }
  50%  { outline-color: rgba(59,130,246,0.95); box-shadow: 0 0 0 8px rgba(59,130,246,0.22); }
  100% { outline-color: rgba(59,130,246,0.10); box-shadow: 0 0 0 0 rgba(59,130,246,0.00); }
}

.ng-selected{
  outline: 2px solid var(--primary, #3b82f6);
  outline-offset: 2px;
  box-shadow: 0 0 0 6px rgba(59,130,246,0.20);
}

.ng-flash{
  outline: 2px solid rgba(59,130,246,0.35);
  outline-offset: 2px;
  animation: ngPortPulse 650ms ease-in-out infinite;
}
`;
            document.head.appendChild(style);
            STATE._portFlashCssInjected = true;
          };

          const clearAllPortHints = () => {
            const wrap = STATE.ui.canvasWrap;
            if (!wrap) return;
            const els = wrap.querySelectorAll(
              "[data-port][data-node][data-side]",
            );
            els.forEach((el) => el.classList.remove("ng-flash"));
          };

          const clearAllPortSelected = () => {
            const wrap = STATE.ui.canvasWrap;
            if (!wrap) return;
            const els = wrap.querySelectorAll(
              "[data-port][data-node][data-side]",
            );
            els.forEach((el) => el.classList.remove("ng-selected"));
          };

          const clearAllPortUiState = () => {
            clearAllPortHints();
            clearAllPortSelected();
          };

          const flashNextClickablePorts = () => {
            ensurePortFlashCss();

            const wrap = STATE.ui.canvasWrap;
            if (!wrap) return;

            const flashed = wrap.querySelectorAll(".ng-flash");
            flashed.forEach((el) => el.classList.remove("ng-flash"));

            const inputs = wrap.querySelectorAll(
              '[data-side="in"][data-port="in"]',
            );
            inputs.forEach((el) => el.classList.add("ng-flash"));

            if (STATE._portFlashTimer) clearTimeout(STATE._portFlashTimer);
            STATE._portFlashTimer = setTimeout(() => {
              const flashed2 = wrap.querySelectorAll(".ng-flash");
              flashed2.forEach((el) => el.classList.remove("ng-flash"));
              STATE._portFlashTimer = null;
            }, 1800);
          };

          const stopFlashingPorts = () => {
            const wrap = STATE.ui.canvasWrap;
            if (!wrap) return;
            const flashed = wrap.querySelectorAll(".ng-flash");
            flashed.forEach((el) => el.classList.remove("ng-flash"));
            if (STATE._portFlashTimer) {
              clearTimeout(STATE._portFlashTimer);
              STATE._portFlashTimer = null;
            }
          };

          const applyInputHints = () => {
            const wrap = STATE.ui.canvasWrap;
            if (!wrap) return;
            const inputs = wrap.querySelectorAll(
              '[data-side="in"][data-port="in"]',
            );
            inputs.forEach((el) => el.classList.add("ng-flash"));
          };

          const portEl = target.closest?.("[data-port][data-node][data-side]");

          // Not armed: clicking an input handle on a node that already has a connection disconnects the latest incoming link.
          if (!STATE.selectingLinkFrom) {
            if (port.side === "in") {
              const incomingCount = countIncomingLinks(
                port.nodeId,
                port.portId,
              );
              if (incomingCount > 0) {
                const removed = removeMostRecentIncomingLink(
                  port.nodeId,
                  port.portId,
                );
                if (removed) {
                  persistToChapter();
                  showToast("Disconnected.");
                  render();
                }
                return;
              }

              showToast("Click an output handle first.");
              return;
            }

            if (port.side !== "out") {
              showToast("Click an output handle first.");
              return;
            }

            STATE.selectingLinkFrom = {
              nodeId: port.nodeId,
              portId: port.portId,
              kind: "user",
            };

            ensurePortFlashCss();
            clearAllPortUiState();

            STATE._lastClickedPortEl = portEl;
            if (portEl) portEl.classList.add("ng-selected");
            showToast(`Selected: ${port.portId}`);

            applyInputHints();
            flashNextClickablePorts();

            const existing = getOutgoingTarget(port.nodeId, port.portId);
            if (existing)
              showToast(
                `Selected: ${port.portId} — click an input to reconnect, or click empty space to disconnect.`,
              );

            render();
            return;
          }

          // Clicking the same output handle again cancels the armed connection
          if (
            port.side === "out" &&
            safeId(STATE.selectingLinkFrom.nodeId) === safeId(port.nodeId) &&
            safeId(STATE.selectingLinkFrom.portId) === safeId(port.portId)
          ) {
            stopFlashingPorts();
            clearAllPortSelected();
            cancelLinkDrag();
            showToast("Canceled connection.");
            return;
          }

          if (port.side === "in") {
            const existing = getOutgoingTarget(
              STATE.selectingLinkFrom.nodeId,
              STATE.selectingLinkFrom.portId,
            );
            if (existing && safeId(existing.nodeId) === safeId(port.nodeId)) {
              const removed = removeOutgoingLinks(
                STATE.selectingLinkFrom.nodeId,
                STATE.selectingLinkFrom.portId,
              );
              stopFlashingPorts();
              clearAllPortSelected();
              cancelLinkDrag();
              if (removed) {
                persistToChapter();
                showToast("Disconnected.");
              }
              render();
              return;
            }
          }

          const from = {
            nodeId: STATE.selectingLinkFrom.nodeId,
            portId: STATE.selectingLinkFrom.portId,
            side: "out",
          };
          const to = {
            nodeId: port.nodeId,
            portId: port.portId,
            side: port.side,
          };

          const ok = canConnect(from, to);
          if (!ok.ok) {
            showToast(ok.reason);
            cancelLinkDrag();
            return;
          }

          addOrReplaceLink(
            { nodeId: from.nodeId, portId: from.portId },
            { nodeId: to.nodeId, portId: "in" },
            "user",
          );

          stopFlashingPorts();
          clearAllPortSelected();
          cancelLinkDrag();

          persistToChapter();
          render();
          return;
        }

        const nodeEl = target.closest?.("[data-node]:not([data-port])");

        const world = screenToWorld(mouse);

        if (nodeEl) {
          const nodeId = nodeEl.getAttribute("data-node");
          const node = getNode(nodeId);
          if (!node) return;

          STATE.drag = {
            mode: "node",
            nodeId,
            start: { x: world.x, y: world.y },
            origin: { x: node.x, y: node.y },
          };

          bringNodeToFront(nodeId);
          render();
          return;
        }

        if (STATE.selectingLinkFrom) {
          const existing = getOutgoingTarget(
            STATE.selectingLinkFrom.nodeId,
            STATE.selectingLinkFrom.portId,
          );
          if (existing) {
            const removed = removeOutgoingLinks(
              STATE.selectingLinkFrom.nodeId,
              STATE.selectingLinkFrom.portId,
            );
            stopFlashingPorts();
            clearAllPortSelected();
            cancelLinkDrag();
            if (removed) {
              persistToChapter();
              showToast("Disconnected.");
            }
          } else {
            stopFlashingPorts();
            clearAllPortSelected();
            cancelLinkDrag();
          }
        }

        STATE.drag = {
          mode: "pan",
          start: { x: mouse.x, y: mouse.y },
          origin: { x: STATE.viewport.x, y: STATE.viewport.y },
        };
        canvasWrap.style.cursor = "grabbing";
      });

      window.addEventListener("mousemove", (e) => {
        if (!STATE.open) return;

        const mouse = getClient(e);

        STATE.hoverPort = getPortFromEventTarget(e.target);

        const world = screenToWorld(mouse);

        if (STATE.drag?.mode === "pan") {
          STATE.viewport.x =
            STATE.drag.origin.x + (mouse.x - STATE.drag.start.x);
          STATE.viewport.y =
            STATE.drag.origin.y + (mouse.y - STATE.drag.start.y);
          render();
          return;
        }

        if (STATE.drag?.mode === "node") {
          const node = getNode(STATE.drag.nodeId);
          if (!node) return;

          const dx = world.x - STATE.drag.start.x;
          const dy = world.y - STATE.drag.start.y;

          node.x = snap((node.x = STATE.drag.origin.x + dx), CFG.grid);
          node.y = snap((node.y = STATE.drag.origin.y + dy), CFG.grid);

          render();
          return;
        }

        // link-drag ghost updates
        if (STATE.selectingLinkFrom) {
          STATE._mouseWorld = world;
          render();
        }
      });

      window.addEventListener("mouseup", (e) => {
        if (!STATE.open) return;

        if (STATE.drag) {
          STATE.drag = null;
          canvasWrap.style.cursor = "grab";
          persistToChapter();
          return;
        }
      });

      canvasWrap.addEventListener("contextmenu", (e) => {
        return;
      });

      window.addEventListener("keydown", (e) => {
        if (!STATE.open) return;
        if (e.key === "Escape") {
          if (STATE.selectingLinkFrom) cancelLinkDrag();
          else saveAndClose(true);
        }
      });

      STATE.ui.overlay.addEventListener("mousedown", (e) => {
        if (e.target === STATE.ui.overlay) {
          saveAndClose(true);
        }
      });
    }

    function snap(v, step) {
      return Math.round(v / step) * step;
    }

    function bringNodeToFront(nodeId) {
      const idx = STATE.nodes.findIndex((n) => n.id === nodeId);
      if (idx < 0) return;
      const [n] = STATE.nodes.splice(idx, 1);
      STATE.nodes.push(n);
    }

    function renderInspector(sel) {
      return;
    }

    function wireInspectorButtons(extra) {
      const el = STATE.ui.inspector;
      if (!el) return;

      const acts = el.querySelectorAll("[data-act]");
      acts.forEach((b) => {
        if (b._wired) return;
        b._wired = true;
        b.addEventListener("click", () => {
          const act = b.getAttribute("data-act");
          if (act === "apply") applyLinksToFrames();
          if (act === "fit") fitToContent();
          if (act === "setNext") {
            const input = el.querySelector('[data-act="nextInput"]');
            const v = input ? String(input.value || "").trim() : "";
            const nodeId = extra?.nodeId;
            const node = nodeId ? getNode(nodeId) : null;
            const frame = node ? getFrameById(node.frameId) : null;
            if (!frame) return;

            if (!v) {
              if (frame.attributes && "nextFrameId" in frame.attributes) {
                delete frame.attributes.nextFrameId;
                showToast("Continue target cleared.");
              }
              persistToChapter();
              render();
              return;
            }

            const toId = Number(v);
            if (!Number.isFinite(toId)) {
              showToast("Invalid frame id.");
              return;
            }

            if (!frame.attributes) frame.attributes = {};
            frame.attributes.nextFrameId = toId;
            showToast("Continue target set.");
            persistToChapter();
          }
        });
      });
    }

    function escapeHtml(s) {
      return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function escapeAttr(s) {
      return escapeHtml(s).replaceAll("\n", " ");
    }

    function render() {
      if (!STATE.open) return;

      const canvas = STATE.ui.canvas;
      const svg = STATE.ui.svg;
      if (!canvas || !svg) return;

      const theme = STATE.ui.theme || {
        border: CFG.colors.border,
        panel: CFG.colors.panel,
        panel2: CFG.colors.panel2,
        text: CFG.colors.text,
        muted: CFG.colors.muted,
        accent: CFG.colors.accent,
      };

      const tx = STATE.viewport.x;
      const ty = STATE.viewport.y;
      const sc = STATE.viewport.scale;

      // Transform the HTML canvas (nodes)
      canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${sc})`;

      // Keep the SVG container fixed to the viewport; links are transformed in a <g>
      svg.style.transform = "none";
      svg.style.width = "100%";
      svg.style.height = "100%";
      svg.removeAttribute("viewBox");

      canvas.innerHTML = "";
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      const linkLayer = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "g",
      );
      linkLayer.setAttribute(
        "transform",
        `translate(${tx}, ${ty}) scale(${sc})`,
      );

      // Nodes layer (HTML) in world-space via canvas transform
      const nodeLayer = document.createElement("div");
      nodeLayer.style.position = "absolute";
      nodeLayer.style.inset = "0";

      svg.appendChild(linkLayer);
      canvas.appendChild(nodeLayer);

      // Render links (user + derived)
      const allLinks = []
        .concat(Array.isArray(STATE.links) ? STATE.links : [])
        .concat(Array.isArray(STATE.derivedLinks) ? STATE.derivedLinks : []);

      const drawLink = (fromPos, toPos, opts) => {
        if (!fromPos || !toPos) return;

        const dx = Math.abs(toPos.x - fromPos.x);
        const c = Math.max(30, Math.min(140, dx * 0.5));

        const d = `M ${fromPos.x} ${fromPos.y} C ${fromPos.x + c} ${fromPos.y} ${toPos.x - c} ${toPos.y} ${toPos.x} ${toPos.y}`;

        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", opts.stroke);
        path.setAttribute("stroke-width", String(opts.w));
        path.setAttribute("opacity", String(opts.opacity));
        path.setAttribute("stroke-linecap", "round");
        if (opts.dash) path.setAttribute("stroke-dasharray", opts.dash);

        linkLayer.appendChild(path);
      };

      for (const l of allLinks) {
        if (!validateLink(l)) continue;

        const fromSide = "out";
        const toSide = "in";

        const fromPos = portWorldPosById(
          l.from.nodeId,
          l.from.portId,
          fromSide,
        );
        const toPos = portWorldPosById(l.to.nodeId, "in", toSide);
        if (!fromPos || !toPos) continue;

        const isDerived = safeId(l.id).startsWith("d-") || l.kind === "derived";
        const stroke = isDerived ? CFG.colors.linkSoft : CFG.colors.link;
        drawLink(fromPos, toPos, {
          stroke,
          w: isDerived ? 2 : 3,
          opacity: isDerived ? 0.7 : 0.95,
          dash: isDerived ? "6 6" : null,
        });
      }

      for (const node of STATE.nodes) {
        renderNode(nodeLayer, node);
      }
    }

    function renderNode(layer, node) {
      const frame = getFrameById(node.frameId);
      const t = frameType(frame);

      const wrap = document.createElement("div");
      wrap.setAttribute("data-node", node.id);
      wrap.style.position = "absolute";
      wrap.style.left = `${node.x}px`;
      wrap.style.top = `${node.y}px`;
      wrap.style.width = `${CFG.node.w}px`;
      const theme = STATE.ui.theme || {
        border: CFG.colors.border,
        panel: CFG.colors.panel,
        panel2: CFG.colors.panel2,
        text: CFG.colors.text,
        muted: CFG.colors.muted,
        accent: CFG.colors.accent,
      };

      wrap.style.borderRadius = `${CFG.node.corner}px`;
      wrap.style.border = `1px solid ${theme.border}`;
      wrap.style.background = theme.panel;
      wrap.style.boxShadow = "0 12px 28px rgba(0,0,0,0.35)";
      wrap.style.userSelect = "none";

      const header = document.createElement("div");
      header.style.height = `${CFG.node.headerH}px`;
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";
      header.style.padding = "0 10px";
      header.style.borderBottom = `1px solid ${theme.border}`;
      header.style.borderTopLeftRadius = `${CFG.node.corner}px`;
      header.style.borderTopRightRadius = `${CFG.node.corner}px`;
      header.style.background =
        t === "instant" ? "rgba(245,158,11,0.12)" : "rgba(59,130,246,0.10)";

      const title = document.createElement("div");
      title.style.fontWeight = "800";
      title.style.fontSize = "12px";
      title.style.letterSpacing = "0.2px";
      title.textContent = `NodeID: ${node.id}`;

      const badge = document.createElement("div");
      badge.style.fontSize = "11px";
      badge.style.padding = "2px 8px";
      badge.style.borderRadius = "999px";
      badge.style.border = `1px solid ${theme.border}`;
      badge.style.opacity = "0.9";
      badge.textContent = t.toUpperCase();

      header.appendChild(title);
      header.appendChild(badge);

      const content = document.createElement("div");
      content.style.padding = `${CFG.node.pad}px`;
      content.style.display = "flex";
      content.style.flexDirection = "column";
      content.style.gap = "6px";

      const ports = getPortsForNode(node);

      const out = ports.outputs;

      for (let i = 0; i < out.length; i++) {
        const p = out[i];

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.justifyContent = "space-between";
        row.style.gap = "10px";
        row.style.height = `${CFG.node.rowH}px`;
        row.style.padding = "0 8px";
        row.style.borderRadius = "8px";
        row.style.background = theme.panel2;
        row.style.border = `1px solid ${theme.border}`;

        const label = document.createElement("div");
        label.style.fontSize = "12px";
        label.style.opacity = "0.9";
        label.style.whiteSpace = "nowrap";
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.textContent = p.label;

        const port = document.createElement("div");
        port.setAttribute("data-port", p.id);
        port.setAttribute("data-node", node.id);
        port.setAttribute("data-side", "out");
        port.style.width = `${CFG.port.hit}px`;
        port.style.height = `${CFG.port.hit}px`;
        port.style.display = "grid";
        port.style.placeItems = "center";
        port.style.borderRadius = "999px";
        port.style.border = `1px solid ${theme.border}`;
        port.style.background = "transparent";
        port.style.cursor = "crosshair";
        port.title = "Connect";

        const dot = document.createElement("div");
        dot.style.width = `${CFG.port.r * 2}px`;
        dot.style.height = `${CFG.port.r * 2}px`;
        dot.style.borderRadius = "999px";
        dot.style.background =
          p.kind === "choice"
            ? "rgba(245,158,11,0.85)"
            : p.kind === "start"
              ? "rgba(16,185,129,0.85)"
              : "rgba(59,130,246,0.85)";
        dot.style.boxShadow = "0 0 0 3px rgba(0,0,0,0.25)";
        port.appendChild(dot);

        port.onmouseenter = () => (dot.style.filter = "brightness(1.1)");
        port.onmouseleave = () => (dot.style.filter = "none");

        row.appendChild(label);
        row.appendChild(port);
        content.appendChild(row);
      }

      const footer = document.createElement("div");
      footer.style.padding = "8px 10px 10px";
      footer.style.borderTop = `1px solid ${theme.border}`;
      footer.style.display = "flex";
      footer.style.alignItems = "center";
      footer.style.justifyContent = "space-between";

      const startPill = document.createElement("div");
      startPill.style.fontSize = "11px";
      startPill.style.opacity = "0.8";
      startPill.textContent =
        STATE.startFrameId === Number(node.frameId) ? "START" : "";

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.textContent = "Open Frame";
      openBtn.style.border = `1px solid ${theme.border}`;
      openBtn.style.background = theme.panel2;
      openBtn.style.color = theme.text;
      openBtn.style.borderRadius = "10px";
      openBtn.style.padding = "6px 10px";
      openBtn.style.fontSize = "12px";
      openBtn.style.cursor = "pointer";
      openBtn.onclick = (e) => {
        e.stopPropagation();
        if (typeof switchFrame === "function") {
          const frames = getFrames();
          const idx = frames.findIndex(
            (f) => Number(f.id) === Number(node.frameId),
          );
          if (idx >= 0) switchFrame(idx);
        }
        showToast("Switched to frame.");
      };

      footer.appendChild(startPill);
      footer.appendChild(openBtn);

      wrap.appendChild(header);
      wrap.appendChild(content);
      wrap.appendChild(footer);

      wrap.addEventListener("click", (e) => {
        e.stopPropagation();
        renderInspector({ type: "node", nodeId: node.id });
      });

      layer.appendChild(wrap);

      const inPort = document.createElement("div");
      inPort.setAttribute("data-port", "in");
      inPort.setAttribute("data-node", node.id);
      inPort.setAttribute("data-side", "in");
      inPort.style.position = "absolute";
      inPort.style.left = `${node.x - 10}px`;
      inPort.style.top = `${node.y + CFG.node.headerH + CFG.node.pad + 6}px`;
      inPort.style.width = `${CFG.port.hit}px`;
      inPort.style.height = `${CFG.port.hit}px`;
      inPort.style.display = "grid";
      inPort.style.placeItems = "center";
      inPort.style.borderRadius = "999px";
      inPort.style.border = `1px solid ${theme.border}`;
      inPort.style.background = "transparent";
      inPort.style.cursor = "crosshair";
      inPort.title = "Input";

      const inDot = document.createElement("div");
      inDot.style.width = `${CFG.port.r * 2}px`;
      inDot.style.height = `${CFG.port.r * 2}px`;
      inDot.style.borderRadius = "999px";
      inDot.style.background = "rgba(16,185,129,0.85)";
      inDot.style.boxShadow = "0 0 0 3px rgba(0,0,0,0.25)";
      inPort.appendChild(inDot);
      layer.appendChild(inPort);
    }

    // Derived links removed: we only render user-created links plus a single ghost link while dragging.

    function fitToContent() {
      const nodes = STATE.nodes;
      if (!nodes.length) return;

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const n of nodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + CFG.node.w);
        maxY = Math.max(maxY, n.y + 220);
      }

      const pad = 80;
      minX -= pad;
      minY -= pad;
      maxX += pad;
      maxY += pad;

      const rect = STATE.ui.canvasWrap?.getBoundingClientRect?.();
      const vpW = rect?.width ?? window.innerWidth;
      const vpH = rect?.height ?? window.innerHeight;

      const contentW = Math.max(100, maxX - minX);
      const contentH = Math.max(100, maxY - minY);

      const scale = clamp(
        Math.min(vpW / contentW, vpH / contentH),
        CFG.minScale,
        CFG.maxScale,
      );

      STATE.viewport.scale = scale;
      STATE.viewport.x = -minX * scale + (vpW - contentW * scale) * 0.5;
      STATE.viewport.y = -minY * scale + (vpH - contentH * scale) * 0.5;

      render();
    }

    function open(chapterId) {
      ensureUI();

      STATE.open = true;
      STATE.chapterId =
        chapterId ??
        (typeof activeChapterId !== "undefined" ? activeChapterId : null);

      const ch = getChapter();
      if (!ch) return;

      STATE.ui.overlay.style.display = "flex";
      loadFromChapter();

      ensureNodesForChapter();
      persistToChapter();

      rebuildDerivedLinks();

      if (!STATE.startFrameId) {
        const main = getFrames().find((f) => frameType(f) === "main");
        if (main) STATE.startFrameId = Number(main.id);
      }

      const titleSuffix = ch?.title ? ` — ${ch.title}` : "";
      if (STATE.ui.headerTitle)
        STATE.ui.headerTitle.textContent =
          "Storyline Node Editor" + titleSuffix;

      fitToContent();
      render();
    }

    function close() {
      if (!STATE.ui.overlay) return;
      STATE.open = false;
      STATE.ui.overlay.style.display = "none";
      STATE.selectingLinkFrom = null;
      persistToChapter();
    }

    function saveAndClose(onlyClose) {
      if (!onlyClose) {
        applyLinksToFrames();
        persistToChapter();
        showToast("Storyline saved", "success");
      }
      close();
    }

    function init() {
      ensureUI();
    }

    return { open, close, init, applyLinksToFrames };
  })();

  window.NodeGraph = NodeGraph;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      try {
        NodeGraph.init();
      } catch (e) {}
    });
  } else {
    try {
      NodeGraph.init();
    } catch (e) {}
  }
})();
