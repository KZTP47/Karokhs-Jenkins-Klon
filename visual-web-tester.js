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
let vwt_editingSuiteId = null; 

// --- VWT Config ---
const vwt_availableSteps = [
    {
        name: 'Click Element',
        description: 'Clicks an element.',
        icon: '🖱️',
        params: [{ key: 'selector', label: 'CSS Selector', type: 'text', placeholder: 'e.g., #submit-button' }],
        execute: (params, iframeWin, log) => {
            const el = iframeWin.document.querySelector(params.selector);
            if (!el) throw new Error(`Element not found: ${params.selector}`);
            el.click();
            log(`✓ Clicked element: ${params.selector}`);
        },
        robot: (p) => `    Click Element    ${p.selector}`
    },
    {
        name: 'Input Text',
        description: 'Types text into a field.',
        icon: '⌨️',
        params: [
            { key: 'selector', label: 'CSS Selector', type: 'text', placeholder: 'e.g., input[name="username"]' },
            { key: 'text', label: 'Text to Input', type: 'textarea', placeholder: 'e.g., john_doe' }
        ],
        execute: (params, iframeWin, log) => {
            const el = iframeWin.document.querySelector(params.selector);
            if (!el) throw new Error(`Element not found: ${params.selector}`);
            el.value = params.text;
            el.dispatchEvent(new iframeWin.Event('input', { bubbles: true }));
            log(`✓ Input text into ${params.selector}: ${params.text.length > 50 ? params.text.substring(0, 50) + '...' : params.text}`);
        },
        robot: (p) => {
            const indentedText = p.text.replace(/^/gm, '    '); 
            return `    Input Text    ${p.selector}    """\n${indentedText}\n    """`;
        }
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
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            throw new Error(`Wait timed out after ${timeout}ms for element: ${params.selector}`);
        },
        robot: (p) => `    Wait For Element    ${p.selector}    timeout=${(parseInt(p.timeout, 10) || 5000) / 1000}s`
    }
];

// --- VWT Modal Management (Creator) ---

function openVisualWebTester() {
    vwt_editingSuiteId = null;
    vwt_files = { html: null, css: [], js: [] };
    vwt_steps = [];
    vwt_selectedStepIndex = null;
    vwt_updateFilesPreview();
    document.getElementById('vwt-iframe').src = 'about:blank';
    document.getElementById('vwt-iframe').srcdoc = '';
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

function openVisualWebTesterForEdit(suite) {
    if (!suite) return;
    vwt_editingSuiteId = suite.id;
    vwt_files.html = suite.website_html_content || null;
    vwt_files.css = suite.website_css_contents || [];
    vwt_files.js = suite.website_js_contents || [];
    vwt_selectedStepIndex = null;
    try {
        vwt_steps = suite.vwt_steps_json ? JSON.parse(suite.vwt_steps_json) : [];
    } catch (e) {
        console.error("Failed to parse vwt_steps_json:", e);
        vwt_steps = [];
    }
    vwt_initializeToolbox();
    vwt_updateFilesPreview();
    vwt_renderCanvas();
    vwt_renderPropertiesPanel();
    vwt_renderIframe();
    const logArea = document.getElementById('vwt-logs');
    if(logArea) logArea.value = `Loaded suite "${suite.name}" for editing.\n`;
    document.getElementById('visual-web-tester-modal').classList.remove('hidden');
    document.body.classList.add('modal-open');
}

function closeVisualWebTester() {
    document.getElementById('visual-web-tester-modal').classList.add('hidden');
    document.body.classList.remove('modal-open');
    const iframe = document.getElementById('vwt-iframe');
    iframe.src = 'about:blank';
    iframe.srcdoc = '';
}

// --- VWT File and Iframe Logic (Creator) ---

function vwt_updateFilesPreview() {
    const preview = document.getElementById('vwt-files-preview');
    if (!preview) return;
    let finalPreview = '';
    if (vwt_files.html) finalPreview += `✓ HTML loaded<br>`;
    if (vwt_files.css && vwt_files.css.length > 0) finalPreview += `✓ ${vwt_files.css.length} CSS file(s) loaded<br>`;
    if (vwt_files.js && vwt_files.js.length > 0) finalPreview += `✓ ${vwt_files.js.length} JS file(s) loaded<br>`;
    preview.innerHTML = finalPreview === '' ? 'Upload files to begin...' : '<strong>Loaded Files:</strong><br>' + finalPreview;
}

async function vwt_handleFileUpload(input, type) {
    const files = input.files;
    if (!files || files.length === 0) return;
    if (type === 'html') {
        vwt_files.html = await vwt_readFileAsText(files[0]);
    } else {
        vwt_files[type] = [];
        for (let file of files) {
            const content = await vwt_readFileAsText(file);
            vwt_files[type].push({ name: file.name, content });
        }
    }
    vwt_updateFilesPreview();
    if (vwt_files.html) vwt_renderIframe();
}

function vwt_readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

function vwt_buildWebsiteHTML(files) {
    if (!files.html) return null;
    let html = files.html;
    if (files.css.length > 0) {
        const cssStyles = files.css.map(f => `<style>/* ${f.name} */\n${f.content}</style>`).join('\n');
        html = html.includes('</head>') ? html.replace('</head>', cssStyles + '\n</head>') : cssStyles + '\n' + html;
    }
    if (files.js.length > 0) {
        const jsScripts = files.js.map(f => `<script>/* ${f.name} */\n${f.content}</script>`).join('\n');
        html = html.includes('</body>') ? html.replace('</body>', jsScripts + '\n</body>') : html + '\n' + jsScripts;
    }
    return html;
}

function vwt_renderIframe() {
    const htmlContent = vwt_buildWebsiteHTML(vwt_files);
    if (!htmlContent) {
        vwt_log("Error: No HTML content to render.");
        return;
    }
    const iframe = document.getElementById('vwt-iframe');
    iframe.src = 'about:blank';
    iframe.srcdoc = htmlContent;
    vwt_log("Website preview reloaded in sandbox.");
}

// --- VWT Builder UI Logic (Creator) ---
function vwt_initializeToolbox() {
    const toolbox = document.getElementById('vwt-toolbox');
    if (!toolbox) return;
    toolbox.innerHTML = '';
    vwt_availableSteps.forEach(step => {
        const stepEl = document.createElement('div');
        stepEl.className = 'aero-button p-3 rounded cursor-grab no-code-step';
        stepEl.draggable = true;
        stepEl.innerHTML = `<div class="font-semibold">${step.icon} ${step.name}</div><div class="text-xs aero-text-muted">${step.description}</div>`;
        stepEl.addEventListener('dragstart', (e) => {
            vwt_dragStartIndex = null;
            e.dataTransfer.setData('text/plain', step.name);
        });
        toolbox.appendChild(stepEl);
    });
}
function vwt_renderCanvas() {
    const canvas = document.getElementById('vwt-canvas');
    canvas.innerHTML = vwt_steps.length === 0 ? `<div class="text-center aero-text-muted p-8">Drag steps here.</div>` : '';
    vwt_steps.forEach((step, index) => {
        const stepConfig = vwt_availableSteps.find(s => s.name === step.name);
        const stepEl = document.createElement('div');
        stepEl.className = `p-4 mb-2 rounded border-l-4 flex justify-between items-center no-code-step ${vwt_selectedStepIndex === index ? 'aero-button-primary' : 'aero-card'}`;
        stepEl.draggable = true;
        stepEl.dataset.index = index;
        stepEl.innerHTML = `<div><span class="font-bold">${stepConfig.icon} ${index + 1}. ${step.name}</span></div><button class="aero-button-danger text-xs py-1 px-2 rounded" onclick="vwt_deleteStep(${index}, event)">Delete</button>`;
        stepEl.addEventListener('click', () => vwt_selectStep(index));
        stepEl.addEventListener('dragstart', (e) => { vwt_dragStartIndex = index; e.dataTransfer.effectAllowed = 'move'; e.stopPropagation(); });
        stepEl.addEventListener('dragover', (e) => { e.preventDefault(); stepEl.classList.add('drag-over-item'); });
        stepEl.addEventListener('dragleave', (e) => { e.preventDefault(); stepEl.classList.remove('drag-over-item'); });
        stepEl.addEventListener('drop', (e) => {
            e.stopPropagation(); e.preventDefault(); stepEl.classList.remove('drag-over-item');
            if (vwt_dragStartIndex === null) vwt_handleDrop(e, index);
            else {
                const dropIndex = index; if (vwt_dragStartIndex === dropIndex) return;
                const draggedItem = vwt_steps[vwt_dragStartIndex]; vwt_steps.splice(vwt_dragStartIndex, 1); vwt_steps.splice(dropIndex, 0, draggedItem);
                vwt_dragStartIndex = null; vwt_renderCanvas(); vwt_selectStep(dropIndex);
            }
        });
        canvas.appendChild(stepEl);
    });
}
function vwt_setupCanvasDropZone() { const canvas = document.getElementById('vwt-canvas'); canvas.addEventListener('dragover', (e) => { e.preventDefault(); canvas.classList.add('drag-over'); }); canvas.addEventListener('dragleave', () => canvas.classList.remove('drag-over')); canvas.addEventListener('drop', (e) => vwt_handleDrop(e, null)); }
document.addEventListener('DOMContentLoaded', vwt_setupCanvasDropZone);
function vwt_handleDrop(e, dropIndex) {
    e.preventDefault(); document.getElementById('vwt-canvas').classList.remove('drag-over'); if (vwt_dragStartIndex !== null) return;
    const stepName = e.dataTransfer.getData('text/plain'); const stepConfig = vwt_availableSteps.find(s => s.name === stepName);
    if (stepConfig) {
        const newStep = { id: `step_${Date.now()}`, name: stepConfig.name, params: {} };
        stepConfig.params.forEach(p => { newStep.params[p.key] = p.placeholder || ''; });
        if (dropIndex === null || dropIndex > vwt_steps.length) vwt_steps.push(newStep); else vwt_steps.splice(dropIndex, 0, newStep);
        vwt_renderCanvas(); vwt_selectStep(dropIndex === null ? vwt_steps.length - 1 : dropIndex);
    }
}
function vwt_renderPropertiesPanel() {
    const propertiesPanel = document.getElementById('vwt-properties');
    if (vwt_selectedStepIndex === null || !vwt_steps[vwt_selectedStepIndex]) { propertiesPanel.innerHTML = `<div class="text-center aero-text-muted p-8">Select a step to configure.</div>`; return; }
    const step = vwt_steps[vwt_selectedStepIndex]; const stepConfig = vwt_availableSteps.find(s => s.name === step.name);
    let formHTML = `<h3 class="text-xl font-bold aero-text-primary mb-4">Properties: ${step.name}</h3>`;
    stepConfig.params.forEach(param => {
        const value = step.params[param.key] || ''; formHTML += `<div class="mb-3"><label class="block text-sm font-medium aero-text-secondary mb-1">${param.label}</label>`;
        if (param.type === 'textarea') formHTML += `<textarea placeholder="${param.placeholder || ''}" oninput="vwt_updateStepParam(vwt_selectedStepIndex, '${param.key}', this.value)" class="w-full aero-input p-2 rounded h-32">${vwt_escapeHtml(value)}</textarea>`;
        else formHTML += `<input type="${param.type}" placeholder="${param.placeholder || ''}" value="${vwt_escapeHtml(value)}" oninput="vwt_updateStepParam(vwt_selectedStepIndex, '${param.key}', this.value)" class="w-full aero-input p-2 rounded">`;
        formHTML += `</div>`;
    });
    propertiesPanel.innerHTML = formHTML;
}
function vwt_selectStep(index) { vwt_selectedStepIndex = index; vwt_renderCanvas(); vwt_renderPropertiesPanel(); }
function vwt_deleteStep(index, event) {
    event.stopPropagation(); vwt_steps.splice(index, 1);
    if (vwt_selectedStepIndex === index) vwt_selectedStepIndex = null;
    else if (vwt_selectedStepIndex > index) vwt_selectedStepIndex--;
    vwt_renderCanvas(); vwt_renderPropertiesPanel();
}
function vwt_updateStepParam(index, key, value) { if (vwt_steps[index]) vwt_steps[index].params[key] = value; }

// --- VWT Test Execution & Saving (Creator) ---
function vwt_log(message) { const logArea = document.getElementById('vwt-logs'); logArea.value += `[${new Date().toLocaleTimeString()}] ${message}\n`; logArea.scrollTop = logArea.scrollHeight; }
async function vwt_runTest() {
    vwt_log("--- Starting Live Test Run ---"); const iframe = document.getElementById('vwt-iframe');
    if (!iframe.srcdoc) { vwt_log("Error: No website loaded."); return; }
    vwt_log("Reloading sandbox..."); vwt_renderIframe();
    await new Promise(resolve => { iframe.onload = resolve; }); vwt_log("Starting test steps...");
    for (let i = 0; i < vwt_steps.length; i++) {
        const step = vwt_steps[i]; const stepConfig = vwt_availableSteps.find(s => s.name === step.name);
        vwt_log(`[Step ${i + 1}] Running: ${step.name}`);
        try {
            vwt_selectStep(i); await new Promise(r => setTimeout(r, 300));
            await stepConfig.execute(step.params, iframe.contentWindow, vwt_log);
        } catch (error) { vwt_log(`--- ERROR at Step ${i + 1} ---\n${error.message}\n--- Test Aborted ---`); return; }
    }
    vwt_log("--- Test Run Finished Successfully ---");
}
function vwt_generateRobotCode() {
    let code = `*** Settings ***\nLibrary    BrowserLibrary\n\n*** Test Cases ***\nVisually Generated Web Test\n`;
    vwt_steps.forEach(step => { const stepConfig = vwt_availableSteps.find(s => s.name === step.name); if (stepConfig) code += stepConfig.robot(step.params) + '\n'; });
    return code;
}
async function vwt_saveSuite() {
    if (vwt_steps.length === 0 || !vwt_files.html) { showMessage('Cannot save: Add steps and upload an HTML file.', 'error'); return; }
    let suiteName, suiteDescription, suiteViewId;
    if (vwt_editingSuiteId) {
        const existingSuite = testSuites.find(s => s.id === vwt_editingSuiteId);
        suiteName = prompt("Confirm test suite name:", existingSuite.name); if (!suiteName) return;
        suiteDescription = prompt("Confirm description:", existingSuite.description); suiteViewId = existingSuite.view_id;
    } else {
        suiteName = prompt("Enter a name for this new test suite:", "New Visual Web Test"); if (!suiteName) return;
        suiteDescription = prompt("Enter a description (optional):", "Generated by Visual Web Tester"); suiteViewId = currentViewId || null;
    }
    const suiteData = { name: suiteName, description: suiteDescription, language: 'website', code: vwt_generateRobotCode(), vwt_steps_json: JSON.stringify(vwt_steps), website_method: 'upload', website_html_content: vwt_files.html, website_css_contents: vwt_files.css, website_js_contents: vwt_files.js, view_id: suiteViewId, parameters: [], input_files: [], log_config: { enabled: true, format: 'html', save_trigger: 'always' } };
    try {
        if (vwt_editingSuiteId) { const existingSuite = testSuites.find(s => s.id === vwt_editingSuiteId); await currentStorage.updateSuite(vwt_editingSuiteId, { ...existingSuite, ...suiteData }); showMessage("Test suite updated!", 'success'); }
        else { await currentStorage.saveSuite(suiteData); showMessage("Test suite saved!", 'success'); }
        closeVisualWebTester();
    } catch (error) { showMessage(`Error saving suite: ${error.message}`, 'error'); }
}
function vwt_escapeHtml(text) { if (text == null) return ''; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

// ============================================
// VWT LIVE RUNNER (REFACTORED FOR CONCURRENT EXECUTION)
// ============================================

// --- Runner State Management ---
let activeTestRunners = new Map();
let vwt_activeRunnerIdInModal = null; 

/**
 * Main entry point to start a new test run or maximize an existing one.
 */
function vwt_openLiveRunner(suite) {
    if (!suite || suite.language !== 'website' || suite.website_method !== 'upload') {
        console.error("Invalid suite for Live Runner.");
        return;
    }

    for (const runner of activeTestRunners.values()) {
        if (runner.suite.id === suite.id) {
            vwt_maximizeLiveRunner(runner.id);
            return;
        }
    }

    const runnerId = `runner_${Date.now()}`;
    const logContainer = [];
    
    // MODIFIED: The iframe is now created and appended to the *visible* modal's container from the start.
    const iframe = document.createElement('iframe');
    iframe.className = 'w-full h-full';
    iframe.style.border = 'none';
    iframe.style.display = 'none'; // It starts hidden.
    iframe.title = `Sandboxed runner for ${suite.name}`;
    
    const iframeContainer = document.getElementById('vwt-runner-iframe-container');
    iframeContainer.appendChild(iframe);

    const runner = {
        id: runnerId,
        suite: suite,
        steps: JSON.parse(suite.vwt_steps_json || '[]'),
        log: logContainer,
        iframe: iframe,
        status: 'RUNNING', 
        isMinimized: true,
        isExecuting: false
    };

    activeTestRunners.set(runnerId, runner);
    
    vwt_addTestToMinimizeBar(runnerId);
    vwt_maximizeLiveRunner(runnerId);
    vwt_runLiveTestFromRunner(runnerId);
}

/**
 * Maximizes a specific runner's view in the main modal.
 */
function vwt_maximizeLiveRunner(runnerId) {
    const runner = activeTestRunners.get(runnerId);
    if (!runner) return;
    
    // MODIFIED: Instead of complex positioning, we just toggle visibility.
    // First, hide all other runner iframes.
    for (const otherRunner of activeTestRunners.values()) {
        if (otherRunner.id !== runnerId) {
            otherRunner.iframe.style.display = 'none';
        }
    }

    // Then, show the one we want.
    runner.iframe.style.display = 'block';

    vwt_activeRunnerIdInModal = runnerId;
    runner.isMinimized = false;

    const modal = document.getElementById('vwt-live-runner-modal');
    const title = document.getElementById('vwt-runner-modal-title');
    const logArea = document.getElementById('vwt-runner-logs');
    const rerunButton = document.getElementById('vwt-runner-rerun-btn');
    
    title.textContent = `▶ ${runner.suite.name}`;
    vwt_renderRunnerCanvas(runner.steps);
    logArea.value = runner.log.join('\n');
    logArea.scrollTop = logArea.scrollHeight;
    
    rerunButton.disabled = runner.isExecuting;
    rerunButton.innerHTML = runner.isExecuting ? `<div class="spinner mr-2"></div> Running...` : '▶ Re-run Test';

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

/**
 * Minimizes the currently visible runner.
 */
function vwt_minimizeLiveRunner() {
    const runnerId = vwt_activeRunnerIdInModal;
    if (!runnerId) {
        vwt_closeLiveRunner(false); 
        return;
    }

    const runner = activeTestRunners.get(runnerId);
    if (!runner) return;
    
    runner.isMinimized = true;

    // MODIFIED: No need to move the iframe. Just hide the modal.
    // The iframe stays in the modal container but becomes invisible with it.
    
    const modal = document.getElementById('vwt-live-runner-modal');
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
    
    vwt_activeRunnerIdInModal = null;
}

/**
 * Closes a runner, either from the modal view or the minimize bar.
 */
function vwt_closeLiveRunner(fromModalOrRunnerId) {
    const runnerId = fromModalOrRunnerId === true ? vwt_activeRunnerIdInModal : fromModalOrRunnerId;
    if (!runnerId) {
        const modal = document.getElementById('vwt-live-runner-modal');
        if (modal) modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
        return;
    }

    const runner = activeTestRunners.get(runnerId);
    if (!runner) return;

    runner.iframe.remove(); 
    activeTestRunners.delete(runnerId);
    vwt_removeTestFromMinimizeBar(runnerId);

    if (vwt_activeRunnerIdInModal === runnerId) {
        const modal = document.getElementById('vwt-live-runner-modal');
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
        vwt_activeRunnerIdInModal = null;
    }
}

/**
 * The core test execution logic for a given runner.
 */
async function vwt_runLiveTestFromRunner(runnerId) {
    if (!runnerId) runnerId = vwt_activeRunnerIdInModal;
    const runner = activeTestRunners.get(runnerId);
    if (!runner || runner.isExecuting) return;

    runner.isExecuting = true;
    runner.status = 'RUNNING';
    vwt_updateMinimizeBarItem(runnerId);
    
    const runnerLog = (message) => {
        const timestampedMessage = `[${new Date().toLocaleTimeString()}] ${message}`;
        runner.log.push(timestampedMessage);
        if (vwt_activeRunnerIdInModal === runnerId) {
            const logArea = document.getElementById('vwt-runner-logs');
            logArea.value += timestampedMessage + '\n';
            logArea.scrollTop = logArea.scrollHeight;
        }
    };

    if (vwt_activeRunnerIdInModal === runnerId) {
        const rerunButton = document.getElementById('vwt-runner-rerun-btn');
        rerunButton.disabled = true;
        rerunButton.innerHTML = `<div class="spinner mr-2"></div> Running...`;
        document.getElementById('vwt-runner-logs').value = '';
    }
    runner.log.length = 0;

    runnerLog("--- Starting Live Test Run ---");
    
    try {
        const htmlContent = vwt_buildWebsiteHTML({
            html: runner.suite.website_html_content,
            css: runner.suite.website_css_contents || [],
            js: runner.suite.website_js_contents || []
        });

        if (!htmlContent) throw new Error("Could not build website HTML.");
        
        runner.iframe.srcdoc = htmlContent;
        runnerLog("Website loaded into isolated sandbox.");

        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Iframe load timed out")), 5000);
            runner.iframe.onload = () => { clearTimeout(timer); resolve(); };
        });

        runnerLog("Sandbox ready. Starting test steps...");
        const iframeWin = runner.iframe.contentWindow;

        for (let i = 0; i < runner.steps.length; i++) {
            const step = runner.steps[i];
            const stepConfig = vwt_availableSteps.find(s => s.name === step.name);
            runnerLog(`[Step ${i + 1}/${runner.steps.length}] Running: ${step.name}`);
            
            if (vwt_activeRunnerIdInModal === runnerId) {
                const canvas = document.getElementById('vwt-runner-canvas');
                canvas.querySelectorAll('.aero-card').forEach(el => 
                    el.classList.toggle('border-blue-700', el.dataset.index == i)
                );
                await new Promise(r => setTimeout(r, 300));
            }
            
            await stepConfig.execute(step.params, iframeWin, runnerLog);
        }
        
        runnerLog("--- Test Run Finished Successfully ---");
        runner.status = 'SUCCESS';

    } catch (error) {
        runnerLog(`--- ERROR ---`);
        runnerLog(error.message);
        runnerLog("--- Test Run Aborted ---");
        runner.status = 'FAILURE';
    } finally {
        runner.isExecuting = false;
        vwt_updateMinimizeBarItem(runnerId);
        if (vwt_activeRunnerIdInModal === runnerId) {
            const rerunButton = document.getElementById('vwt-runner-rerun-btn');
            rerunButton.disabled = false;
            rerunButton.textContent = '▶ Re-run Test';
            const canvas = document.getElementById('vwt-runner-canvas');
            canvas.querySelectorAll('.aero-card').forEach(el => el.classList.remove('border-blue-700'));
        }
    }
}

// --- Runner UI Helpers ---

function vwt_renderRunnerCanvas(steps) {
    const canvas = document.getElementById('vwt-runner-canvas');
    canvas.innerHTML = steps.length === 0 ? `<div class="text-center aero-text-muted p-8">No steps defined.</div>` : '';
    steps.forEach((step, index) => {
        const stepConfig = vwt_availableSteps.find(s => s.name === step.name);
        if (!stepConfig) return;
        const stepEl = document.createElement('div');
        stepEl.className = `aero-card p-3 rounded border-l-4 border-blue-400 opacity-80`; 
        stepEl.dataset.index = index;
        stepEl.innerHTML = `<div><span class="font-bold">${stepConfig.icon} ${index + 1}. ${step.name}</span></div>
            <div class="text-xs aero-text-muted mt-1">
            ${Object.entries(step.params).map(([key, value]) => `<strong>${key}:</strong> ${vwt_escapeHtml(String(value)).substring(0, 30)}`).join(' | ')}
            </div>`;
        canvas.appendChild(stepEl);
    });
}

// ============================================
// MINIMIZE BAR FUNCTIONS (REFACTORED FOR MULTIPLE ITEMS)
// ============================================

function vwt_addTestToMinimizeBar(runnerId) {
    const runner = activeTestRunners.get(runnerId);
    if (!runner) return;
    
    const container = document.getElementById('minimize-bar-items-container');
    const bar = document.getElementById('minimize-bar');

    const item = document.createElement('div');
    item.className = 'minimized-test-item';
    item.id = `minimized-test-${runnerId}`;
    
    item.onclick = (e) => {
        if (e.target.closest('.close-btn')) return;
        vwt_maximizeLiveRunner(runnerId);
    };
    
    item.innerHTML = `
        <div class="spinner mr-2"></div>
        <span class="font-semibold">${vwt_escapeHtml(runner.suite.name)}</span>
        <button class="close-btn" title="Close Test" onclick="event.stopPropagation(); vwt_closeLiveRunner('${runnerId}')">
            &times;
        </button>
    `;

    container.appendChild(item);
    bar.classList.remove('hidden');
    document.body.style.paddingBottom = '4rem';
}

function vwt_removeTestFromMinimizeBar(runnerId) {
    const item = document.getElementById(`minimized-test-${runnerId}`);
    if (item) item.remove();

    const container = document.getElementById('minimize-bar-items-container');
    if (container.children.length === 0) {
        document.getElementById('minimize-bar').classList.add('hidden');
        document.body.style.paddingBottom = '0';
    }
}

function vwt_updateMinimizeBarItem(runnerId) {
    const runner = activeTestRunners.get(runnerId);
    if (!runner) return;

    const item = document.getElementById(`minimized-test-${runnerId}`);
    if (!item) return;

    item.classList.remove('status-success', 'status-failure');
    const spinner = item.querySelector('.spinner');

    if (runner.status === 'SUCCESS') {
        item.classList.add('status-success');
        if(spinner) spinner.style.display = 'none';
    } else if (runner.status === 'FAILURE') {
        item.classList.add('status-failure');
        if(spinner) spinner.style.display = 'none';
    } else { 
        if(spinner) spinner.style.display = 'inline-block';
    }
}

function vwt_initializeMinimizeBarScroll() {
    const wrapper = document.getElementById('minimize-bar-items-wrapper');
    const leftBtn = document.getElementById('minimize-bar-toggle-left');
    const rightBtn = document.getElementById('minimize-bar-toggle-right');
    if (!wrapper || !leftBtn || !rightBtn) return;
    const scrollAmount = 200;
    leftBtn.addEventListener('click', () => wrapper.scrollBy({ left: -scrollAmount, behavior: 'smooth' }));
    rightBtn.addEventListener('click', () => wrapper.scrollBy({ left: scrollAmount, behavior: 'smooth' }));
}
document.addEventListener('DOMContentLoaded', vwt_initializeMinimizeBarScroll);

// Make the entry point function globally accessible
window.vwt_openLiveRunner = vwt_openLiveRunner;
