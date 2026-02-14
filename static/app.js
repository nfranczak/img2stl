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
        // initEditor() will be called here in Task 9
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
