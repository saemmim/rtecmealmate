/* ============================================================================
   SECTION: API Configuration                                            START
   ============================================================================
   Change these URLs if your backend uses different routes.
   shared/bulletin.js and shared/receipts.js have their own API blocks.
============================================================================ */

const API = {

    // User Approval (identical endpoints to the standalone user-approval.js)
    pending: "/user-approval/pending",
    approved: "/user-approval/approved",
    banned: "/user-approval/banned",

    approve: (id) => `/user-approval/${encodeURIComponent(id)}/approve`,
    ban: (id) => `/user-approval/${encodeURIComponent(id)}/ban`,
    unban: (id) => `/user-approval/${encodeURIComponent(id)}/unban`,

    // Select Representatives
    //
    // GET  representatives/true   -> current representatives
    // GET  representatives/false  -> eligible users (everyone else)
    // POST representatives/assign -> body: { user_id }
    // POST representatives/remove -> body: { user_id }
    repsCurrent: "/representatives/true",
    repsEligible: "/representatives/false",

    repsAssign: "/representatives/assign",
    repsRemove: "/representatives/remove",

    // Manage Batches
    //
    // GET  /batches               -> [ { batch, name, status, total_students } ]
    // POST /batches               -> body: [ { batch, name } ]
    // POST /batches/change-status -> body: { batch, setStatus: "open" | "archived" | "deleted" }
    // POST /batches/new           -> body: { batch, name }
    batches: "/batches",
    batchesStatus: "/batches/change-status",
    batchesNew: "/batches/new",

    // Logout
    logout: "../auth/logout"
};

/* ============================================================================
   SECTION: API Configuration                                              END
============================================================================ */


/* ============================================================================
   SECTION: General Configuration                                       START
   ============================================================================ */

const REQUEST_TIMEOUT = 1000 * 60;

/* ============================================================================
   SECTION: General Configuration                                         END
============================================================================ */


/* ============================================================================
   SECTION: DOM — Dashboard Shell                                       START
   ============================================================================ */

const bottomTabs = document.querySelectorAll(".bottom-tab");
const dashboardSections = document.querySelectorAll(".dashboard-section");

/* ============================================================================
   SECTION: DOM — Dashboard Shell                                          END
============================================================================ */


/* ============================================================================
   SECTION: Bottom Tab Switching                                        START
   ============================================================================ */

function setupBottomTabs() {

    bottomTabs.forEach(tab => {

        tab.addEventListener("click", () => {

            const sectionName = tab.dataset.tab;

            activateSection(sectionName);
        });
    });
}


function activateSection(sectionName) {

    bottomTabs.forEach(tab => {
        tab.classList.toggle("active", tab.dataset.tab === sectionName);
    });

    dashboardSections.forEach(section => {
        section.classList.toggle("active", section.dataset.section === sectionName);
    });

    initializeSection(sectionName);
}


// Reloads a section's data. Runs on EVERY click of a bottom tab, including a
// click on the tab that is already open, and once at startup.
function initializeSection(sectionName) {

    switch (sectionName) {

        case "receipts": {
            // Provided by shared/receipts.js. init() builds the structure the
            // first time (tracked via root.dataset.receiptInitialized),
            // refresh() just reloads the data on every click after that.
            const root = document.getElementById("receipts-root");

            if (root.dataset.receiptInitialized === "true") {
                window.ReceiptsModule?.refresh(root);
            } else {
                window.ReceiptsModule?.init(root);
            }

            break;
        }

        case "bulletin": {
            // Provided by shared/bulletin.js. Same init-then-refresh pattern,
            // tracked via root.dataset.bulletinInitialized.
            const root = document.getElementById("bulletin-root");

            if (root.dataset.bulletinInitialized === "true") {
                window.BulletinModule?.refresh(root);
            } else {
                window.BulletinModule?.init(root);
            }

            break;
        }

        case "representatives":
            loadRepsTab("users");
            loadRepsTab("representatives");
            break;

        case "approval":
            loadApprovalTab("pending");
            loadApprovalTab("approved");
            loadApprovalTab("banned");
            break;

        case "options":
            // Nothing to fetch — static list.
            break;
    }
}

/* ============================================================================
   SECTION: Bottom Tab Switching                                           END
============================================================================ */


/* ============================================================================
   SECTION: Shared Helpers                                               START
   ============================================================================ */

async function fetchWithTimeout(url, options = {}, timeout = 10000) {

    const controller = new AbortController();

    const timeoutId = setTimeout(() => { controller.abort(); }, timeout);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}


async function fetchJson(url) {

    const response = await fetchWithTimeout(
        url,
        { method: "GET", headers: { "Accept": "application/json" } },
        REQUEST_TIMEOUT
    );

    if (!response.ok) {
        throw new Error(`Request to ${url} failed: ${response.status}`);
    }

    return response.json();
}


function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function createInitialAvatar(name) {

    const initial = String(name || "?").trim().charAt(0).toUpperCase();

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


function showLoading(container) {

    container.innerHTML = `
        <div class="loading-state">
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <span>Loading...</span>
        </div>
    `;
}


function showStateBox(container, title, message, onRetry) {

    container.innerHTML = `
        <div class="state-box">
            <h2 class="state-title">${escapeHtml(title)}</h2>
            <p class="state-message">${escapeHtml(message)}</p>
            ${onRetry ? '<button type="button" class="retry-button" id="retryButton">Try again</button>' : ""}
        </div>
    `;

    if (onRetry) {
        document.getElementById("retryButton").addEventListener("click", onRetry);
    }
}

/* ============================================================================
   SECTION: Shared Helpers                                                 END
============================================================================ */


/* ============================================================================
   SECTION: User Approval                                                START
   ============================================================================
   Same behaviour as the standalone user-approval.js, adapted to live
   inside a dashboard tab (container ids: approvalUserList, pendingCount,
   approvedCount, bannedCount).
============================================================================ */

// --- DOM refs ---------------------------------------------------------------

const approvalUserList = document.getElementById("approvalUserList");
const approvalTabs = document.querySelectorAll("[data-approval-tab]");

const approvalCounts = {
    pending: document.getElementById("pendingCount"),
    approved: document.getElementById("approvedCount"),
    banned: document.getElementById("bannedCount")
};

const approvalBadge = document.getElementById("approvalBadge");

// --- State -------------------------------------------------------------------

let currentApprovalTab = "pending";

const approvalUsers = {
    pending: [],
    approved: [],
    banned: []
};


// --- Tab switching -----------------------------------------------------------

function setupApprovalTabs() {

    approvalTabs.forEach(tab => {

        tab.addEventListener("click", () => {

            const tabName = tab.dataset.approvalTab;

            if (tabName === currentApprovalTab) {
                return;
            }

            currentApprovalTab = tabName;

            approvalTabs.forEach(t => t.classList.toggle("active", t.dataset.approvalTab === tabName));

            renderApprovalUsers(tabName);
        });
    });
}


// --- Fetching ------------------------------------------------------------------

function getApprovalEndpoint(tabName) {

    switch (tabName) {
        case "pending": return API.pending;
        case "approved": return API.approved;
        case "banned": return API.banned;
        default: throw new Error(`Unknown tab: ${tabName}`);
    }
}


async function loadApprovalTab(tabName) {

    if (currentApprovalTab === tabName) {
        showLoading(approvalUserList);
    }

    try {

        const response = await fetchWithTimeout(
            getApprovalEndpoint(tabName),
            { method: "GET", headers: { "Accept": "application/json" } },
            REQUEST_TIMEOUT
        );

        if (!response.ok) {
            throw new Error(`Failed to load users: ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("Backend returned an invalid users format.");
        }

        approvalUsers[tabName] = data;

        updateApprovalCounts();

        if (currentApprovalTab === tabName) {
            renderApprovalUsers(tabName);
        }

    } catch (error) {

        console.error(error);

        if (currentApprovalTab === tabName) {
            showStateBox(
                approvalUserList,
                "Something went wrong",
                "Could not load users. Please try again.",
                () => loadApprovalTab(currentApprovalTab)
            );
        }
    }
}


// --- Rendering -----------------------------------------------------------------

function renderApprovalUsers(tabName) {

    const userData = approvalUsers[tabName];

    if (!userData || userData.length === 0) {

        const messages = {
            pending: "There are no pending users.",
            approved: "There are no approved users.",
            banned: "There are no banned users."
        };

        approvalUserList.innerHTML = `
            <div class="state-box">
                <h2 class="state-title">No users found</h2>
                <p class="state-message">${messages[tabName]}</p>
            </div>
        `;

        return;
    }

    approvalUserList.innerHTML = userData.map(user => createApprovalUserCard(user, tabName)).join("");
}


function createApprovalUserCard(user, tabName) {

    if (user.profile_picture) {
            return `
        <article class="user-card" data-user-id="${escapeHtml(user.id)}">

            <img class="profile-picture" src="../${escapeHtml(user.profile_picture)}" alt="${escapeHtml(user.name)}" loading="lazy" onerror="this.src='${createInitialAvatar(user.name)}'">

            <div class="user-info">
                <h2 class="name">${escapeHtml(user.name)}</h2>

                <div class="user-details">
                    <span class="username">${escapeHtml(user.username)}</span>
                    <span class="detail-separator"></span>
                    <span class="department-batch">${escapeHtml(user.department)} | ${escapeHtml(user.batch)}</span>
                    <span class="detail-separator"></span>
                    <span class="phone">${escapeHtml(user.phone)}</span>
                </div>
            </div>

            <div class="action-area">${createApprovalActionButton(user, tabName)}</div>

        </article>
    `;
    }

    else {
        const profilePicture = createInitialAvatar(user.name);

        return `
            <article class="user-card" data-user-id="${escapeHtml(user.id)}">

                <img class="profile-picture" src="${escapeHtml(profilePicture)}" alt="${escapeHtml(user.name)}" loading="lazy" onerror="this.src='${createInitialAvatar(user.name)}'">

                <div class="user-info">
                    <h2 class="name">${escapeHtml(user.name)}</h2>

                    <div class="user-details">
                        <span class="username">${escapeHtml(user.username)}</span>
                        <span class="detail-separator"></span>
                        <span class="department-batch">${escapeHtml(user.department)} | ${escapeHtml(user.batch)}</span>
                        <span class="detail-separator"></span>
                        <span class="phone">${escapeHtml(user.phone)}</span>
                    </div>
                </div>

                <div class="action-area">${createApprovalActionButton(user, tabName)}</div>

            </article>
        `;
    }
}


function createApprovalActionButton(user, tabName) {

    let label, action, className;

    switch (tabName) {

        case "pending":
            label = "Approve"; action = "approve"; className = "approve";
            break;

        case "approved":
            label = "Ban"; action = "ban"; className = "ban";
            break;

        case "banned":
            label = "Unban"; action = "unban"; className = "unban";
            break;

        default: return "";
    }

    return `<button type="button" class="action-button ${className}" data-action="${action}" data-user-id="${escapeHtml(user.id)}">${label}</button>`;
}


// --- Actions (approve / ban / unban) --------------------------------------------

approvalUserList.addEventListener("click", async (event) => {

    const button = event.target.closest("[data-action]");

    if (!button || button.disabled) {
        return;
    }

    const action = button.dataset.action;
    const userId = button.dataset.userId;

    await performApprovalAction(userId, action, button);
});


async function performApprovalAction(userId, action, button) {

    const endpoint = getApprovalActionEndpoint(userId, action);

    button.disabled = true;

    const originalText = button.innerHTML.trim();

    button.innerHTML = `<span class="button-spinner"></span>`;

    try {

        const response = await fetchWithTimeout(
            endpoint,
            { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" } },
            REQUEST_TIMEOUT
        );

        let result = null;

        try {
            result = await response.json();
        } catch {
            throw new Error("Backend returned no valid response.");
        }

        if (!response.ok || response.status !== 200) {
            if (result?.message) {
                console.error(result.message);
            }

            throw new Error(result?.message || `Request failed: ${response.status}`);
        }

        removeApprovalUserFromCurrentList(userId);
        refreshApprovalCounts();

    } catch (error) {

        console.error(`Failed to ${action} user ${userId}:`, error);

        button.disabled = false;
        button.innerHTML = originalText;

        button.classList.remove("action-error");
        void button.offsetWidth;
        button.classList.add("action-error");

        setTimeout(() => button.classList.remove("action-error"), 400);
    }
}


function getApprovalActionEndpoint(userId, action) {

    switch (action) {
        case "approve": return API.approve(userId);
        case "ban": return API.ban(userId);
        case "unban": return API.unban(userId);
        default: throw new Error(`Unknown action: ${action}`);
    }
}


function removeApprovalUserFromCurrentList(userId) {

    approvalUsers[currentApprovalTab] = approvalUsers[currentApprovalTab].filter(
        user => String(user.id) !== String(userId)
    );

    updateApprovalCounts();
    renderApprovalUsers(currentApprovalTab);
}


// --- Counts ----------------------------------------------------------------------

function updateApprovalCounts() {

    approvalCounts.pending.textContent = approvalUsers.pending.length;
    approvalCounts.approved.textContent = approvalUsers.approved.length;
    approvalCounts.banned.textContent = approvalUsers.banned.length;

    // Surface pending count as a badge on the bottom nav item.
    const pendingTotal = approvalUsers.pending.length;

    if (pendingTotal > 0) {
        approvalBadge.style.display = "inline-flex";
        approvalBadge.textContent = pendingTotal > 99 ? "99+" : String(pendingTotal);
    } else {
        approvalBadge.style.display = "none";
    }
}


async function refreshApprovalCounts() {

    const tabNames = ["pending", "approved", "banned"];

    try {

        await Promise.all(tabNames.map(async tabName => {

            const response = await fetchWithTimeout(
                getApprovalEndpoint(tabName),
                { method: "GET", headers: { "Accept": "application/json" } },
                REQUEST_TIMEOUT
            );

            if (!response.ok) {
                throw new Error(`Failed to refresh ${tabName}: ${response.status}`);
            }

            const data = await response.json();

            if (!Array.isArray(data)) {
                throw new Error(`Invalid ${tabName} users format.`);
            }

            approvalUsers[tabName] = data;
        }));

        updateApprovalCounts();
        renderApprovalUsers(currentApprovalTab);

    } catch (error) {
        console.error("Failed to refresh user counts:", error);
    }
}

/* ============================================================================
   SECTION: User Approval                                                   END
============================================================================ */


/* ============================================================================
   SECTION: Select Representatives                                       START
   ============================================================================
   Two sub-tabs: eligible Users, and current Representatives.

   Backend routes (see API block above):
       GET  /representatives/true   -> current representatives
       GET  /representatives/false  -> eligible users (everyone else)
       POST /representatives/assign -> body: { user_id }
       POST /representatives/remove -> body: { user_id }
============================================================================ */

// --- DOM refs ---------------------------------------------------------------

const repsSubtabs = document.querySelectorAll("[data-reps-tab]");

const repsContainers = {
    users: document.getElementById("repsUsersList"),
    representatives: document.getElementById("repsRepresentativesList")
};

const repsActiveCount = document.getElementById("repsActiveCount");

// --- State -------------------------------------------------------------------

let currentRepsTab = "users";

const repsData = {
    users: [],
    representatives: []
};


// --- Tab switching -----------------------------------------------------------

function setupRepsSubtabs() {

    repsSubtabs.forEach(tab => {

        tab.addEventListener("click", () => {

            const tabName = tab.dataset.repsTab;

            if (tabName === currentRepsTab) {
                return;
            }

            currentRepsTab = tabName;

            repsSubtabs.forEach(t => t.classList.toggle("active", t.dataset.repsTab === tabName));

            Object.entries(repsContainers).forEach(([name, el]) => {
                el.style.display = name === tabName ? "" : "none";
            });
        });
    });
}


// --- Fetching ------------------------------------------------------------------

function getRepsEndpoint(tabName) {

    switch (tabName) {
        case "users": return API.repsEligible;          // representatives/false
        case "representatives": return API.repsCurrent;  // representatives/true
        default: throw new Error(`Unknown reps tab: ${tabName}`);
    }
}


async function loadRepsTab(tabName) {

    const container = repsContainers[tabName];

    if (currentRepsTab === tabName) {
        showLoading(container);
    }

    try {

        const response = await fetchWithTimeout(
            getRepsEndpoint(tabName),
            { method: "GET", headers: { "Accept": "application/json" } },
            REQUEST_TIMEOUT
        );

        if (!response.ok) {
            throw new Error(`Failed to load ${tabName}: ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("Backend returned an invalid format.");
        }

        repsData[tabName] = data;

        if (tabName === "representatives") {
            repsActiveCount.textContent = data.length;
        }

        renderRepsTab(tabName);

    } catch (error) {

        console.error(error);

        showStateBox(
            container,
            "Something went wrong",
            `Could not load ${tabName}. Please try again.`,
            () => loadRepsTab(tabName)
        );
    }
}


// --- Rendering -----------------------------------------------------------------

function renderRepsTab(tabName) {

    const container = repsContainers[tabName];
    const data = repsData[tabName];

    if (!data || data.length === 0) {

        const messages = {
            users: "There are no eligible users to promote.",
            representatives: "There are no current representatives."
        };

        container.innerHTML = `
            <div class="state-box">
                <h2 class="state-title">Nothing here</h2>
                <p class="state-message">${messages[tabName]}</p>
            </div>
        `;

        return;
    }

    container.innerHTML = data.map(user => createRepsUserCard(user, tabName)).join("");
}


function createRepsUserCard(user, tabName) {

    const profilePicture = user.profile_picture || createInitialAvatar(user.name);

    const isEligibleTab = tabName === "users";

    const actionLabel = isEligibleTab ? "Make Rep" : "Remove";
    const actionName = isEligibleTab ? "make-rep" : "remove-rep";
    const actionClass = isEligibleTab ? "make-rep" : "remove-rep";

    return `
        <article class="user-card" data-user-id="${escapeHtml(user.id)}">

            <img class="profile-picture" src="${escapeHtml(profilePicture)}" alt="${escapeHtml(user.name)}" loading="lazy" onerror="this.src='${createInitialAvatar(user.name)}'">

            <div class="user-info">
                <h2 class="name">${escapeHtml(user.name)}</h2>

                <div class="user-details">
                    <span class="username">${escapeHtml(user.username)}</span>
                    <span class="detail-separator"></span>
                    <span class="department-batch">${escapeHtml(user.department)} | ${escapeHtml(user.batch)}</span>
                    <span class="detail-separator"></span>
                    <span class="phone">${escapeHtml(user.phone)}</span>
                </div>
            </div>

            <div class="action-area">
                <button type="button" class="action-button ${actionClass}" data-reps-action="${actionName}" data-user-id="${escapeHtml(user.id)}">${actionLabel}</button>
            </div>

        </article>
    `;
}


// --- Actions (make representative / remove representative) ---------------------

// Delegate clicks for both "users" and "representatives" sub-lists.
[repsContainers.users, repsContainers.representatives].forEach(container => {

    container.addEventListener("click", async (event) => {

        const button = event.target.closest("[data-reps-action]");

        if (!button || button.disabled) {
            return;
        }

        const action = button.dataset.repsAction;
        const userId = button.dataset.userId;

        await performRepsAction(userId, action, button);
    });
});


async function performRepsAction(userId, action, button) {

    // Both endpoints are fixed routes — the target user is identified by
    // "user_id" in the JSON body rather than in the URL. Adjust the field
    // name below if the backend expects something else (e.g. "userId").
    const endpoint = action === "make-rep" ? API.repsAssign : API.repsRemove;

    button.disabled = true;

    const originalText = button.innerHTML.trim();

    button.innerHTML = `<span class="button-spinner"></span>`;

    try {

        const response = await fetchWithTimeout(
            endpoint,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ user_id: userId })
            },
            REQUEST_TIMEOUT
        );

        let result = null;

        try {
            result = await response.json();
        } catch {
            throw new Error("Backend returned no valid response.");
        }

        if (!response.ok || response.status !== 200) {
            if (result?.message) {
                console.error(result.message);
            }

            throw new Error(result?.message || `Request failed: ${response.status}`);
        }

        // Move the user between lists locally, then let the two affected
        // tabs re-sync in the background.
        const sourceTab = action === "make-rep" ? "users" : "representatives";

        repsData[sourceTab] = repsData[sourceTab].filter(user => String(user.id) !== String(userId));

        renderRepsTab(currentRepsTab);

        loadRepsTab("users");
        loadRepsTab("representatives");

    } catch (error) {

        console.error(`Failed to ${action} user ${userId}:`, error);

        button.disabled = false;
        button.innerHTML = originalText;

        button.classList.remove("action-error");
        void button.offsetWidth;
        button.classList.add("action-error");

        setTimeout(() => button.classList.remove("action-error"), 400);
    }
}

/* ============================================================================
   SECTION: Select Representatives                                          END
============================================================================ */


/* ============================================================================
   SECTION: Options — Dark Mode, Logout                                  START
   ============================================================================ */

const DARK_MODE_KEY = "rtec-dark-mode";

const darkModeToggle = document.getElementById("darkModeToggle");
const logoutButton = document.getElementById("logoutButton");


function applyTheme(isDark) {

    document.body.classList.toggle("dark-mode", isDark);
    document.body.classList.toggle("light-mode", !isDark);

    darkModeToggle.checked = isDark;
}


function setupOptions() {

    // Restore saved preference, falling back to the OS setting.
    const saved = localStorage.getItem(DARK_MODE_KEY);

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    applyTheme(saved !== null ? saved === "true" : prefersDark);

    darkModeToggle.addEventListener("change", () => {

        applyTheme(darkModeToggle.checked);

        localStorage.setItem(DARK_MODE_KEY, String(darkModeToggle.checked));
    });

    document.getElementById("manageBatchesOption").addEventListener("click", openBatchManager);

    logoutButton.addEventListener("click", async () => {

        logoutButton.disabled = true;

        try {

            await fetchWithTimeout(
                API.logout,
                { method: "POST", headers: { "Accept": "application/json" } },
                REQUEST_TIMEOUT
            );

        } catch (error) {

            console.error("Logout request failed:", error);

            // Fall through and redirect anyway — session cookie/token
            // expiry on the backend should still invalidate access.

        } finally {

            // Adjust this path once the login page's location is finalized.
            window.location.href = "../authentication.html";
        }
    });
}

/* ============================================================================
   SECTION: Options — Dark Mode, Logout                                    END
============================================================================ */


/* ============================================================================
   SECTION: Options — Manage Batches                                    START
   ============================================================================
   GET  /batches               -> [ { batch, name, status, total_students } ]
        status: open | archived | reopened
   POST /batches               -> [ { batch: number, name } ]  (Save)
   POST /batches/change-status -> { batch: number, setStatus: "open" | "archived" | "deleted" }
   POST /batches/new           -> { batch: number }

   Archive / Reopen / Delete / Add New Batch hit the backend immediately.
   Name edits are only sent when Save is pressed.
============================================================================ */

// The newest batches that can never be archived.
const BATCHES_PROTECTED_LATEST = 4;

// Rows of the open panel: { batch, name, status, students }
let batchRows = [];


function ordinalNumber(value) {

    const n = Number(value);
    const lastTwo = n % 100;

    if (lastTwo >= 11 && lastTwo <= 13) {
        return `${n}th`;
    }

    switch (n % 10) {
        case 1: return `${n}st`;
        case 2: return `${n}nd`;
        case 3: return `${n}rd`;
        default: return `${n}th`;
    }
}


async function postJsonBody(url, body) {

    const response = await fetchWithTimeout(
        url,
        {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(body)
        },
        REQUEST_TIMEOUT
    );

    if (!response.ok) {
        throw new Error(`Request to ${url} failed: ${response.status}`);
    }

    return response;
}


// OK / Cancel popup with a custom message. Resolves true only for OK.
function confirmAction(message, okText = "OK") {

    return new Promise(resolve => {

        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.style.zIndex = "110";

        overlay.innerHTML = `
            <div class="modal-box" role="alertdialog" aria-modal="true">
                <p class="confirm-message">${escapeHtml(message)}</p>

                <div class="modal-actions">
                    <button type="button" class="action-button" data-confirm-cancel>Cancel</button>
                    <button type="button" class="action-button ban" data-confirm-ok>${escapeHtml(okText)}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const finish = result => {
            document.removeEventListener("keydown", onKeydown, true);
            overlay.remove();
            resolve(result);
        };

        const onKeydown = event => {
            if (event.key === "Escape") {
                event.stopPropagation();
                finish(false);
            }
        };

        document.addEventListener("keydown", onKeydown, true);

        overlay.addEventListener("click", event => {
            if (event.target === overlay) finish(false);
        });

        overlay.querySelector("[data-confirm-cancel]").addEventListener("click", () => finish(false));
        overlay.querySelector("[data-confirm-ok]").addEventListener("click", () => finish(true));

        overlay.querySelector("[data-confirm-cancel]").focus();
    });
}


function normalizeBatch(item) {

    const students = item.total_students;

    return {
        batch: Number(item.batch),
        name: String(item.name ?? ""),
        status: String(item.status ?? "open").toLowerCase(),
        // null when the backend doesn't report it, so Delete is never offered by guesswork.
        students: students === undefined || students === null ? null : Number(students)
    };
}


function nameKey(name) {
    return name.trim().toLowerCase();
}


function batchStatusChipClass(status) {

    switch (status) {
        case "open":     return "chip-green";
        case "reopened": return "chip-yellow";
        default:         return "chip-muted";
    }
}


function batchStatusLabel(status) {
    return status.charAt(0).toUpperCase() + status.slice(1);
}


function shakeElement(el) {

    if (!el || el.dataset.shaking) return;

    el.dataset.shaking = "1";

    el.classList.add("shake");

    el.addEventListener("animationend", () => {
        el.classList.remove("shake");
        delete el.dataset.shaking;
    }, { once: true });
}


async function openBatchManager() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-box batch-modal" role="dialog" aria-modal="true" aria-labelledby="batchModalTitle">
            <h3 class="modal-title" id="batchModalTitle">Manage Batches</h3>

            <div data-batch-body></div>
        </div>
    `;

    document.body.appendChild(overlay);

    const body = overlay.querySelector("[data-batch-body]");

    const close = () => {
        document.removeEventListener("keydown", onKeydown);
        overlay.remove();
    };

    const onKeydown = event => {
        if (event.key === "Escape") close();
    };

    document.addEventListener("keydown", onKeydown);

    // Not closed by clicking outside, so unsaved name edits aren't lost by accident.

    async function load() {

        body.innerHTML = `<div class="batch-empty">Loading batches...</div>`;

        try {

            const data = await fetchJson(API.batches);

            if (!Array.isArray(data)) {
                throw new Error("Backend returned an invalid batches format.");
            }

            batchRows = data.map(normalizeBatch).sort((a, b) => a.batch - b.batch);

            renderPanel();

        } catch (error) {

            console.error(error);

            body.innerHTML = `
                <div class="batch-empty">Could not load batches.</div>

                <div class="modal-actions">
                    <button type="button" class="action-button" data-batch-close>Close</button>
                    <button type="button" class="action-button approve" data-batch-retry>Retry</button>
                </div>
            `;

            body.querySelector("[data-batch-close]").addEventListener("click", close);
            body.querySelector("[data-batch-retry]").addEventListener("click", load);
        }
    }

    function rowActionsHtml(row, protectedFrom) {

        const buttons = [];

        if (row.status === "open" && row.batch < protectedFrom) {
            buttons.push(`<button type="button" class="action-button batch-action batch-archive" data-batch-action="archived" data-batch="${row.batch}" data-batch-btn>Archive</button>`);
        }

        if (row.status === "archived") {
            buttons.push(`<button type="button" class="action-button batch-action batch-reopen" data-batch-action="open" data-batch="${row.batch}" data-batch-btn>Reopen</button>`);
        }

        if (row.students === 0) {
            buttons.push(`<button type="button" class="action-button batch-action batch-delete" title="Delete" aria-label="Delete batch" data-batch-action="deleted" data-batch="${row.batch}" data-batch-btn>&#x2715;</button>`);
        }

        return buttons.join("");
    }

    function rowsHtml() {

        // The four highest batch numbers are never archivable.
        const numbers = batchRows.map(row => row.batch).sort((a, b) => b - a);
        const protectedFrom = numbers.length > BATCHES_PROTECTED_LATEST
            ? numbers[BATCHES_PROTECTED_LATEST - 1]
            : -Infinity;

        return batchRows.map(row => `
            <tr data-batch-row="${row.batch}">
                <td>
                    <input type="text" class="batch-name-input" data-batch-name="${row.batch}"
                           value="${escapeHtml(row.name)}" maxlength="40"
                           placeholder="${ordinalNumber(row.batch)} batch"
                           aria-label="Name of the ${ordinalNumber(row.batch)} batch">
                </td>
                <td class="numeric batch-cell-students">${row.students === null ? "—" : row.students}</td>
                <td>
                    <div class="batch-status-cell">
                        <span class="chip ${batchStatusChipClass(row.status)}">${escapeHtml(batchStatusLabel(row.status))}</span>
                        <div class="batch-action-col">${rowActionsHtml(row, protectedFrom)}</div>
                    </div>
                </td>
            </tr>
        `).join("");
    }

    function renderPanel() {

        body.innerHTML = `
            <div class="batch-table-wrap">
                <table class="batch-table">
                    <colgroup>
                        <col class="col-batch">
                        <col class="col-students">
                        <col class="col-status">
                    </colgroup>
                    <thead>
                        <tr>
                            <th>Batch</th>
                            <th class="numeric">Students</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody data-batch-tbody>${rowsHtml()}</tbody>
                </table>
            </div>

            <button type="button" class="action-button batch-add-button" data-batch-add>+ Add New Batch</button>

            <p class="form-error" data-batch-error style="display:none;"></p>

            <div class="modal-actions">
                <button type="button" class="action-button" data-batch-cancel>Cancel</button>
                <button type="button" class="action-button approve" data-batch-save>Save</button>
            </div>
        `;

        validate();
    }

    function showError(message) {

        const el = body.querySelector("[data-batch-error]");

        if (!el) return;

        el.textContent = message;
        el.style.display = message ? "block" : "none";
    }

    // Marks empty / duplicate names and enables Save only when everything is valid.
    function validate() {

        const counts = new Map();

        batchRows.forEach(row => {
            const key = nameKey(row.name);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        });

        let message = "";

        batchRows.forEach(row => {

            const input = body.querySelector(`[data-batch-name="${row.batch}"]`);
            const key = nameKey(row.name);

            const isEmpty = key === "";
            const isDuplicate = !isEmpty && counts.get(key) > 1;

            input?.classList.toggle("invalid", isEmpty || isDuplicate);

            if (!message && isEmpty) {
                message = `The ${ordinalNumber(row.batch)} batch needs a name.`;
            } else if (!message && isDuplicate) {
                message = `The name "${row.name.trim()}" is used by more than one batch.`;
            }
        });

        showError(message);

        const save = body.querySelector("[data-batch-save]");

        if (save) {
            save.disabled = message !== "" || batchRows.length === 0;
        }
    }

    function setBusy(isBusy) {

        body.querySelectorAll("button, input").forEach(el => { el.disabled = isBusy; });

        if (!isBusy) {
            validate();
        }
    }

    body.addEventListener("input", event => {

        const input = event.target.closest("[data-batch-name]");

        if (!input) return;

        const row = batchRows.find(r => r.batch === Number(input.dataset.batchName));

        if (row) {
            row.name = input.value;
            validate();
        }
    });

    body.addEventListener("click", async event => {

        if (event.target.closest("[data-batch-cancel]")) {
            close();
            return;
        }

        if (event.target.closest("[data-batch-add]")) {
            await addBatch();
            return;
        }

        if (event.target.closest("[data-batch-save]")) {
            await save();
            return;
        }

        const actionButton = event.target.closest("[data-batch-action]");

        if (actionButton) {
            await changeStatus(Number(actionButton.dataset.batch), actionButton.dataset.batchAction);
        }
    });

    async function changeStatus(batch, setStatus) {

        const row = batchRows.find(r => r.batch === batch);

        if (!row) return;

        if (setStatus === "deleted") {

            const label = row.name.trim() ? `${ordinalNumber(batch)} batch (${row.name.trim()})` : `${ordinalNumber(batch)} batch`;

            if (!await confirmAction(`Delete the ${label}? This cannot be undone.`, "Delete")) {
                return;
            }
        }

        setBusy(true);
        showError("");

        try {

            await postJsonBody(API.batchesStatus, { batch, setStatus });

            if (setStatus === "deleted") {
                batchRows = batchRows.filter(r => r.batch !== batch);
            } else {
                row.status = setStatus;
            }

            // Re-render, keeping any name edits that haven't been saved yet.
            body.querySelector("[data-batch-tbody]").innerHTML = rowsHtml();

            setBusy(false);

        } catch (error) {

            console.error(error);

            setBusy(false);
            showError("Could not change the batch status. Please try again.");

            // Shake the button that was clicked so the user gets clear feedback.
            body.querySelectorAll(`[data-batch-btn][data-batch="${batch}"]`).forEach(shakeElement);
        }
    }

    async function addBatch() {

        const next = batchRows.reduce((max, row) => Math.max(max, row.batch), 0) + 1;

        setBusy(true);
        showError("");

        try {

            await postJsonBody(API.batchesNew, { batch: next, name: `${ordinalNumber(next)} Batch` });

            batchRows.push({ batch: next, name: `${ordinalNumber(next)} Batch`, status: "open", students: 0 });

            body.querySelector("[data-batch-tbody]").innerHTML = rowsHtml();

            setBusy(false);

            body.querySelector(`[data-batch-name="${next}"]`)?.focus();

        } catch (error) {

            console.error(error);

            setBusy(false);
            showError("Could not add a new batch. Please try again.");

            shakeElement(body.querySelector("[data-batch-add]"));
        }
    }

    async function save() {

        validate();

        if (body.querySelector("[data-batch-save]").disabled) {
            return;
        }

        setBusy(true);

        try {

            await postJsonBody(
                API.batches,
                batchRows.map(row => ({ batch: row.batch, name: row.name.trim() }))
            );

            close();

        } catch (error) {

            console.error(error);

            setBusy(false);
            showError("Could not save the batches. Please try again.");
        }
    }

    await load();
}

/* ============================================================================
   SECTION: Options — Manage Batches                                      END
============================================================================ */


/* ============================================================================
   SECTION: Initialize                                                   START
   ============================================================================ */

document.addEventListener("DOMContentLoaded", () => {

    setupBottomTabs();
    setupApprovalTabs();
    setupRepsSubtabs();
    setupOptions();

    // Select Representatives is the default active tab for this dashboard.
    initializeSection("representatives");

    // Keep the pending-approval badge up to date even before that tab
    // has been opened, since it needs to reflect state at a glance.
    loadApprovalTab("pending");
});

/* ============================================================================
   SECTION: Initialize                                                     END
============================================================================ */
