// ============================================
        // EXECUTION ENGINE
        // ============================================
        
        let pyodideInstance = null;
        let pyodideLoading = false;
        let robotFrameworkInstalled = false;
        let executionConfig = null;

        async function initializePyodide() {
            if (pyodideInstance) return pyodideInstance;
            if (pyodideLoading) {
                // Wait for existing load
                while (pyodideLoading) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                return pyodideInstance;
            }

            pyodideLoading = true;
            try {
                console.log("Loading Pyodide...");
                pyodideInstance = await loadPyodide({
                    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
                });
                console.log("Pyodide loaded successfully");
                pyodideLoading = false;
                return pyodideInstance;
            } catch (error) {
                pyodideLoading = false;
                console.error("Failed to load Pyodide:", error);
                throw error;
            }
        }

        async function installRobotFramework() {
            if (robotFrameworkInstalled) return true;
            
            try {
                const pyodide = await initializePyodide();
                
                showMessage('Installing Robot Framework... This may take 10-15 seconds', 'info');
                
                // Install Robot Framework via micropip
                await pyodide.loadPackage('micropip');
                const micropip = pyodide.pyimport('micropip');
                await micropip.install('robotframework');
                
                // Create custom BrowserLibrary for DOM automation
                await pyodide.runPythonAsync(`
from robot.api.deco import keyword, library
import js
from js import document, window, console

@library(scope='GLOBAL')
class BrowserLibrary:
    """Custom Robot Framework library for browser automation using native DOM APIs.
    
    This library provides browser automation capabilities that work entirely in the browser
    without requiring Selenium or external drivers. It is enhanced to work with iframes.
    """
    
    ROBOT_LIBRARY_SCOPE = 'GLOBAL'
    ROBOT_LIBRARY_VERSION = '1.1.0'

    def _get_target_document_and_window(self):
        """Helper to get the document and window of the test iframe, or the main ones."""
        iframe = document.getElementById('test-website-iframe')
        if iframe and iframe.contentWindow and iframe.contentWindow.document:
            return iframe.contentWindow.document, iframe.contentWindow
        return document, window
    
    @keyword('Click Element')
    def click_element(self, selector):
        """Click an element identified by CSS selector."""
        target_doc, _ = self._get_target_document_and_window()
        element = target_doc.querySelector(selector)
        if not element:
            raise AssertionError(f"Element not found: {selector}")
        element.click()
        console.log(f"Clicked element: {selector}")
    
    @keyword('Input Text')
    def input_text(self, selector, text):
        """Input text into an element identified by CSS selector."""
        target_doc, _ = self._get_target_document_and_window()
        element = target_doc.querySelector(selector)
        if not element:
            raise AssertionError(f"Element not found: {selector}")
        element.value = text
        # Trigger input event for frameworks like React/Vue
        event = js.Event.new('input', {'bubbles': True})
        element.dispatchEvent(event)
        console.log(f"Input text into {selector}: {text}")
    
    @keyword('Element Should Be Visible')
    def element_should_be_visible(self, selector):
        """Verify that element is visible on the page."""
        target_doc, target_window = self._get_target_document_and_window()
        element = target_doc.querySelector(selector)
        if not element:
            raise AssertionError(f"Element not found: {selector}")
        
        style = target_window.getComputedStyle(element)
        if style.display == 'none' or style.visibility == 'hidden':
            raise AssertionError(f"Element is not visible: {selector}")
        console.log(f"Element is visible: {selector}")
    
    @keyword('Element Should Contain')
    def element_should_contain(self, selector, text):
        """Verify that element contains expected text."""
        target_doc, _ = self._get_target_document_and_window()
        element = target_doc.querySelector(selector)
        if not element:
            raise AssertionError(f"Element not found: {selector}")
        
        if text not in element.textContent:
            raise AssertionError(f"Element '{selector}' does not contain '{text}'. Actual: {element.textContent}")
        console.log(f"Element {selector} contains: {text}")
    
    @keyword('Get Text')
    def get_text(self, selector):
        """Get text content of an element."""
        target_doc, _ = self._get_target_document_and_window()
        element = target_doc.querySelector(selector)
        if not element:
            raise AssertionError(f"Element not found: {selector}")
        return element.textContent
    
    @keyword('Get Value')
    def get_value(self, selector):
        """Get value of an input element."""
        target_doc, _ = self._get_target_document_and_window()
        element = target_doc.querySelector(selector)
        if not element:
            raise AssertionError(f"Element not found: {selector}")
        return element.value
    
    @keyword('Page Should Contain')
    def page_should_contain(self, text):
        """Verify that page contains expected text."""
        target_doc, _ = self._get_target_document_and_window()
        if text not in target_doc.body.textContent:
            raise AssertionError(f"Page does not contain: {text}")
        console.log(f"Page contains: {text}")
    
    @keyword('Element Should Exist')
    def element_should_exist(self, selector):
        """Verify that element exists on the page."""
        target_doc, _ = self._get_target_document_and_window()
        element = target_doc.querySelector(selector)
        if not element:
            raise AssertionError(f"Element does not exist: {selector}")
        console.log(f"Element exists: {selector}")
    
    @keyword('Wait For Element')
    def wait_for_element(self, selector, timeout=5):
        """Wait for element to appear on the page."""
        import time
        start_time = time.time()
        timeout = float(timeout)
        target_doc, _ = self._get_target_document_and_window()
        
        while time.time() - start_time < timeout:
            element = target_doc.querySelector(selector)
            if element:
                console.log(f"Element found: {selector}")
                return
            time.sleep(0.1)
        
        raise AssertionError(f"Element not found after {timeout}s: {selector}")
    
    @keyword('Select From List')
    def select_from_list(self, selector, value):
        """Select option from dropdown list."""
        target_doc, _ = self._get_target_document_and_window()
        element = target_doc.querySelector(selector)
        if not element:
            raise AssertionError(f"Element not found: {selector}")
        
        element.value = value
        event = js.Event.new('change', {'bubbles': True})
        element.dispatchEvent(event)
        console.log(f"Selected '{value}' from {selector}")
    
    @keyword('Check Checkbox')
    def check_checkbox(self, selector):
        """Check a checkbox."""
        target_doc, _ = self._get_target_document_and_window()
        element = target_doc.querySelector(selector)
        if not element:
            raise AssertionError(f"Element not found: {selector}")
        element.checked = True
        event = js.Event.new('change', {'bubbles': True})
        element.dispatchEvent(event)
        console.log(f"Checked checkbox: {selector}")
    
    @keyword('Uncheck Checkbox')
    def uncheck_checkbox(self, selector):
        """Uncheck a checkbox."""
        target_doc, _ = self._get_target_document_and_window()
        element = target_doc.querySelector(selector)
        if not element:
            raise AssertionError(f"Element not found: {selector}")
        element.checked = False
        event = js.Event.new('change', {'bubbles': True})
        element.dispatchEvent(event)
        console.log(f"Unchecked checkbox: {selector}")
    
    @keyword('Get Element Count')
    def get_element_count(self, selector):
        """Get count of elements matching selector."""
        target_doc, _ = self._get_target_document_and_window()
        elements = target_doc.querySelectorAll(selector)
        return len(elements)
    
    @keyword('Execute JavaScript')
    def execute_javascript(self, script):
        """Execute JavaScript code in the context of the iframe or main window."""
        _, target_window = self._get_target_document_and_window()
        return target_window.eval(script)
`);
                
                robotFrameworkInstalled = true;
                showMessage('Robot Framework + BrowserLibrary installed successfully!', 'success');
                return true;
            } catch (error) {
                console.error('Failed to install Robot Framework:', error);
                showMessage('Failed to install Robot Framework: ' + error.message, 'error');
                throw error;
            }
        }

        async function executePythonCode(code, inputFiles) {
            try {
                const pyodide = await initializePyodide();
                
                // Get Python's current working directory and write files there
                const cwd = pyodide.runPython('import os; os.getcwd()');
                
                // Create a virtual filesystem with input files in the working directory
                for (const file of inputFiles) {
                    const filePath = `${cwd}/${file.filename}`;
                    pyodide.FS.writeFile(filePath, file.content);
                }
                
                // Capture stdout
                let output = '';
                pyodide.runPython(`
import sys
from io import StringIO
sys.stdout = StringIO()
sys.stderr = StringIO()
`);
                
                // Run the code
                try {
                    await pyodide.runPythonAsync(code);
                    
                    // Get output
                    output = pyodide.runPython(`
stdout_value = sys.stdout.getvalue()
stderr_value = sys.stderr.getvalue()
stdout_value + stderr_value
`);
                } catch (execError) {
                    output = pyodide.runPython(`sys.stderr.getvalue()`) || execError.message;
                    throw new Error(output);
                }
                
                return {
                    success: true,
                    output: output,
                    error: null
                };
                
            } catch (error) {
                return {
                    success: false,
                    output: error.output || '',
                    error: error.message
                };
            }
        }

        async function executeRobotFrameworkBrowser(code) {
            if (!robotFrameworkInstalled) {
                await installRobotFramework();
            }
            
            try {
                const pyodide = await initializePyodide();
                
                // Create a temporary robot file in Pyodide's virtual filesystem
                const tempFileName = 'test_suite.robot';
                
                await pyodide.runPythonAsync(`
import sys
from io import StringIO
from robot import run

# Setup output capture
sys.stdout = StringIO()
sys.stderr = StringIO()

# Write robot file
with open('${tempFileName}', 'w') as f:
    f.write("""${code.replace(/"/g, '\\"').replace(/\n/g, '\\n')}""")

# Run robot tests with BrowserLibrary available
try:
    # Register BrowserLibrary
    from robot.libraries import STDLIBS
    # Note: BrowserLibrary is already defined globally from installation
    
    result = run('${tempFileName}', outputdir='NONE', output='NONE', log='NONE', report='NONE')
    output = sys.stdout.getvalue()
    error = sys.stderr.getvalue()
    success = (result == 0)
except Exception as e:
    output = sys.stdout.getvalue()
    error = str(e) + "\\n" + sys.stderr.getvalue()
    success = False
    result = -1
                `);
                
                const success = await pyodide.runPythonAsync('success');
                const output = await pyodide.runPythonAsync('output');
                const error = await pyodide.runPythonAsync('error');
                const exitCode = await pyodide.runPythonAsync('result');
                
                return {
                    success: success,
                    output: output || '(Robot Framework execution completed)',
                    error: error || null,
                    exitCode: exitCode
                };
            } catch (error) {
                return {
                    success: false,
                    output: null,
                    error: error.message,
                    exitCode: -1
                };
            }
        }

        async function executeRobotFrameworkBackend(code) {
            const backendUrl = executionConfig.robotBackendUrl || 'http://localhost:5000';
            
            try {
                const response = await fetch(`${backendUrl}/execute`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ code: code })
                });

                const result = await response.json();
                
                return {
                    success: result.success || false,
                    output: result.output || '',
                    error: result.error || null,
                    exitCode: result.exitCode || -1
                };
            } catch (error) {
                return {
                    success: false,
                    output: '',
                    error: `Failed to connect to backend server: ${error.message}`,
                    exitCode: -1
                };
            }
        }

        async function executeRobotFrameworkApi(code) {
            const apiUrl = executionConfig.robotApiUrl;
            
            if (!apiUrl) {
                return {
                    success: false,
                    output: '',
                    error: 'Robot Framework API URL not configured',
                    exitCode: -1
                };
            }
            
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ code: code })
                });

                const result = await response.json();
                
                return {
                    success: result.success || false,
                    output: result.output || '',
                    error: result.error || null,
                    exitCode: result.exitCode || -1
                };
            } catch (error) {
                return {
                    success: false,
                    output: '',
                    error: `API request failed: ${error.message}`,
                    exitCode: -1
                };
            }
        }

        async function executeJavaCode(code, inputFiles) {
            if (!executionConfig.javaType || executionConfig.javaType === 'jdoodle') {
                if (!executionConfig.jdoodleClientId || !executionConfig.jdoodleClientSecret) {
                    throw new Error("JDoodle API credentials not configured. Please go to Execution Settings.");
                }
                
                return await executeViaJDoodle('java', code, inputFiles);
            } else {
                throw new Error("Local Java execution requires a backend server. This feature is not yet implemented.");
            }
        }

        async function executeCSharpCode(code, inputFiles) {
            if (!executionConfig.csharpType || executionConfig.csharpType === 'jdoodle') {
                if (!executionConfig.jdoodleClientId || !executionConfig.jdoodleClientSecret) {
                    throw new Error("JDoodle API credentials not configured. Please go to Execution Settings.");
                }
                
                return await executeViaJDoodle('csharp', code, inputFiles);
            } else {
                throw new Error("Local C# execution requires a backend server. This feature is not yet implemented.");
            }
        }

        async function executeViaJDoodle(language, code, inputFiles) {
            // Prepare stdin (concatenate all input files)
            const stdin = inputFiles.map(f => f.content).join('\n');
            
            const payload = {
                clientId: executionConfig.jdoodleClientId,
                clientSecret: executionConfig.jdoodleClientSecret,
                script: code,
                stdin: stdin,
                language: language === 'java' ? 'java' : 'csharp',
                versionIndex: "0"
            };

            try {
                const response = await fetch('https://api.jdoodle.com/v1/execute', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();
                
                if (result.error) {
                    return {
                        success: false,
                        output: result.output || '',
                        error: result.error
                    };
                }

                return {
                    success: !result.statusCode || result.statusCode === 200,
                    output: result.output || '',
                    error: result.statusCode && result.statusCode !== 200 ? `Exit code: ${result.statusCode}` : null
                };
            } catch (error) {
                return {
                    success: false,
                    output: '',
                    error: error.message
                };
            }
        }

        function loadExecutionConfig() {
            const saved = localStorage.getItem('execution_config');
            if (saved) {
                executionConfig = JSON.parse(saved);
            } else {
                executionConfig = {
                    mode: 'real',
                    javaType: 'jdoodle',
                    csharpType: 'jdoodle',
                    jdoodleClientId: '',
                    jdoodleClientSecret: '',
                    robotType: 'browser',
                    robotBackendUrl: 'http://localhost:5000',
                    robotApiUrl: ''
                };
            }
            updateExecutionDisplay();
        }

        function updateExecutionDisplay() {
            const modeText = executionConfig.mode === 'real' ? 'Real Execution' : 'Simulated';
            const modeClass = executionConfig.mode === 'real' ? 'text-green-400' : 'text-yellow-400';
            document.getElementById('exec-mode-display').innerHTML = `<span class="${modeClass}">${modeText}</span>`;
        }

        function openExecutionSettingsModal() {
            // Safely set radio buttons with null checks
            const execModeRadio = document.querySelector(`input[name="execution-mode"][value="${executionConfig.mode}"]`);
            if (execModeRadio) execModeRadio.checked = true;
            
            const javaTypeRadio = document.querySelector(`input[name="java-execution-type"][value="${executionConfig.javaType}"]`);
            if (javaTypeRadio) javaTypeRadio.checked = true;
            
            const csharpTypeRadio = document.querySelector(`input[name="csharp-execution-type"][value="${executionConfig.csharpType}"]`);
            if (csharpTypeRadio) csharpTypeRadio.checked = true;
            
            const robotTypeRadio = document.querySelector(`input[name="robot-execution-type"][value="${executionConfig.robotType}"]`);
            if (robotTypeRadio) robotTypeRadio.checked = true;
            
            const jdoodleClientId = document.getElementById('jdoodle-client-id');
            if (jdoodleClientId) jdoodleClientId.value = executionConfig.jdoodleClientId || '';
            
            const jdoodleClientSecret = document.getElementById('jdoodle-client-secret');
            if (jdoodleClientSecret) jdoodleClientSecret.value = executionConfig.jdoodleClientSecret || '';
            
            const robotBackendUrl = document.getElementById('robot-backend-url');
            if (robotBackendUrl) robotBackendUrl.value = executionConfig.robotBackendUrl || 'http://localhost:5000';
            
            const robotApiUrl = document.getElementById('robot-api-url');
            if (robotApiUrl) robotApiUrl.value = executionConfig.robotApiUrl || '';
            
            // Setup Robot Framework radio button handlers
            document.querySelectorAll('input[name="robot-execution-type"]').forEach(radio => {
                radio.addEventListener('change', function() {
                    const browserConfig = document.getElementById('robot-browser-config');
                    const backendConfig = document.getElementById('robot-backend-config');
                    const apiConfig = document.getElementById('robot-api-config');
                    
                    if (!browserConfig || !backendConfig || !apiConfig) return;
                    
                    if (this.value === 'browser') {
                        browserConfig.classList.remove('hidden');
                        backendConfig.classList.add('hidden');
                        apiConfig.classList.add('hidden');
                    } else if (this.value === 'backend') {
                        browserConfig.classList.add('hidden');
                        backendConfig.classList.remove('hidden');
                        apiConfig.classList.add('hidden');
                    } else {
                        browserConfig.classList.add('hidden');
                        backendConfig.classList.add('hidden');
                        apiConfig.classList.remove('hidden');
                    }
                });
            });
            
            // Trigger initial state
            const selectedRobotRadio = document.querySelector('input[name="robot-execution-type"]:checked');
            if (selectedRobotRadio) {
                const selectedRobot = selectedRobotRadio.value;
                const browserConfig = document.getElementById('robot-browser-config');
                const backendConfig = document.getElementById('robot-backend-config');
                const apiConfig = document.getElementById('robot-api-config');
                
                if (browserConfig && backendConfig && apiConfig) {
                    if (selectedRobot === 'browser') {
                        browserConfig.classList.remove('hidden');
                        backendConfig.classList.add('hidden');
                        apiConfig.classList.add('hidden');
                    } else if (selectedRobot === 'backend') {
                        browserConfig.classList.add('hidden');
                        backendConfig.classList.remove('hidden');
                        apiConfig.classList.add('hidden');
                    } else {
                        browserConfig.classList.add('hidden');
                        backendConfig.classList.add('hidden');
                        apiConfig.classList.remove('hidden');
                    }
                }
            }
            
            document.getElementById('execution-settings-modal').classList.remove('hidden');
        }

        function closeExecutionSettingsModal() {
            document.getElementById('execution-settings-modal').classList.add('hidden');
        }

        function saveExecutionSettings() {
            const execModeRadio = document.querySelector('input[name="execution-mode"]:checked');
            const javaTypeRadio = document.querySelector('input[name="java-execution-type"]:checked');
            const csharpTypeRadio = document.querySelector('input[name="csharp-execution-type"]:checked');
            const robotTypeRadio = document.querySelector('input[name="robot-execution-type"]:checked');
            
            if (execModeRadio) executionConfig.mode = execModeRadio.value;
            if (javaTypeRadio) executionConfig.javaType = javaTypeRadio.value;
            if (csharpTypeRadio) executionConfig.csharpType = csharpTypeRadio.value;
            if (robotTypeRadio) executionConfig.robotType = robotTypeRadio.value;
            
            const jdoodleClientId = document.getElementById('jdoodle-client-id');
            const jdoodleClientSecret = document.getElementById('jdoodle-client-secret');
            const robotBackendUrl = document.getElementById('robot-backend-url');
            const robotApiUrl = document.getElementById('robot-api-url');
            
            if (jdoodleClientId) executionConfig.jdoodleClientId = jdoodleClientId.value;
            if (jdoodleClientSecret) executionConfig.jdoodleClientSecret = jdoodleClientSecret.value;
            if (robotBackendUrl) executionConfig.robotBackendUrl = robotBackendUrl.value;
            if (robotApiUrl) executionConfig.robotApiUrl = robotApiUrl.value;
            
            localStorage.setItem('execution_config', JSON.stringify(executionConfig));
            updateExecutionDisplay();
            closeExecutionSettingsModal();
            showMessage("Execution settings saved", 'success');
        }

        // ============================================
        // STORAGE ABSTRACTION LAYER
        // ============================================
        
        let currentStorage = null;
        let storageConfig = null;
        
        // Storage Interface - all backends must implement these methods
        class StorageBackend {
            async initialize() { throw new Error("Not implemented"); }
            async getAllSuites() { throw new Error("Not implemented"); }
            async saveSuite(suite) { throw new Error("Not implemented"); }
            async updateSuite(id, suite) { throw new Error("Not implemented"); }
            async deleteSuite(id) { throw new Error("Not implemented"); }
            async subscribeToChanges(callback) { /* Optional */ }
            getStatusMessage() { return "Connected"; }
        }

        // ============================================
        // LOCAL STORAGE BACKEND
        // ============================================
        
        class LocalStorageBackend extends StorageBackend {
            constructor() {
                super();
                this.STORAGE_KEY = 'pipeline_test_suites';
                this.changeListeners = [];
            }

            async initialize() {
                if (!window.localStorage) {
                    throw new Error("localStorage is not available in this browser");
                }
                return true;
            }

            async getAllSuites() {
                const data = localStorage.getItem(this.STORAGE_KEY);
                return data ? JSON.parse(data) : [];
            }

            async saveSuite(suite) {
                const suites = await this.getAllSuites();
                suite.id = suite.id || this._generateId();
                suite.last_run_time = suite.last_run_time || null;
                suite.last_run_status = suite.last_run_status || 'NEVER_RUN';
                suite.last_run_log = suite.last_run_log || '';
                suites.push(suite);
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(suites));
                this._notifyListeners();
                return suite.id;
            }

            async updateSuite(id, updates) {
                const suites = await this.getAllSuites();
                const index = suites.findIndex(s => s.id === id);
                if (index !== -1) {
                    suites[index] = { ...suites[index], ...updates };
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(suites));
                    this._notifyListeners();
                }
            }

            async deleteSuite(id) {
                const suites = await this.getAllSuites();
                const filtered = suites.filter(s => s.id !== id);
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
                this._notifyListeners();
            }

            async subscribeToChanges(callback) {
                this.changeListeners.push(callback);
                const suites = await this.getAllSuites();
                callback(suites);
            }

            _notifyListeners() {
                const suites = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
                this.changeListeners.forEach(cb => cb(suites));
            }

            _generateId() {
                return 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }

            getStatusMessage() {
                return `Connected: Local Storage (Browser Only)`;
            }
        }

        // ============================================
        // FIREBASE BACKEND
        // ============================================
        
        class FirebaseBackend extends StorageBackend {
            constructor(config) {
                super();
                this.config = config;
                this.app = null;
                this.db = null;
                this.auth = null;
                this.userId = null;
                this.unsubscribe = null;
            }

            async initialize() {
                try {
                    if (!window.firebaseModules) {
                        throw new Error("Firebase modules not loaded");
                    }

                    const { initializeApp, getFirestore, getAuth, signInAnonymously, onAuthStateChanged } = window.firebaseModules;
                    
                    this.app = initializeApp(this.config);
                    this.db = getFirestore(this.app);
                    this.auth = getAuth(this.app);

                    await signInAnonymously(this.auth);
                    
                    return new Promise((resolve, reject) => {
                        onAuthStateChanged(this.auth, (user) => {
                            if (user) {
                                this.userId = user.uid;
                                resolve(true);
                            } else {
                                reject(new Error("Authentication failed"));
                            }
                        });
                    });
                } catch (error) {
                    console.error("Firebase initialization error:", error);
                    throw error;
                }
            }

            async getAllSuites() {
                return [];
            }

            async saveSuite(suite) {
                const { collection, addDoc } = window.firebaseModules;
                suite.userId = this.userId;
                suite.last_run_time = suite.last_run_time || null;
                suite.last_run_status = suite.last_run_status || 'NEVER_RUN';
                suite.last_run_log = suite.last_run_log || '';
                
                const docRef = await addDoc(collection(this.db, 'test_suites'), suite);
                return docRef.id;
            }

            async updateSuite(id, updates) {
                const { doc, updateDoc } = window.firebaseModules;
                const docRef = doc(this.db, 'test_suites', id);
                await updateDoc(docRef, updates);
            }

            async deleteSuite(id) {
                const { doc, deleteDoc } = window.firebaseModules;
                const docRef = doc(this.db, 'test_suites', id);
                await deleteDoc(docRef);
            }

            async subscribeToChanges(callback) {
                const { collection, query, where, onSnapshot } = window.firebaseModules;
                const q = query(
                    collection(this.db, 'test_suites'),
                    where('userId', '==', this.userId)
                );
                
                this.unsubscribe = onSnapshot(q, (snapshot) => {
                    const suites = [];
                    snapshot.forEach((doc) => {
                        suites.push({ id: doc.id, ...doc.data() });
                    });
                    callback(suites);
                });
            }

            getStatusMessage() {
                return `Connected: Firebase (User: ${this.userId ? this.userId.substring(0, 8) + '...' : 'Unknown'})`;
            }
        }

        // ============================================
        // CUSTOM API BACKEND
        // ============================================
        
        class CustomApiBackend extends StorageBackend {
            constructor(config) {
                super();
                this.baseUrl = config.baseUrl;
                this.authHeader = config.authHeader;
                this.pollInterval = null;
            }

            async initialize() {
                try {
                    await this._fetch('GET', '');
                    return true;
                } catch (error) {
                    throw new Error(`Cannot connect to API: ${error.message}`);
                }
            }

            async getAllSuites() {
                const response = await this._fetch('GET', '');
                return response;
            }

            async saveSuite(suite) {
                suite.last_run_time = suite.last_run_time || null;
                suite.last_run_status = suite.last_run_status || 'NEVER_RUN';
                suite.last_run_log = suite.last_run_log || '';
                
                const response = await this._fetch('POST', '', suite);
                return response.id;
            }

            async updateSuite(id, updates) {
                await this._fetch('PUT', `/${id}`, updates);
            }

            async deleteSuite(id) {
                await this._fetch('DELETE', `/${id}`);
            }

            async subscribeToChanges(callback) {
                const poll = async () => {
                    try {
                        const suites = await this.getAllSuites();
                        callback(suites);
                    } catch (error) {
                        console.error("Polling error:", error);
                    }
                };
                
                await poll();
                this.pollInterval = setInterval(poll, 5000);
            }

            async _fetch(method, path, body = null) {
                const options = {
                    method,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                };

                if (this.authHeader) {
                    options.headers['Authorization'] = this.authHeader;
                }

                if (body) {
                    options.body = JSON.stringify(body);
                }

                const response = await fetch(this.baseUrl + path, options);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                if (method !== 'DELETE') {
                    return await response.json();
                }
            }

            getStatusMessage() {
                return `Connected: Custom API (${this.baseUrl})`;
            }
        }

        // ============================================
        // STORAGE MANAGER
        // ============================================
        
        async function initializeStorage() {
            try {
                const savedConfig = localStorage.getItem('storage_config');
                if (savedConfig) {
                    storageConfig = JSON.parse(savedConfig);
                } else {
                    storageConfig = { type: 'localStorage' };
                    localStorage.setItem('storage_config', JSON.stringify(storageConfig));
                }

                await connectToStorage(storageConfig);
                
            } catch (error) {
                console.error("Storage initialization error:", error);
                showMessage("Failed to initialize storage: " + error.message, 'error');
                document.getElementById('storage-info').textContent = "Storage initialization failed. Click Settings to configure.";
            }
        }

        async function connectToStorage(config) {
            try {
                switch (config.type) {
                    case 'localStorage':
                        currentStorage = new LocalStorageBackend();
                        break;
                    
                    case 'firebase':
                        if (!config.firebaseConfig) {
                            throw new Error("Firebase configuration is missing");
                        }
                        currentStorage = new FirebaseBackend(config.firebaseConfig);
                        break;
                    
                    case 'customApi':
                        if (!config.apiConfig) {
                            throw new Error("API configuration is missing");
                        }
                        currentStorage = new CustomApiBackend(config.apiConfig);
                        break;
                    
                    default:
                        throw new Error("Unknown storage type: " + config.type);
                }

                document.getElementById('storage-info').textContent = "Connecting to storage...";
                await currentStorage.initialize();
                await currentStorage.subscribeToChanges(renderTestSuites);
                document.getElementById('storage-info').textContent = currentStorage.getStatusMessage();
                showMessage("Storage connected successfully", 'success');
                
            } catch (error) {
                console.error("Storage connection error:", error);
                currentStorage = null;
                throw error;
            }
        }

        // ============================================
        // SETTINGS MODAL
        // ============================================
        
        function openSettingsModal() {
            if (storageConfig) {
                const storageTypeRadio = document.querySelector(`input[name="storage-type"][value="${storageConfig.type}"]`);
                if (storageTypeRadio) storageTypeRadio.checked = true;
                
                if (storageConfig.type === 'firebase' && storageConfig.firebaseConfig) {
                    const fc = storageConfig.firebaseConfig;
                    const fbApiKey = document.getElementById('firebase-api-key');
                    const fbAuthDomain = document.getElementById('firebase-auth-domain');
                    const fbProjectId = document.getElementById('firebase-project-id');
                    const fbStorageBucket = document.getElementById('firebase-storage-bucket');
                    
                    if (fbApiKey) fbApiKey.value = fc.apiKey || '';
                    if (fbAuthDomain) fbAuthDomain.value = fc.authDomain || '';
                    if (fbProjectId) fbProjectId.value = fc.projectId || '';
                    if (fbStorageBucket) fbStorageBucket.value = fc.storageBucket || '';
                }
                
                if (storageConfig.type === 'customApi' && storageConfig.apiConfig) {
                    const ac = storageConfig.apiConfig;
                    const apiBaseUrl = document.getElementById('api-base-url');
                    const apiAuthHeader = document.getElementById('api-auth-header');
                    
                    if (apiBaseUrl) apiBaseUrl.value = ac.baseUrl || '';
                    if (apiAuthHeader) apiAuthHeader.value = ac.authHeader || '';
                }
            }
            
            // Setup storage type radio handlers
            document.querySelectorAll('input[name="storage-type"]').forEach(radio => {
                radio.addEventListener('change', function() {
                    const firebaseConfig = document.getElementById('firebase-config');
                    const customApiConfig = document.getElementById('custom-api-config');
                    
                    if (!firebaseConfig || !customApiConfig) return;
                    
                    firebaseConfig.classList.add('hidden');
                    customApiConfig.classList.add('hidden');
                    
                    if (this.value === 'firebase') {
                        firebaseConfig.classList.remove('hidden');
                    } else if (this.value === 'customApi') {
                        customApiConfig.classList.remove('hidden');
                    }
                });
            });
            
            // Trigger initial state
            const selectedTypeRadio = document.querySelector('input[name="storage-type"]:checked');
            if (selectedTypeRadio) {
                const selectedType = selectedTypeRadio.value;
                const firebaseConfig = document.getElementById('firebase-config');
                const customApiConfig = document.getElementById('custom-api-config');
                
                if (firebaseConfig && customApiConfig) {
                    if (selectedType === 'firebase') {
                        firebaseConfig.classList.remove('hidden');
                    } else if (selectedType === 'customApi') {
                        customApiConfig.classList.remove('hidden');
                    }
                }
            }
            
            document.getElementById('settings-modal').classList.remove('hidden');
        }

        function closeSettingsModal() {
            document.getElementById('settings-modal').classList.add('hidden');
        }

        async function saveSettings() {
            const storageTypeRadio = document.querySelector('input[name="storage-type"]:checked');
            if (!storageTypeRadio) {
                showMessage("Please select a storage type", 'error');
                return;
            }
            
            const newConfig = {
                type: storageTypeRadio.value
            };
            
            if (newConfig.type === 'firebase') {
                const fbApiKey = document.getElementById('firebase-api-key');
                const fbAuthDomain = document.getElementById('firebase-auth-domain');
                const fbProjectId = document.getElementById('firebase-project-id');
                const fbStorageBucket = document.getElementById('firebase-storage-bucket');
                
                newConfig.firebaseConfig = {
                    apiKey: fbApiKey ? fbApiKey.value : '',
                    authDomain: fbAuthDomain ? fbAuthDomain.value : '',
                    projectId: fbProjectId ? fbProjectId.value : '',
                    storageBucket: fbStorageBucket ? fbStorageBucket.value : ''
                };
                
                if (!newConfig.firebaseConfig.apiKey || !newConfig.firebaseConfig.projectId) {
                    showMessage("Please fill in Firebase credentials", 'error');
                    return;
                }
            } else if (newConfig.type === 'customApi') {
                const apiBaseUrl = document.getElementById('custom-api-base-url');
                const apiAuthHeader = document.getElementById('custom-api-auth-header');
                
                newConfig.apiConfig = {
                    baseUrl: apiBaseUrl ? apiBaseUrl.value : '',
                    authHeader: apiAuthHeader ? apiAuthHeader.value : ''
                };
                
                if (!newConfig.apiConfig.baseUrl) {
                    showMessage("Please enter API base URL", 'error');
                    return;
                }
            }
            
            try {
                localStorage.setItem('storage_config', JSON.stringify(newConfig));
                storageConfig = newConfig;
                await connectToStorage(newConfig);
                closeSettingsModal();
            } catch (error) {
                showMessage("Failed to connect: " + error.message, 'error');
            }
        }

        // ============================================
        // TEST SUITE RENDERING
        // ============================================
        
        let testSuites = [];
        let editingSuiteId = null;
        
        // ============================================
        // VIEWS MANAGEMENT
        // ============================================
        
        let views = [];
        let currentViewId = null; // null means "All Views"
        
        function initializeViews() {
            try {
                const savedViews = localStorage.getItem('views');
                if (savedViews) {
                    views = JSON.parse(savedViews);
                } else {
                    views = []; // Start with no views, show all by default
                }
                renderViews();
            } catch (error) {
                console.error('Error initializing views:', error);
                views = [];
            }
        }
        
        function saveViewsToStorage() {
            localStorage.setItem('views', JSON.stringify(views));
        }
        
        function renderViews() {
            const viewsList = document.getElementById('views-list');
            if (!viewsList) return;
            
            viewsList.innerHTML = '';
            
            // "All Views" option
            const allViewsBtn = document.createElement('button');
            allViewsBtn.className = `w-full text-left p-3 rounded transition duration-200 ${
                currentViewId === null ? 'aero-button-primary' : 'aero-button hover:aero-button-primary'
            }`;
            allViewsBtn.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="font-semibold">📋 All Views</span>
                    <span class="text-xs aero-badge-info">${testSuites.length}</span>
                </div>
            `;
            allViewsBtn.onclick = () => switchView(null);
            viewsList.appendChild(allViewsBtn);
            
            // Individual views
            views.forEach(view => {
                const suitesInView = testSuites.filter(s => s.view_id === view.id);
                const viewBtn = document.createElement('div');
                viewBtn.className = `${
                    currentViewId === view.id ? 'aero-button-primary' : 'aero-button hover:aero-button-primary'
                } p-3 rounded transition duration-200 mb-2`;
                viewBtn.innerHTML = `
                    <div class="flex justify-between items-center cursor-pointer" onclick="switchView('${view.id}')">
                        <div class="flex-1">
                            <div class="font-semibold text-sm">${escapeHtml(view.name)}</div>
                            ${view.description ? `<div class="text-xs aero-text-muted mt-1">${escapeHtml(view.description)}</div>` : ''}
                        </div>
                        <span class="text-xs aero-badge-info ml-2">${suitesInView.length}</span>
                    </div>
                    <div class="flex gap-2 mt-2">
                        <button onclick="event.stopPropagation(); duplicateView('${view.id}')"
                            class="aero-button-purple text-xs py-1 px-2 rounded transition duration-200 flex-1"
                            title="Duplicate View">
                             Duplicate
                        </button>
                        <button onclick="event.stopPropagation(); deleteView('${view.id}')" 
                            class="aero-button-danger text-xs py-1 px-2 rounded transition duration-200 flex-1" 
                            title="Delete View">
                            🗑️ Delete
                        </button>
                    </div>
                `;
                viewsList.appendChild(viewBtn);
            });
        }
        
        function switchView(viewId) {
            currentViewId = viewId;
            renderViews();
            renderTestSuites(testSuites);
            
            // Update the current view name display
            const viewNameSpan = document.getElementById('current-view-name');
            if (viewNameSpan) {
                if (viewId === null) {
                    viewNameSpan.textContent = '';
                } else {
                    const view = views.find(v => v.id === viewId);
                    if (view) {
                        viewNameSpan.textContent = `(View: ${view.name})`;
                    }
                }
            }
        }
        
        function openAddViewModal() {
            const modal = document.getElementById('add-view-modal');
            if (!modal) return;
            
            modal.classList.remove('hidden');
            
            const nameInput = document.getElementById('view-name');
            if (nameInput) nameInput.value = '';
            
            const descInput = document.getElementById('view-description');
            if (descInput) descInput.value = '';
        }
        
        function closeAddViewModal() {
            const modal = document.getElementById('add-view-modal');
            if (modal) modal.classList.add('hidden');
        }
        
        function createView(event) {
            event.preventDefault();
            
            const nameEl = document.getElementById('view-name');
            const descEl = document.getElementById('view-description');
            
            if (!nameEl || !descEl) {
                showMessage('Form elements not found', 'error');
                return;
            }
            
            const name = nameEl.value.trim();
            const description = descEl.value.trim();
            
            if (!name) {
                showMessage('View name is required', 'error');
                return;
            }
            
            const newView = {
                id: 'view-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                name: name,
                description: description,
                created_at: new Date().toISOString()
            };
            
            views.push(newView);
            saveViewsToStorage();
            renderViews();
            closeAddViewModal();
            showMessage(`View "${name}" created`, 'success');
        }

        async function duplicateView(viewId) {
            const originalView = views.find(v => v.id === viewId);
            if (!originalView) {
                showMessage('Original view not found!', 'error');
                return;
            }

            const suitesInView = testSuites.filter(s => s.view_id === viewId);
            
            // 1. Ask the user if they want to duplicate the test suites as well.
            let confirmMessage = `Duplicate the view "${originalView.name}"?`;
            if (suitesInView.length > 0) {
                confirmMessage += `\n\nThis view contains ${suitesInView.length} test suite(s). Do you want to duplicate these test suites into the new view?`;
            }
            const shouldDuplicateSuites = confirm(confirmMessage);

            try {
                // 2. Create the new view object.
                const newViewId = 'view-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                const newView = {
                    ...originalView,
                    id: newViewId,
                    name: `${originalView.name} (Copy)`
                };

                // 3. Save the new view.
                views.push(newView);
                saveViewsToStorage();

                // 4. If confirmed, duplicate all test suites from the original view.
                if (shouldDuplicateSuites && suitesInView.length > 0) {
                    for (const originalSuite of suitesInView) {
                        // Create a copy of the suite object
                        const { id, ...suiteDataToCopy } = originalSuite;

                        // Append "(Copy)" to the name
                        suiteDataToCopy.name = `${originalSuite.name} (Copy)`;

                        // Assign the new suite to our new view
                        suiteDataToCopy.view_id = newViewId;

                        // Reset run history for the new copy
                        suiteDataToCopy.last_run_status = 'NEVER_RUN';
                        suiteDataToCopy.last_run_time = null;
                        suiteDataToCopy.last_run_log = '';
                        
                        // Save the new suite using the storage backend
                        await currentStorage.saveSuite(suiteDataToCopy);
                    }
                }
                
                // 5. Refresh the UI and show a success message.
                renderViews();
                let successMessage = `View "${originalView.name}" duplicated.`;
                if (shouldDuplicateSuites && suitesInView.length > 0) {
                    successMessage += ` Copied ${suitesInView.length} test suite(s).`;
                }
                showMessage(successMessage, 'success');

            } catch (error) {
                console.error("View duplication error:", error);
                showMessage("Failed to duplicate view: " + error.message, 'error');
            }
        }
        
        function deleteView(viewId) {
            const view = views.find(v => v.id === viewId);
            if (!view) return;
            
            // Count suites in this view
            const suitesInView = testSuites.filter(s => s.view_id === viewId);
            
            let confirmMsg = `Delete view "${view.name}"?`;
            if (suitesInView.length > 0) {
                confirmMsg += `\n\nThis view contains ${suitesInView.length} test suite(s). They will be moved to "All Views" (unassigned).`;
            }
            
            if (!confirm(confirmMsg)) {
                return;
            }
            
            // Remove view
            views = views.filter(v => v.id !== viewId);
            saveViewsToStorage();
            
            // If this was the current view, switch to All Views
            if (currentViewId === viewId) {
                currentViewId = null;
            }
            
            // Unassign suites from this view
            if (suitesInView.length > 0) {
                suitesInView.forEach(async suite => {
                    try {
                        await currentStorage.updateSuite(suite.id, { view_id: null });
                    } catch (error) {
                        console.error('Error updating suite:', error);
                    }
                });
            }
            
            renderViews();
            renderTestSuites(testSuites);
            showMessage(`View "${view.name}" deleted`, 'success');
        }
        
        function populateViewSelectOptions() {
            const select = document.getElementById('suite_view');
            if (!select) return;
            
            // Clear existing options except the first one
            select.innerHTML = '<option value="">All Views (Default)</option>';
            
            // Add view options
            views.forEach(view => {
                const option = document.createElement('option');
                option.value = view.id;
                option.textContent = view.name;
                select.appendChild(option);
            });
        }

        function renderTestSuites(suites) {
            testSuites = suites;
            
            // Filter by current view
            let filteredSuites = suites;
            if (currentViewId !== null) {
                filteredSuites = suites.filter(s => s.view_id === currentViewId);
            }
            
            const container = document.getElementById('test-suites');
            if (!container) return;  // Guard clause if container doesn't exist
            
            const loadingMsg = document.getElementById('loading-message');
            if (loadingMsg) loadingMsg.remove();
            
            if (filteredSuites.length === 0) {
                container.innerHTML = `<p class="aero-text-muted text-center py-8">No test suites found${currentViewId ? ' in this view' : ''}. Click "Add New Test Suite" to get started.</p>`;
                return;
            }
            
            // Update views panel counts
            renderViews();
            
            container.innerHTML = filteredSuites.map(suite => {
                const statusBadge = suite.last_run_status === 'SUCCESS' ? 'aero-badge-success' : 
                                  suite.last_run_status === 'FAILURE' ? 'aero-badge-error' : '';
                const isWebsite = suite.language === 'website';
                
                // *** MODIFICATION ***
                // Check if it's a Visual Web Test (website + upload)
                const isVisualWebTest = isWebsite && suite.website_method === 'upload';
                
                const languageDisplay = isVisualWebTest ? '✨ VISUAL WEB' : 
                                       isWebsite ? '🌐 WEBSITE (URL)' : 
                                       suite.language.toUpperCase();
                                       
                const cardBorderColor = isVisualWebTest ? 'border-purple-500' : 'border-blue-500';
                
                return `
                    <div class="aero-card p-6 border-l-4 ${cardBorderColor}">
                        <div class="flex justify-between items-start mb-3">
                            <div class="flex-1">
                                <h3 class="text-xl font-bold aero-text-primary mb-2">${escapeHtml(suite.name)}</h3>
                                <p class="aero-text-muted text-sm">${escapeHtml(suite.description || 'No description')}</p>
                                ${isWebsite && suite.website_method === 'url' ? `
                                    <p class="text-xs aero-text-muted mt-1">🔗 ${escapeHtml(suite.website_url || 'No URL')}</p>
                                ` : ''}
                                ${isVisualWebTest ? `
                                    <p class="text-xs aero-text-success mt-1">📁 Uploaded site files</p>
                                ` : ''}
                            </div>
                            <div class="flex flex-col items-end space-y-2">
                                <span class="aero-badge-info">
                                    ${languageDisplay}
                                </span>
                                ${suite.last_run_status && suite.last_run_status !== 'NEVER_RUN' ? `
                                    <span class="${statusBadge}">
                                        ${suite.last_run_status}
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                        
                        ${suite.last_run_time ? `
                            <div class="text-xs aero-text-muted mb-3">
                                Last run: ${new Date(suite.last_run_time).toLocaleString()}
                            </div>
                        ` : ''}
                        
                        <div class="flex justify-end space-x-2">
                            <button onclick="duplicateSuite('${suite.id}')" 
                                class="aero-button-purple text-sm font-semibold py-1 px-3 rounded transition">
                                Duplicate
                            </button>
                            <button onclick="runTestSuite('${suite.id}')" 
                                class="aero-button-success text-sm font-semibold py-1 px-3 rounded transition">
                                ▶ Run
                            </button>
                            <button onclick="editSuite('${suite.id}')" 
                                class="aero-button-primary text-sm font-semibold py-1 px-3 rounded transition">
                                Edit
                            </button>
                            <button onclick="deleteSuite('${suite.id}')" 
                                class="aero-button-danger text-sm font-semibold py-1 px-3 rounded transition">
                                Delete
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function openAddSuiteModal() {
            if (!currentStorage) {
                showMessage("Please configure storage first (click Settings)", 'error');
                return;
            }
            
            editingSuiteId = null;
            const modalTitle = document.getElementById('modal-title');
            if (modalTitle) modalTitle.textContent = 'Add New Test Suite';
            
            const suiteForm = document.getElementById('suite-form');
            if (suiteForm) suiteForm.reset();
            
            const suiteId = document.getElementById('suite-id');
            if (suiteId) suiteId.value = '';
            
            const paramsContainer = document.getElementById('parameters-container');
            if (paramsContainer) paramsContainer.innerHTML = '';
            
            const filesContainer = document.getElementById('input-files-container');
            if (filesContainer) filesContainer.innerHTML = '';
            
            const enableLogSaving = document.getElementById('enable_log_saving');
            if (enableLogSaving) enableLogSaving.checked = false;
            
            const logConfigOptions = document.getElementById('log-config-options');
            if (logConfigOptions) logConfigOptions.classList.add('hidden');
            
            // Populate view options
            populateViewSelectOptions();
            
            // Reset website integration data
            websiteFiles = { html: null, css: [], js: [] };
            const websiteConfig = document.getElementById('website-testing-config');
            if (websiteConfig) websiteConfig.classList.add('hidden');
            
            const uploadedPreview = document.getElementById('website-files-preview');
            if (uploadedPreview) uploadedPreview.innerHTML = 'No files uploaded yet';
            
            const suiteModal = document.getElementById('suite-modal');
            if (suiteModal) suiteModal.classList.remove('hidden');
        }

        function closeEditorModal() {
            const modal = document.getElementById('suite-modal');
            if (modal) modal.classList.add('hidden');
        }

        // ============================================
        // *** NEW EDIT LOGIC ***
        // This function now acts as a router,
        // deciding which editor modal to open.
        // ============================================
        function editSuite(suiteId) {
            const suite = testSuites.find(s => s.id === suiteId);
            if (!suite) {
                console.error("Suite not found:", suiteId);
                showMessage("Error: Test suite not found.", 'error');
                return;
            }

            // This is the logic you requested:
            // If it's a 'website' language test AND it uses the 'upload' method,
            // it was almost certainly made by the Visual Web Tester.
            if (suite.language === 'website' && suite.website_method === 'upload') {
                
                // Check if the visual editor's function exists
                if (typeof openVisualWebTesterForEdit === 'function') {
                    openVisualWebTesterForEdit(suite);
                } else {
                    console.error("Visual Web Tester edit function not found. Opening standard editor as fallback.");
                    showMessage("Visual editor function not found. Opening standard editor.", 'error');
                    openNormalSuiteEditor(suite); // Fallback to normal editor
                }
                
            } else {
                // This is for all other test types:
                // Python, Java, C#, Robot, or 'website' with 'url' method
                openNormalSuiteEditor(suite);
            }
        }

        // ============================================
        // *** NEW FUNCTION ***
        // This contains the logic from the *original*
        // editSuite function, now repurposed to
        // only open the standard editor.
        // ============================================
        function openNormalSuiteEditor(suite) {
            editingSuiteId = suite.id; // Set the global editing ID
            
            // Helper function to safely set element value
            const setElementValue = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.value = value || '';
            };
            
            const setElementText = (id, text) => {
                const el = document.getElementById(id);
                if (el) el.textContent = text;
            };
            
            const setElementChecked = (id, checked) => {
                const el = document.getElementById(id);
                if (el) el.checked = checked;
            };
            
            setElementText('modal-title', 'Edit Test Suite');
            setElementValue('suite-id', suite.id);
            setElementValue('suite_name', suite.name);
            setElementValue('suite_description', suite.description);
            setElementValue('suite_language', suite.language);
            setElementValue('suite_code', suite.code);
            setElementValue('expected_output', suite.expected_output);
            setElementValue('webhook_url', suite.webhook_url);
            setElementValue('integration_info', suite.integration_info);
            
            // Load log configuration
            if (suite.log_config) {
                setElementChecked('enable_log_saving', suite.log_config.enabled || false);
                setElementValue('log_filename', suite.log_config.filename || 'log_{suite_name}_{timestamp}');
                setElementValue('log_format', suite.log_config.format || 'txt');
                setElementValue('log_save_trigger', suite.log_config.save_trigger || 'always');
                
                const logOptions = document.getElementById('log-config-options');
                if (logOptions) logOptions.classList.toggle('hidden', !suite.log_config.enabled);
            } else {
                setElementChecked('enable_log_saving', false);
                const logOptions = document.getElementById('log-config-options');
                if (logOptions) logOptions.classList.add('hidden');
            }
            
            // Ensure the correct code editor view is shown
            updateCodeEditor();

            // Load website integration data if applicable
            if (suite.language === 'website') {
                document.getElementById('website-testing-config')?.classList.remove('hidden');
                
                const method = suite.website_method || 'url';
                const methodRadio = document.querySelector(`input[name="website-method"][value="${method}"]`);
                if (methodRadio) methodRadio.checked = true;
                toggleWebsiteMethod();
                
                if (method === 'url') {
                    document.getElementById('website_url').value = suite.website_url || '';
                } else if (method === 'upload') {
                    // Restore uploaded files
                    websiteFiles.html = suite.website_html_content;
                    websiteFiles.css = suite.website_css_contents || [];
                    websiteFiles.js = suite.website_js_contents || [];
                    
                    // Update preview
                    const preview = document.getElementById('website-files-preview');
                    let previewText = '';
                    if (websiteFiles.html) previewText += '✓ HTML file loaded<br>';
                    if (websiteFiles.css.length > 0) previewText += `✓ ${websiteFiles.css.length} CSS file(s) loaded<br>`;
                    if (websiteFiles.js.length > 0) previewText += `✓ ${websiteFiles.js.length} JS file(s) loaded<br>`;
                    if (preview) {
                        preview.innerHTML = '<strong>Loaded Files:</strong><br>' + (previewText || 'No files loaded');
                    }
                }
            }
            
            // Populate view options and set selected view
            populateViewSelectOptions();
            const viewSelect = document.getElementById('suite_view');
            if (viewSelect && suite.view_id) {
                viewSelect.value = suite.view_id;
            }
            
            // Clear and repopulate Environment Parameters
            const paramsContainer = document.getElementById('parameters-container');
            if (paramsContainer) {
                paramsContainer.innerHTML = '';
                if (suite.parameters && suite.parameters.length > 0) {
                    suite.parameters.forEach(param => {
                        addParameterInput(param.key, param.value);
                    });
                }
            }
            
            // Clear and repopulate External Test Inputs (Mock Files)
            const filesContainer = document.getElementById('input-files-container');
            if (filesContainer) {
                filesContainer.innerHTML = '';
                if (suite.input_files && suite.input_files.length > 0) {
                    suite.input_files.forEach(file => {
                        addInputFile(file.filename, file.content);
                    });
                }
            }
            
            const suiteModal = document.getElementById('suite-modal');
            if (suiteModal) suiteModal.classList.remove('hidden');
        }

        async function saveSuite(event) {
            event.preventDefault();
            
            if (!currentStorage) {
                showMessage("Storage not initialized", 'error');
                return;
            }
            
            // Helper function to safely get element value
            const getElementValue = (id, defaultValue = '') => {
                const el = document.getElementById(id);
                return el ? (el.value || defaultValue) : defaultValue;
            };
            
            const getElementChecked = (id) => {
                const el = document.getElementById(id);
                return el ? el.checked : false;
            };
            
            const suite = {
                name: getElementValue('suite_name'),
                description: getElementValue('suite_description'),
                language: getElementValue('suite_language', 'python'),
                code: getElementValue('suite_code'),
                expected_output: getElementValue('expected_output'),
                webhook_url: getElementValue('webhook_url'),
                integration_info: getElementValue('integration_info'),
                view_id: getElementValue('suite_view') || null,
                execution_mode: executionConfig ? executionConfig.mode : 'real',
                parameters: getParametersFromForm(),
                input_files: getInputFilesFromForm(),
                log_config: {
                    enabled: getElementChecked('enable_log_saving'),
                    filename: getElementValue('log_filename', 'log_{suite_name}_{timestamp}'),
                    format: getElementValue('log_format', 'txt'),
                    save_trigger: getElementValue('log_save_trigger', 'always')
                }
            };
            
            // Add website integration data if applicable
            if (suite.language === 'website') {
                const method = document.querySelector('input[name="website-method"]:checked')?.value || 'url';
                suite.website_method = method;
                
                if (method === 'url') {
                    suite.website_url = document.getElementById('website_url').value;
                    // Clear file content if we switch to URL
                    suite.website_html_content = null;
                    suite.website_css_contents = [];
                    suite.website_js_contents = [];
                } else if (method === 'upload') {
                    // Store the uploaded file contents
                    suite.website_html_content = websiteFiles.html;
                    suite.website_css_contents = websiteFiles.css;
                    suite.website_js_contents = websiteFiles.js;
                    // Clear URL if we switch to upload
                    suite.website_url = '';
                }
            }
            
            try {
                if (editingSuiteId) {
                    await currentStorage.updateSuite(editingSuiteId, suite);
                    showMessage("Test suite updated successfully", 'success');
                } else {
                    await currentStorage.saveSuite(suite);
                    showMessage("Test suite created successfully", 'success');
                }
                closeEditorModal();
            } catch (error) {
                console.error("Save error:", error);
                showMessage("Failed to save: " + error.message, 'error');
            }
        }

        async function duplicateSuite(suiteId) {
            if (!currentStorage) {
                showMessage("Storage not initialized", 'error');
                return;
            }

            // Find the original suite data from our local cache
            const originalSuite = testSuites.find(s => s.id === suiteId);
            if (!originalSuite) {
                showMessage('Original suite not found to duplicate!', 'error');
                return;
            }
            
            // 1. Create a copy of the suite object using the spread syntax.
            // 2. IMPORTANT: We remove the 'id' property. This tells the saveSuite
            //    function that this is a NEW suite, so it will generate a new unique ID.
            const { id, ...suiteDataToCopy } = originalSuite;

            // 3. Append "(Copy)" to the name to avoid confusion.
            suiteDataToCopy.name = `${originalSuite.name} (Copy)`;

            // 4. Reset run history for the new copy.
            suiteDataToCopy.last_run_status = 'NEVER_RUN';
            suiteDataToCopy.last_run_time = null;
            suiteDataToCopy.last_run_log = '';

            try {
                // 5. Use the existing saveSuite function to create the new suite.
                await currentStorage.saveSuite(suiteDataToCopy);
                showMessage("Test suite duplicated successfully!", 'success');
            } catch (error) {
                console.error("Duplication error:", error);
                showMessage("Failed to duplicate suite: " + error.message, 'error');
            }
        }

        async function deleteSuite(suiteId) {
            if (!confirm('Are you sure you want to delete this test suite?')) {
                return;
            }
            
            try {
                await currentStorage.deleteSuite(suiteId);
                showMessage("Test suite deleted", 'success');
            } catch (error) {
                console.error("Delete error:", error);
                showMessage("Failed to delete: " + error.message, 'error');
            }
        }

        // ============================================
        // PARAMETERS & INPUT FILES
        // ============================================
        
        function addParameterInput(key = '', value = '') {
            const container = document.getElementById('parameters-container');
            const id = 'param-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            
            const div = document.createElement('div');
            div.className = 'flex space-x-2';
            div.id = id;
            div.innerHTML = `
                <input type="text" placeholder="Key" value="${escapeHtml(key)}" 
                    class="flex-1 bg-gray-700 border border-gray-600 text-white p-2 rounded text-sm">
                <input type="text" placeholder="Value" value="${escapeHtml(value)}" 
                    class="flex-1 bg-gray-700 border border-gray-600 text-white p-2 rounded text-sm">
                <button type="button" onclick="document.getElementById('${id}').remove()" 
                    class="bg-red-600 hover:bg-red-500 text-white px-3 rounded text-sm">×</button>
            `;
            container.appendChild(div);
        }

        function getParametersFromForm() {
            const container = document.getElementById('parameters-container');
            const params = [];
            container.querySelectorAll('div').forEach(div => {
                const inputs = div.querySelectorAll('input[type="text"]');
                if (inputs.length === 2 && inputs[0].value && inputs[1].value) {
                    params.push({
                        key: inputs[0].value,
                        value: inputs[1].value
                    });
                }
            });
            return params;
        }

        function addInputFile(filename = '', content = '') {
            const container = document.getElementById('input-files-container');
            const id = 'file-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            const fileInputId = 'file-input-' + id;
            
            const div = document.createElement('div');
            div.className = 'p-3 bg-gray-700 rounded border border-gray-600';
            div.id = id;
            div.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <input type="text" id="${id}-filename" placeholder="Filename (e.g., test_data.csv)" value="${escapeHtml(filename)}" 
                        class="flex-1 bg-gray-800 border border-gray-600 text-white p-2 rounded text-sm mr-2">
                    <label for="${fileInputId}" 
                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm cursor-pointer whitespace-nowrap mr-2">
                        Browse...
                    </label>
                    <input type="file" id="${fileInputId}" class="hidden">
                    <button type="button" onclick="document.getElementById('${id}').remove()" 
                        class="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm">Remove</button>
                </div>
                <textarea id="${id}-content" placeholder="File content (or click Browse to load a file)..." rows="3" 
                    class="w-full bg-gray-800 border border-gray-600 text-white p-2 rounded text-sm font-mono">${escapeHtml(content)}</textarea>
                <div id="${id}-file-info" class="text-xs text-gray-400 mt-1"></div>
            `;
            container.appendChild(div);
            
            const fileInput = document.getElementById(fileInputId);
            fileInput.addEventListener('change', function(e) {
                handleFileLoad(e, id);
            });
        }
        
        function handleFileLoad(event, containerId) {
            const file = event.target.files[0];
            if (!file) return;
            
            const filenameInput = document.getElementById(`${containerId}-filename`);
            const contentTextarea = document.getElementById(`${containerId}-content`);
            const fileInfo = document.getElementById(`${containerId}-file-info`);
            
            filenameInput.value = file.name;
            fileInfo.textContent = `Loading ${file.name}...`;
            
            const reader = new FileReader();
            
            const isBinary = file.type.startsWith('image/') || 
                            file.type.startsWith('video/') || 
                            file.type.startsWith('audio/') ||
                            file.name.match(/\.(exe|bin|zip|tar|gz|pdf|doc|docx|xls|xlsx)$/i);
            
            reader.onload = function(e) {
                if (isBinary) {
                    const base64 = btoa(
                        new Uint8Array(e.target.result)
                            .reduce((data, byte) => data + String.fromCharCode(byte), '')
                    );
                    contentTextarea.value = `[Binary file - Base64 encoded]\n${base64}`;
                    fileInfo.innerHTML = `Loaded: <strong>${file.name}</strong> (${formatFileSize(file.size)}) - Binary file encoded as Base64`;
                } else {
                    contentTextarea.value = e.target.result;
                    fileInfo.innerHTML = `Loaded: <strong>${file.name}</strong> (${formatFileSize(file.size)})`;
                }
            };
            
            reader.onerror = function() {
                fileInfo.innerHTML = `Error loading file: ${file.name}`;
                contentTextarea.value = '';
            };
            
            if (isBinary) {
                reader.readAsArrayBuffer(file);
            } else {
                reader.readAsText(file);
            }
            
            event.target.value = '';
        }
        
        function formatFileSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        }

        function getInputFilesFromForm() {
            const container = document.getElementById('input-files-container');
            const files = [];
            container.querySelectorAll('div[id^="file-"]').forEach(div => {
                const id = div.id;
                const filenameInput = document.getElementById(`${id}-filename`);
                const contentTextarea = document.getElementById(`${id}-content`);
                
                if (filenameInput && contentTextarea) {
                    const filename = filenameInput.value;
                    const content = contentTextarea.value;
                    
                    if (filename && content) {
                        files.push({ filename, content });
                    }
                }
            });
            return files;
        }


        // ============================================
        // LOG FILE MANAGEMENT
        // ============================================
        
        let currentLogData = null;
        let currentSuiteForLog = null;
        
        function formatLogFilename(pattern, suite, status) {
            const now = new Date();
            const timestamp = now.getTime();
            const date = now.toISOString().split('T')[0];
            const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
            
            return pattern
                .replace('{suite_name}', suite.name.replace(/[^a-zA-Z0-9]/g, '_'))
                .replace('{timestamp}', timestamp)
                .replace('{date}', date)
                .replace('{time}', time)
                .replace('{status}', status.toLowerCase());
        }
        
        function formatLogContent(logText, format, suite, status) {
            const now = new Date();
            
            switch(format) {
                case 'json':
                    return JSON.stringify({
                        suite_name: suite.name,
                        description: suite.description,
                        language: suite.language,
                        timestamp: now.toISOString(),
                        status: status,
                        execution_mode: executionConfig.mode,
                        parameters: suite.parameters || [],
                        log: logText
                    }, null, 2);
                
                case 'html':
                    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Test Log - ${suite.name}</title>
    <style>
        body { font-family: 'Courier New', monospace; background: #1a1a1a; color: #00ff00; padding: 20px; }
        .header { background: #2d2d2d; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .header h1 { margin: 0; color: #00ff00; }
        .header .meta { color: #888; font-size: 12px; margin-top: 10px; }
        .status-success { color: #00ff00; }
        .status-failure { color: #ff0000; }
        .log-content { background: #0d0d0d; padding: 15px; border-radius: 5px; white-space: pre-wrap; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📋 Test Execution Log</h1>
        <div class="meta">
            <strong>Suite:</strong> ${suite.name}<br>
            <strong>Language:</strong> ${suite.language}<br>
            <strong>Date:</strong> ${now.toLocaleString()}<br>
            <strong>Status:</strong> <span class="status-${status.toLowerCase()}">${status}</span>
        </div>
    </div>
    <div class="log-content">${logText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
</body>
</html>`;
                
                case 'xml':
                    return `<?xml version="1.0" encoding="UTF-8"?>
<test-execution>
    <suite name="${suite.name}" language="${suite.language}">
        <timestamp>${now.toISOString()}</timestamp>
        <status>${status}</status>
        <mode>${executionConfig.mode}</mode>
        <log><![CDATA[
${logText}
        ]]></log>
    </suite>
</test-execution>`;
                
                case 'md':
                    return `# Test Execution Log

**Suite:** ${suite.name}  
**Language:** ${suite.language}  
**Date:** ${now.toLocaleString()}  
**Status:** ${status}

## Execution Log

\`\`\`
${logText}
\`\`\`
`;
                
                default:
                    return logText;
            }
        }
        
        function autoSaveLogIfNeeded(suite, log, status) {
            if (!suite.log_config || !suite.log_config.enabled) {
                return;
            }
            
            const trigger = suite.log_config.save_trigger || 'always';
            
            let shouldSave = false;
            if (trigger === 'always') {
                shouldSave = true;
            } else if (trigger === 'failure' && status === 'FAILURE') {
                shouldSave = true;
            } else if (trigger === 'success' && status === 'SUCCESS') {
                shouldSave = true;
            }
            
            if (!shouldSave) return;
            
            const format = suite.log_config.format || 'txt';
            const extension = format === 'txt' ? 'txt' : format;
            const filename = formatLogFilename(suite.log_config.filename || 'log_{suite_name}_{timestamp}', suite, status) + '.' + extension;
            const content = formatLogContent(log, format, suite, status);
            
            // Trigger download
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        }
        
        function downloadCurrentLog() {
            if (!currentLogData || !currentSuiteForLog) {
                showMessage('No log data available', 'error');
                return;
            }
            
            const suite = currentSuiteForLog;
            const format = suite.log_config && suite.log_config.enabled ? suite.log_config.format : 'txt';
            const extension = format === 'txt' ? 'txt' : format;
            const filename = (suite.log_config && suite.log_config.enabled) 
                ? formatLogFilename(suite.log_config.filename, suite, currentLogData.status) + '.' + extension
                : `${suite.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.txt`;
            
            const content = (suite.log_config && suite.log_config.enabled) 
                ? formatLogContent(currentLogData.log, format, suite, currentLogData.status)
                : currentLogData.log;
            
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            
            showMessage('Log downloaded', 'success');
        }


        // ============================================
        // TEST EXECUTION
        // ============================================
        
        async function runTestSuite(suiteId) {
            const suite = testSuites.find(s => s.id === suiteId);
            if (!suite) {
                showMessage('Suite not found', 'error');
                return;
            }
            
            // *** NEW LOGIC: Reroute Visual Web Tests to the Live Runner ***
            if (suite.language === 'website' && suite.website_method === 'upload') {
                if (typeof vwt_openLiveRunner === 'function') {
                    // This function will handle opening the new modal and starting the live run
                    vwt_openLiveRunner(suite); 
                    return;
                } else {
                    console.error("Visual Web Tester Live Runner function not found.");
                    showMessage("Visual Runner not available. Running in standard modal as fallback.", 'warning');
                    // Fallthrough to standard run modal if function is missing
                }
            }
            // *** END NEW LOGIC ***
            
            document.getElementById('run-modal').classList.remove('hidden');
            document.getElementById('run-modal-content').textContent = 'Initializing...';
            document.getElementById('run-status-indicator').innerHTML = '<span class="text-yellow-400"><div class="spinner"></div> Running...</span>';
            
            const startTime = new Date();
            let log = `=== PIPELINE EXECUTION LOG ===\n`;
            log += `Suite: ${suite.name}\n`;
            log += `Language: ${suite.language}\n`;
            log += `Mode: ${executionConfig.mode}\n`;
            log += `Started: ${formatTime(startTime)}\n`;
            log += `--- PIPELINE STARTED ---\n\n`;
            
            let status = 'SUCCESS';
            let executionOutput = '';
            
            if (executionConfig.mode === 'real') {
                log += `[EXECUTION] Running ${suite.language} code...\n\n`;
                document.getElementById('run-modal-content').textContent = log;
                
                try {
                    let result;
                    
                    if (suite.language === 'python') {
                        log += `[INFO] Initializing Python (Pyodide)...\n`;
                        document.getElementById('run-modal-content').textContent = log;
                        result = await executePythonCode(suite.code, suite.inputFiles || []);
                        
                    } else if (suite.language === 'robot') {
                        log += `[INFO] Initializing Robot Framework...\n`;
                        document.getElementById('run-modal-content').textContent = log;
                        
                        if (executionConfig.robotType === 'browser') {
                            result = await executeRobotFrameworkBrowser(suite.code);
                        } else if (executionConfig.robotType === 'backend') {
                            result = await executeRobotFrameworkBackend(suite.code);
                        } else {
                            result = await executeRobotFrameworkApi(suite.code);
                        }
                        
                    } else if (suite.language === 'java') {
                        log += `[INFO] Executing Java code...\n`;
                        document.getElementById('run-modal-content').textContent = log;
                        result = await executeJavaCode(suite.code, suite.inputFiles || []);
                        
                    } else if (suite.language === 'csharp') {
                        log += `[INFO] Executing C# code...\n`;
                        document.getElementById('run-modal-content').textContent = log;
                        result = await executeCSharpCode(suite.code, suite.inputFiles || []);
                        
                    } else if (suite.language === 'website') {
                        log += `[INFO] Starting Website Integration Test...\n`;
                        document.getElementById('run-modal-content').textContent = log;
                        result = await executeWebsiteIntegration(suite);
                        
                    } else {
                        throw new Error(`Unsupported language: ${suite.language}`);
                    }
                    
                    if (result.success) {
                        log += `[OUTPUT]\n${result.output}\n`;
                        if (result.error) {
                            log += `[STDERR]\n${result.error}\n`;
                        }
                        executionOutput = result.output;
                        
                        // Check for error indicators in output
                        const errorIndicators = ['error', 'exception', 'failed', 'failure'];
                        const hasErrorInOutput = errorIndicators.some(indicator => 
                            (result.output || '').toLowerCase().includes(indicator) || 
                            (result.error || '').toLowerCase().includes(indicator) ||
                            (result.output || '').includes(indicator)
                        );
                        
                        if (hasErrorInOutput) {
                            status = 'FAILURE';
                            log += `[WARNING] Error indicators detected in output despite successful execution.\n`;
                        }
                    } else if (result.status) {
                        // Handle website integration format
                        log += result.log || '';
                        status = result.status;
                        executionOutput = result.log || '';
                    } else {
                        log += `\n--- EXECUTION ERROR ---\n`;
                        log += result.error || 'Unknown error';
                        log += `\n--- END ERROR ---\n\n`;
                        status = 'FAILURE';
                        executionOutput = result.error;
                    }
                    
                } catch (error) {
                    log += `\n[ERROR] Execution failed: ${error.message}\n`;
                    status = 'FAILURE';
                    executionOutput = error.message;
                }
                
            } else {
                // Simulated mode
                log += `[CODE] Displaying code (simulation mode)...\n\n`;
                if (suite.code) {
                    log += suite.code.split('\n').map(line => `  ${line}`).join('\n');
                } else {
                    log += `  (no code defined)`;
                }
                log += `\n\n[RESULT] Simulated execution completed.\n`;
            }
            
            const endTime = new Date();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            
            log += `\n[STATUS] ${status}: ${status === 'SUCCESS' ? 'All tests passed.' : 'Execution encountered errors.'}\n\n`;
            log += `--- PIPELINE ENDED ---\n`;
            log += `Duration: ${duration}s. Final Status: ${status}`;
            
            document.getElementById('run-modal-content').textContent = log;
            document.getElementById('run-status-indicator').innerHTML = status === 'SUCCESS' ? 
                '<span class="text-green-400">Completed</span>' : 
                '<span class="text-red-400">Failed</span>';
            
            // Store log data for download
            currentLogData = { log: log, status: status };
            currentSuiteForLog = suite;
            
            // Auto-save log if configured
            autoSaveLogIfNeeded(suite, log, status);
            
            try {
                await currentStorage.updateSuite(suiteId, {
                    last_run_status: status,
                    last_run_time: new Date().toISOString(),
                    last_run_log: log
                });
            } catch (error) {
                console.error("Update error:", error);
                showMessage("Failed to update run status: " + error.message, 'error');
            }
        }

        function closeRunModal() {
            document.getElementById('run-modal').classList.add('hidden');
        }

        function formatTime(date) {
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }

        // ============================================
        // IMPORT/EXPORT
        // ============================================
        
        function exportToJSON() {
            const data = {
                exported_at: new Date().toISOString(),
                storage_type: storageConfig.type,
                execution_mode: executionConfig.mode,
                views: views,  // Include views in export
                test_suites: testSuites
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pipeline_suites_export_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            showMessage("Export completed", 'success');
        }

        function importFromJSON(event) {
            if (!currentStorage) {
                showMessage("Please configure storage first", 'error');
                event.target.value = null;
                return;
            }
            
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const content = JSON.parse(e.target.result);
                    
                    // Import views if they exist
                    if (content.views && Array.isArray(content.views)) {
                        views = content.views;
                        saveViewsToStorage();
                        renderViews();
                        showMessage('Imported ' + views.length + ' view(s)', 'info');
                    }
                    
                    let suitesToImport = [];
                    
                    if (content.test_suites && Array.isArray(content.test_suites)) {
                        suitesToImport = content.test_suites;
                    } else if (Array.isArray(content)) {
                        suitesToImport = content;
                    } else {
                        showMessage("Invalid JSON format", 'error');
                        return;
                    }
                    
                    if (suitesToImport.length === 0) {
                        showMessage("No test suites found in file", 'info');
                        return;
                    }
                    
                    let importCount = 0;
                    for (const suite of suitesToImport) {
                        try {
                            const { id, ...newSuite } = suite;
                            // Preserve view_id if it exists
                            if (!newSuite.view_id) newSuite.view_id = null;
                            await currentStorage.saveSuite(newSuite);
                            importCount++;
                        } catch (error) {
                            console.error("Failed to import suite:", error);
                        }
                    }
                    
                    showMessage(`Imported ${importCount} test suite(s)`, 'success');
                    
                } catch (error) {
                    console.error("Import error:", error);
                    showMessage("Failed to import: " + error.message, 'error');
                }
            };
            reader.readAsText(file);
            event.target.value = null;
        }

        // ============================================
        // UTILITIES
        // ============================================
        
        function showMessage(text, type = 'info') {
            const messageBox = document.getElementById('message-box');
            const classes = {
                success: 'aero-button-success',
                error: 'aero-button-danger',
                info: 'aero-button-primary'
            };
            
            messageBox.className = `fixed top-5 right-5 z-50 transition-all duration-300 ${classes[type]} px-6 py-3 rounded-lg shadow-lg`;
            messageBox.textContent = text;
            messageBox.style.transform = 'translateX(0)';
            
            setTimeout(() => {
                messageBox.style.transform = 'translateX(150%)';
            }, 3000);
        }

        function escapeHtml(text) {
            if (text === null || typeof text === 'undefined') return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // ============================================
        // WEBSITE INTEGRATION FUNCTIONS
        // ============================================
        
        let websiteFiles = {
            html: null,
            css: [],
            js: []
        };
        
        function toggleWebsiteIntegrationOptions() {
            const languageEl = document.getElementById('suite_language');
            if (!languageEl) return;
            
            const language = languageEl.value;
            const websiteOptions = document.getElementById('website-testing-config');
            const templateBtn = document.getElementById('load-website-template-btn');
            
            if (language === 'website') {
                if (websiteOptions) websiteOptions.classList.remove('hidden');
                if (templateBtn) templateBtn.classList.remove('hidden');
            } else {
                if (websiteOptions) websiteOptions.classList.add('hidden');
                if (templateBtn) templateBtn.classList.add('hidden');
            }
        }
        
        function loadWebsiteTemplate() {
            const template = `*** Settings ***
Library    BrowserLibrary

*** Test Cases ***
Test Website Form Submission
    [Documentation]    Example: Test a form on your website
    # The website will be loaded automatically in an iframe
    # You can interact with it using BrowserLibrary keywords
    
    # Example: Fill in a form
    Input Text    id=nameInput    John Doe
    Input Text    id=emailInput    john@example.com
    Click Element    id=submitButton
    
    # Verify results
    Element Should Contain    id=result    Success
    
Test Website Navigation
    [Documentation]    Example: Test navigation and element visibility
    
    # Check if an element exists
    Element Should Exist    css=.header
    
    # Get text from an element
    \${text}=    Get Text    id=welcomeMessage
    Should Contain    \${text}    Welcome
    
    # Click a button
    Click Element    xpath=//button[text()='Learn More']
    
    # Wait for element to appear
    Wait For Element    id=moreInfo    timeout=5s
    Element Should Be Visible    id=moreInfo

*** Keywords ***
# Add your custom keywords here if needed
`;
            const codeEl = document.getElementById('suite_code');
            if (codeEl) {
                codeEl.value = template;
                showMessage('Example template loaded! Customize it for your website.', 'success');
            }
        }
        
        function toggleWebsiteGuide() {
            const content = document.getElementById('website-guide-content');
            const icon = document.getElementById('guide-toggle-icon');
            
            if (content.classList.contains('hidden')) {
                content.classList.remove('hidden');
                icon.textContent = '▲';
            } else {
                content.classList.add('hidden');
                icon.textContent = '▼';
            }
        }
        
        function toggleWebsiteMethodInputs() {
            const method = document.querySelector('input[name="website-method"]:checked').value;
            const urlInput = document.getElementById('website-url-input');
            const uploadInput = document.getElementById('website-upload-input');
            
            if (method === 'url') {
                urlInput.classList.remove('hidden');
                uploadInput.classList.add('hidden');
            } else {
                urlInput.classList.add('hidden');
                uploadInput.classList.remove('hidden');
            }
        }
        
        async function handleWebsiteFileUpload(input, type) {
            const files = input.files;
            if (!files || files.length === 0) return;
            
            const preview = document.getElementById('website-files-preview'); // Changed ID
            let previewText = '';
            
            if (type === 'html') {
                const file = files[0];
                websiteFiles.html = await readFileAsText(file);
                previewText += `✓ HTML: ${file.name}<br>`;
            } else if (type === 'css') {
                websiteFiles.css = [];
                for (let file of files) {
                    const content = await readFileAsText(file);
                    websiteFiles.css.push({ name: file.name, content }); // Store as object
                    previewText += `✓ CSS: ${file.name}<br>`;
                }
            } else if (type === 'js') {
                websiteFiles.js = [];
                for (let file of files) {
                    const content = await readFileAsText(file);
                    websiteFiles.js.push({ name: file.name, content }); // Store as object
                    previewText += `✓ JS: ${file.name}<br>`;
                }
            }
            
            if (preview) {
                preview.innerHTML = '<strong>Uploaded Files:</strong><br>' + previewText;
            }
        }
        
        function readFileAsText(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (e) => reject(e);
                reader.readAsText(file);
            });
        }
        
        function buildWebsiteHTML() {
            if (!websiteFiles.html) return null;
            
            let html = websiteFiles.html;
            
            // Inject CSS into the HTML
            if (websiteFiles.css.length > 0) {
                const cssStyles = websiteFiles.css.map(file => 
                    `<style>/* ${file.name} */\n${file.content}</style>`
                ).join('\n');
                
                // Try to inject before </head> or at the start of <body>
                if (html.includes('</head>')) {
                    html = html.replace('</head>', cssStyles + '\n</head>');
                } else if (html.includes('<body')) {
                    html = html.replace(/<body[^>]*>/, (match) => match + '\n' + cssStyles);
                } else {
                    html = cssStyles + '\n' + html;
                }
            }
            
            // Inject JS into the HTML
            if (websiteFiles.js.length > 0) {
                const jsScripts = websiteFiles.js.map(file => 
                    `<script>/* ${file.name} */\n${file.content}</script>`
                ).join('\n');
                
                // Try to inject before </body> or at the end
                if (html.includes('</body>')) {
                    html = html.replace('</body>', jsScripts + '\n</body>');
                } else {
                    html = html + '\n' + jsScripts;
                }
            }
            
            return html;
        }
        
        async function executeWebsiteIntegration(suite) {
            let log = '[WEBSITE INTEGRATION TEST]\n';
            log += `Testing: ${suite.name}\n`;
            log += `Method: ${suite.website_method || 'url'}\n\n`;
            
            let websiteUrl = suite.website_url;
            let websiteHTML = null;
            
            if (suite.website_method === 'upload' && suite.website_html_content) {
                // Build the complete HTML from uploaded files
                const tempFiles = {
                    html: suite.website_html_content,
                    css: suite.website_css_contents || [],
                    js: suite.website_js_contents || []
                };
                
                // Temporarily swap global websiteFiles to build HTML
                const originalFiles = websiteFiles;
                websiteFiles = tempFiles;
                websiteHTML = buildWebsiteHTML();
                websiteFiles = originalFiles; // Restore
                
                if (!websiteHTML) {
                     throw new Error('Failed to build website HTML from stored files.');
                }

                // Create a blob URL for the uploaded site
                const blob = new Blob([websiteHTML], { type: 'text/html' });
                websiteUrl = URL.createObjectURL(blob);
                log += `[INFO] Loaded uploaded website files\n`;
            } else {
                log += `[INFO] Loading external website: ${websiteUrl}\n`;
            }
            
            if (!websiteUrl) {
                throw new Error('No website URL or files provided');
            }
            
            log += `\n[CREATING TEST ENVIRONMENT]\n`;
            log += `Creating iframe for website...\n`;
            
            // Find or create iframe
            let iframe = document.getElementById('test-website-iframe');
            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.id = 'test-website-iframe';
                // Position it off-screen but available
                iframe.style.cssText = 'position:absolute; top:-9999px; left:-9999px; width:1280px; height:720px; border:none; z-index:9999;';
                document.body.appendChild(iframe);
            }
            
            iframe.src = websiteUrl;
            
            log += `[SUCCESS] Website loaded in test environment\n\n`;
            
            // Wait for iframe to load
            await new Promise((resolve, reject) => {
                iframe.onload = resolve;
                iframe.onerror = () => reject(new Error('Iframe failed to load.'));
                setTimeout(() => reject(new Error('Iframe load timeout.')), 5000);
            });
            
            log += `[EXECUTING TEST SCRIPT]\n`;
            
            try {
                // Execute the Robot Framework test
                if (suite.language === 'website' && suite.code) {
                    log += `Running Robot Framework tests...\n\n`;
                    
                    const result = await executeRobotFrameworkBrowser(suite.code);
                    
                    log += result.output || 'Test execution completed\n';
                    if (result.error) {
                        log += `[STDERR]\n${result.error}\n`;
                    }
                    
                    // Clean up
                    iframe.src = 'about:blank';
                    if (suite.website_method === 'upload' && websiteUrl.startsWith('blob:')) {
                        URL.revokeObjectURL(websiteUrl);
                    }
                    
                    return {
                        status: result.success ? 'SUCCESS' : 'FAILURE',
                        log: log,
                        output: result.output,
                        error: result.error
                    };
                }
                
            } catch (error) {
                log += `\n[ERROR] ${error.message}\n`;
                iframe.src = 'about:blank';
                if (suite.website_method === 'upload' && websiteUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(websiteUrl);
                }
                throw error;
            }
            
            log += `\n[TEST COMPLETED]\n`;
            log += `Closing test environment...\n`;
            
            // Clean up
            iframe.src = 'about:blank';
            if (suite.website_method === 'upload' && websiteUrl.startsWith('blob:')) {
                URL.revokeObjectURL(websiteUrl);
            }
            
            return {
                status: 'SUCCESS',
                log: log
            };
        }

        // ============================================
        // INITIALIZATION
        // ============================================
        
        // ============================================
        // HELPER FUNCTIONS FOR HTML
        // ============================================
        
        function updateCodeEditor() {
            const languageEl = document.getElementById('suite_language');
            if (!languageEl) return;
            
            const language = languageEl.value;
            const websiteConfig = document.getElementById('website-testing-config');
            
            if (language === 'website') {
                if (websiteConfig) websiteConfig.classList.remove('hidden');
            } else {
                if (websiteConfig) websiteConfig.classList.add('hidden');
            }
        }
        
        function toggleWebsiteMethod() {
            const method = document.querySelector('input[name="website-method"]:checked')?.value;
            const urlConfig = document.getElementById('website-url-config');
            const uploadConfig = document.getElementById('website-upload-config');
            
            if (method === 'url') {
                urlConfig?.classList.remove('hidden');
                uploadConfig?.classList.add('hidden');
            } else {
                urlConfig?.classList.add('hidden');
                uploadConfig?.classList.remove('hidden');
            }
        }
        
        async function handleWebsiteFile(input, type) {
            await handleWebsiteFileUpload(input, type);
        }
        
        // ============================================
        // INITIALIZATION
        // ============================================
        
        window.onload = async function() {
            loadExecutionConfig();
            initializeViews();  // Initialize views system
            await initializeStorage();
        };