
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
            const newWidth = startWidth + dx;

            // Apply new width (CSS min/max-width will handle constraints automatically, 
            // but we can also clamp here if we want smoother behavior)
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
