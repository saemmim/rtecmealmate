/* ============================================================================
   SECTION: API Configuration                                            START
   ============================================================================
   Change these URLs if your backend uses different routes.
   shared/bulletin.js and shared/receipts.js have their own API blocks.

   Select Managers routes (mirrors /representatives, month-scoped):
       GET  managers/true?month=YYYY-MM   -> current managers for that month
       GET  managers/false?month=YYYY-MM  -> eligible users for that month
       POST managers/assign                -> body: { user_id, month }
       POST managers/remove                -> body: { user_id, month }

   Months tab:
       GET  /managers/month?query=YYYY-MM  -> [ { id, name, username, department, phone,
                                                  profile_picture, batch, status } ]
            status: open | reopen | close | reopened | closed
       POST /managers/month                -> body: { period: "YYYY-MM",
                                                      setStatus: "reopened" | "closed" }
                                              plus id: number, for Reject only

   Options tab:
       GET  /manager/period                -> [ { period: "YYYY-MM", status } ]
            (the months this user served as meal manager; decides whether the
            Meal Manager Dashboard link is shown)
============================================================================ */

const API = {

    managersCurrent: "/managers/true",
    managersEligible: "/managers/false",

    managersAssign: "/managers/assign",
    managersRemove: "/managers/remove",

    months: "/managers/month",          // GET  ?query=YYYY-MM
    monthApprove: "/managers/month",     // POST { period, setStatus } (+ id for Reject)

    managerPeriods: "/manager/period",   // GET

    logout: "/auth/logout"
};

/* ============================================================================
   SECTION: API Configuration                                              END
============================================================================ */


/* ============================================================================
   SECTION: General Configuration                                       START
   ============================================================================ */

const REQUEST_TIMEOUT = 1000 * 60;

// How many past months to offer in the dropdown, besides the current and
// next month. Adjust freely — there's no backend-driven lower bound.
const MONTH_LOOKBACK = 12;

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


// Reloads a section's data. Runs on EVERY click of a bottom tab — including
// a click on the tab that is already open — and once at startup for Managers.
function initializeSection(sectionName) {

    switch (sectionName) {

        case "receipts": {
            // Provided by shared/receipts.js. The module tracks its own
            // one-time DOM setup via root.dataset.receiptInitialized —
            // init() builds the structure the first time, refresh() just
            // reloads the data on every click after that.
            const root = document.getElementById("receipts-root");

            if (root.dataset.receiptInitialized === "true") {
                window.ReceiptsModule?.refresh(root);
            } else {
                window.ReceiptsModule?.init(root);
            }

            break;
        }

        case "bulletin": {
            // Provided by shared/bulletin.js. Same init-then-refresh
            // pattern as Receipts, tracked via root.dataset.bulletinInitialized.
            const root = document.getElementById("bulletin-root");

            if (root.dataset.bulletinInitialized === "true") {
                window.BulletinModule?.refresh(root);
            } else {
                window.BulletinModule?.init(root);
            }

            break;
        }

        case "managers":
            loadManagersForSelectedMonth();
            break;

        case "months":
            openMonthsTab();
            break;

        case "options":
            // Re-checks whether the Meal Manager link belongs here.
            loadOptionsAccess();
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
   SECTION: Select Managers — Month Handling                             START
   ============================================================================
   The month dropdown is populated entirely on the front end: MONTH_LOOKBACK
   past months, the current month, and the next month. Nothing beyond next
   month is ever offered, since managers can't be planned further ahead.
============================================================================ */

// --- DOM refs ---------------------------------------------------------------

const managerMonthSelect = document.getElementById("managerMonthSelect");
const addManagerButton = document.getElementById("addManagerButton");
const monthStatusNote = document.getElementById("monthStatusNote");
const managersList = document.getElementById("managersList");

// --- State -------------------------------------------------------------------

// "YYYY-MM" for whichever month is currently selected in the dropdown.
let selectedMonth = null;

let currentManagers = [];


// --- Month value helpers ------------------------------------------------------

function monthValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date) {
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// Returns "past", "current" or "next" relative to today's real-world month.
function monthStatus(value) {

    const now = new Date();
    const currentValue = monthValue(now);

    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextValue = monthValue(next);

    if (value === currentValue) return "current";
    if (value === nextValue) return "next";
    return "past";
}


// --- Dropdown population ------------------------------------------------------

function populateMonthDropdown() {

    const now = new Date();

    const options = [];

    // Next month first, then current, then MONTH_LOOKBACK months back —
    // most actionable months float to the top of the list.
    for (let offset = 1; offset >= -MONTH_LOOKBACK; offset--) {

        const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);

        options.push({ value: monthValue(date), label: monthLabel(date) });
    }

    managerMonthSelect.innerHTML = options
        .map(opt => `<option value="${opt.value}">${escapeHtml(opt.label)}</option>`)
        .join("");

    // Default to the current month.
    selectedMonth = monthValue(now);
    managerMonthSelect.value = selectedMonth;
}


function updateMonthControls() {

    const status = monthStatus(selectedMonth);

    // Add Manager: enabled for current + next month, disabled for past.
    addManagerButton.disabled = status === "past";

    const notes = {
        past: "This month is history — read only.",
        current: "You can add a manager for this month, but not remove one already assigned.",
        next: "You can add or remove managers for the upcoming month."
    };

    monthStatusNote.textContent = notes[status];
}


managerMonthSelect.addEventListener("change", () => {

    selectedMonth = managerMonthSelect.value;

    updateMonthControls();
    loadManagersForSelectedMonth();
});

/* ============================================================================
   SECTION: Select Managers — Month Handling                               END
============================================================================ */


/* ============================================================================
   SECTION: Select Managers — Managers List                              START
   ============================================================================ */

async function loadManagersForSelectedMonth() {

    updateMonthControls();

    showLoading(managersList);

    try {

        const response = await fetchWithTimeout(
            `${API.managersCurrent}?month=${encodeURIComponent(selectedMonth)}`,
            { method: "GET", headers: { "Accept": "application/json" } },
            REQUEST_TIMEOUT
        );

        if (!response.ok) {
            throw new Error(`Failed to load managers: ${response.status}`);
        }

        const data = await response.json();

        if (data.redirect) {
            window.location.href = data.redirect;
            return;
        }

        if (!Array.isArray(data)) {
            throw new Error("Backend returned an invalid managers format.");
        }

        currentManagers = data;

        renderManagersList();

    } catch (error) {

        console.error(error);

        showStateBox(
            managersList,
            "Something went wrong",
            "Could not load managers for this month. Please try again.",
            () => loadManagersForSelectedMonth()
        );
    }
}


function renderManagersList() {

    if (currentManagers.length === 0) {

        managersList.innerHTML = `
            <div class="state-box">
                <h2 class="state-title">No managers assigned</h2>
                <p class="state-message">No Meal Manager has been assigned for this month yet.</p>
            </div>
        `;

        return;
    }

    // Remove is only ever allowed for the upcoming month.
    const canRemove = monthStatus(selectedMonth) === "next";

    managersList.innerHTML = currentManagers.map(user => {

        const profilePicture = user.profile_picture || createInitialAvatar(user.name);

        return `
            <article class="user-card" data-user-id="${escapeHtml(user.id)}">

                <img class="profile-picture" src="${escapeHtml(profilePicture)}" alt="${escapeHtml(user.name)}" loading="lazy" onerror="this.src='${createInitialAvatar(user.name)}'">

                <div class="user-info">
                    <h2 class="name">${escapeHtml(user.name)}</h2>

                    <div class="user-details">
                        <span class="username">${escapeHtml(user.username)}</span>
                        <span class="detail-separator"></span>
                        <span class="department-batch">${escapeHtml(user.department)}</span>
                        <span class="detail-separator"></span>
                        <span class="phone">${escapeHtml(user.phone)}</span>
                    </div>
                </div>

                <div class="action-area">
                    <button type="button" class="action-button remove-manager" data-remove-manager="${escapeHtml(user.id)}" ${canRemove ? "" : "disabled"}>
                        Remove
                    </button>
                </div>

            </article>
        `;
    }).join("");
}


managersList.addEventListener("click", async (event) => {

    const button = event.target.closest("[data-remove-manager]");

    if (!button || button.disabled) {
        return;
    }

    await performManagerAction(button.dataset.removeManager, "remove", button);
});

/* ============================================================================
   SECTION: Select Managers — Managers List                                END
============================================================================ */


/* ============================================================================
   SECTION: Select Managers — Add Manager (modal picker)                 START
   ============================================================================ */

addManagerButton.addEventListener("click", () => {

    if (addManagerButton.disabled) {
        return;
    }

    openAddManagerModal();
});


async function openAddManagerModal() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-box">
            <h3 class="modal-title">Add Manager</h3>

            <div class="picker-list" data-picker-list>
                <div class="picker-empty">Loading eligible users...</div>
            </div>

            <p class="form-error" data-add-manager-error style="display:none;"></p>

            <div class="modal-actions">
                <button type="button" class="action-button" data-add-manager-cancel>Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
    });

    overlay.querySelector("[data-add-manager-cancel]").addEventListener("click", close);

    const pickerList = overlay.querySelector("[data-picker-list]");
    const errorEl = overlay.querySelector("[data-add-manager-error]");

    try {

        const response = await fetchWithTimeout(
            `${API.managersEligible}?month=${encodeURIComponent(selectedMonth)}`,
            { method: "GET", headers: { "Accept": "application/json" } },
            REQUEST_TIMEOUT
        );

        if (!response.ok) {
            throw new Error(`Failed to load eligible users: ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("Backend returned an invalid users format.");
        }

        if (data.length === 0) {
            pickerList.innerHTML = `<div class="picker-empty">No eligible users found for this month.</div>`;
            return;
        }

        pickerList.innerHTML = data.map(user => `
            <div class="picker-row" data-picker-user="${escapeHtml(user.id)}">
                <img class="picker-avatar" src="${escapeHtml(user.profile_picture || createInitialAvatar(user.name))}" alt="${escapeHtml(user.name)}" loading="lazy" onerror="this.src='${createInitialAvatar(user.name)}'">

                <div class="picker-info">
                    <p class="picker-name">${escapeHtml(user.name)}</p>
                    <p class="picker-meta">${escapeHtml(user.username)} &middot; ${escapeHtml(user.department)} &middot; ${escapeHtml(user.phone)}</p>
                </div>
            </div>
        `).join("");

        pickerList.querySelectorAll("[data-picker-user]").forEach(row => {

            row.addEventListener("click", async () => {

                if (row.classList.contains("selected")) {
                    return;
                }

                errorEl.style.display = "none";

                pickerList.querySelectorAll(".picker-row").forEach(r => r.classList.remove("selected"));
                row.classList.add("selected");

                const userId = row.dataset.pickerUser;

                const success = await assignManager(userId, errorEl);

                if (success) {
                    close();
                }
            });
        });

    } catch (error) {

        console.error("Failed to load eligible users:", error);

        pickerList.innerHTML = `<div class="picker-empty">Could not load eligible users. Please try again.</div>`;
    }
}


async function assignManager(userId, errorEl) {

    const success = await performManagerAction(userId, "assign");

    if (!success) {
        errorEl.textContent = "Could not assign this user as manager. Please try again.";
        errorEl.style.display = "block";
    }

    return success;
}

/* ============================================================================
   SECTION: Select Managers — Add Manager (modal picker)                   END
============================================================================ */


/* ============================================================================
   SECTION: Select Managers — Assign / Remove Request                    START
   ============================================================================ */

// Shared by both the Remove button (on a manager card) and the Add Manager
// picker. Returns true on success so callers can react (close a modal,
// re-enable a button, etc.) without duplicating the fetch/error logic.
async function performManagerAction(userId, action, button = null) {

    const endpoint = action === "assign" ? API.managersAssign : API.managersRemove;

    if (button) {
        button.disabled = true;
        button.innerHTML = `<span class="button-spinner"></span>`;
    }

    try {

        const response = await fetchWithTimeout(
            endpoint,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                // Adjust field names below if the backend expects something
                // else (e.g. "userId" / "month_value").
                body: JSON.stringify({ user_id: userId, month: selectedMonth })
            },
            REQUEST_TIMEOUT
        );

        let result = null;

        try {
            result = await response.json();
        } catch {
            throw new Error("Backend returned no valid response.");
        }

        if (!response.ok) {
            if (result?.message) {
                console.error(result.message);
            }

            throw new Error(result?.message || `Request failed: ${response.status}`);
        }

        // Re-fetch the managers list so the UI reflects the new state.
        await loadManagersForSelectedMonth();

        return true;

    } catch (error) {

        console.error(`Failed to ${action} manager ${userId}:`, error);

        if (button) {
            button.disabled = false;
            button.textContent = "Remove";

            button.classList.remove("action-error");
            void button.offsetWidth;
            button.classList.add("action-error");

            setTimeout(() => button.classList.remove("action-error"), 400);
        }

        return false;
    }
}

/* ============================================================================
   SECTION: Select Managers — Assign / Remove Request                      END
============================================================================ */


/* ============================================================================
   SECTION: Months                                                       START
   ============================================================================
   Shows the managers of one month, each with that month's status:

       open      -> "Open"                 green
       reopen    -> "Requested to reopen"  yellow   + Approve and Reject buttons
       close     -> "Requested to close"   purple   + Approve button
       reopened  -> "Reopened"             red      + Close button
       closed    -> "Closed"               normal text color

   The buttons POST to /managers/month, then the month is loaded again:
       reopen request: Approve -> { period, setStatus: "reopened" }
                       Reject  -> { id, period, setStatus: "closed" }
       close request:  Approve -> { period, setStatus: "closed" }
       reopened:       Close   -> { period, setStatus: "closed" }
   Only Reject carries the user id (the id from that card).

   The month selector offers the current month and the 11 before it (12 in
   total, never a future month). Each time the tab opens, every month is
   loaded in the background, strictly one after another. A red count badge
   shows on each month that has managers in reopen / close / reopened, and a
   total badge sits next to the selector.
============================================================================ */

const monthsDropdown = document.getElementById("monthsDropdown");
const monthsDropdownButton = document.getElementById("monthsDropdownButton");
const monthsDropdownLabel = document.getElementById("monthsDropdownLabel");
const monthsDropdownMenu = document.getElementById("monthsDropdownMenu");
const monthsTotalBadge = document.getElementById("monthsTotalBadge");
const monthsNote = document.getElementById("monthsNote");
const monthsList = document.getElementById("monthsList");

// Current month + 11 before it.
const MONTHS_SHOWN = 12;

// Statuses that put a badge on a month.
const MONTH_ATTENTION_STATUSES = new Set(["reopen", "close", "reopened"]);

// label / color tone / buttons, each with the setStatus it sends. Open and
// closed months have no buttons. Only Reject also sends the user's id, and
// Approve and Close ask for confirmation first (Reject does not).
const MONTH_STATUS_INFO = {
    open:     { label: "Open", tone: "green" },
    reopen:   {
        label: "Requested to reopen",
        tone: "yellow",
        actions: [
            { text: "Approve", setStatus: "reopened", className: "approve-month", confirm: true },
            { text: "Reject",  setStatus: "closed",   className: "reject-month", sendId: true }
        ]
    },
    close:    {
        label: "Requested to close",
        tone: "purple",
        actions: [
            { text: "Approve", setStatus: "closed", className: "approve-month", confirm: true }
        ]
    },
    reopened: {
        label: "Reopened",
        tone: "red",
        actions: [
            { text: "Close", setStatus: "closed", className: "close-month", confirm: true }
        ]
    },
    closed:   { label: "Closed", tone: "normal" }
};

// [{ value: "YYYY-MM", label: "October 2026" }], newest first.
let monthsOptions = [];

// "YYYY-MM" of the month being shown.
let monthsSelected = null;

// value -> { state: "loaded" | "error", users: [] }
const monthsStore = new Map();

// value -> Promise, for requests currently running (so one month is never
// requested twice at once).
const monthsInFlight = new Map();

// Months already fetched during the current visit to the tab.
const monthsFreshThisVisit = new Set();

// Bumped on every visit so an older background run stops by itself.
let monthsVisitToken = 0;


function normalizeMonthStatus(status) {
    return String(status ?? "").trim().toLowerCase();
}


function countAttention(value) {

    const entry = monthsStore.get(value);

    if (!entry) {
        return 0;
    }

    return entry.users.filter(user => MONTH_ATTENTION_STATUSES.has(normalizeMonthStatus(user.status))).length;
}


function buildMonthsOptions() {

    const now = new Date();

    monthsOptions = [];

    for (let offset = 0; offset < MONTHS_SHOWN; offset++) {

        const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);

        monthsOptions.push({ value: monthValue(date), label: monthLabel(date) });
    }
}


// --- Dropdown -------------------------------------------------------------------

function renderMonthsDropdown() {

    monthsDropdownMenu.innerHTML = monthsOptions.map(option => `
        <button type="button" class="month-dropdown-option" role="option" data-month="${option.value}" aria-selected="${option.value === monthsSelected}">
            <span>${escapeHtml(option.label)}</span>
            <span class="count-badge" hidden></span>
        </button>
    `).join("");

    monthsDropdownLabel.textContent = monthsOptions.find(option => option.value === monthsSelected)?.label ?? "";

    updateMonthBadges();
}


// Updates the badges in place, so an open menu keeps its focus while
// background requests finish.
function updateMonthBadges() {

    let total = 0;

    monthsDropdownMenu.querySelectorAll("[data-month]").forEach(option => {

        const count = countAttention(option.dataset.month);
        const badge = option.querySelector(".count-badge");

        total += count;

        badge.textContent = count > 99 ? "99+" : String(count);
        badge.hidden = count === 0;
    });

    monthsTotalBadge.textContent = total > 99 ? "99+" : String(total);
    monthsTotalBadge.hidden = total === 0;

    monthsTotalBadge.title = `${total} manager${total === 1 ? "" : "s"} need attention`;
    monthsTotalBadge.setAttribute("aria-label", monthsTotalBadge.title);
}


function openMonthsMenu() {

    monthsDropdownMenu.hidden = false;
    monthsDropdownButton.setAttribute("aria-expanded", "true");

    monthsDropdownMenu.querySelector('[aria-selected="true"]')?.focus();
}


function closeMonthsMenu(returnFocus = false) {

    if (monthsDropdownMenu.hidden) {
        return;
    }

    monthsDropdownMenu.hidden = true;
    monthsDropdownButton.setAttribute("aria-expanded", "false");

    if (returnFocus) {
        monthsDropdownButton.focus();
    }
}


function selectMonth(value) {

    monthsSelected = value;

    setMonthsNote("");

    monthsDropdownLabel.textContent = monthsOptions.find(option => option.value === value)?.label ?? "";

    monthsDropdownMenu.querySelectorAll("[data-month]").forEach(option => {
        option.setAttribute("aria-selected", String(option.dataset.month === value));
    });

    renderMonthsList();

    // Don't make the user wait for the background run to reach this month.
    if (!monthsFreshThisVisit.has(value) && !monthsInFlight.has(value)) {
        fetchMonth(value);
    }
}


monthsDropdownButton.addEventListener("click", () => {

    if (monthsDropdownMenu.hidden) {
        openMonthsMenu();
    } else {
        closeMonthsMenu();
    }
});

monthsDropdownMenu.addEventListener("click", event => {

    const option = event.target.closest("[data-month]");

    if (!option) {
        return;
    }

    selectMonth(option.dataset.month);
    closeMonthsMenu(true);
});

document.addEventListener("click", event => {

    if (!monthsDropdown.contains(event.target)) {
        closeMonthsMenu();
    }
});

monthsDropdown.addEventListener("keydown", event => {

    if (event.key === "Escape") {
        closeMonthsMenu(true);
        return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
    }

    event.preventDefault();

    if (monthsDropdownMenu.hidden) {
        openMonthsMenu();
        return;
    }

    const options = [...monthsDropdownMenu.querySelectorAll("[data-month]")];
    const index = options.indexOf(document.activeElement);

    const next = event.key === "ArrowDown"
        ? Math.min(index + 1, options.length - 1)
        : Math.max(index - 1, 0);

    options[next]?.focus();
});


// --- Loading --------------------------------------------------------------------

function setMonthsNote(text, isError = false) {

    monthsNote.textContent = text || "";
    monthsNote.classList.toggle("is-error", isError);
}


// Loads one month. A failed refresh keeps whatever was already on screen.
function fetchMonth(value) {

    if (monthsInFlight.has(value)) {
        return monthsInFlight.get(value);
    }

    const promise = (async () => {

        try {

            const data = await fetchJson(`${API.months}?query=${encodeURIComponent(value)}`);

            if (data && !Array.isArray(data) && data.redirect) {
                window.location.href = data.redirect;
                return;
            }

            if (!Array.isArray(data)) {
                throw new Error("Backend returned an invalid months format.");
            }

            monthsStore.set(value, { state: "loaded", users: data });

        } catch (error) {

            console.error(`Failed to load month ${value}:`, error);

            if (monthsStore.get(value)?.state !== "loaded") {
                monthsStore.set(value, { state: "error", users: [] });
            }

        } finally {

            monthsFreshThisVisit.add(value);
            monthsInFlight.delete(value);

            updateMonthBadges();

            if (value === monthsSelected) {
                renderMonthsList();
            }
        }
    })();

    monthsInFlight.set(value, promise);

    return promise;
}


// Like fetchMonth, but never settles for a request that began before now.
async function refreshMonth(value) {

    if (monthsInFlight.has(value)) {
        await monthsInFlight.get(value);
    }

    return fetchMonth(value);
}


// Every month, one after another, starting with the one on screen.
async function loadMonthsInBackground(token) {

    const order = [
        monthsSelected,
        ...monthsOptions.map(option => option.value).filter(value => value !== monthsSelected)
    ];

    for (const value of order) {

        if (token !== monthsVisitToken) {
            return;
        }

        if (monthsFreshThisVisit.has(value)) {
            continue;
        }

        await fetchMonth(value);
    }
}


function openMonthsTab() {

    const token = ++monthsVisitToken;

    buildMonthsOptions();

    // Keep the month the user was on; otherwise start on the current month.
    if (!monthsOptions.some(option => option.value === monthsSelected)) {
        monthsSelected = monthsOptions[0].value;
    }

    monthsFreshThisVisit.clear();

    closeMonthsMenu();
    setMonthsNote("");

    renderMonthsDropdown();
    renderMonthsList();

    loadMonthsInBackground(token);
}


// --- Rendering ------------------------------------------------------------------

function monthCardHtml(user) {

    const profilePicture = user.profile_picture || createInitialAvatar(user.name);

    const status = normalizeMonthStatus(user.status);
    const info = MONTH_STATUS_INFO[status] ?? { label: user.status ?? "—", tone: "normal" };

    const buttons = (info.actions ?? []).map(action => `
        <button type="button" class="action-button ${action.className}" data-set-status="${action.setStatus}"${action.sendId ? " data-send-id" : ""}${action.confirm ? " data-confirm" : ""}>${action.text}</button>
    `).join("");

    const actions = buttons ? `<div class="month-status-actions">${buttons}</div>` : "";

    return `
        <article class="user-card" data-user-id="${escapeHtml(user.id ?? "")}">

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

            <div class="action-area month-status-area">
                <span class="status-indicator status-${info.tone}">${escapeHtml(info.label)}</span>
                ${actions}
            </div>

        </article>
    `;
}


function renderMonthsList() {

    const value = monthsSelected;
    const entry = monthsStore.get(value);

    if (!entry) {
        showLoading(monthsList);
        return;
    }

    if (entry.state === "error") {

        showStateBox(
            monthsList,
            "Something went wrong",
            "Could not load this month. Please try again.",
            () => {
                monthsStore.delete(value);
                renderMonthsList();
                refreshMonth(value);
            }
        );

        return;
    }

    if (entry.users.length === 0) {

        monthsList.innerHTML = `
            <div class="state-box">
                <h2 class="state-title">No managers</h2>
                <p class="state-message">There are no managers for this month.</p>
            </div>
        `;

        return;
    }

    monthsList.innerHTML = entry.users.map(monthCardHtml).join("");
}


// --- Approve --------------------------------------------------------------------

const MONTH_CHANGE_CONFIRMATION = "This will change status of all the managers for the selected month.";


// OK / Cancel popup, same overlay and box as the other modals on this page.
// Resolves true for OK, false for Cancel, a click outside, or Escape.
function confirmMonthChange() {

    return new Promise(resolve => {

        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";

        overlay.innerHTML = `
            <div class="modal-box" role="alertdialog" aria-modal="true" aria-describedby="confirmMonthMessage">
                <p class="confirm-message" id="confirmMonthMessage">${escapeHtml(MONTH_CHANGE_CONFIRMATION)}</p>

                <div class="modal-actions">
                    <button type="button" class="action-button" data-confirm-cancel>Cancel</button>
                    <button type="button" class="action-button make-manager" data-confirm-ok>OK</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const finish = (result) => {
            document.removeEventListener("keydown", onKeydown);
            overlay.remove();
            resolve(result);
        };

        const onKeydown = (event) => {
            if (event.key === "Escape") finish(false);
        };

        document.addEventListener("keydown", onKeydown);

        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) finish(false);
        });

        overlay.querySelector("[data-confirm-cancel]").addEventListener("click", () => finish(false));
        overlay.querySelector("[data-confirm-ok]").addEventListener("click", () => finish(true));

        // Start on the safe choice.
        overlay.querySelector("[data-confirm-cancel]").focus();
    });
}


async function setMonthStatus(button) {

    const period = monthsSelected;
    const setStatus = button.dataset.setStatus;

    // Only Reject sends the user's id (saved on the card when it was drawn);
    // Approve and Close send just the month and the new status.
    const body = { period, setStatus };

    if (button.hasAttribute("data-send-id")) {

        const rawId = button.closest(".user-card").dataset.userId;
        const id = Number(rawId);

        if (rawId === "" || !Number.isFinite(id)) {

            console.error("The card has no valid user id:", rawId);

            setMonthsNote("Could not find this user's id. Please reload the tab and try again.", true);

            button.classList.remove("action-error");
            void button.offsetWidth;
            button.classList.add("action-error");

            setTimeout(() => button.classList.remove("action-error"), 400);

            return;
        }

        body.id = id;
    }

    // Every button on this card is locked while one request runs.
    const cardButtons = [...button.closest(".month-status-area").querySelectorAll("button")];
    const originalText = button.textContent;

    setMonthsNote("");

    cardButtons.forEach(cardButton => { cardButton.disabled = true; });
    button.innerHTML = `<span class="button-spinner"></span>`;

    try {

        const response = await fetchWithTimeout(
            API.monthApprove,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(body)
            },
            REQUEST_TIMEOUT
        );

        let result = null;

        try {
            result = await response.json();
        } catch {
            result = null;
        }

        if (!response.ok) {
            throw Object.assign(
                new Error(result?.message || `Request failed: ${response.status}`),
                { userMessage: result?.message }
            );
        }

        // Reload the month; this redraws the cards and updates the badges.
        await refreshMonth(period);

    } catch (error) {

        console.error(`Failed to set ${period} to ${setStatus}:`, error);

        cardButtons.forEach(cardButton => { cardButton.disabled = false; });
        button.textContent = originalText;

        button.classList.remove("action-error");
        void button.offsetWidth;
        button.classList.add("action-error");

        setTimeout(() => button.classList.remove("action-error"), 400);

        setMonthsNote(error.userMessage || "Could not update this month. Please try again.", true);
    }
}


monthsList.addEventListener("click", async event => {

    const button = event.target.closest("[data-set-status]");

    if (!button || button.disabled) {
        return;
    }

    // Approve and Close change every manager of the month, so ask first.
    if (button.hasAttribute("data-confirm") && !(await confirmMonthChange())) {
        return;
    }

    await setMonthStatus(button);
});

/* ============================================================================
   SECTION: Months                                                         END
============================================================================ */


/* ============================================================================
   SECTION: Options — Dark Mode, Logout                                  START
   ============================================================================
   The Meal Manager Dashboard link is only added for people who may open it:
   GET /manager/period must answer with a list like
   [ { "period": "2026-10", "status": "open" }, ... ] — the months this user
   served as meal manager. An empty list, an error status or any other shape
   means no link. The check runs again every time the Options tab is opened,
   and a failed request counts as "not allowed".
============================================================================ */

const DARK_MODE_KEY = "rtec-dark-mode";

const darkModeToggle = document.getElementById("darkModeToggle");
const logoutButton = document.getElementById("logoutButton");

// Guards against an older, slower check overwriting a newer one.
let optionsAccessToken = 0;


function isManagerPeriodList(data) {

    return Array.isArray(data)
        && data.length > 0
        && data.every(item =>
            item
            && typeof item.period === "string"
            && typeof item.status === "string"
        );
}


function renderManagerOption(show) {

    const group = document.getElementById("dashboardOptionsGroup");

    group.querySelector("[data-manager-link]")?.remove();

    if (!show) {
        return;
    }

    // Added (not just unhidden) so the last item in the group never keeps
    // a stray bottom border.
    group.insertAdjacentHTML("beforeend", `
        <a class="options-item" href="manager.html" data-manager-link>
            <span>Meal Manager Dashboard</span>
            <span class="options-chevron">&rsaquo;</span>
        </a>
    `);
}


async function loadOptionsAccess() {

    const token = ++optionsAccessToken;

    let isManager = false;

    try {

        isManager = isManagerPeriodList(await fetchJson(API.managerPeriods));

    } catch (error) {

        console.error("Failed to check the meal manager role:", error);
    }

    if (token !== optionsAccessToken) {
        return;
    }

    renderManagerOption(isManager);
}


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
   SECTION: Initialize                                                   START
   ============================================================================ */

document.addEventListener("DOMContentLoaded", () => {

    setupBottomTabs();
    setupOptions();

    populateMonthDropdown();
    updateMonthControls();

    // Select Managers is the default active tab for this dashboard.
    initializeSection("managers");
});

/* ============================================================================
   SECTION: Initialize                                                     END
============================================================================ */
