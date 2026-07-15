/**
 * Google Drive integration copied from jnovec/dmix and adapted for Dawomix.
 * Opens Google Picker, downloads selected audio files, and returns them as File objects.
 */
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
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/x-wav',
        'audio/flac',
        'audio/aac',
        'audio/ogg',
        'audio/mp4',
        'audio/x-m4a',
        'audio/webm'
    ].join(',');

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.defer = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Load failed: ${src}`));
            document.head.appendChild(script);
        });
    }

    function getValidApiKey() {
        return CONFIG.API_KEY && CONFIG.API_KEY.startsWith('AIza') ? CONFIG.API_KEY : '';
    }

    function updateSignInStatus(signedIn) {
        isSignedIn = signedIn;
        document.dispatchEvent(new CustomEvent('gdrive-signin-changed', { detail: { isSignedIn } }));
    }

    async function initialize() {
        if (isInitialized) return true;
        if (!CONFIG.CLIENT_ID) {
            console.error('Google Drive: Chybi CLIENT_ID.');
            return false;
        }

        try {
            await loadScript('https://apis.google.com/js/api.js');
            await loadScript('https://accounts.google.com/gsi/client');

            await new Promise((resolve, reject) => {
                if (!window.gapi || !gapi.load) {
                    reject(new Error('gapi knihovna neni dostupna'));
                    return;
                }

                gapi.load('client:picker', {
                    callback: resolve,
                    onerror: reject,
                    timeout: 10000,
                    ontimeout: reject
                });
            });

            const clientConfig = { discoveryDocs: CONFIG.DISCOVERY_DOCS };
            const apiKey = getValidApiKey();
            if (apiKey) clientConfig.apiKey = apiKey;

            await gapi.client.init(clientConfig);

            if (!window.google || !google.accounts || !google.accounts.oauth2) {
                throw new Error('Google Identity Services knihovna neni dostupna');
            }

            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CONFIG.CLIENT_ID,
                scope: CONFIG.SCOPES.join(' '),
                callback: () => {}
            });

            const existingToken = gapi.client.getToken && gapi.client.getToken();
            accessToken = existingToken && existingToken.access_token ? existingToken.access_token : null;
            updateSignInStatus(Boolean(accessToken));

            isInitialized = true;
            return true;
        } catch (error) {
            console.error('Google Drive inicializace selhala:', error);
            return false;
        }
    }

    async function signIn() {
        const initialized = await initialize();
        if (!initialized) return false;

        try {
            if (!tokenClient) throw new Error('Google token client neni dostupny');

            return await new Promise((resolve) => {
                tokenClient.callback = (response) => {
                    if (response.error) {
                        console.error('Google token request selhal:', response);
                        updateSignInStatus(false);
                        resolve(false);
                        return;
                    }

                    accessToken = response.access_token;
                    gapi.client.setToken(response);
                    updateSignInStatus(Boolean(accessToken));
                    resolve(Boolean(accessToken));
                };

                tokenClient.requestAccessToken({
                    prompt: accessToken ? '' : 'consent select_account'
                });
            });
        } catch (error) {
            console.error('Google Sign-In selhalo:', error);
            return false;
        }
    }

    async function signOut() {
        if (!isInitialized) return;

        try {
            if (accessToken && window.google && google.accounts && google.accounts.oauth2) {
                google.accounts.oauth2.revoke(accessToken);
            }
            accessToken = null;
            if (window.gapi && gapi.client) gapi.client.setToken(null);
            updateSignInStatus(false);
        } catch (error) {
            console.error('Google Sign-Out selhalo:', error);
        }
    }

    async function openPicker() {
        if (!isSignedIn) {
            const signedIn = await signIn();
            if (!signedIn) throw new Error('Prihlaseni selhalo');
        }

        if (!window.google || !window.google.picker) {
            await new Promise((resolve, reject) => {
                if (!window.gapi || !gapi.load) {
                    reject(new Error('gapi neni dostupne pro Picker'));
                    return;
                }

                gapi.load('picker', {
                    callback: resolve,
                    onerror: reject,
                    timeout: 10000,
                    ontimeout: reject
                });
            });
        }

        return new Promise((resolve, reject) => {
            if (!accessToken) {
                reject(new Error('Zadny access token'));
                return;
            }

            const apiKey = getValidApiKey();
            if (!apiKey) {
                reject(new Error('Chybi platny Google API key pro Picker.'));
                return;
            }

            const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
                .setMimeTypes(AUDIO_MIME_TYPES)
                .setIncludeFolders(true)
                .setSelectFolderEnabled(false);

            const picker = new google.picker.PickerBuilder()
                .addView(view)
                .setOAuthToken(accessToken)
                .setDeveloperKey(apiKey)
                .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
                .setCallback((data) => {
                    if (data.action === google.picker.Action.ERROR) {
                        reject(new Error(data.message || 'Google Picker selhal'));
                        return;
                    }

                    if (data.action === google.picker.Action.PICKED || data.action === google.picker.Action.PICKED_MULTIPLE) {
                        resolve(data.docs || []);
                    } else if (data.action === google.picker.Action.CANCEL) {
                        resolve([]);
                    }
                })
                .setTitle('Vyberte audio soubory z Google Disku')
                .build();

            picker.setVisible(true);
        });
    }

    async function downloadFile(fileId, fileName) {
        if (!isSignedIn) throw new Error('Nejsi prihlasen do Google');

        const metadata = await gapi.client.drive.files.get({
            fileId,
            fields: 'name,mimeType'
        });

        const file = metadata.result;
        const isAudio = file.mimeType && file.mimeType.startsWith('audio/');
        if (!isAudio) throw new Error(`Soubor neni audio: ${file.mimeType || 'neznamy typ'}`);

        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) throw new Error(`Stahovani souboru selhalo (${response.status})`);

        const blob = await response.blob();
        return new File([blob], fileName || file.name, { type: file.mimeType });
    }

    async function downloadMultipleFiles(fileIds) {
        const files = [];
        for (const fileId of fileIds) {
            try {
                files.push(await downloadFile(fileId));
            } catch (error) {
                console.error(`Chyba pri stahovani ${fileId}:`, error);
            }
        }
        return files;
    }

    async function selectAndDownloadFiles() {
        const docs = await openPicker();
        if (!docs.length) return [];
        const ids = docs.map(doc => doc.id).filter(Boolean);
        return downloadMultipleFiles(ids);
    }

    function getSignInStatus() {
        return isSignedIn;
    }

    function isAvailable() {
        return Boolean(CONFIG.CLIENT_ID);
    }

    function setConfig(clientId, apiKey) {
        CONFIG.CLIENT_ID = clientId;
        CONFIG.API_KEY = apiKey;
        isInitialized = false;
    }

    return {
        initialize,
        signIn,
        signOut,
        openPicker,
        downloadFile,
        downloadMultipleFiles,
        selectAndDownloadFiles,
        getSignInStatus,
        isAvailable,
        setConfig
    };
})();
