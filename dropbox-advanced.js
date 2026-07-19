/**
 * Dropbox OAuth PKCE integration for Dawomix.
 * Every user authorizes their own Dropbox account; no app secret or user password is stored.
 */
window.DropboxIntegration = (() => {
    const CONFIG = {
        APP_KEY: 'ro3534tr3nfa1fo',
        SCOPES: ['files.metadata.read', 'files.content.read']
    };

    const STORAGE = {
        TOKEN: 'dawomix_dropbox_access_token',
        VERIFIER: 'dawomix_dropbox_pkce_verifier',
        STATE: 'dawomix_dropbox_oauth_state',
        PENDING_IMPORT: 'dawomix_dropbox_pending_import'
    };

    const AUDIO_EXTENSIONS = /\.(mp3|mpeg|mpga|m4a|aac|wav|ogg|oga|flac|webm)$/i;
    let accessToken = sessionStorage.getItem(STORAGE.TOKEN);

    function redirectUri() {
        // GitHub Pages can expose the same page as both / and /index.html.
        // Dropbox requires an exact redirect URI match, so always use one canonical URL.
        const pathname = window.location.pathname.replace(/index\.html$/i, '');
        return `${window.location.origin}${pathname}`;
    }

    function randomUrlSafeString(length = 64) {
        const bytes = new Uint8Array(length);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, byte => (byte % 36).toString(36)).join('');
    }

    function base64Url(bytes) {
        let binary = '';
        bytes.forEach(byte => { binary += String.fromCharCode(byte); });
        const encoded = typeof btoa === 'function'
            ? btoa(binary)
            : Buffer.from(binary, 'binary').toString('base64');
        return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    async function createCodeChallenge(verifier) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
        return base64Url(new Uint8Array(digest));
    }

    function cleanOAuthParameters() {
        const url = new URL(window.location.href);
        ['code', 'state', 'error', 'error_description'].forEach(name => url.searchParams.delete(name));
        const cleanPath = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, typeof document === 'undefined' ? '' : document.title, cleanPath);
    }

    function reloadAfterOAuthCallback() {
        // A full navigation is intentional. Some Android/MIUI WebViews retain the
        // zoom level of the Dropbox authorization page when only history is changed.
        // Reloading the canonical app URL reapplies the mobile viewport and layout.
        if (typeof window.location.replace === 'function') {
            window.location.replace(redirectUri());
            return true;
        }
        return false;
    }

    function updateSignInStatus() {
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('dropbox-signin-changed', {
                detail: { isSignedIn: Boolean(accessToken) }
            }));
        }
    }

    async function exchangeAuthorizationCode(code, verifier) {
        const body = new URLSearchParams({
            code,
            grant_type: 'authorization_code',
            client_id: CONFIG.APP_KEY,
            redirect_uri: redirectUri(),
            code_verifier: verifier
        });
        const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });
        const data = await response.json();
        if (!response.ok || !data.access_token) {
            throw new Error(data.error_description || data.error || `Dropbox OAuth selhal (${response.status})`);
        }
        accessToken = data.access_token;
        sessionStorage.setItem(STORAGE.TOKEN, accessToken);
        sessionStorage.removeItem(STORAGE.VERIFIER);
        sessionStorage.removeItem(STORAGE.STATE);
        updateSignInStatus();
    }

    async function initialize() {
        const params = new URLSearchParams(window.location.search);
        const oauthError = params.get('error');
        if (oauthError) {
            const description = params.get('error_description') || oauthError;
            cleanOAuthParameters();
            throw new Error(`Dropbox přihlášení bylo zrušeno: ${description}`);
        }

        const code = params.get('code');
        if (code) {
            const expectedState = sessionStorage.getItem(STORAGE.STATE);
            const returnedState = params.get('state');
            const verifier = sessionStorage.getItem(STORAGE.VERIFIER);
            if (!expectedState || expectedState !== returnedState || !verifier) {
                cleanOAuthParameters();
                throw new Error('Dropbox OAuth kontrola zabezpečení selhala. Zkus přihlášení znovu.');
            }
            await exchangeAuthorizationCode(code, verifier);
            cleanOAuthParameters();
            if (reloadAfterOAuthCallback()) return true;
        }

        accessToken = sessionStorage.getItem(STORAGE.TOKEN);
        updateSignInStatus();
        return Boolean(accessToken);
    }

    async function signIn() {
        const verifier = randomUrlSafeString(64);
        const state = randomUrlSafeString(32);
        const challenge = await createCodeChallenge(verifier);
        sessionStorage.setItem(STORAGE.VERIFIER, verifier);
        sessionStorage.setItem(STORAGE.STATE, state);
        sessionStorage.setItem(STORAGE.PENDING_IMPORT, '1');

        const params = new URLSearchParams({
            client_id: CONFIG.APP_KEY,
            response_type: 'code',
            redirect_uri: redirectUri(),
            code_challenge: challenge,
            code_challenge_method: 'S256',
            token_access_type: 'online',
            scope: CONFIG.SCOPES.join(' '),
            state
        });
        window.location.assign(`https://www.dropbox.com/oauth2/authorize?${params.toString()}`);
    }

    async function signOut() {
        const token = accessToken;
        accessToken = null;
        sessionStorage.removeItem(STORAGE.TOKEN);
        sessionStorage.removeItem(STORAGE.PENDING_IMPORT);
        updateSignInStatus();
        if (token) {
            await fetch('https://api.dropboxapi.com/2/auth/token/revoke', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            }).catch(() => {});
        }
    }

    async function apiRequest(endpoint, body) {
        if (!accessToken) throw new Error('Nejsi přihlášený k Dropboxu.');
        const response = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (response.status === 401) {
            await signOut();
            throw new Error('Přihlášení k Dropboxu vypršelo. Přihlas se znovu.');
        }
        if (!response.ok) {
            throw new Error(data.error_summary || `Dropbox API selhalo (${response.status})`);
        }
        return data;
    }

    async function listAudioFiles() {
        accessToken = sessionStorage.getItem(STORAGE.TOKEN);
        if (!accessToken) throw new Error('Nejsi přihlášený k Dropboxu.');

        const entries = [];
        let page = await apiRequest('files/list_folder', {
            path: '',
            recursive: true,
            include_deleted: false,
            include_non_downloadable_files: false,
            limit: 2000
        });
        entries.push(...(page.entries || []));
        while (page.has_more) {
            page = await apiRequest('files/list_folder/continue', { cursor: page.cursor });
            entries.push(...(page.entries || []));
        }
        return entries.filter(entry => entry['.tag'] === 'file' && AUDIO_EXTENSIONS.test(entry.name || ''));
    }

    function mimeTypeForName(name) {
        const extension = (name.split('.').pop() || '').toLowerCase();
        return {
            mp3: 'audio/mpeg', mpeg: 'audio/mpeg', mpga: 'audio/mpeg',
            m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
            ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm'
        }[extension] || 'application/octet-stream';
    }

    async function downloadFile(entry) {
        if (!accessToken) throw new Error('Nejsi přihlášený k Dropboxu.');
        const response = await fetch('https://content.dropboxapi.com/2/files/download', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Dropbox-API-Arg': JSON.stringify({ path: entry.path_lower || entry.id })
            }
        });
        if (response.status === 401) {
            await signOut();
            throw new Error('Přihlášení k Dropboxu vypršelo. Přihlas se znovu.');
        }
        if (!response.ok) throw new Error(`Stažení z Dropboxu selhalo (${response.status})`);
        const blob = await response.blob();
        return new File([blob], entry.name, { type: blob.type || mimeTypeForName(entry.name) });
    }

    function chooseFiles(files) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-4 backdrop-blur-sm';
            const panel = document.createElement('div');
            panel.className = 'bg-[var(--color-bg-secondary)] border border-[var(--color-border)] w-full max-w-sm max-h-[85vh] p-5 rounded-2xl shadow-2xl flex flex-col gap-4';

            const title = document.createElement('h3');
            title.className = 'text-xs font-bold uppercase tracking-wider border-b border-[var(--color-border)] pb-2';
            title.textContent = 'Vyber skladby z Dropboxu';
            panel.appendChild(title);

            const list = document.createElement('div');
            list.className = 'space-y-2 overflow-y-auto flex-1';
            files.forEach((file, index) => {
                const label = document.createElement('label');
                label.className = 'flex items-center gap-3 p-2.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = String(index);
                checkbox.className = 'accent-[var(--color-accent-primary)]';
                const name = document.createElement('span');
                name.className = 'truncate';
                name.textContent = file.name;
                label.append(checkbox, name);
                list.appendChild(label);
            });
            panel.appendChild(list);

            const actions = document.createElement('div');
            actions.className = 'grid grid-cols-2 gap-2';
            const cancel = document.createElement('button');
            cancel.className = 'py-2.5 border border-[var(--color-border)] rounded-lg text-xs';
            cancel.textContent = 'Zrušit';
            const confirm = document.createElement('button');
            confirm.className = 'py-2.5 bg-[#0061ff] text-white font-bold rounded-lg text-xs';
            confirm.textContent = 'Importovat vybrané';
            actions.append(cancel, confirm);
            panel.appendChild(actions);
            overlay.appendChild(panel);
            document.body.appendChild(overlay);

            const finish = selected => {
                overlay.remove();
                resolve(selected);
            };
            cancel.onclick = () => finish([]);
            overlay.onclick = event => { if (event.target === overlay) finish([]); };
            confirm.onclick = () => {
                const selected = [...list.querySelectorAll('input:checked')]
                    .map(input => files[Number(input.value)])
                    .filter(Boolean);
                finish(selected);
            };
        });
    }

    async function selectAndDownloadFiles() {
        const signedIn = await initialize();
        if (!signedIn) {
            await signIn();
            return [];
        }
        sessionStorage.removeItem(STORAGE.PENDING_IMPORT);
        const available = await listAudioFiles();
        if (!available.length) throw new Error('V Dropboxu nebyly nalezeny podporované audio soubory.');
        const selected = await chooseFiles(available);
        if (!selected.length) return [];
        return Promise.all(selected.map(downloadFile));
    }

    function getSignInStatus() {
        return Boolean(accessToken || sessionStorage.getItem(STORAGE.TOKEN));
    }

    function hasPendingImport() {
        return sessionStorage.getItem(STORAGE.PENDING_IMPORT) === '1';
    }

    function isAvailable() {
        return Boolean(CONFIG.APP_KEY);
    }

    return {
        initialize,
        signIn,
        signOut,
        listAudioFiles,
        downloadFile,
        selectAndDownloadFiles,
        getSignInStatus,
        hasPendingImport,
        isAvailable
    };
})();
