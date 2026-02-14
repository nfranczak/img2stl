/* ===== img2stl — Frontend Application ===== */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
    screen: 'upload',    // 'upload' | 'editor' | 'export'
    file: null,          // File object from input / drop
    cleanedImage: null,  // base64 PNG returned by /api/upload
    svg: null,           // SVG string returned by /api/upload
};

// ---------------------------------------------------------------------------
// DOM references (resolved once on DOMContentLoaded)
// ---------------------------------------------------------------------------
let dom = {};

function cacheDom() {
    dom = {
        screens: document.querySelectorAll('.screen'),
        dropZone: document.getElementById('drop-zone'),
        fileInput: document.getElementById('file-input'),
        preview: document.getElementById('preview'),
        previewContainer: document.getElementById('preview-container'),
        fileName: document.getElementById('file-name'),
        uploadBtn: document.getElementById('upload-btn'),
        loadingOverlay: document.getElementById('loading-overlay'),
        errorToast: document.getElementById('error-toast'),
    };
}

// ---------------------------------------------------------------------------
// Screen management
// ---------------------------------------------------------------------------
function showScreen(name) {
    dom.screens.forEach(function (s) {
        s.classList.remove('active');
    });
    var target = document.getElementById(name + '-screen');
    if (target) {
        target.classList.add('active');
    }
    state.screen = name;

    // Hide header in editor mode to maximize canvas space
    if (name === 'editor') {
        document.body.classList.add('editor-active');
    } else {
        document.body.classList.remove('editor-active');
    }
}

// ---------------------------------------------------------------------------
// Loading overlay
// ---------------------------------------------------------------------------
function showLoading(visible, message) {
    if (visible) {
        if (message) {
            var p = dom.loadingOverlay.querySelector('p');
            if (p) p.textContent = message;
        }
        dom.loadingOverlay.classList.add('visible');
    } else {
        dom.loadingOverlay.classList.remove('visible');
        // Reset default message
        var p = dom.loadingOverlay.querySelector('p');
        if (p) p.textContent = 'Processing image\u2026';
    }
}

// ---------------------------------------------------------------------------
// Error toast
// ---------------------------------------------------------------------------
var errorTimer = null;

function showError(message) {
    dom.errorToast.textContent = message;
    dom.errorToast.classList.add('visible');
    if (errorTimer) clearTimeout(errorTimer);
    errorTimer = setTimeout(function () {
        dom.errorToast.classList.remove('visible');
    }, 5000);
}

// ---------------------------------------------------------------------------
// File selection & preview
// ---------------------------------------------------------------------------
function selectFile(file) {
    // Basic validation — accept images only
    if (!file.type.startsWith('image/')) {
        showError('Please select an image file (PNG, JPG, etc.).');
        return;
    }

    state.file = file;

    // Show preview
    var reader = new FileReader();
    reader.onload = function (e) {
        dom.preview.src = e.target.result;
        dom.previewContainer.classList.add('visible');
        dom.fileName.textContent = file.name;
        dom.uploadBtn.disabled = false;
    };
    reader.readAsDataURL(file);
}

// ---------------------------------------------------------------------------
// Drag-and-drop handlers
// ---------------------------------------------------------------------------
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    dom.dropZone.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dom.dropZone.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dom.dropZone.classList.remove('dragover');

    var files = e.dataTransfer.files;
    if (files.length > 0) {
        selectFile(files[0]);
    }
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------
async function uploadImage() {
    if (!state.file) return;

    showLoading(true);

    var form = new FormData();
    form.append('file', state.file);

    try {
        var res = await fetch('/api/upload', {
            method: 'POST',
            body: form,
        });

        if (!res.ok) {
            var errBody;
            try {
                errBody = await res.json();
            } catch (_) {
                errBody = null;
            }
            var detail = (errBody && errBody.detail) ? errBody.detail : res.statusText;
            throw new Error(detail);
        }

        var data = await res.json();
        state.cleanedImage = data.cleaned_image;
        state.svg = data.svg;

        showScreen('editor');
        initEditor();
    } catch (err) {
        showError('Upload failed: ' + err.message);
    } finally {
        showLoading(false);
    }
}

// ---------------------------------------------------------------------------
// Reset (go back to upload screen)
// ---------------------------------------------------------------------------
function resetUpload() {
    state.file = null;
    state.cleanedImage = null;
    state.svg = null;

    dom.preview.src = '';
    dom.previewContainer.classList.remove('visible');
    dom.fileName.textContent = '';
    dom.uploadBtn.disabled = true;
    dom.fileInput.value = '';

    showScreen('upload');
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {
    cacheDom();

    // Drag-and-drop events
    dom.dropZone.addEventListener('dragover', handleDragOver);
    dom.dropZone.addEventListener('dragleave', handleDragLeave);
    dom.dropZone.addEventListener('drop', handleDrop);

    // Click on drop zone opens file picker
    dom.dropZone.addEventListener('click', function () {
        dom.fileInput.click();
    });

    // File input change
    dom.fileInput.addEventListener('change', function (e) {
        if (e.target.files.length > 0) {
            selectFile(e.target.files[0]);
        }
    });

    // Upload button
    dom.uploadBtn.addEventListener('click', uploadImage);

    // Prevent browser from opening files dropped outside the drop zone
    document.body.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.body.addEventListener('drop', function (e) { e.preventDefault(); });

    // Show the upload screen by default
    showScreen('upload');
});

// ---------------------------------------------------------------------------
// Editor — Paper.js Vector Editor (Task 9)
// ---------------------------------------------------------------------------

var editor = {
    currentTool: 'select',
    undoStack: [],
    redoStack: [],
    selectedPath: null,
    penPath: null,          // path being drawn with pen tool
    penDragSegment: null,   // segment being dragged for bezier handles
    penGuideLine: null,     // dashed guide from last anchor to cursor
    activePath: null,       // path being drawn with freehand / eraser
    previewShape: null,     // preview for rect / ellipse / line
    dragStart: null,        // mouse-down point for shapes
    isPanning: false,       // space+drag pan mode
    spaceHeld: false,       // is space key held down
    panStart: null,         // pan start point
    panStartCenter: null,   // view center when pan started
    bgLayer: null,
    drawLayer: null,
    initialized: false,
    eventsAttached: false,
    toolCreated: false,
};

// ---------------------------------------------------------------------------
// Editor: Initialisation
// ---------------------------------------------------------------------------
function initEditor() {
    var canvas = document.getElementById('editor-canvas');

    // If already initialized, clear and re-setup
    if (editor.initialized) {
        paper.project.clear();
    } else {
        paper.setup(canvas);
        editor.initialized = true;
    }

    // Reset editor state
    editor.undoStack = [];
    editor.redoStack = [];
    editor.selectedPath = null;
    editor.penPath = null;
    editor.activePath = null;
    editor.previewShape = null;
    editor.currentTool = 'select';

    // Layer 0: background raster (locked)
    editor.bgLayer = new paper.Layer();
    editor.bgLayer.name = 'background';
    var raster = new paper.Raster('data:image/png;base64,' + state.cleanedImage);
    raster.onLoad = function () {
        raster.position = paper.view.center;
        // Fit view to raster
        var zoomX = paper.view.viewSize.width / raster.width;
        var zoomY = paper.view.viewSize.height / raster.height;
        paper.view.zoom = Math.min(zoomX, zoomY) * 0.9;
        paper.view.center = raster.position;
    };
    raster.visible = false; // hidden; kept for export dimension reference
    raster.locked = true;
    editor.bgLayer.locked = true;

    // Layer 1: editable vector paths
    editor.drawLayer = new paper.Layer();
    editor.drawLayer.name = 'draw';
    editor.drawLayer.activate();

    // Import SVG paths from potrace
    if (state.svg) {
        paper.project.importSVG(state.svg, {
            onLoad: function (item) {
                // Move imported item to draw layer
                editor.drawLayer.addChild(item);
                // Flatten and style all paths
                flattenAndStyleSVG(item);
                paper.view.update();
                // Save initial state for undo
                saveEditorState();
            }
        });
    } else {
        saveEditorState();
    }

    if (!editor.toolCreated) {
        setupTools();
        editor.toolCreated = true;
    }
    if (!editor.eventsAttached) {
        setupEditorEvents();
        editor.eventsAttached = true;
    }
}

// ---------------------------------------------------------------------------
// Editor: Flatten imported SVG and apply stroke styling
// ---------------------------------------------------------------------------
function flattenAndStyleSVG(item) {
    if (item.children) {
        var children = item.children.slice();
        for (var i = 0; i < children.length; i++) {
            flattenAndStyleSVG(children[i]);
        }
    }
    if (item instanceof paper.Path || item instanceof paper.CompoundPath) {
        // White fill matches stencil semantics (white = ink = cutout)
        // and is visible against the dark canvas background
        item.fillColor = 'white';
        item.strokeColor = null;
        item.strokeWidth = 0;
    }
}

// ---------------------------------------------------------------------------
// Editor: Get current stroke width from slider
// ---------------------------------------------------------------------------
function getStrokeWidth() {
    var slider = document.getElementById('stroke-width');
    return slider ? parseInt(slider.value, 10) : 3;
}

// ---------------------------------------------------------------------------
// Editor: Undo / Redo
// ---------------------------------------------------------------------------
function saveEditorState() {
    editor.undoStack.push(paper.project.exportJSON());
    editor.redoStack.length = 0;
    // Cap undo history to prevent memory bloat
    if (editor.undoStack.length > 50) {
        editor.undoStack.shift();
    }
}

function editorUndo() {
    if (editor.undoStack.length <= 1) return; // keep at least the initial state
    editor.redoStack.push(editor.undoStack.pop());
    var prev = editor.undoStack[editor.undoStack.length - 1];
    restoreEditorState(prev);
}

function editorRedo() {
    if (editor.redoStack.length === 0) return;
    var next = editor.redoStack.pop();
    editor.undoStack.push(next);
    restoreEditorState(next);
}

function restoreEditorState(jsonStr) {
    paper.project.clear();
    paper.project.importJSON(jsonStr);
    // Re-acquire layer references
    editor.bgLayer = paper.project.layers[0] || null;
    editor.drawLayer = paper.project.layers[1] || null;
    if (editor.drawLayer) {
        editor.drawLayer.activate();
    }
    // Reset all active tool state — old items were removed by project.clear()
    editor.selectedPath = null;
    editor.penPath = null;
    editor.penGuideLine = null;
    editor.penDragSegment = null;
    editor.activePath = null;
    editor.previewShape = null;
    editor.dragStart = null;
    deselectAll();
    paper.view.update();
}

// ---------------------------------------------------------------------------
// Editor: Selection helpers
// ---------------------------------------------------------------------------
function deselectAll() {
    if (editor.selectedPath) {
        editor.selectedPath.selected = false;
        editor.selectedPath = null;
    }
    // Deselect everything in the project
    paper.project.deselectAll();
}

// ---------------------------------------------------------------------------
// Editor: Set active tool
// ---------------------------------------------------------------------------
function setActiveTool(toolName) {
    editor.currentTool = toolName;

    // Finish any in-progress pen path
    if (toolName !== 'pen' && editor.penPath) {
        finishPenPath();
    }

    // Update toolbar button states
    var buttons = document.querySelectorAll('.tool-btn[data-tool]');
    buttons.forEach(function (btn) {
        if (btn.getAttribute('data-tool') === toolName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update cursor
    var container = document.querySelector('.editor-canvas-container');
    if (container) {
        container.style.cursor = getCursorForTool(toolName);
    }
}

function getCursorForTool(toolName) {
    switch (toolName) {
        case 'select': return 'default';
        case 'pen': return 'crosshair';
        case 'freehand': return 'crosshair';
        case 'line': return 'crosshair';
        case 'eraser': return 'crosshair';
        case 'rectangle': return 'crosshair';
        case 'ellipse': return 'crosshair';
        default: return 'default';
    }
}

// ---------------------------------------------------------------------------
// Editor: Pen tool helpers
// ---------------------------------------------------------------------------
function finishPenPath() {
    if (editor.penGuideLine) {
        editor.penGuideLine.remove();
        editor.penGuideLine = null;
    }
    if (editor.penPath) {
        if (editor.penPath.segments.length < 2) {
            editor.penPath.remove();
        } else {
            saveEditorState();
        }
        editor.penPath = null;
    }
}

// ---------------------------------------------------------------------------
// Editor: Setup Paper.js tools
// ---------------------------------------------------------------------------
function setupTools() {
    var tool = new paper.Tool();

    tool.onMouseDown = function (event) {
        if (editor.spaceHeld) {
            // Start panning
            editor.isPanning = true;
            editor.panStart = event.event;
            editor.panStartCenter = paper.view.center.clone();
            return;
        }

        switch (editor.currentTool) {
            case 'select':
                toolSelectDown(event);
                break;
            case 'pen':
                toolPenDown(event);
                break;
            case 'freehand':
                toolFreehandDown(event);
                break;
            case 'line':
                toolLineDown(event);
                break;
            case 'eraser':
                toolEraserDown(event);
                break;
            case 'rectangle':
                toolRectDown(event);
                break;
            case 'ellipse':
                toolEllipseDown(event);
                break;
        }
    };

    tool.onMouseDrag = function (event) {
        if (editor.isPanning) {
            var dx = event.event.clientX - editor.panStart.clientX;
            var dy = event.event.clientY - editor.panStart.clientY;
            paper.view.center = new paper.Point(
                editor.panStartCenter.x - dx / paper.view.zoom,
                editor.panStartCenter.y - dy / paper.view.zoom
            );
            return;
        }

        switch (editor.currentTool) {
            case 'select':
                toolSelectDrag(event);
                break;
            case 'pen':
                toolPenDrag(event);
                break;
            case 'freehand':
                toolFreehandDrag(event);
                break;
            case 'line':
                toolLineDrag(event);
                break;
            case 'eraser':
                toolEraserDrag(event);
                break;
            case 'rectangle':
                toolRectDrag(event);
                break;
            case 'ellipse':
                toolEllipseDrag(event);
                break;
        }
    };

    tool.onMouseUp = function (event) {
        if (editor.isPanning) {
            editor.isPanning = false;
            return;
        }

        switch (editor.currentTool) {
            case 'select':
                toolSelectUp(event);
                break;
            case 'freehand':
                toolFreehandUp(event);
                break;
            case 'line':
                toolLineUp(event);
                break;
            case 'eraser':
                toolEraserUp(event);
                break;
            case 'rectangle':
                toolRectUp(event);
                break;
            case 'ellipse':
                toolEllipseUp(event);
                break;
        }
    };

    tool.onMouseMove = function (event) {
        // Pen tool guide line: show a preview from last anchor to cursor
        if (editor.currentTool === 'pen' && editor.penPath && editor.penPath.segments.length > 0) {
            if (editor.penGuideLine) {
                editor.penGuideLine.remove();
            }
            var lastPt = editor.penPath.lastSegment.point;
            editor.penGuideLine = new paper.Path.Line({
                from: lastPt,
                to: event.point,
                strokeColor: 'rgba(233, 69, 96, 0.5)',
                strokeWidth: 1,
                dashArray: [4, 4],
                guide: true,
            });
        } else if (editor.penGuideLine) {
            editor.penGuideLine.remove();
            editor.penGuideLine = null;
        }
    };
}

// ---------------------------------------------------------------------------
// Tool: Select
// ---------------------------------------------------------------------------
var selectDragOffset = null;
var selectDragging = false;

function toolSelectDown(event) {
    var hitResult = paper.project.hitTest(event.point, {
        segments: true,
        stroke: true,
        fill: true,
        tolerance: 8 / paper.view.zoom,
        match: function (result) {
            // Only hit items on the draw layer
            return isOnDrawLayer(result.item);
        }
    });

    if (hitResult && hitResult.item) {
        var item = getTopLevelItem(hitResult.item);
        deselectAll();
        editor.selectedPath = item;
        item.selected = true;
        selectDragOffset = event.point.subtract(item.position);
        selectDragging = true;
    } else {
        deselectAll();
        selectDragging = false;
    }
}

function toolSelectDrag(event) {
    if (selectDragging && editor.selectedPath) {
        editor.selectedPath.position = event.point.subtract(selectDragOffset);
    }
}

function toolSelectUp(event) {
    if (selectDragging && editor.selectedPath) {
        saveEditorState();
    }
    selectDragging = false;
}

function isOnDrawLayer(item) {
    var current = item;
    while (current) {
        if (current === editor.drawLayer) return true;
        if (current === editor.bgLayer) return false;
        current = current.parent;
    }
    return false;
}

function getTopLevelItem(item) {
    // Walk up to get the top-level child of the draw layer
    var current = item;
    while (current.parent && current.parent !== editor.drawLayer) {
        current = current.parent;
    }
    return current;
}

// ---------------------------------------------------------------------------
// Tool: Pen
// ---------------------------------------------------------------------------
function toolPenDown(event) {
    if (!editor.penPath) {
        editor.penPath = new paper.Path({
            strokeColor: 'white',
            strokeWidth: getStrokeWidth(),
            fillColor: null,
        });
    }

    // Add a segment at the click point
    editor.penPath.add(new paper.Segment(event.point));
    editor.penDragSegment = editor.penPath.lastSegment;
}

// Pen tool drag: pull bezier handles from the last anchor point
function toolPenDrag(event) {
    if (editor.penPath && editor.penDragSegment) {
        var delta = event.point.subtract(editor.penDragSegment.point);
        editor.penDragSegment.handleOut = delta;
        editor.penDragSegment.handleIn = delta.negate();
    }
}

// Double-click detection for finishing pen path is handled via dblclick event

// ---------------------------------------------------------------------------
// Tool: Freehand
// ---------------------------------------------------------------------------
function toolFreehandDown(event) {
    editor.activePath = new paper.Path({
        strokeColor: 'white',
        strokeWidth: getStrokeWidth(),
        fillColor: null,
    });
    editor.activePath.add(event.point);
}

function toolFreehandDrag(event) {
    if (editor.activePath) {
        editor.activePath.add(event.point);
    }
}

function toolFreehandUp(event) {
    if (editor.activePath) {
        editor.activePath.simplify(10);
        editor.activePath = null;
        saveEditorState();
    }
}

// ---------------------------------------------------------------------------
// Tool: Line
// ---------------------------------------------------------------------------
function toolLineDown(event) {
    editor.dragStart = event.point.clone();
    editor.previewShape = new paper.Path.Line({
        from: editor.dragStart,
        to: editor.dragStart,
        strokeColor: 'white',
        strokeWidth: getStrokeWidth(),
    });
}

function toolLineDrag(event) {
    if (editor.previewShape) {
        editor.previewShape.remove();
        editor.previewShape = new paper.Path.Line({
            from: editor.dragStart,
            to: event.point,
            strokeColor: 'white',
            strokeWidth: getStrokeWidth(),
        });
    }
}

function toolLineUp(event) {
    if (editor.previewShape) {
        // Keep the line if it has some length
        if (editor.dragStart.getDistance(event.point) < 2) {
            editor.previewShape.remove();
        } else {
            saveEditorState();
        }
        editor.previewShape = null;
        editor.dragStart = null;
    }
}

// ---------------------------------------------------------------------------
// Tool: Eraser (draws white paths on top)
// ---------------------------------------------------------------------------
function toolEraserDown(event) {
    editor.activePath = new paper.Path({
        strokeColor: '#111',
        strokeWidth: getStrokeWidth() * 3,
        fillColor: null,
        strokeCap: 'round',
        strokeJoin: 'round',
    });
    editor.activePath.data.isEraser = true;
    editor.activePath.add(event.point);
}

function toolEraserDrag(event) {
    if (editor.activePath) {
        editor.activePath.add(event.point);
    }
}

function toolEraserUp(event) {
    if (editor.activePath) {
        editor.activePath.simplify(5);
        editor.activePath = null;
        saveEditorState();
    }
}

// ---------------------------------------------------------------------------
// Tool: Rectangle
// ---------------------------------------------------------------------------
function toolRectDown(event) {
    editor.dragStart = event.point.clone();
    editor.previewShape = new paper.Path.Rectangle({
        from: editor.dragStart,
        to: editor.dragStart,
        strokeColor: 'white',
        strokeWidth: getStrokeWidth(),
        fillColor: null,
    });
}

function toolRectDrag(event) {
    if (editor.previewShape) {
        editor.previewShape.remove();
        editor.previewShape = new paper.Path.Rectangle({
            from: editor.dragStart,
            to: event.point,
            strokeColor: 'white',
            strokeWidth: getStrokeWidth(),
            fillColor: null,
        });
    }
}

function toolRectUp(event) {
    if (editor.previewShape) {
        var rect = new paper.Rectangle(editor.dragStart, event.point);
        if (rect.width < 2 && rect.height < 2) {
            editor.previewShape.remove();
        } else {
            saveEditorState();
        }
        editor.previewShape = null;
        editor.dragStart = null;
    }
}

// ---------------------------------------------------------------------------
// Tool: Ellipse
// ---------------------------------------------------------------------------
function toolEllipseDown(event) {
    editor.dragStart = event.point.clone();
    editor.previewShape = new paper.Path.Ellipse({
        from: editor.dragStart,
        to: editor.dragStart,
        strokeColor: 'white',
        strokeWidth: getStrokeWidth(),
        fillColor: null,
    });
}

function toolEllipseDrag(event) {
    if (editor.previewShape) {
        editor.previewShape.remove();
        editor.previewShape = new paper.Path.Ellipse({
            from: editor.dragStart,
            to: event.point,
            strokeColor: 'white',
            strokeWidth: getStrokeWidth(),
            fillColor: null,
        });
    }
}

function toolEllipseUp(event) {
    if (editor.previewShape) {
        var rect = new paper.Rectangle(editor.dragStart, event.point);
        if (rect.width < 2 && rect.height < 2) {
            editor.previewShape.remove();
        } else {
            saveEditorState();
        }
        editor.previewShape = null;
        editor.dragStart = null;
    }
}

// ---------------------------------------------------------------------------
// Editor: Zoom / Pan via mouse wheel
// ---------------------------------------------------------------------------
function handleEditorWheel(e) {
    if (state.screen !== 'editor') return;
    e.preventDefault();

    // Ctrl+scroll (or pinch on trackpad) = zoom
    if (e.ctrlKey || e.metaKey) {
        var delta = e.deltaY;
        var zoomFactor = 1.05;
        var oldZoom = paper.view.zoom;
        var newZoom;

        if (delta < 0) {
            newZoom = oldZoom * zoomFactor;
        } else {
            newZoom = oldZoom / zoomFactor;
        }

        // Clamp zoom
        newZoom = Math.max(0.1, Math.min(newZoom, 20));

        // Zoom toward the mouse position
        var canvasEl = document.getElementById('editor-canvas');
        var rect = canvasEl.getBoundingClientRect();
        var mouseX = e.clientX - rect.left;
        var mouseY = e.clientY - rect.top;

        var viewPos = paper.view.viewToProject(new paper.Point(mouseX, mouseY));
        paper.view.zoom = newZoom;
        var afterViewPos = paper.view.viewToProject(new paper.Point(mouseX, mouseY));
        var shift = afterViewPos.subtract(viewPos);
        paper.view.center = paper.view.center.subtract(shift);
    } else {
        // Plain scroll (two-finger swipe on trackpad) = pan
        var dx = e.deltaX / paper.view.zoom;
        var dy = e.deltaY / paper.view.zoom;
        paper.view.center = paper.view.center.add(new paper.Point(dx, dy));
    }
}

// ---------------------------------------------------------------------------
// Editor: Zoom to fit
// ---------------------------------------------------------------------------
function zoomToFit() {
    var target = null;
    if (editor.bgLayer && editor.bgLayer.children.length > 0) {
        target = editor.bgLayer.children[0];
    } else if (editor.drawLayer && editor.drawLayer.bounds.width > 0) {
        target = editor.drawLayer;
    }
    if (!target) return;

    var zoomX = paper.view.viewSize.width / target.bounds.width;
    var zoomY = paper.view.viewSize.height / target.bounds.height;
    paper.view.zoom = Math.min(zoomX, zoomY) * 0.9;
    paper.view.center = target.bounds.center;
}

// ---------------------------------------------------------------------------
// Editor: Setup DOM event handlers
// ---------------------------------------------------------------------------
function setupEditorEvents() {
    // Toolbar tool buttons
    var toolButtons = document.querySelectorAll('.tool-btn[data-tool]');
    toolButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            setActiveTool(btn.getAttribute('data-tool'));
        });
    });

    // Undo / Redo buttons
    var undoBtn = document.getElementById('undo-btn');
    var redoBtn = document.getElementById('redo-btn');
    if (undoBtn) {
        undoBtn.addEventListener('click', function () { editorUndo(); });
    }
    if (redoBtn) {
        redoBtn.addEventListener('click', function () { editorRedo(); });
    }

    // Export button
    var exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', function () {
            showScreen('export');
            initExportScreen();
        });
    }

    // Stroke width slider live value
    var strokeSlider = document.getElementById('stroke-width');
    var strokeVal = document.getElementById('stroke-width-val');
    if (strokeSlider && strokeVal) {
        strokeSlider.addEventListener('input', function () {
            strokeVal.textContent = strokeSlider.value;
        });
    }

    // Fit to screen button
    var fitBtn = document.getElementById('fit-btn');
    if (fitBtn) {
        fitBtn.addEventListener('click', function () { zoomToFit(); });
    }

    // New image button
    var newImgBtn = document.getElementById('new-image-btn');
    if (newImgBtn) {
        newImgBtn.addEventListener('click', function () {
            if (confirm('Start over with a new image? Current edits will be lost.')) {
                resetUpload();
            }
        });
    }

    // Mouse wheel for zoom
    var canvasContainer = document.querySelector('.editor-canvas-container');
    if (canvasContainer) {
        canvasContainer.addEventListener('wheel', handleEditorWheel, { passive: false });
    }

    // Double-click to finish pen path
    var canvasEl = document.getElementById('editor-canvas');
    if (canvasEl) {
        canvasEl.addEventListener('dblclick', function () {
            if (editor.currentTool === 'pen' && editor.penPath) {
                finishPenPath();
            }
        });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', handleEditorKeyDown);
    document.addEventListener('keyup', handleEditorKeyUp);

    // Resize canvas when window resizes
    window.addEventListener('resize', function () {
        if (state.screen !== 'editor') return;
        var container = document.querySelector('.editor-canvas-container');
        if (container && paper.view) {
            paper.view.viewSize = new paper.Size(container.clientWidth, container.clientHeight);
        }
    });
}

// ---------------------------------------------------------------------------
// Editor: Keyboard handling
// ---------------------------------------------------------------------------
function handleEditorKeyDown(e) {
    if (state.screen !== 'editor') return;

    // Ignore shortcuts when typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Space for panning
    if (e.code === 'Space' && !editor.spaceHeld) {
        e.preventDefault();
        editor.spaceHeld = true;
        var container = document.querySelector('.editor-canvas-container');
        if (container) container.style.cursor = 'grab';
        return;
    }

    // Ctrl/Cmd shortcuts
    var isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        editorUndo();
        return;
    }
    if (isCtrl && (e.key === 'y' || e.key === 'Y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        editorRedo();
        return;
    }

    // Tool shortcuts (single key, no modifier)
    if (!isCtrl && !e.altKey) {
        switch (e.key.toLowerCase()) {
            case 'v': setActiveTool('select'); break;
            case 'p': setActiveTool('pen'); break;
            case 'b': setActiveTool('freehand'); break;
            case 'l': setActiveTool('line'); break;
            case 'e': setActiveTool('eraser'); break;
            case 'r': setActiveTool('rectangle'); break;
            case 'o': setActiveTool('ellipse'); break;
            case 'f': zoomToFit(); break;
            case 'enter':
                if (editor.currentTool === 'pen' && editor.penPath) {
                    finishPenPath();
                }
                break;
            case 'escape':
                if (editor.currentTool === 'pen' && editor.penPath) {
                    if (editor.penGuideLine) {
                        editor.penGuideLine.remove();
                        editor.penGuideLine = null;
                    }
                    editor.penPath.remove();
                    editor.penPath = null;
                } else {
                    deselectAll();
                }
                break;
        }
    }

    // Delete / Backspace to remove selected path
    if ((e.key === 'Delete' || e.key === 'Backspace') && !isCtrl) {
        if (editor.selectedPath) {
            e.preventDefault();
            editor.selectedPath.remove();
            editor.selectedPath = null;
            saveEditorState();
        }
    }
}

function handleEditorKeyUp(e) {
    if (e.code === 'Space') {
        editor.spaceHeld = false;
        editor.isPanning = false;
        var container = document.querySelector('.editor-canvas-container');
        if (container) {
            container.style.cursor = getCursorForTool(editor.currentTool);
        }
    }
}

// ---------------------------------------------------------------------------
// Export Screen (Task 10)
// ---------------------------------------------------------------------------

var exportEventsAttached = false;

/**
 * Initialize the export screen: capture a snapshot of the editor canvas
 * as a preview image and wire up event handlers.
 */
function initExportScreen() {
    // Zoom-to-fit before capturing so the preview shows the full drawing
    var canvas = document.getElementById('editor-canvas');
    var previewImg = document.getElementById('export-preview-img');
    if (canvas && previewImg && paper.view) {
        var prevZoom = paper.view.zoom;
        var prevCenter = paper.view.center.clone();
        zoomToFit();
        paper.view.update();
        previewImg.src = canvas.toDataURL('image/png');
        // Restore previous view state
        paper.view.zoom = prevZoom;
        paper.view.center = prevCenter;
    }

    // Wire up export buttons (only once)
    if (!exportEventsAttached) {
        var stlBtn = document.getElementById('download-stl-btn');
        var svgBtn = document.getElementById('download-svg-btn');
        var pngBtn = document.getElementById('download-png-btn');
        var backBtn = document.getElementById('back-to-editor-btn');

        if (stlBtn) stlBtn.addEventListener('click', exportSTL);
        if (svgBtn) svgBtn.addEventListener('click', downloadSVG);
        if (pngBtn) pngBtn.addEventListener('click', downloadPNG);
        if (backBtn) {
            backBtn.addEventListener('click', function () {
                showScreen('editor');
            });
        }

        exportEventsAttached = true;
    }
}

// ---------------------------------------------------------------------------
// Export: Rasterize canvas to a binary mask PNG for STL generation
// ---------------------------------------------------------------------------

/**
 * Creates a binary black-and-white image (ink = white, background = black)
 * from the draw layer paths for the STL backend.
 *
 * The draw layer contains the potrace paths (which represent the ink from the
 * cleaned image) plus any user edits. Eraser paths (data.isEraser=true) are
 * rendered in black to subtract ink.
 *
 * Two-pass render:
 *   Pass 1: All non-eraser paths rendered in white (ink)
 *   Pass 2: All eraser paths rendered in black (remove ink)
 *
 * Returns a Promise<Blob> of the mask PNG.
 */
async function rasterizeForSTL() {
    if (!editor.drawLayer) {
        return new Promise(function (resolve) {
            var c = document.createElement('canvas');
            c.width = 100; c.height = 100;
            c.toBlob(resolve, 'image/png');
        });
    }

    // Determine export dimensions from the background raster
    var rasterItem = null;
    if (editor.bgLayer && editor.bgLayer.children.length > 0) {
        rasterItem = editor.bgLayer.children[0];
    }

    var exportWidth = 800;
    var exportHeight = 800;
    var bounds;

    if (rasterItem) {
        bounds = rasterItem.bounds;
        var scale = exportWidth / bounds.width;
        exportHeight = Math.round(bounds.height * scale);
    } else {
        bounds = editor.drawLayer.bounds;
        if (bounds.width > 0) {
            var scale = exportWidth / bounds.width;
            exportHeight = Math.round(bounds.height * scale);
        }
    }

    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = exportWidth;
    tempCanvas.height = exportHeight;
    var ctx = tempCanvas.getContext('2d');

    // Black background (non-ink)
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, exportWidth, exportHeight);

    // Helper: render a set of paths as SVG onto the canvas
    async function renderPaths(items, color) {
        if (items.length === 0) return;

        // Create a temporary group, clone paths with the export color
        var group = new paper.Group();
        for (var i = 0; i < items.length; i++) {
            var clone = items[i].clone({ insert: false });
            clone.strokeColor = color;
            if (clone.fillColor) clone.fillColor = color;
            group.addChild(clone);
        }

        var svgStr = group.exportSVG({ asString: true });
        group.remove();

        // Add viewBox and dimensions so the SVG renders at the correct scale
        if (bounds) {
            svgStr = svgStr.replace(
                /^<svg/,
                '<svg viewBox="' + bounds.x + ' ' + bounds.y + ' ' +
                bounds.width + ' ' + bounds.height +
                '" width="' + exportWidth + '" height="' + exportHeight + '"'
            );
        }

        var svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        var url = URL.createObjectURL(svgBlob);
        var img = new Image();
        await new Promise(function (resolve, reject) {
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
        });
        ctx.drawImage(img, 0, 0, exportWidth, exportHeight);
        URL.revokeObjectURL(url);
    }

    // Collect ink paths and eraser paths
    var inkPaths = [];
    var eraserPaths = [];

    function collectPaths(item) {
        if (item instanceof paper.Path || item instanceof paper.CompoundPath) {
            if (item.data && item.data.isEraser) {
                eraserPaths.push(item);
            } else {
                inkPaths.push(item);
            }
        } else if (item.children) {
            for (var i = 0; i < item.children.length; i++) {
                collectPaths(item.children[i]);
            }
        }
    }
    collectPaths(editor.drawLayer);

    // Pass 1: render ink paths in white
    await renderPaths(inkPaths, 'white');

    // Pass 2: render eraser paths in black (subtracts ink)
    await renderPaths(eraserPaths, 'black');

    // Return a PNG blob
    return new Promise(function (resolve) {
        tempCanvas.toBlob(resolve, 'image/png');
    });
}

// ---------------------------------------------------------------------------
// Export: Download STL
// ---------------------------------------------------------------------------

async function exportSTL() {
    showLoading(true, 'Generating STL\u2026');
    try {
        var maskBlob = await rasterizeForSTL();

        var form = new FormData();
        form.append('file', maskBlob, 'mask.png');
        form.append('width_mm', document.getElementById('stl-width').value);
        form.append('thickness_mm', document.getElementById('stl-thickness').value);
        form.append('border_mm', document.getElementById('stl-border').value);

        var res = await fetch('/api/generate-stl', {
            method: 'POST',
            body: form,
        });

        if (!res.ok) {
            var errBody;
            try {
                errBody = await res.json();
            } catch (_) {
                errBody = null;
            }
            var detail = (errBody && errBody.detail) ? errBody.detail : res.statusText;
            throw new Error(detail);
        }

        var stlBlob = await res.blob();
        triggerDownload(stlBlob, 'stencil.stl');
    } catch (err) {
        showError('Export failed: ' + err.message);
    } finally {
        showLoading(false);
    }
}

// ---------------------------------------------------------------------------
// Export: Download SVG
// ---------------------------------------------------------------------------

function downloadSVG() {
    try {
        // Export only the draw layer (skip the background raster)
        var svg = editor.drawLayer
            ? editor.drawLayer.exportSVG({ asString: true })
            : paper.project.exportSVG({ asString: true });
        var blob = new Blob([svg], { type: 'image/svg+xml' });
        triggerDownload(blob, 'stencil.svg');
    } catch (err) {
        showError('SVG export failed: ' + err.message);
    }
}

// ---------------------------------------------------------------------------
// Export: Download PNG
// ---------------------------------------------------------------------------

function downloadPNG() {
    try {
        var canvas = document.getElementById('editor-canvas');
        var dataURL = canvas.toDataURL('image/png');
        var a = document.createElement('a');
        a.href = dataURL;
        a.download = 'stencil.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (err) {
        showError('PNG export failed: ' + err.message);
    }
}

// ---------------------------------------------------------------------------
// Export: Trigger file download from a Blob
// ---------------------------------------------------------------------------

function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Clean up the object URL after a short delay
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}
