/* Cloudové importy pro Dawomix: Google Drive + opravy UI pro MEGA a Dropbox. */
window.GDriveIntegration = (() => {
    const CONFIG = {
        CLIENT_ID: '235448749622-6309rvp8u5c1amdcuir3glc4ef7ui89j.apps.googleusercontent.com',
        API_KEY: 'AIzaSyCEyfgB6VmjDsGafeg9nN70axASy4EEM9s',
        SCOPES: ['https://www.googleapis.com/auth/drive.readonly'],
        DISCOVERY_DOCS: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
    };

    let isInitialized = false;
    let isSignedIn = false;
    let tokenClient = null;
    let accessToken = null;

    const AUDIO_MIME_TYPES = [
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/flac',
        'audio/aac', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/webm'
    ].join(',');

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                if (existing.dataset.loaded === 'true') return resolve();
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', () => reject(new Error(`Nelze načíst ${src}`)), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.defer = true;
            script.onload = () => {
                script.dataset.loaded = 'true';
                resolve();
            };
            script.onerror = () => reject(new Error(`Nelze načíst ${src}`));
            document.head.appendChild(script);
        });
    }

    function updateSignInStatus(value) {
        isSignedIn = Boolean(value);
        document.dispatchEvent(new CustomEvent('gdrive-signin-changed', {
            detail: { isSignedIn }
        }));
    }

    async function initialize() {
        if (isInitialized) return true;
        if (!CONFIG.CLIENT_ID || !CONFIG.API_KEY) return false;

        try {
            await Promise.all([
                loadScript('https://apis.google.com/js/api.js'),
                loadScript('https://accounts.google.com/gsi/client')
            ]);

            await new Promise((resolve, reject) => {
                if (!window.gapi?.load) return reject(new Error('Google API knihovna není dostupná.'));
                gapi.load('client:picker', {
                    callback: resolve,
                    onerror: () => reject(new Error('Google API se nepodařilo načíst.')),
                    timeout: 15000,
                    ontimeout: () => reject(new Error('Načítání Google API vypršelo.'))
                });
            });

            await gapi.client.init({
                apiKey: CONFIG.API_KEY,
                discoveryDocs: CONFIG.DISCOVERY_DOCS
            });

            if (!window.google?.accounts?.oauth2) {
                throw new Error('Google přihlašování není dostupné.');
            }

            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CONFIG.CLIENT_ID,
                scope: CONFIG.SCOPES.join(' '),
                callback: () => {}
            });

            const token = gapi.client.getToken?.();
            accessToken = token?.access_token || null;
            updateSignInStatus(Boolean(accessToken));
            isInitialized = true;
            return true;
        } catch (error) {
            console.error('Google Drive inicializace selhala:', error);
            return false;
        }
    }

    async function signIn() {
        if (!(await initialize())) return false;
        if (!tokenClient) return false;

        return new Promise(resolve => {
            tokenClient.callback = response => {
                if (response?.error || !response?.access_token) {
                    console.error('Google přihlášení selhalo:', response);
                    updateSignInStatus(false);
                    resolve(false);
                    return;
                }
                accessToken = response.access_token;
                gapi.client.setToken(response);
                updateSignInStatus(true);
                resolve(true);
            };

            tokenClient.requestAccessToken({
                prompt: accessToken ? '' : 'consent select_account'
            });
        });
    }

    async function signOut() {
        try {
            if (accessToken && window.google?.accounts?.oauth2) {
                google.accounts.oauth2.revoke(accessToken);
            }
        } finally {
            accessToken = null;
            window.gapi?.client?.setToken?.(null);
            updateSignInStatus(false);
        }
    }

    async function openPicker() {
        if (!isSignedIn && !(await signIn())) {
            throw new Error('Přihlášení ke Google Disku bylo zrušeno nebo selhalo.');
        }

        if (!window.google?.picker) {
            await new Promise((resolve, reject) => {
                gapi.load('picker', {
                    callback: resolve,
                    onerror: () => reject(new Error('Google Picker se nepodařilo načíst.')),
                    timeout: 15000,
                    ontimeout: () => reject(new Error('Načítání Google Pickeru vypršelo.'))
                });
            });
        }

        return new Promise((resolve, reject) => {
            const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
                .setMimeTypes(AUDIO_MIME_TYPES)
                .setIncludeFolders(true)
                .setSelectFolderEnabled(false);

            const picker = new google.picker.PickerBuilder()
                .addView(view)
                .setOAuthToken(accessToken)
                .setDeveloperKey(CONFIG.API_KEY)
                .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
                .setTitle('Vyber audio soubory z Google Disku')
                .setCallback(data => {
                    if (data.action === google.picker.Action.ERROR) {
                        reject(new Error(data.message || 'Google Picker selhal.'));
                    } else if (data.action === google.picker.Action.PICKED || data.action === google.picker.Action.PICKED_MULTIPLE) {
                        resolve(data.docs || []);
                    } else if (data.action === google.picker.Action.CANCEL) {
                        resolve([]);
                    }
                })
                .build();

            picker.setVisible(true);
        });
    }

    async function downloadFile(fileId, fallbackName) {
        if (!accessToken) throw new Error('Nejsi přihlášen ke Google Disku.');

        const metadata = await gapi.client.drive.files.get({
            fileId,
            fields: 'name,mimeType,size'
        });
        const file = metadata.result;
        const name = fallbackName || file.name || 'google-drive-audio.mp3';
        const supportedByMime = file.mimeType?.startsWith('audio/');
        const supportedByName = /\.(mp3|mpeg|mpga|m4a|aac|wav|ogg|oga|flac)$/i.test(name);
        if (!supportedByMime && !supportedByName) {
            throw new Error(`Nepodporovaný soubor: ${name}`);
        }

        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok) throw new Error(`Stažení souboru ${name} selhalo (${response.status}).`);

        const blob = await response.blob();
        return new File([blob], name, { type: blob.type || file.mimeType || 'audio/mpeg' });
    }

    async function downloadMultipleFiles(docs) {
        const files = [];
        const errors = [];
        for (const doc of docs) {
            try {
                files.push(await downloadFile(doc.id, doc.name));
            } catch (error) {
                errors.push(error.message);
                console.error('Google Drive soubor nelze stáhnout:', error);
            }
        }
        if (!files.length && errors.length) throw new Error(errors[0]);
        return files;
    }

    async function selectAndDownloadFiles() {
        const docs = await openPicker();
        if (!docs.length) return [];
        return downloadMultipleFiles(docs);
    }

    return {
        initialize,
        signIn,
        signOut,
        openPicker,
        downloadFile,
        downloadMultipleFiles,
        selectAndDownloadFiles,
        getSignInStatus: () => isSignedIn,
        isAvailable: () => Boolean(CONFIG.CLIENT_ID && CONFIG.API_KEY),
        setConfig(clientId, apiKey) {
            CONFIG.CLIENT_ID = clientId;
            CONFIG.API_KEY = apiKey;
            isInitialized = false;
            updateSignInStatus(false);
        }
    };
})();

/* Opravy cloudových vstupů bez nutnosti přepisovat obří index.html. */
window.addEventListener('DOMContentLoaded', () => {
    const cloudModal = document.getElementById('cloudModal');
    const cloudCard = cloudModal?.querySelector(':scope > div');
    const serviceSelect = document.getElementById('cloudServiceSelect');
    if (!cloudModal || !cloudCard || !serviceSelect) return;

    const status = document.createElement('div');
    status.id = 'cloudImportStatus';
    status.className = 'hidden text-[10px] leading-relaxed p-3 rounded-xl border';
    serviceSelect.insertBefore(status, serviceSelect.lastElementChild);

    function setCloudStatus(message = '', type = 'info') {
        if (!message) {
            status.classList.add('hidden');
            status.textContent = '';
            return;
        }
        const styles = {
            info: 'border-cyan-400/30 bg-cyan-400/5 text-cyan-200',
            success: 'border-emerald-400/30 bg-emerald-400/5 text-emerald-200',
            error: 'border-red-400/30 bg-red-400/5 text-red-200'
        };
        status.className = `text-[10px] leading-relaxed p-3 rounded-xl border ${styles[type] || styles.info}`;
        status.textContent = message;
    }
    window.setCloudStatus = setCloudStatus;

    const dropboxPanel = document.createElement('div');
    dropboxPanel.id = 'dropboxImportPanel';
    dropboxPanel.className = 'hidden space-y-4';
    dropboxPanel.innerHTML = `
        <div class="flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
            <img src="dropbox.png" alt="Dropbox" class="w-5 h-5">
            <h3 class="text-xs font-bold uppercase tracking-wider">Import z Dropboxu</h3>
        </div>
        <p class="text-[10px] text-[var(--color-text-secondary)] leading-relaxed">Vlož sdílený odkaz na audio soubor. Více odkazů dej každý na nový řádek.</p>
        <textarea id="dropboxLinksInput" rows="6" inputmode="url" spellcheck="false" placeholder="https://www.dropbox.com/scl/fi/.../skladba.mp3" class="w-full resize-none bg-[var(--color-bg-main)] border border-[var(--color-border)] p-3 text-xs text-[var(--color-text-main)] focus:outline-none focus:border-blue-400 rounded-xl"></textarea>
        <div id="dropboxInputError" class="hidden text-[10px] text-red-300"></div>
        <button id="dropboxImportButton" type="button" class="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition">Importovat odkazy</button>
        <button id="dropboxBackButton" type="button" class="w-full text-center text-[10px] text-[var(--color-text-secondary)] uppercase">Zpět</button>
    `;
    cloudCard.appendChild(dropboxPanel);

    function showServiceSelect() {
        document.getElementById('megaLoginForm')?.classList.add('hidden');
        document.getElementById('megaFileExplorer')?.classList.add('hidden');
        dropboxPanel.classList.add('hidden');
        serviceSelect.classList.remove('hidden');
    }

    window.backToCloudSelect = showServiceSelect;

    const originalOpenCloudModal = window.openCloudModal;
    window.openCloudModal = function () {
        originalOpenCloudModal?.();
        showServiceSelect();
        setCloudStatus();
    };

    const originalGoogleImport = window.importFromGoogleDrive;
    window.loginWithGoogle = async function () {
        cloudModal.classList.remove('hidden');
        showServiceSelect();
        setCloudStatus('Připojuji Google Disk…', 'info');
        try {
            await originalGoogleImport?.();
            setCloudStatus('Google Drive byl zpracován. Vybrané soubory se přidávají do knihovny.', 'success');
        } catch (error) {
            console.error(error);
            setCloudStatus(error.message || 'Google Drive import selhal.', 'error');
        }
    };

    window.importFromDropbox = function () {
        serviceSelect.classList.add('hidden');
        document.getElementById('megaLoginForm')?.classList.add('hidden');
        document.getElementById('megaFileExplorer')?.classList.add('hidden');
        dropboxPanel.classList.remove('hidden');
        document.getElementById('dropboxLinksInput')?.focus();
    };

    document.getElementById('dropboxBackButton').addEventListener('click', showServiceSelect);
    document.getElementById('dropboxImportButton').addEventListener('click', async () => {
        const input = document.getElementById('dropboxLinksInput');
        const errorBox = document.getElementById('dropboxInputError');
        const button = document.getElementById('dropboxImportButton');
        const links = input.value.split(/\n+/).map(value => value.trim()).filter(Boolean);

        errorBox.classList.add('hidden');
        if (!links.length) {
            errorBox.textContent = 'Vlož alespoň jeden Dropbox odkaz.';
            errorBox.classList.remove('hidden');
            return;
        }

        const invalid = links.find(link => {
            try {
                const url = new URL(link);
                return !/(^|\.)dropbox\.com$/.test(url.hostname) && !/(^|\.)dropboxusercontent\.com$/.test(url.hostname);
            } catch {
                return true;
            }
        });
        if (invalid) {
            errorBox.textContent = `Neplatný Dropbox odkaz: ${invalid}`;
            errorBox.classList.remove('hidden');
            return;
        }

        button.disabled = true;
        button.textContent = `Stahuji 0/${links.length}…`;
        try {
            const files = [];
            for (let index = 0; index < links.length; index++) {
                button.textContent = `Stahuji ${index + 1}/${links.length}…`;
                files.push(await window.downloadDropboxLink(links[index]));
            }
            if (files.length) window.processFiles(files);
            input.value = '';
            showServiceSelect();
            setCloudStatus(`Z Dropboxu se importuje ${files.length} souborů.`, 'success');
        } catch (error) {
            console.error('Dropbox import selhal:', error);
            errorBox.textContent = `${error.message || 'Dropbox import selhal.'} Sdílený odkaz musí být veřejný a umožňovat přímé stažení.`;
            errorBox.classList.remove('hidden');
        } finally {
            button.disabled = false;
            button.textContent = 'Importovat odkazy';
        }
    });

    const megaEmail = document.getElementById('megaEmail');
    const megaPassword = document.getElementById('megaPassword');
    const mega2fa = document.getElementById('mega2fa');
    megaEmail?.setAttribute('autocomplete', 'username');
    megaPassword?.setAttribute('autocomplete', 'current-password');
    mega2fa?.setAttribute('autocomplete', 'one-time-code');

    if (megaPassword && !document.getElementById('megaPasswordToggle')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'relative';
        megaPassword.parentNode.insertBefore(wrapper, megaPassword);
        wrapper.appendChild(megaPassword);
        megaPassword.classList.add('pr-14');

        const toggle = document.createElement('button');
        toggle.id = 'megaPasswordToggle';
        toggle.type = 'button';
        toggle.className = 'absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-[var(--color-text-secondary)] hover:text-white';
        toggle.textContent = 'ZOBRAZIT';
        toggle.addEventListener('click', () => {
            const visible = megaPassword.type === 'text';
            megaPassword.type = visible ? 'password' : 'text';
            toggle.textContent = visible ? 'ZOBRAZIT' : 'SKRÝT';
        });
        wrapper.appendChild(toggle);
    }

    [megaEmail, megaPassword, mega2fa].forEach(input => input?.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            window.submitMegaLogin?.();
        }
    }));
});
