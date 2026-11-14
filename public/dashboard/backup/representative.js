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
============================================================================ */

const API = {

    managersCurrent: "/managers/true",
    managersEligible: "/managers/false",

    managersAssign: "/managers/assign",
    managersRemove: "/managers/remove",

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

// Tracks which sections have already fetched their data at least once,
// so switching tabs back and forth doesn't refetch every time.
const initializedSections = new Set();

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


// Lazy-load each section's data the first time it is opened.
function initializeSection(sectionName) {

    if (initializedSections.has(sectionName)) {
        return;
    }

    initializedSections.add(sectionName);

    switch (sectionName) {

        case "receipts":
            // Provided by shared/receipts.js
            window.ReceiptsModule?.init(document.getElementById("receipts-root"));
            break;

        case "managers":
            loadManagersForSelectedMonth();
            break;

        case "bulletin":
            // Provided by shared/bulletin.js
            window.BulletinModule?.init(document.getElementById("bulletin-root"));
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
