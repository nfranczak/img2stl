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
}

// ---------------------------------------------------------------------------
// Loading overlay
// ---------------------------------------------------------------------------
function showLoading(visible) {
    if (visible) {
        dom.loadingOverlay.classList.add('visible');
    } else {
        dom.loadingOverlay.classList.remove('visible');
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

    setupTools();
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
        // Process children in reverse to safely remove groups
        var children = item.children.slice();
        for (var i = 0; i < children.length; i++) {
            flattenAndStyleSVG(children[i]);
        }
    }
    if (item instanceof paper.Path || item instanceof paper.CompoundPath) {
        item.strokeColor = 'black';
        item.fillColor = 'black';
        item.strokeWidth = 1;
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
    editor.selectedPath = null;
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
        // Pen tool preview line
        if (editor.currentTool === 'pen' && editor.penPath && editor.penPath.segments.length > 0) {
            // Nothing dynamic on hover for now; could add guide line
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
        // Start a new path
        editor.penPath = new paper.Path({
            strokeColor: 'black',
            strokeWidth: getStrokeWidth(),
            fillColor: null,
        });
    }

    // Add a segment at the click point
    editor.penPath.add(new paper.Segment(event.point));
}

// Double-click detection for finishing pen path is handled via dblclick event

// ---------------------------------------------------------------------------
// Tool: Freehand
// ---------------------------------------------------------------------------
function toolFreehandDown(event) {
    editor.activePath = new paper.Path({
        strokeColor: 'black',
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
        strokeColor: 'black',
        strokeWidth: getStrokeWidth(),
    });
}

function toolLineDrag(event) {
    if (editor.previewShape) {
        editor.previewShape.remove();
        editor.previewShape = new paper.Path.Line({
            from: editor.dragStart,
            to: event.point,
            strokeColor: 'black',
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
        strokeColor: 'white',
        strokeWidth: getStrokeWidth() * 3,
        fillColor: null,
        strokeCap: 'round',
        strokeJoin: 'round',
    });
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
        strokeColor: 'black',
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
            strokeColor: 'black',
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
        strokeColor: 'black',
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
            strokeColor: 'black',
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
            case 'enter':
                if (editor.currentTool === 'pen' && editor.penPath) {
                    finishPenPath();
                }
                break;
            case 'escape':
                if (editor.currentTool === 'pen' && editor.penPath) {
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
