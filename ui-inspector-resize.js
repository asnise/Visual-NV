
(() => {
    // === Inspector Resizer Logic ===
    const resizer = document.getElementById('inspectorResizer');
    const inspector = document.querySelector('.inspector');

    if (resizer && inspector) {
        let isResizing = false;
        let startX, startWidth;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            // Get the current computed width
            startWidth = parseInt(window.getComputedStyle(inspector).width, 10);

            resizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none'; // Prevent text selection

            // Add listeners to document for smooth dragging outside the handle
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        function onMouseMove(e) {
            if (!isResizing) return;

            // Calculate movement (drag left = increase width)
            // Initial X - Current X = how much we moved left
            const dx = startX - e.clientX;
            let newWidth = startWidth + dx;

            // Enforce constraints
            // 1. Minimum Inspector Width (css usually has min-width, but good to clamp here)
            const MIN_INSPECTOR_WIDTH = 200;
            if (newWidth < MIN_INSPECTOR_WIDTH) newWidth = MIN_INSPECTOR_WIDTH;

            // 2. Maximum Inspector Width (usually 800px or so)
            const MAX_INSPECTOR_WIDTH = 800;
            if (newWidth > MAX_INSPECTOR_WIDTH) newWidth = MAX_INSPECTOR_WIDTH;

            // 3. Minimum Stage Width (CRITICAL FIX)
            // We need to ensure the stage area (workspace width - sidebar - inspector)
            // remains at least X pixels wide so tabs don't squash.
            const sidebar = document.querySelector('.sidebar');
            const workspace = document.querySelector('.workspace');

            if (sidebar && workspace) {
                const MIN_STAGE_WIDTH = 450; // Adjust as needed to fit tabs comfortably
                const availableSpace = workspace.clientWidth - sidebar.offsetWidth;
                const maxAllowedInspector = availableSpace - MIN_STAGE_WIDTH;

                if (newWidth > maxAllowedInspector) {
                    newWidth = maxAllowedInspector;
                }
            }

            inspector.style.width = `${newWidth}px`;
        }

        function onMouseUp() {
            isResizing = false;
            resizer.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    }
})();
