(function() {
    const container = document.getElementById('requestsContainer');

    // ---------- helpers ----------
    function escapeHTML(value) {
        const div = document.createElement('div');
        div.textContent = value ?? '';
        return div.innerHTML;
    }

    function createInitialAvatar(name) {
        const initial = String(name || '?').trim().charAt(0).toUpperCase();
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
                <rect width="100" height="100" rx="50" fill="#e5eae8"/>
                <text x="50" y="60" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" fill="#555">
                    ${initial}
                </text>
            </svg>
        `;
        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    }

    function formatMealDate(isoString) {
        if (!isoString) return '—';
        try {
            const d = new Date(isoString);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (e) {
            return '—';
        }
    }

    function getProfilePicture(user) {
        if (user.profile_picture) {
            let path = user.profile_picture;
            if (!path.startsWith('/') && !path.startsWith('http')) {
                path = '/' + path;
            }
            return path;
        }
        return createInitialAvatar(user.name);
    }

    function parseGuestCount(guestsStatus) {
        if (!guestsStatus) return 0;
        const str = String(guestsStatus).trim();
        const fromToMatch = str.match(/from\s+(\d+)\s+to\s+(\d+)/i);
        if (fromToMatch) {
            const from = parseInt(fromToMatch[1], 10);
            const to = parseInt(fromToMatch[2], 10);
            return Math.abs(to - from);
        }
        const singleMatch = str.match(/^(\d+)$/);
        if (singleMatch) {
            return parseInt(singleMatch[1], 10);
        }
        const numMatch = str.match(/(\d+)/);
        if (numMatch) return parseInt(numMatch[1], 10);
        return 0;
    }

    function buildSentence(item) {
        const requestedBy = escapeHTML(item.requested_by || 'Someone');
        const mealDate = escapeHTML(formatMealDate(item.meal_date));

        if (item.guest === true) {
            const count = parseGuestCount(item.guests_status);
            let verb;
            if (item.toggle_to === 'off') {
                verb = `<span class="verb verb-off">remove ${count} guest meal${count !== 1 ? 's' : ''}</span>`;
            } else {
                verb = `<span class="verb verb-on">add ${count} guest meal${count !== 1 ? 's' : ''}</span>`;
            }
            return `${requestedBy} requested to ${verb} on <span class="date">${mealDate}</span>.`;
        }

        // guest === false
        const toggle = item.toggle_to === 'on' ? 'on' : 'off';
        const verbClass = toggle === 'on' ? 'verb-on' : 'verb-off';
        const base = `<span class="verb ${verbClass}">turn ${toggle} meal</span>`;

        // Special case: turning OFF with a numeric guests_status > 0
        if (toggle === 'off') {
            const guestCount = parseGuestCount(item.guests_status);
            if (guestCount > 0) {
                const guestWord = guestCount === 1 ? 'guest meal' : 'guest meals';
                return `${requestedBy} requested to ${base} along with ${guestCount} ${guestWord} on <span class="date">${mealDate}</span>.`;
            }
        }

        return `${requestedBy} requested to ${base} on <span class="date">${mealDate}</span>.`;
    }

    function getRailClass(item) {
        if (item.guest === true) return 'rail-neutral';
        if (item.toggle_to === 'on') return 'rail-on';
        if (item.toggle_to === 'off') return 'rail-off';
        return 'rail-neutral';
    }

    // ---------- toast (Android-style) ----------
    function ensureToastContainer() {
        let el = document.querySelector('.toast-container');
        if (!el) {
            el = document.createElement('div');
            el.className = 'toast-container';
            document.body.appendChild(el);
        }
        return el;
    }

    function showToast(message, type = 'success', duration = 2000) {
        const containerEl = ensureToastContainer();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');

        containerEl.appendChild(toast);

        let removed = false;

        function removeToast() {
            if (removed) return;
            removed = true;

            toast.classList.add('toast-exit');

            const fallbackId = setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
                if (containerEl.children.length === 0 && containerEl.parentNode) {
                    containerEl.parentNode.removeChild(containerEl);
                }
            }, 250);

            toast.addEventListener('transitionend', function onEnd() {
                toast.removeEventListener('transitionend', onEnd);
                clearTimeout(fallbackId);
                if (toast.parentNode) toast.parentNode.removeChild(toast);
                if (containerEl.children.length === 0 && containerEl.parentNode) {
                    containerEl.parentNode.removeChild(containerEl);
                }
            });
        }

        setTimeout(removeToast, duration);
    }

    function toastTypeFromStatus(status) {
        if (status >= 200 && status < 300) return 'success';
        return 'error';
    }

    async function readResponseMessage(response) {
        try {
            const text = await response.text();
            if (!text) return null;
            try {
                const parsed = JSON.parse(text);
                if (parsed && typeof parsed.message === 'string') return parsed.message;
                if (parsed && typeof parsed.error === 'string') return parsed.error;
                return text;
            } catch (e) {
                return text;
            }
        } catch (e) {
            return null;
        }
    }

    // ---------- render one card ----------
    function createRequestCard(item) {
        const card = document.createElement('div');
        card.className = 'request-card';
        card.dataset.id = item.id;

        const profileSrc = getProfilePicture(item);
        const avatarFallback = createInitialAvatar(item.name);

        const username = escapeHTML(item.username || '');
        const department = escapeHTML(item.department || '');
        const batch = escapeHTML(item.batch ? `Batch ${item.batch}` : '');
        const sentence = buildSentence(item);
        const railClass = getRailClass(item);

        card.innerHTML = `
            <div class="card-top">
                <img class="profile-picture"
                     src="${escapeHTML(profileSrc)}"
                     alt="${escapeHTML(item.name || 'Unknown')}"
                     loading="lazy"
                     onerror="this.src='${avatarFallback}'">

                <div class="user-info">
                    <h3 class="name">${escapeHTML(item.name || 'Unknown')}</h3>
                    <div class="user-details">
                        <span class="username">${username}</span>
                        <span class="detail-separator"></span>
                        <span class="department-batch">${department}${batch ? ' · ' + batch : ''}</span>
                    </div>
                </div>
            </div>

            <p class="request-sentence ${railClass}">${sentence}</p>

            <div class="card-actions">
                <button class="action-button reject" type="button" data-action="reject">Reject</button>
                <button class="action-button approve" type="button" data-action="approve">Approve</button>
            </div>
        `;

        const approveBtn = card.querySelector('[data-action="approve"]');
        const rejectBtn = card.querySelector('[data-action="reject"]');

        approveBtn.addEventListener('click', () => handleAction(item.id, true, approveBtn, rejectBtn));
        rejectBtn.addEventListener('click', () => handleAction(item.id, false, rejectBtn, approveBtn));

        return card;
    }

    // ---------- API call & UI feedback ----------
    async function handleAction(id, approve, clickedBtn, otherBtn) {
        const card = clickedBtn.closest('.request-card');
        const buttons = card.querySelectorAll('.action-button');
        const originalTexts = new Map();
        buttons.forEach(btn => {
            originalTexts.set(btn, btn.innerHTML);
            btn.disabled = true;
        });

        clickedBtn.innerHTML = '<span class="button-spinner"></span>';

        try {
            const response = await fetch('/force-toggle-meal/proceed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, approve: approve })
            });

            const message = await readResponseMessage(response);
            const type = toastTypeFromStatus(response.status);
            const fallback = response.ok
                ? (approve ? 'Meal approved.' : 'Meal rejected.')
                : `Request failed (${response.status}).`;

            showToast(message || fallback, type);

            if (!response.ok) {
                throw new Error(message || `Server responded with ${response.status}`);
            }

            card.remove();

            if (container.children.length === 0) {
                showEmptyState();
            }

        } catch (error) {
            console.error('Action failed:', error);

            if (error && error.name === 'TypeError') {
                showToast('Network error. Please try again.', 'error');
            }

            buttons.forEach(btn => {
                btn.disabled = false;
                btn.innerHTML = originalTexts.get(btn);
            });

            card.classList.add('action-error');
            setTimeout(() => card.classList.remove('action-error'), 400);
        }
    }

    // ---------- loading, empty, error states ----------
    function showLoading() {
        container.innerHTML = `
            <div class="loading-state">
                <span>Loading requests</span>
                <span class="loading-dots">
                    <span></span><span></span><span></span>
                </span>
            </div>
        `;
    }

    function showEmptyState() {
        container.innerHTML = `
            <div class="state-box">
                <h3 class="state-title">No pending requests</h3>
                <p class="state-message">All meal requests have been processed.</p>
            </div>
        `;
    }

    function showError(message) {
        container.innerHTML = `
            <div class="state-box">
                <h3 class="state-title">Something went wrong</h3>
                <p class="state-message">${escapeHTML(message || 'Failed to load requests.')}</p>
                <button id="retryButton" type="button">Retry</button>
            </div>
        `;
        const retryBtn = document.getElementById('retryButton');
        if (retryBtn) {
            retryBtn.addEventListener('click', loadRequests);
        }
    }

    // ---------- load data from endpoint ----------
    async function loadRequests() {
        showLoading();

        try {
            const response = await fetch('/force-toggle-meal');

            if (response.redirected) {
                window.location.href = response.url;
                return;
            }

            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}`);
            }

            const data = await response.json();
            const items = Array.isArray(data) ? data : (Array.isArray(data.users) ? data.users : []);

            if (items.length === 0) {
                showEmptyState();
                return;
            }

            const sorted = [...items].sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at) : 0;
                const dateB = b.created_at ? new Date(b.created_at) : 0;
                return dateB - dateA;
            });

            container.innerHTML = '';
            sorted.forEach(item => {
                container.appendChild(createRequestCard(item));
            });

        } catch (error) {
            console.error('Failed to load requests:', error);
            showError(error.message);
        }
    }

    // ---------- start ----------
    loadRequests();
})();