// ============================================
// VISUAL WEB TESTER (VWT)
// A self-contained module for the new
// no-code web testing environment.
// ============================================

// --- VWT State ---
let vwt_files = { html: null, css: [], js: [] };
let vwt_steps = [];
let vwt_selectedStepIndex = null;
let vwt_dragStartIndex = null;
let vwt_editingSuiteId = null; // *** NEW: To track if we are editing an existing suite

// --- VWT Config ---
// Simplified set of steps for the new visual builder
// This is separate from the main nocode-builder.js steps
const vwt_availableSteps = [
    {
        name: 'Click Element',
        description: 'Clicks an element.',
        icon: '🖱️',
        params: [{ key: 'selector', label: 'CSS Selector', type: 'text', placeholder: 'e.g., #submit-button' }],
        // This template generates direct JS for live execution
        execute: (params, iframeWin, log) => {
            const el = iframeWin.document.querySelector(params.selector);
            if (!el) throw new Error(`Element not found: ${params.selector}`);
            el.click();
            log(`✓ Clicked element: ${params.selector}`);
        },
        // This template generates Robot Framework code for saving
        robot: (p) => `    Click Element    ${p.selector}`
    },
    {
        name: 'Input Text',
        description: 'Types text into a field.',
        icon: '⌨️',
        params: [
            { key: 'selector', label: 'CSS Selector', type: 'text', placeholder: 'e.g., input[name="username"]' },
            { key: 'text', label: 'Text to Input', type: 'text', placeholder: 'e.g., john_doe' }
        ],
        execute: (params, iframeWin, log) => {
            const el = iframeWin.document.querySelector(params.selector);
            if (!el) throw new Error(`Element not found: ${params.selector}`);
            el.value = params.text;
            // Dispatch input event for frameworks
            el.dispatchEvent(new iframeWin.Event('input', { bubbles: true }));
            log(`✓ Input text into ${params.selector}: ${params.text}`);
        },
        robot: (p) => `    Input Text    ${p.selector}    ${p.text}`
    },
    {
        name: 'Element Should Contain',
        description: 'Verifies element text.',
        icon: '🔍',
        params: [
            { key: 'selector', label: 'CSS Selector', type: 'text', placeholder: 'e.g., h1' },
            { key: 'text', label: 'Expected Text', type: 'text', placeholder: 'e.g., Welcome' }
        ],
        execute: (params, iframeWin, log) => {
            const el = iframeWin.document.querySelector(params.selector);
            if (!el) throw new Error(`Element not found: ${params.selector}`);
            if (!el.textContent.includes(params.text)) {
                throw new Error(`Assertion Failed: Element ${params.selector} does not contain "${params.text}". Actual: "${el.textContent}"`);
            }
            log(`✓ Element ${params.selector} contains "${params.text}"`);
        },
        robot: (p) => `    Element Should Contain    ${p.selector}    ${p.text}`
    },
    {
        name: 'Wait For Element',
        description: 'Waits for an element.',
        icon: '⏳',
        params: [
            { key: 'selector', label: 'CSS Selector', type: 'text', placeholder: 'e.g., #results' },
            { key: 'timeout', label: 'Timeout (ms)', type: 'number', placeholder: '5000' }
        ],
        execute: async (params, iframeWin, log) => {
            const timeout = parseInt(params.timeout, 10) || 5000;
            const startTime = Date.now();
            while (Date.now() - startTime < timeout) {
                if (iframeWin.document.querySelector(params.selector)) {
                    log(`✓ Waited for and found element: ${params.selector}`);
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 100)); // Poll every 100ms
            }
            throw new Error(`Wait timed out after ${timeout}ms for element: ${params.selector}`);
        },
        robot: (p) => `    Wait For Element    ${p.selector}    timeout=${(parseInt(p.timeout, 10) || 5000) / 1000}s`
    }
];

// --- VWT Modal Management ---

// This function is for CREATING a new test
function openVisualWebTester() {
    // Reset state for a new test
    vwt_editingSuiteId = null; // *** NEW: Ensure we are in "create" mode
    vwt_files = { html: null, css: [], js: [] };
    vwt_steps = [];
    vwt_selectedStepIndex = null;
    
    // Reset UI
    vwt_updateFilesPreview(); // Use helper to set default message
    document.getElementById('vwt-iframe').src = 'about:blank';
    document.getElementById('vwt-iframe').srcdoc = ''; // Clear srcdoc
    document.getElementById('vwt-logs').value = '';
    document.getElementById('vwt-html-file').value = '';
    document.getElementById('vwt-css-files').value = '';
    document.getElementById('vwt-js-files').value = '';

    vwt_initializeToolbox();
    vwt_renderCanvas();
    vwt_renderPropertiesPanel();

    document.getElementById('visual-web-tester-modal').classList.remove('hidden');
    document.body.classList.add('modal-open');
}

// *** NEW ***
// This function is for EDITING an existing test
function openVisualWebTesterForEdit(suite) {
    if (!suite) return;

    // 1. Set editing state
    vwt_editingSuiteId = suite.id;

    // 2. Load files from suite object
    vwt_files.html = suite.website_html_content || null;
    vwt_files.css = suite.website_css_contents || [];
    vwt_files.js = suite.website_js_contents || [];

    // 3. Load steps from suite object (from the JSON we will save)
    vwt_selectedStepIndex = null;
    if (suite.vwt_steps_json) {
        try {
            vwt_steps = JSON.parse(suite.vwt_steps_json);
        } catch (e) {
            console.error("Failed to parse vwt_steps_json:", e);
            vwt_steps = [];
            vwt_log("Error: Could not load visual steps. Starting with a blank canvas.");
        }
    } else {
        vwt_steps = [];
        vwt_log("Warning: This test suite was saved without visual steps. Starting with a blank canvas.");
    }

    // 4. Update UI
    vwt_initializeToolbox();
    vwt_updateFilesPreview(); // Update file preview text
    vwt_renderCanvas();
    vwt_renderPropertiesPanel();
    vwt_renderIframe(); // Load the website preview
    
    const logArea = document.getElementById('vwt-logs');
    if(logArea) logArea.value = `Loaded suite "${suite.name}" for editing.\n`;

    // 5. Open modal
    document.getElementById('visual-web-tester-modal').classList.remove('hidden');
    document.body.classList.add('modal-open');
}


function closeVisualWebTester() {
    document.getElementById('visual-web-tester-modal').classList.add('hidden');
    document.body.classList.remove('modal-open');
    
    // Clean up iframe content
    const iframe = document.getElementById('vwt-iframe');
    iframe.src = 'about:blank';
    iframe.srcdoc = '';
    
    if (iframe.dataset.blobUrl) {
        URL.revokeObjectURL(iframe.dataset.blobUrl);
        iframe.dataset.blobUrl = '';
    }
}

// --- VWT File and Iframe Logic ---

// *** NEW HELPER FUNCTION ***
// Extracted from vwt_handleFileUpload to be reusable
function vwt_updateFilesPreview() {
    const preview = document.getElementById('vwt-files-preview');
    if (!preview) return;

    let finalPreview = '';
    if (vwt_files.html) finalPreview += `✓ HTML loaded<br>`;
    if (vwt_files.css && vwt_files.css.length > 0) finalPreview += `✓ ${vwt_files.css.length} CSS file(s) loaded<br>`;
    if (vwt_files.js && vwt_files.js.length > 0) finalPreview += `✓ ${vwt_files.js.length} JS file(s) loaded<br>`;

    if (finalPreview === '') {
        preview.innerHTML = 'Upload files to begin...';
    } else {
        preview.innerHTML = '<strong>Loaded Files:</strong><br>' + finalPreview;
    }
}

async function vwt_handleFileUpload(input, type) {
    const files = input.files;
    if (!files || files.length === 0) return;

    if (type === 'html') {
        const file = files[0];
        vwt_files.html = await vwt_readFileAsText(file);
    } else if (type === 'css') {
        vwt_files.css = [];
        for (let file of files) {
            const content = await vwt_readFileAsText(file);
            vwt_files.css.push({ name: file.name, content });
        }
    } else if (type === 'js') {
        vwt_files.js = [];
        for (let file of files) {
            const content = await vwt_readFileAsText(file);
            vwt_files.js.push({ name: file.name, content });
        }
    }

    // Update preview display using the new helper
    vwt_updateFilesPreview();

    // Auto-render iframe if HTML is present
    if (vwt_files.html) {
        vwt_renderIframe();
    }
}

function vwt_readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

function vwt_buildWebsiteHTML() {
    if (!vwt_files.html) return null;
    let html = vwt_files.html;

    // Inject CSS
    if (vwt_files.css.length > 0) {
        const cssStyles = vwt_files.css.map(file => 
            `<style>/* ${file.name} */\n${file.content}</style>`
        ).join('\n');
        html = html.includes('</head>') ? 
               html.replace('</head>', cssStyles + '\n</head>') : 
               cssStyles + '\n' + html;
    }

    // Inject JS
    if (vwt_files.js.length > 0) {
        const jsScripts = vwt_files.js.map(file => 
            `<script>/* ${file.name} */\n${file.content}</script>`
        ).join('\n');
        html = html.includes('</body>') ? 
               html.replace('</body>', jsScripts + '\n</body>') : 
               html + '\n' + jsScripts;
    }
    return html;
}

function vwt_renderIframe() {
    const htmlContent = vwt_buildWebsiteHTML();
    if (!htmlContent) {
        vwt_log("Error: No HTML content to render. Please upload an HTML file.");
        return;
    }
    
    const iframe = document.getElementById('vwt-iframe');
    
    // Clean up old blob URL if it exists
    if (iframe.dataset.blobUrl) {
        URL.revokeObjectURL(iframe.dataset.blobUrl);
        iframe.dataset.blobUrl = '';
    }

    // *** MODIFICATION: Use srcdoc instead of blob URL ***
    // This helps avoid the "origin 'null'" cross-origin error
    // when running the application from a file:// URL.
    iframe.src = 'about:blank'; // First, clear the src
    iframe.srcdoc = htmlContent; // Now, set the content via srcdoc

    vwt_log("Website preview reloaded in sandbox.");
}

// --- VWT Builder UI Logic ---

function vwt_initializeToolbox() {
    const toolbox = document.getElementById('vwt-toolbox');
    if (!toolbox) return;

    toolbox.innerHTML = '';
    vwt_availableSteps.forEach(step => {
        const stepEl = document.createElement('div');
        stepEl.className = 'aero-button p-3 rounded cursor-grab no-code-step';
        stepEl.draggable = true;
        stepEl.innerHTML = `
            <div class="font-semibold">${step.icon} ${step.name}</div>
            <div class="text-xs aero-text-muted">${step.description}</div>
        `;
        stepEl.addEventListener('dragstart', (e) => {
            vwt_dragStartIndex = null; // Indicates dragging a *new* step
            e.dataTransfer.setData('text/plain', step.name);
        });
        toolbox.appendChild(stepEl);
    });
}

function vwt_renderCanvas() {
    const canvas = document.getElementById('vwt-canvas');
    canvas.innerHTML = '';

    if (vwt_steps.length === 0) {
        canvas.innerHTML = `<div class="text-center aero-text-muted p-8">Drag steps from the toolbox and drop them here.</div>`;
    }

    vwt_steps.forEach((step, index) => {
        const stepConfig = vwt_availableSteps.find(s => s.name === step.name);
        const stepEl = document.createElement('div');
        stepEl.className = `p-4 mb-2 rounded border-l-4 flex justify-between items-center no-code-step ${vwt_selectedStepIndex === index ? 'aero-button-primary' : 'aero-card'}`;
        stepEl.draggable = true;
        stepEl.dataset.index = index;

        stepEl.innerHTML = `
            <div>
                <span class="font-bold">${stepConfig.icon} ${index + 1}. ${step.name}</span>
            </div>
            <button class="aero-button-danger text-xs py-1 px-2 rounded" onclick="vwt_deleteStep(${index}, event)">Delete</button>
        `;
        
        stepEl.addEventListener('click', () => vwt_selectStep(index));
        
        // Reordering logic
        stepEl.addEventListener('dragstart', (e) => {
            vwt_dragStartIndex = index;
            e.dataTransfer.effectAllowed = 'move';
            e.stopPropagation(); // Prevent toolbox dragstart
        });

        stepEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            stepEl.classList.add('drag-over-item');
        });
        stepEl.addEventListener('dragleave', (e) => {
            e.preventDefault();
            stepEl.classList.remove('drag-over-item');
        });

        stepEl.addEventListener('drop', (e) => {
            e.stopPropagation();
            e.preventDefault();
            stepEl.classList.remove('drag-over-item');

            if (vwt_dragStartIndex === null) {
                // This is a NEW step being dropped
                vwt_handleDrop(e, index);
            } else {
                // This is REORDERING
                const dropIndex = index;
                if (vwt_dragStartIndex === dropIndex) return;
                const draggedItem = vwt_steps[vwt_dragStartIndex];
                vwt_steps.splice(vwt_dragStartIndex, 1);
                vwt_steps.splice(dropIndex, 0, draggedItem);
                vwt_dragStartIndex = null;
                vwt_renderCanvas();
                vwt_selectStep(dropIndex);
            }
        });
        canvas.appendChild(stepEl);
    });
}

function vwt_setupCanvasDropZone() {
    const canvas = document.getElementById('vwt-canvas');
    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        canvas.classList.add('drag-over');
    });
    canvas.addEventListener('dragleave', () => canvas.classList.remove('drag-over'));
    canvas.addEventListener('drop', (e) => vwt_handleDrop(e, null)); // Drop at the end
}
// Initialize drop zone listener
document.addEventListener('DOMContentLoaded', vwt_setupCanvasDropZone);


function vwt_handleDrop(e, dropIndex) {
    e.preventDefault();
    document.getElementById('vwt-canvas').classList.remove('drag-over');

    // Only handle drops for NEW steps
    if (vwt_dragStartIndex !== null) {
        return;
    }
    
    const stepName = e.dataTransfer.getData('text/plain');
    const stepConfig = vwt_availableSteps.find(s => s.name === stepName);
    
    if (stepConfig) {
        const newStep = {
            id: `step_${Date.now()}`,
            name: stepConfig.name,
            params: {}
        };
        stepConfig.params.forEach(p => { newStep.params[p.key] = p.placeholder || ''; });
        
        if (dropIndex === null || dropIndex > vwt_steps.length) {
            vwt_steps.push(newStep); // Add to end
        } else {
            vwt_steps.splice(dropIndex, 0, newStep); // Insert at position
        }

        vwt_renderCanvas();
        vwt_selectStep(dropIndex === null ? vwt_steps.length - 1 : dropIndex);
    }
}

function vwt_renderPropertiesPanel() {
    const propertiesPanel = document.getElementById('vwt-properties');
    if (vwt_selectedStepIndex === null || !vwt_steps[vwt_selectedStepIndex]) {
        propertiesPanel.innerHTML = `<div class="text-center aero-text-muted p-8">Select a step to configure its properties.</div>`;
        return;
    }

    const step = vwt_steps[vwt_selectedStepIndex];
    const stepConfig = vwt_availableSteps.find(s => s.name === step.name);
    
    let formHTML = `<h3 class="text-xl font-bold aero-text-primary mb-4">Properties: ${step.name}</h3>`;
    
    stepConfig.params.forEach(param => {
        const value = step.params[param.key] || '';
        formHTML += `<div class="mb-3">
            <label class="block text-sm font-medium aero-text-secondary mb-1">${param.label}</label>
            <input type="${param.type}" 
                   placeholder="${param.placeholder || ''}"
                   value="${vwt_escapeHtml(value)}"
                   oninput="vwt_updateStepParam(vwt_selectedStepIndex, '${param.key}', this.value)"
                   class="w-full aero-input p-2 rounded">
        </div>`;
    });

    propertiesPanel.innerHTML = formHTML;
}

function vwt_selectStep(index) {
    vwt_selectedStepIndex = index;
    vwt_renderCanvas();
    vwt_renderPropertiesPanel();
}

function vwt_deleteStep(index, event) {
    event.stopPropagation();
    vwt_steps.splice(index, 1);
    
    if (vwt_selectedStepIndex === index) {
        vwt_selectedStepIndex = null;
    } else if (vwt_selectedStepIndex > index) {
        vwt_selectedStepIndex--;
    }
    
    vwt_renderCanvas();
    vwt_renderPropertiesPanel();
}

function vwt_updateStepParam(index, key, value) {
    if (vwt_steps[index]) {
        vwt_steps[index].params[key] = value;
    }
}

// --- VWT Test Execution & Saving ---

function vwt_log(message) {
    const logArea = document.getElementById('vwt-logs');
    logArea.value += `[${new Date().toLocaleTimeString()}] ${message}\n`;
    logArea.scrollTop = logArea.scrollHeight;
}

async function vwt_runTest() {
    vwt_log("--- Starting Live Test Run ---");
    const iframe = document.getElementById('vwt-iframe');

    // *** MODIFICATION ***
    // We now check for `srcdoc` content. The `src` will be 'about:blank'
    // when using `srcdoc`, so we check if `srcdoc` is empty or not.
    if (!iframe.srcdoc) {
        vwt_log("Error: No website loaded. Please upload an HTML file and reload preview.");
        return;
    }
    const iframeWin = iframe.contentWindow;

    // Reload the iframe to ensure a clean state
    vwt_log("Reloading website sandbox for clean test...");
    vwt_renderIframe();

    // Wait for the iframe to fully reload
    await new Promise((resolve) => {
        const listener = () => {
            iframe.removeEventListener('load', listener);
            resolve();
        };
        iframe.addEventListener('load', listener);
    });
    
    vwt_log("Website reloaded. Starting test steps...");

    for (let i = 0; i < vwt_steps.length; i++) {
        const step = vwt_steps[i];
        const stepConfig = vwt_availableSteps.find(s => s.name === step.name);
        
        vwt_log(`[Step ${i + 1}/${vwt_steps.length}] Running: ${step.name}`);
        
        try {
            // Highlight the step being run
            vwt_selectStep(i); 
            
            // A small delay to make the execution visible
            await new Promise(resolve => setTimeout(resolve, 300));

            // Use 'await' for async steps like 'Wait For Element'
            await stepConfig.execute(step.params, iframeWin, vwt_log);

        } catch (error) {
            vwt_log(`--- ERROR at Step ${i + 1} ---`);
            vwt_log(error.message);
            vwt_log("--- Test Run Aborted ---");
            return; // Stop execution on failure
        }
    }
    
    vwt_log("--- Test Run Finished Successfully ---");
}

function vwt_generateRobotCode() {
    let code = `*** Settings ***\n`;
    code += `Library    BrowserLibrary\n\n`; // Use the built-in browser library
    code += `*** Test Cases ***\n`;
    code += `Visually Generated Web Test\n`;

    vwt_steps.forEach(step => {
        const stepConfig = vwt_availableSteps.find(s => s.name === step.name);
        if (stepConfig) {
            code += stepConfig.robot(step.params) + '\n';
        }
    });
    return code;
}

// *** MODIFIED ***
// This function now handles both CREATE and UPDATE
async function vwt_saveSuite() {
    if (vwt_steps.length === 0) {
        showMessage('Cannot save: No test steps added.', 'error'); // Relies on showMessage from script.js
        return;
    }
    if (!vwt_files.html) {
        showMessage('Cannot save: No HTML file uploaded.', 'error');
        return;
    }

    let suiteName, suiteDescription, suiteViewId;

    // Get name and description
    if (vwt_editingSuiteId) {
        // We are EDITING, so we get existing data
        const existingSuite = testSuites.find(s => s.id === vwt_editingSuiteId); // testSuites from script.js
        suiteName = prompt("Confirm test suite name:", existingSuite.name);
        if (!suiteName) return; // User cancelled
        suiteDescription = prompt("Confirm description:", existingSuite.description);
        suiteViewId = existingSuite.view_id; // Preserve existing view_id
    } else {
        // We are CREATING, so we ask for new data
        suiteName = prompt("Enter a name for this new test suite:", "New Visual Web Test");
        if (!suiteName) return; // User cancelled
        suiteDescription = prompt("Enter a description (optional):", "Generated by Visual Web Tester");
        suiteViewId = currentViewId || null; // Rely on currentViewId from script.js
    }

    vwt_log("Generating Robot Framework code...");
    const generatedCode = vwt_generateRobotCode();
    
    // This is the complete suite data object
    const suiteData = {
        name: suiteName,
        description: suiteDescription,
        language: 'website',
        code: generatedCode,
        vwt_steps_json: JSON.stringify(vwt_steps), // *** Store the visual steps as JSON! ***
        website_method: 'upload',
        website_html_content: vwt_files.html,
        website_css_contents: vwt_files.css, // Stored as {name, content}
        website_js_contents: vwt_files.js,   // Stored as {name, content}
        view_id: suiteViewId, 
        parameters: [], // VWT doesn't use these, so default to empty
        input_files: [], // VWT doesn't use these, so default to empty
        log_config: { enabled: true, format: 'html', save_trigger: 'always' } // Sensible default
    };

    try {
        // This is the key integration: it calls functions from script.js
        if (typeof currentStorage === 'undefined' || !currentStorage.saveSuite || !currentStorage.updateSuite) {
             vwt_log("Error: currentStorage function not found.");
             showMessage("Error: Storage system not found. Cannot save.", 'error');
             return;
        }
        
        if (vwt_editingSuiteId) {
            // We are UPDATING an existing suite
            vwt_log("Updating test suite...");
            // We need to merge with existing data in case VWT doesn't set all fields
            const existingSuite = testSuites.find(s => s.id === vwt_editingSuiteId);
            const updatedSuite = { ...existingSuite, ...suiteData };
            
            await currentStorage.updateSuite(vwt_editingSuiteId, updatedSuite);
            showMessage("Test suite updated successfully!", 'success');
            vwt_log("Test suite updated! You can now close this window.");
        } else {
            // We are CREATING a new suite
            vwt_log("Saving new test suite...");
            await currentStorage.saveSuite(suiteData);
            showMessage("Test suite saved successfully!", 'success');
            vwt_log("Test suite saved! You can now close this window.");
        }
        
        closeVisualWebTester(); // Close modal on success

    } catch (error) {
        vwt_log(`Error saving suite: ${error.message}`);
        showMessage(`Error saving suite: ${error.message}`, 'error');
    }
}

// --- VWT Utilities ---

function vwt_escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

