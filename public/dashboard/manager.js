/* ============================================================================
   SECTION: API Configuration                                            START
   ============================================================================
   Change these URLs if your backend uses different routes. Every route
   here is a placeholder — nothing on this dashboard has a finalized
   backend yet.

   NOTE ON METHODS: browsers reject a body on a GET request (fetch throws
   a TypeError). Endpoints that only ever read data but were described as
   carrying a JSON body use POST here purely so that body can exist —
   /manager/day and /manager/month are the exception: since they were
   explicitly specced as GET, their date/period is sent as a URL query
   string instead of a body. Swap any of this if your backend disagrees.

   shared/bulletin.js and shared/receipts.js have their own API blocks.
============================================================================ */

const API = {

    // Period (month) resolution
    periodList: "/manager/period/",
    periodStatus: "/manager/period/",       // POST { period, setStatus }

    // Manage Users
    users: "/manager/users",                       // POST { period }
    usersDeposit: "/manager/users/deposit",        // POST { period, user_id, amount, note }
    usersTransactions: "/manager/users/transactions/", // POST { user_id, period }
    usersCalendar: "/manager/users/calendar",      // POST { period, user_id }

    // Batch records: [{ batch, name, status }, ...]
    batches: "/batches",

    // Home
    day: "/manager/day",                // GET ?date=YYYY-MM-DD
    monthBatch: "/manager/month/batch", // GET ?period=YYYY-MM
    totalExpense: "/manager/month/total-expense", // GET ?period=YYYY-MM
    calendar: "/manager/calendar/",     // POST { period, currentBatchOnly }

    mealConfig: "/meal-config",

    me: "/auth/me",                     // GET -> { ..., role, ... }

    logout: "/auth/logout"
};

/* ============================================================================
   SECTION: API Configuration                                              END
============================================================================ */


/* ============================================================================
   SECTION: General Configuration                                       START
   ============================================================================ */

const REQUEST_TIMEOUT = 1000 * 60;

const PERIOD_STATUS_LABELS = {
    open: "Open",
    closed: "Closed",
    close: "Close Requested",
    reopen: "Reopen Requested",
    requested_to_reopen: "Reopen Requested",
    reopened: "Reopened"
};

/* ============================================================================
   SECTION: General Configuration                                         END
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


function formatAmount(value) {

    const num = Number(value) || 0;

    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


// "YYYY-MM-DD" for a Date object, in local time (not UTC).
function dateValue(date) {

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


// "YYYY-MM" for a Date object.
function monthValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}


// "September 2026" for a "YYYY-MM" period string.
function periodLabel(period) {

    const [year, month] = period.split("-").map(Number);
    const date = new Date(year, month - 1, 1);

    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/* ============================================================================
   SECTION: Shared Helpers                                                 END
============================================================================ */


/* ============================================================================
   SECTION: Period Resolution                                           START
   ============================================================================
   Expected shape of GET /manager/period/:

       [ { period: "YYYY-MM", status: "open" | "closed" | "requested_to_reopen" | "reopened" } ]

   Rule: if the manager is serving the current month, or has only ever
   served one month total, skip straight to the dashboard. Otherwise show
   a blocking picker so they choose which month to work in. The chosen
   period (and its status) is stored as data attributes on <body>, so
   every other section can read it without re-fetching this list.
============================================================================ */

let managerPeriods = [];

function getPeriod() {
    return document.body.dataset.period || null;
}

function getPeriodStatus() {
    return document.body.dataset.periodStatus || null;
}

function setPeriod(period, status) {
    document.body.dataset.period = period;
    document.body.dataset.periodStatus = status;
}


// Money (Add Money) and Meal Configuration are only editable while the
// period is "open" or "reopened" — "closed" and "requested_to_reopen"
// are both read-only states.
function isPeriodEditable() {
    const status = getPeriodStatus();
    return status === "open" || status === "reopened";
}


async function resolveManagerPeriod() {

    try {

        const response = await fetchWithTimeout(
            API.periodList,
            { method: "GET", headers: { "Accept": "application/json" } },
            REQUEST_TIMEOUT
        );
        
        const data = await response.json();

        if (!response.ok) {

            if (data && data.redirect) {
                window.location.href = data.redirect;
                return;
            }
            
            throw new Error(`Failed to load manager periods: ${response.status}`);
        }       


        if (!Array.isArray(data)) {
            throw new Error("Backend returned an invalid periods format.");
        }

        managerPeriods = data;

        if (managerPeriods.length === 0) {
            showFullPageState(
                "Not a Meal Manager",
                "You are not currently assigned as a Meal Manager for any month."
            );
            return;
        }

        const todayPeriod = monthValue(new Date());
        const currentEntry = managerPeriods.find(p => p.period === todayPeriod);

        if (currentEntry) {
            setPeriod(currentEntry.period, currentEntry.status);
            finishStartup();
            return;
        }

        if (managerPeriods.length === 1) {
            setPeriod(managerPeriods[0].period, managerPeriods[0].status);
            finishStartup();
            return;
        }

        // Multiple past months, none of them the current one — the
        // manager must pick which month to work in before anything else
        // can load, so this picker cannot be dismissed without a choice.
        openPeriodPickerModal(entry => {
            setPeriod(entry.period, entry.status);
            finishStartup();
        }, { blocking: true });

    } catch (error) {

        console.error(error);

        showFullPageState(
            "Something went wrong",
            "Could not load your manager periods. Please refresh to try again."
        );
    }
}


function showFullPageState(title, message) {

    document.querySelector(".dashboard-content").innerHTML = `
        <div class="state-box">
            <h2 class="state-title">${escapeHtml(title)}</h2>
            <p class="state-message">${escapeHtml(message)}</p>
        </div>
    `;

    document.querySelector(".bottom-tabs").style.display = "none";
}


// Runs once a period has been chosen (auto-resolved or picked) — this is
// the real start of the dashboard; nothing else initializes before this.
function finishStartup() {

    setupBottomTabs();
    setupOptions();
    updateChangeMonthOption();

    document.getElementById("viewCalendarButton").addEventListener("click", openHomeCalendarModal);

    setupDayPicker();

    // Home is the default active tab for this dashboard.
    initializeSection("home");
}

/* ============================================================================
   SECTION: Period Resolution                                             END
============================================================================ */


/* ============================================================================
   SECTION: Period Picker Modal                                         START
   ============================================================================
   Shared by the blocking startup picker and the non-blocking
   Options > Change Month picker.
============================================================================ */

function openPeriodPickerModal(onSelect, { blocking = false } = {}) {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const currentPeriod = getPeriod();

    overlay.innerHTML = `
        <div class="modal-box">
            <h3 class="modal-title">Select Month</h3>

            <div class="period-list">
                ${managerPeriods.map(entry => `
                    <div class="period-row ${entry.period === currentPeriod ? "selected" : ""}" data-period-row="${escapeHtml(entry.period)}">
                        <span class="period-label">${escapeHtml(periodLabel(entry.period))}</span>
                        <span class="period-status-badge status-${escapeHtml(entry.status)}">${escapeHtml(PERIOD_STATUS_LABELS[entry.status] || entry.status)}</span>
                    </div>
                `).join("")}
            </div>

            ${blocking ? "" : `
                <div class="modal-actions">
                    <button type="button" class="action-button" data-period-cancel>Cancel</button>
                </div>
            `}
        </div>
    `;

    document.body.appendChild(overlay);

    if (!blocking) {

        const close = () => overlay.remove();

        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) close();
        });

        overlay.querySelector("[data-period-cancel]").addEventListener("click", close);
    }

    overlay.querySelectorAll("[data-period-row]").forEach(row => {

        row.addEventListener("click", () => {

            const period = row.dataset.periodRow;
            const entry = managerPeriods.find(p => p.period === period);

            overlay.remove();

            onSelect(entry);
        });
    });
}

/* ============================================================================
   SECTION: Period Picker Modal                                           END
============================================================================ */


/* ============================================================================
   SECTION: DOM — Dashboard Shell                                       START
   ============================================================================ */

const bottomTabs = document.querySelectorAll(".bottom-tab");
const dashboardSections = document.querySelectorAll(".dashboard-section");

// Tracks which sections have already fetched their data at least once,
// so switching tabs back and forth doesn't refetch every time. Cleared
// whenever the period changes, since every fetch below is period-scoped.
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


function getActiveSectionName() {
    return document.querySelector(".dashboard-section.active")?.dataset.section || "home";
}


// Every tab reloads its data on every switch into it — there is no more
// "only the first time" caching. initializedSections now only tracks
// "has this tab ever been visited this session" (used elsewhere, e.g.
// to decide whether to bother refreshing Manage Users in the background
// after saving Meal Configuration).
function initializeSection(sectionName) {

    initializedSections.add(sectionName);

    switch (sectionName) {

        case "receipts": {
            // Provided by shared/receipts.js. The module tracks its own
            // one-time DOM setup via root.dataset.receiptInitialized —
            // init() builds the structure the first time, refresh() just
            // reloads the data on every switch after that.
            const root = document.getElementById("receipts-root");

            if (root.dataset.receiptInitialized === "true") {
                window.ReceiptsModule?.refresh(root);
            } else {
                window.ReceiptsModule?.init(root);
            }

            break;
        }

        case "home":
            loadTodayMeal();
            loadMonthlyBatchSummary();
            loadMonthlyExpense();
            break;

        case "manageUsers":
            loadManageUsersList();
            break;

        case "bulletin": {
            // Same one-time-init-then-refresh pattern as Receipts.
            const root = document.getElementById("bulletin-root");

            if (root.dataset.bulletinInitialized === "true") {
                window.BulletinModule?.refresh(root);
            } else {
                window.BulletinModule?.init(root);
            }

            break;
        }

        case "options":
            // Re-checks whether the Hall Representative link belongs here.
            loadOptionsAccess();
            break;
    }
}

/* ============================================================================
   SECTION: Bottom Tab Switching                                           END
============================================================================ */


/* ============================================================================
   SECTION: Batch Names                                                  START
   ============================================================================
    GET /batches returns an array of records, e.g.
    [{ batch: "1", name: "Primary", status: "open" }].
   A lower number means an older batch, so anything listing batches is
   sorted ascending: oldest at the top, youngest at the bottom.

   The map is fetched once and reused. If the request fails, labels fall
   back to "Batch N" and the next render tries again.
============================================================================ */

let batchNames = {};
let batchNamesPromise = null;


function loadBatchNames() {

    if (!batchNamesPromise) {

        batchNamesPromise = (async () => {

            const response = await fetchWithTimeout(
                API.batches,
                { method: "GET", headers: { "Accept": "application/json" } },
                REQUEST_TIMEOUT
            );

            if (!response.ok) {
                throw new Error(`Failed to load batch names: ${response.status}`);
            }

            const data = await response.json();

            const map = parseBatchNames(data);

            // An empty/unrecognised payload is treated as a failure so the
            // next render retries instead of caching nothing forever.
            if (Object.keys(map).length === 0) {
                throw new Error("Backend returned no usable batch records.");
            }

            batchNames = map;

            return batchNames;
        })().catch(error => {

            console.error(error);

            // Allow a retry on the next render.
            batchNamesPromise = null;

            return batchNames;
        });
    }

    return batchNamesPromise;
}


// Accepts the /batches payload in any of these shapes and returns
// { "<batch number>": "<name>" }:
//   [{ batch, name }, ...]
//   { batches: [...] } / { data: [...] } / { results: [...] }
//   { "1": "Primary", "2": "Secondary" }
function parseBatchNames(data) {

    const list = Array.isArray(data)
        ? data
        : (data && (data.batches || data.data || data.results || data.items));

    if (Array.isArray(list)) {

        const map = {};

        list.forEach(record => {

            if (!record || typeof record !== "object") return;

            const number = record.batch ?? record.batch_number ?? record.number ?? record.id;
            const name = record.name ?? record.batch_name;

            if (number === undefined || number === null) return;
            if (typeof name !== "string" || name.trim() === "") return;

            map[String(number).trim()] = name.trim();
        });

        return map;
    }

    if (data && typeof data === "object") {

        return Object.fromEntries(
            Object.entries(data)
                .filter(([, name]) => typeof name === "string" && name.trim() !== "")
                .map(([number, name]) => [String(number).trim(), name.trim()])
        );
    }

    return {};
}


function getBatchName(batchNumber) {

    const key = String(batchNumber ?? '').trim();

    return batchNames[key] || `Batch ${key}`;
}


// Oldest batch (lowest number) first.
function sortByBatch(rows) {

    return [...rows].sort((a, b) => Number(a.batch) - Number(b.batch));
}

/* ============================================================================
   SECTION: Batch Names                                                    END
============================================================================ */


/* ============================================================================
   SECTION: Home — Today's Meal                                         START
   ============================================================================
   Expected shape of GET /manager/day?date=YYYY-MM-DD — an array of:

       { batch, total_meals }

   Date range allowed: within the active period's month only — any past
   date, today, or tomorrow. If the period is a past month, every day in
   it is already "past", so the whole month is selectable. If the period
   is the current month, only up through tomorrow is selectable; the
   rest of the month is disabled. Native <input type="date"> min/max
   handles this cleanly since the allowed range is always one contiguous
   span (period start → whichever is earlier: period end or tomorrow).
============================================================================ */

const dayDateInput = document.getElementById("dayDateInput");
const todayMealCard = document.getElementById("todayMealCard");

function setupDayPicker() {

    const [year, month] = getPeriod().split("-").map(Number);

    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0);

    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const maxDate = periodEnd < tomorrow ? periodEnd : tomorrow;

    dayDateInput.min = dateValue(periodStart);
    dayDateInput.max = dateValue(maxDate);

    // Default to today when it falls inside the allowed range, otherwise
    // clamp to the latest allowed date (e.g. a past period's last day).
    const defaultDate = (today >= periodStart && today <= maxDate) ? today : maxDate;

    dayDateInput.value = dateValue(defaultDate);
}

dayDateInput.addEventListener("change", () => loadTodayMeal());

document.getElementById("dayTodayButton").addEventListener("click", () => {

    const [year, month] = getPeriod().split("-").map(Number);
    const periodStart = new Date(year, month - 1, 1);

    const today = new Date();

    // "Today" snaps to the real today when it's in range, otherwise to
    // the latest allowed date (dayDateInput.max already reflects that).
    dayDateInput.value = (today >= periodStart && dateValue(today) <= dayDateInput.max)
        ? dateValue(today)
        : dayDateInput.max;

    loadTodayMeal();
});


async function loadTodayMeal() {

    showLoading(todayMealCard);

    try {

        const response = await fetchWithTimeout(
            `${API.day}?date=${encodeURIComponent(dayDateInput.value)}`,
            { method: "GET", headers: { "Accept": "application/json" } },
            REQUEST_TIMEOUT
        );

        if (!response.ok) {
            throw new Error(`Failed to load today's meals: ${response.status}`);
        }

        const data = await response.json();

        renderTodayMeal(Array.isArray(data) ? data : []);

    } catch (error) {

        console.error(error);

        showStateBox(
            todayMealCard,
            "Something went wrong",
            "Could not load meal counts for this date. Please try again.",
            () => loadTodayMeal()
        );
    }
}


async function renderTodayMeal(batches) {

    if (batches.length === 0) {
        todayMealCard.innerHTML = `<p class="state-message" style="padding:16px 0;">No meal data for this date.</p>`;
        return;
    }

    await loadBatchNames();

    const total = batches.reduce((sum, batch) => sum + (Number(batch.total_meals) || 0), 0);

    todayMealCard.innerHTML = sortByBatch(batches).map(batch => `
        <div class="today-meal-row">
            <span class="today-meal-batch">${escapeHtml(getBatchName(batch.batch))}</span>
            <span class="today-meal-count">${escapeHtml(batch.total_meals)}</span>
        </div>
    `).join("") + `
        <div class="today-meal-row today-meal-total-row">
            <span>Total</span>
            <span>${total}</span>
        </div>
    `;
}

/* ============================================================================
   SECTION: Home — Today's Meal                                            END
============================================================================ */


/* ============================================================================
   SECTION: Home — Monthly Summary                                      START
   ============================================================================
   Total Meals and Total Deposit are summed from the batch table rows
   (GET /manager/month/batch, see the next section). Total Expense comes
   from GET /manager/month/total-expense?period=YYYY-MM, which returns:

       { "total-expense": number }

   Deficit = Total Deposit - Total Expense. It is recalculated whenever
   either side arrives, and shows "—" until both are known.
============================================================================ */

const monthlyTotals = { deposit: null, expense: null };


function resetMonthlySummary() {

    monthlyTotals.deposit = null;
    monthlyTotals.expense = null;

    document.getElementById("monthlyTotalMeals").textContent = "—";

    renderMonthlySummaryAmounts();
}


function renderMonthlySummaryAmounts() {

    const { deposit, expense } = monthlyTotals;

    document.getElementById("monthlyTotalDeposit").textContent = deposit === null ? "—" : formatAmount(deposit);
    document.getElementById("monthlyTotalExpense").textContent = expense === null ? "—" : formatAmount(expense);

    const balanceEl = document.getElementById("monthlyBalance");

    if (deposit === null || expense === null) {
        balanceEl.textContent = "—";
        balanceEl.classList.remove("negative");
        return;
    }

    const balance = deposit - expense;

    balanceEl.textContent = formatAmount(balance);
    balanceEl.classList.toggle("negative", balance < 0);
}


async function loadMonthlyExpense() {

    try {

        const response = await fetchWithTimeout(
            `${API.totalExpense}?period=${encodeURIComponent(getPeriod())}`,
            { method: "GET", headers: { "Accept": "application/json" } },
            REQUEST_TIMEOUT
        );

        if (!response.ok) {
            throw new Error(`Failed to load total expense: ${response.status}`);
        }

        const data = await response.json();
        const record = Array.isArray(data) ? data[0] : data;

        monthlyTotals.expense = Number(record?.["total-expanse"] ?? record?.["total_expanse"] ?? record?.["total-expense"] ?? record?.["total_expense"]) || 0;

        renderMonthlySummaryAmounts();

    } catch (error) {
        console.error("Failed to load total expense:", error);
    }
}

/* ============================================================================
   SECTION: Home — Monthly Summary                                         END
============================================================================ */


/* ============================================================================
   SECTION: Home — Monthly Batch Summary                                 START
   ============================================================================
   Expected shape of GET /manager/month/batch?period=YYYY-MM:

       [ { batch, total_meals, total_deposit } ]
============================================================================ */

async function loadMonthlyBatchSummary() {

    const body = document.getElementById("batchSummaryBody");

    resetMonthlySummary();

    try {

        const response = await fetchWithTimeout(
            `${API.monthBatch}?period=${encodeURIComponent(getPeriod())}`,
            { method: "GET", headers: { "Accept": "application/json" } },
            REQUEST_TIMEOUT
        );

        if (!response.ok) {
            throw new Error(`Failed to load batch summary: ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0) {
            body.innerHTML = `<tr><td colspan="3" class="state-message">No batch data for this month.</td></tr>`;

            document.getElementById("monthlyTotalMeals").textContent = 0;
            monthlyTotals.deposit = 0;
            renderMonthlySummaryAmounts();

            return;
        }

        await loadBatchNames();

        const totalMeals = data.reduce((sum, batch) => sum + (Number(batch.total_meals) || 0), 0);
        const totalDeposit = data.reduce((sum, batch) => sum + (Number(batch.total_deposit) || 0), 0);

        document.getElementById("monthlyTotalMeals").textContent = totalMeals;
        monthlyTotals.deposit = totalDeposit;
        renderMonthlySummaryAmounts();

        body.innerHTML = sortByBatch(data).map(batch => `
            <tr>
                <td>${escapeHtml(getBatchName(batch.batch))}</td>
                <td class="numeric">${escapeHtml(batch.total_meals)}</td>
                <td class="numeric">${formatAmount(batch.total_deposit)}</td>
            </tr>
        `).join("");

    } catch (error) {

        console.error("Failed to load monthly batch summary:", error);

        body.innerHTML = `<tr><td colspan="3" class="state-message">Could not load batch summary.</td></tr>`;
    }
}

/* ============================================================================
   SECTION: Home — Monthly Batch Summary                                   END
============================================================================ */


/* ============================================================================
   SECTION: Meal Configuration (Options popup)                          START
   ============================================================================
   Expected shape of GET /meal-config?period=YYYY-MM:

       {
           expected_meal_rate,   // number, or null if nothing is set yet
           meal_lock_offset,     // e.g. "+00:00", "+02:30"
           temp_meal_lock_offset // e.g. "+02:30", or null if no change is pending
       }

   A null expected_meal_rate means the field stays blank in the form
   (rather than showing "0" or "null").

   Saving POSTs { period, expected_meal_rate, meal_lock_offset }. Leaving
   the rate field blank sends expected_meal_rate as null. A value of
   exactly 0 is rejected client-side before the request is even sent —
   expected_meal_rate can never be zero.

   Whatever the backend returns in a { message } field is shown after
   saving, colored green if the response was ok, red otherwise.

   Meal Lock Offset is a single 30-minute-interval offset from midnight,
   shown to the manager as the clock time only (e.g. "02:30AM"), while the
   offset value ("+00:00", "+02:30", ...) is what is sent to the backend.
============================================================================ */

// Converts total minutes from midnight into a clock label like "02:30AM".
function minutesToTimeLabel(minutes) {

    const wrapped = ((minutes % 1440) + 1440) % 1440;
    const hours24 = Math.floor(wrapped / 60);
    const mins = wrapped % 60;
    const period = hours24 < 12 ? "AM" : "PM";
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

    return `${String(hours12).padStart(2, "0")}:${String(mins).padStart(2, "0")}${period}`;
}


// Maps an offset value like "+02:30" to its clock label ("02:30AM").
// Returns null if the value can't be parsed.
function offsetToTimeLabel(offset) {

    const match = /^([+-]?)(\d{1,2}):(\d{2})$/.exec(String(offset ?? "").trim());

    if (!match) return null;

    const total = Number(match[2]) * 60 + Number(match[3]);

    return minutesToTimeLabel(match[1] === "-" ? -total : total);
}


// Builds the <option> list for the offset select: +00:00 to +12:00 in
// 30-minute steps. The visible label is only the clock time (e.g. "02:30AM"),
// while the option value is the offset sent to / received from the backend
// (e.g. "+02:30").
function buildMealLockOffsetOptions(selectedValue) {

    // Backend sends values like "+02:30". If a sign is ever missing
    // (e.g. "02:30"), treat it as positive so the match still works.
    let normalizedSelected = String(selectedValue || "+00:00").trim();
    if (!/^[+-]/.test(normalizedSelected)) {
        normalizedSelected = `+${normalizedSelected}`;
    }

    const options = [];

    for (let minutes = 0; minutes <= 720; minutes += 30) {

        const value = `+${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
        const selected = normalizedSelected === value;

        options.push(
            `<option value="${value}" ${selected ? "selected" : ""}>${minutesToTimeLabel(minutes)}</option>`
        );
    }

    return options.join("");
}


function openMealConfigModal() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-box">
            <h3 class="modal-title">Meal Configuration</h3>

            <div data-meal-config-body>
                <div class="loading-state">
                    <span>Loading...</span>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    loadMealConfigModal(overlay);
}


async function loadMealConfigModal(overlay) {

    const body = overlay.querySelector("[data-meal-config-body]");

    try {

        const response = await fetchWithTimeout(
            `${API.mealConfig}?period=${encodeURIComponent(getPeriod())}`,
            { method: "GET", headers: { "Accept": "application/json" } },
            REQUEST_TIMEOUT
        );

        if (!response.ok) {
            throw new Error(`Failed to load meal configuration: ${response.status}`);
        }

        const data = await response.json();

        renderMealConfigModal(overlay, data);

    } catch (error) {

        console.error(error);

        showStateBox(
            body,
            "Something went wrong",
            "Could not load meal configuration. Please try again.",
            () => loadMealConfigModal(overlay)
        );
    }
}


function renderMealConfigModal(overlay, data) {

    const body = overlay.querySelector("[data-meal-config-body]");

    // null -> blank field, per spec. (0 never comes from the backend
    // since expected_meal_rate can't be zero, but ?? only catches
    // null/undefined anyway, so this stays correct either way.)
    const rateValue = data.expected_meal_rate ?? "";

    body.innerHTML = `
        <div class="field-tooltip-group">
            <div class="meal-config-row">
                <label for="mealRateInput">Meal rate</label>
                <input type="number" id="mealRateInput" min="0" step="0.01" value="${escapeHtml(rateValue)}">
            </div>

            <p class="field-tooltip">Leave blank to auto calculate from total expenses.</p>
        </div>

        <div class="meal-config-row">
            <label for="mealLockOffsetInput">Meal lock time</label>
            <select id="mealLockOffsetInput">
                ${buildMealLockOffsetOptions(data.meal_lock_offset)}
            </select>
        </div>

        <p class="form-message" id="mealConfigMessage" style="display:none;"></p>

        <div class="modal-actions">
            <button type="button" class="action-button" data-meal-config-close>Close</button>
            <button type="button" class="action-button deposit" id="mealConfigSaveButton">Save</button>
        </div>
    `;

    const close = () => overlay.remove();

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
    });

    overlay.querySelector("[data-meal-config-close]").addEventListener("click", close);

    document.getElementById("mealConfigSaveButton").addEventListener("click", () => saveMealConfigModal(overlay));

    // A pending (temporary) lock time change, if the backend reports one.
    if (data.temp_meal_lock_offset != null) {

        const pendingTime = offsetToTimeLabel(data.temp_meal_lock_offset);

        if (pendingTime) {
            showMealConfigMessage(overlay, `Meal lock time will be set to ${pendingTime} from next time.`, null);
        }
    }
}


function showMealConfigMessage(overlay, text, isSuccess) {

    const messageEl = overlay.querySelector("#mealConfigMessage");

    messageEl.textContent = text;
    messageEl.classList.remove("message-success", "message-error");

    // isSuccess === null -> neutral notice in the normal text color.
    if (isSuccess !== null) {
        messageEl.classList.add(isSuccess ? "message-success" : "message-error");
    }

    messageEl.style.display = "block";
}


async function saveMealConfigModal(overlay) {

    const saveButton = overlay.querySelector("#mealConfigSaveButton");
    const messageEl = overlay.querySelector("#mealConfigMessage");

    const rateInput = overlay.querySelector("#mealRateInput").value.trim();
    const mealLockOffset = overlay.querySelector("#mealLockOffsetInput").value;

    messageEl.style.display = "none";

    // expected_meal_rate can never be zero — blank (auto-calculate) is
    // fine, but a literal 0 is rejected before any request goes out.
    if (rateInput !== "" && Number(rateInput) === 0) {
        showMealConfigMessage(overlay, "Meal rate cannot be zero.", false);
        return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    try {

        const response = await fetchWithTimeout(
            API.mealConfig,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({
                    period: getPeriod(),
                    expected_meal_rate: rateInput === "" ? null : Number(rateInput),
                    meal_lock_offset: mealLockOffset
                })
            },
            REQUEST_TIMEOUT
        );

        let result = null;

        try {
            result = await response.json();
        } catch {
            // No JSON body — fine, as long as the status itself tells us
            // whether it worked; a missing {message} just means nothing
            // gets displayed below.
        }

        if (result?.message) {
            showMealConfigMessage(overlay, result.message, response.ok);
        }

        if (!response.ok) {

            saveButton.textContent = "Save";

            if (!result?.message) {
                showMealConfigMessage(overlay, `Request failed: ${response.status}`, false);
            }

            return;
        }

        saveButton.textContent = "Saved";

        // The Users tab's meal-rate banner reflects this rate, so
        // refresh it in the background.
        if (initializedSections.has("manageUsers")) {
            loadManageUsersList();
        }

        setTimeout(() => { saveButton.textContent = "Save"; }, 1200);

    } catch (error) {

        console.error("Failed to save meal configuration:", error);

        showMealConfigMessage(overlay, "Could not save meal configuration. Please try again.", false);

        saveButton.textContent = "Save";

    } finally {
        saveButton.disabled = false;
    }
}

/* ============================================================================
   SECTION: Meal Configuration (Options popup)                             END
============================================================================ */


/* ============================================================================
   SECTION: Calendar Grid Helper                                        START
   ============================================================================
   Shared by the Home-wide calendar popup and the per-user calendar popup
   — both show a fixed month (the active period), no navigation. Only the
   content drawn inside each day cell differs, via renderCount.

   NOTE ON DATES: the backend returns meal_date as a full timestamp
   (e.g. "2026-09-28T18:00:00.000Z"). This is converted with the
   browser's local timezone (new Date(...).getFullYear()/Month()/Date()),
   which assumes the viewer's timezone matches the one the backend
   intended (Asia/Dhaka). If dates ever look off-by-one, this is the
   first place to check.
============================================================================ */

function buildCalendarCellsHtml(period, renderCount) {

    const [year, month] = period.split("-").map(Number);

    const firstOfMonth = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const leadingBlanks = firstOfMonth.getDay();

    const todayValue = dateValue(new Date());

    let html = "";

    for (let i = 0; i < leadingBlanks; i++) {
        html += `<div class="calendar-day empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {

        const cellValue = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

        html += `
            <div class="calendar-day ${cellValue === todayValue ? "today" : ""}">
                <span class="calendar-day-number">${day}</span>
                ${renderCount(cellValue)}
            </div>
        `;
    }

    return html;
}


function calendarWeekdaysHtml() {
    return `
        <div class="calendar-weekdays">
            <span class="calendar-weekday">Sun</span>
            <span class="calendar-weekday">Mon</span>
            <span class="calendar-weekday">Tue</span>
            <span class="calendar-weekday">Wed</span>
            <span class="calendar-weekday">Thu</span>
            <span class="calendar-weekday">Fri</span>
            <span class="calendar-weekday">Sat</span>
        </div>
    `;
}

/* ============================================================================
   SECTION: Calendar Grid Helper                                           END
============================================================================ */


/* ============================================================================
   SECTION: Home-wide Calendar Modal                                    START
   ============================================================================
   Expected shape of POST /manager/calendar/ (body: { period, currentBatchOnly }):

       [ { meal_date, total_meals } ]
============================================================================ */

function openHomeCalendarModal() {

    const period = getPeriod();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-box">
            <h3 class="modal-title">Meal Count Per Day</h3>
            <span class="calendar-month-label">${escapeHtml(periodLabel(period))}</span>

            ${calendarWeekdaysHtml()}

            <div class="calendar-grid" data-home-calendar-grid></div>

            <label class="calendar-filter-row">
                <input type="checkbox" id="homeCalendarBatchOnly" checked>
                My batch only
            </label>

            <div class="modal-actions">
                <button type="button" class="action-button" data-home-calendar-close>Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
    });

    overlay.querySelector("[data-home-calendar-close]").addEventListener("click", close);

    const checkbox = overlay.querySelector("#homeCalendarBatchOnly");

    checkbox.addEventListener("change", () => loadHomeCalendar(overlay, period, checkbox.checked));

    loadHomeCalendar(overlay, period, checkbox.checked);
}


async function loadHomeCalendar(overlay, period, currentBatchOnly) {

    const grid = overlay.querySelector("[data-home-calendar-grid]");

    showLoading(grid);

    try {

        const response = await fetchWithTimeout(
            API.calendar,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ period, currentBatchOnly })
            },
            REQUEST_TIMEOUT
        );

        if (!response.ok) {
            throw new Error(`Failed to load calendar: ${response.status}`);
        }

        const data = await response.json();

        const countByDate = new Map(
            (Array.isArray(data) ? data : []).map(day => [dateValue(new Date(day.meal_date)), day.total_meals])
        );

        grid.innerHTML = buildCalendarCellsHtml(period, cellValue => {
            const count = countByDate.get(cellValue);
            return `<span class="calendar-day-count">${count !== undefined ? count : "—"}</span>`;
        });

    } catch (error) {

        console.error(error);

        showStateBox(
            grid,
            "Something went wrong",
            "Could not load the calendar. Please try again.",
            () => loadHomeCalendar(overlay, period, currentBatchOnly)
        );
    }
}

/* ============================================================================
   SECTION: Home-wide Calendar Modal                                       END
============================================================================ */


/* ============================================================================
   SECTION: Manage Users                                                START
   ============================================================================
   Expected shape of POST /manager/users (body: { period }) — an array of:

       {
           id, name, username, department, batch, phone, profile_picture,
           status, normal_meals, guest_meals, total_deposit
       }

   Each card shows deposits, bill (meal rate x total meals) and balance.
   Each card shows department | batch name (see Batch Names above). Users with zero activity (both normal_meals and
   guest_meals are 0) are hidden from the list entirely.
============================================================================ */

const manageUsersList = document.getElementById("manageUsersList");

// Cached so the Deposit action can update a total locally without
// re-fetching the whole list.
let manageUsersCache = [];

// Meal rate for the active period, from GET /meal-config?period=YYYY-MM.
// Bill = meal rate x (normal + guest meals). "type" tracks whether the
// rate is an explicit manager-set value ("actual") or an auto-calculated
// fallback ("expected") — the banner above the list colors itself by it.
let manageUsersMealRate = 0;
let manageUsersMealRateType = "expected";


async function loadManageUsersList() {

    showLoading(manageUsersList);

    try {

        const [response, configResponse] = await Promise.all([
            fetchWithTimeout(
                API.users,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Accept": "application/json" },
                    body: JSON.stringify({ period: getPeriod() })
                },
                REQUEST_TIMEOUT
            ),
            fetchWithTimeout(
                `${API.mealConfig}?period=${encodeURIComponent(getPeriod())}`,
                { method: "GET", headers: { "Accept": "application/json" } },
                REQUEST_TIMEOUT
            )
        ]);

        if (!response.ok) {
            throw new Error(`Failed to load users: ${response.status}`);
        }

        if (!configResponse.ok) {
            throw new Error(`Failed to load meal rate: ${configResponse.status}`);
        }

        const data = await response.json();
        const config = await configResponse.json();

        // An explicit "actual" rate takes priority; otherwise fall back
        // to the auto-calculated "expected" one.
        if (config?.actual_meal_rate !== undefined && config?.actual_meal_rate !== null) {
            manageUsersMealRate = Number(config.actual_meal_rate) || 0;
            manageUsersMealRateType = "actual";
        } else {
            manageUsersMealRate = Number(config?.expected_meal_rate) || 0;
            manageUsersMealRateType = "expected";
        }

        renderMealRateBanner();

        if (!Array.isArray(data)) {
            throw new Error("Backend returned an invalid users format.");
        }

        // Hide fully-inactive users (no normal meals AND no guest meals).
        manageUsersCache = data.filter(user =>
            (Number(user.normal_meals) || 0) + (Number(user.guest_meals) || 0) > 0
        );

        await loadBatchNames();

        renderManageUsersList();

    } catch (error) {

        console.error(error);

        showStateBox(
            manageUsersList,
            "Something went wrong",
            "Could not load users for this month. Please try again.",
            () => loadManageUsersList()
        );
    }
}


// Danger (expected/auto-calculated) vs success (actual/manager-set).
function renderMealRateBanner() {

    const banner = document.getElementById("mealRateBanner");

    banner.textContent = `Meal Rate: ${formatAmount(manageUsersMealRate)}`;

    banner.classList.toggle("rate-expected", manageUsersMealRateType === "expected");
    banner.classList.toggle("rate-actual", manageUsersMealRateType === "actual");
}


// Bill and balance for one user, from the cached meal rate and deposit.
function getUserMoney(user) {

    const totalMeals = (Number(user.normal_meals) || 0) + (Number(user.guest_meals) || 0);
    const deposits = Number(user.total_deposit) || 0;
    const bill = totalMeals * manageUsersMealRate;

    return { deposits, bill, balance: deposits - bill };
}


// Balance coloring: close to zero (-5..5) reads as "settled" (green),
// otherwise a clearly negative balance stays red; a clearly positive one
// stays neutral.
function getBalanceColorClass(balance) {

    if (balance >= -5 && balance <= 5) return "balanced";

    return balance < 0 ? "negative" : "";
}


function renderManageUsersList() {

    if (manageUsersCache.length === 0) {

        manageUsersList.innerHTML = `
            <div class="state-box">
                <h2 class="state-title">No users found</h2>
                <p class="state-message">No one in your batch has meal activity this month yet.</p>
            </div>
        `;

        return;
    }

    manageUsersList.innerHTML = manageUsersCache.map(user => {

        const profilePicture = user.profile_picture || createInitialAvatar(user.name);
        const money = getUserMoney(user);

        return `
            <article class="user-card" data-user-id="${escapeHtml(user.id)}">

            <div class="user-card-top">

                <img class="profile-picture" src="${escapeHtml(profilePicture)}" alt="${escapeHtml(user.name)}" loading="lazy" onerror="this.src='${createInitialAvatar(user.name)}'">

                <div class="user-info">
                    <div class="name-row">
                        <h2 class="name">${escapeHtml(user.name)}</h2>
                    </div>

                    <div class="user-details">
                        <span class="username">${escapeHtml(user.username)}</span>
                        <span class="detail-separator"></span>
                        <span class="department-batch">${escapeHtml(user.department)} | ${escapeHtml(getBatchName(user.batch))}</span>
                        <span class="detail-separator"></span>
                        <span class="phone">${escapeHtml(user.phone)}</span>
                    </div>
                </div>

            </div>

            <div class="user-card-footer">

                <button type="button" class="meal-rows" data-user-calendar="${escapeHtml(user.id)}" aria-label="View meal calendar for ${escapeHtml(user.name)}">
                    <span class="meal-rows-cell">
                        <span class="meal-rows-label">Total Meals</span>
                        <span class="meal-rows-value">${escapeHtml(Number(user.normal_meals || 0) + Number(user.guest_meals || 0))}</span>
                    </span>
                </button>

                <div class="money-group">
                    <button type="button" class="money-rows" data-user-transactions="${escapeHtml(user.id)}" aria-label="View transaction history for ${escapeHtml(user.name)}">
                        <span class="money-total">
                            <span class="money-label">Deposits:</span>
                            <span class="money-value" data-deposit-value="${escapeHtml(user.id)}">${formatAmount(money.deposits)}</span>
                        </span>
                        <span class="money-total">
                            <span class="money-label">Bill:</span>
                            <span class="money-value" data-bill-value="${escapeHtml(user.id)}">${formatAmount(money.bill)}</span>
                        </span>
                        <span class="money-total">
                            <span class="money-label">Balance:</span>
                            <span class="money-value ${getBalanceColorClass(money.balance)}" data-balance-value="${escapeHtml(user.id)}">${formatAmount(money.balance)}</span>
                        </span>
                    </button>
                    <button type="button" class="money-add" data-deposit-button="${escapeHtml(user.id)}" ${isPeriodEditable() ? "" : "disabled"}>
                        <span aria-hidden="true">+</span> Add Money
                    </button>
                </div>

            </div>

            </article>
        `;
    }).join("");
}


manageUsersList.addEventListener("click", (event) => {

    const calendarButton = event.target.closest("[data-user-calendar]");

    if (calendarButton) {

        const userId = calendarButton.dataset.userCalendar;
        const card = calendarButton.closest(".user-card");
        const userName = card?.querySelector(".name")?.textContent || "User";

        openUserCalendarModal(userId, userName);
        return;
    }

    const transactionsButton = event.target.closest("[data-user-transactions]");

    if (transactionsButton) {

        const userId = transactionsButton.dataset.userTransactions;
        const card = transactionsButton.closest(".user-card");
        const userName = card?.querySelector(".name")?.textContent || "User";

        openTransactionsModal(userId, userName);
        return;
    }

    const depositButton = event.target.closest("[data-deposit-button]");

    if (depositButton && !depositButton.disabled) {
        openDepositModal(depositButton.dataset.depositButton);
    }
});

/* ============================================================================
   SECTION: Manage Users                                                   END
============================================================================ */


/* ============================================================================
   SECTION: Deposit Modal                                                START
   ============================================================================
   POST /manager/users/deposit (body: { period, user_id, amount, note }). On success,
   the amount is added to the cached total locally — no re-fetch needed.
============================================================================ */

function openDepositModal(userId) {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-box">
            <h3 class="modal-title">Deposit Money</h3>

            <div class="form-field">
                <label for="depositAmountInput">Amount</label>
                <input type="number" id="depositAmountInput" min="0" step="0.01" autofocus>
            </div>

            <div class="form-field">
                <label for="depositNoteInput">Note (optional)</label>
                <textarea id="depositNoteInput" rows="2" maxlength="300"></textarea>
            </div>

            <p class="form-error" data-deposit-error style="display:none;"></p>

            <div class="modal-actions">
                <button type="button" class="action-button" data-deposit-cancel>Cancel</button>
                <button type="button" class="action-button deposit" data-deposit-submit>Add</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
    });

    overlay.querySelector("[data-deposit-cancel]").addEventListener("click", close);

    overlay.querySelector("[data-deposit-submit]").addEventListener("click", () => submitDeposit(userId, overlay));
}


async function submitDeposit(userId, overlay) {

    const amountInput = overlay.querySelector("#depositAmountInput");
    const noteInput = overlay.querySelector("#depositNoteInput");
    const errorEl = overlay.querySelector("[data-deposit-error]");
    const submitButton = overlay.querySelector("[data-deposit-submit]");

    const amount = Number(amountInput.value);

    if (!amount || amount == 0) {
        errorEl.textContent = "Please enter a valid non-zero amount.";
        errorEl.style.display = "block";
        return;
    }

    errorEl.style.display = "none";
    submitButton.disabled = true;
    submitButton.textContent = "Adding...";

    try {

        const response = await fetchWithTimeout(
            API.usersDeposit,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ period: getPeriod(), user_id: userId, amount, note: noteInput.value.trim() })
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
            throw new Error(result?.message || `Request failed: ${response.status}`);
        }

        // Success — bump the cached total locally rather than re-fetching.
        const user = manageUsersCache.find(u => String(u.id) === String(userId));

        if (user) {
            user.total_deposit = (Number(user.total_deposit) || 0) + amount;

            const money = getUserMoney(user);

            const depositEl = document.querySelector(`[data-deposit-value="${userId}"]`);
            if (depositEl) {
                depositEl.textContent = formatAmount(money.deposits);
            }

            const balanceEl = document.querySelector(`[data-balance-value="${userId}"]`);
            if (balanceEl) {
                balanceEl.textContent = formatAmount(money.balance);
                balanceEl.classList.remove("negative", "balanced");
                const colorClass = getBalanceColorClass(money.balance);
                if (colorClass) balanceEl.classList.add(colorClass);
            }
        }

        overlay.remove();

    } catch (error) {

        console.error("Failed to add deposit:", error);

        errorEl.textContent = error.message || "Could not add this deposit. Please try again.";
        errorEl.style.display = "block";

        submitButton.disabled = false;
        submitButton.textContent = "Add";
    }
}

/* ============================================================================
   SECTION: Deposit Modal                                                  END
============================================================================ */


/* ============================================================================
   SECTION: Transaction History Modal                                   START
   ============================================================================
   Opened by clicking a user's money rows.
   Expected shape of POST /manager/users/transactions/ (body: { user_id, period }):

       [ { created_at, amount, collected_by, note } ]     (note may be null)
============================================================================ */

function openTransactionsModal(userId, userName) {

    const period = getPeriod();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-box">
            <h3 class="modal-title">${escapeHtml(userName)}</h3>
            <span class="calendar-month-label">Transactions — ${escapeHtml(periodLabel(period))}</span>

            <div data-transactions-body></div>

            <div class="modal-actions">
                <button type="button" class="action-button" data-transactions-close>Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
    });

    overlay.querySelector("[data-transactions-close]").addEventListener("click", close);

    loadTransactions(overlay, period, userId);
}


async function loadTransactions(overlay, period, userId) {

    const body = overlay.querySelector("[data-transactions-body]");

    showLoading(body);

    try {

        const response = await fetchWithTimeout(
            API.usersTransactions,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ user_id: userId, period })
            },
            REQUEST_TIMEOUT
        );

        if (!response.ok) {
            throw new Error(`Failed to load transactions: ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0) {
            body.innerHTML = `<p class="state-message" style="padding:16px 0;">No transactions this month.</p>`;
            return;
        }

        body.innerHTML = `
            <div class="table-scroll">
                <table class="batch-summary-table transactions-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th class="numeric">Amount</th>
                            <th>Collected by</th>
                            <th>Note</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(tx => `
                            <tr>
                                <td>${escapeHtml(formatTransactionDate(tx.created_at))}</td>
                                <td class="numeric">${formatAmount(tx.amount)}</td>
                                <td>${escapeHtml(tx.collected_by)}</td>
                                <td>${escapeHtml(tx.note ?? "")}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;

    } catch (error) {

        console.error(error);

        showStateBox(
            body,
            "Something went wrong",
            "Could not load transactions. Please try again.",
            () => loadTransactions(overlay, period, userId)
        );
    }
}


function formatTransactionDate(value) {

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    // "Jan 26" — month and day only, whatever the device's language.
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ============================================================================
   SECTION: Transaction History Modal                                      END
============================================================================ */


/* ============================================================================
   SECTION: Per-User Calendar Modal                                     START
   ============================================================================
   Expected shape of POST /manager/users/calendar (body: { period, user_id }):

       [ { meal_date, normal_meal, guest_meal } ]    (counts may be strings)

   Days with no meals are absent from the list and show nothing. Per
   day, total = normal_meal + guest_meal: a total of 1 shows a green
   check mark, anything higher shows the number in the danger color.
============================================================================ */

function openUserCalendarModal(userId, userName) {

    const period = getPeriod();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-box">
            <h3 class="modal-title">${escapeHtml(userName)}</h3>
            <span class="calendar-month-label">${escapeHtml(periodLabel(period))}</span>

            ${calendarWeekdaysHtml()}

            <div class="calendar-grid" data-user-calendar-grid></div>

            <div class="modal-actions">
                <button type="button" class="action-button" data-user-calendar-close>Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
    });

    overlay.querySelector("[data-user-calendar-close]").addEventListener("click", close);

    loadUserCalendar(overlay, period, userId);
}


async function loadUserCalendar(overlay, period, userId) {

    const grid = overlay.querySelector("[data-user-calendar-grid]");

    showLoading(grid);

    try {

        const response = await fetchWithTimeout(
            API.usersCalendar,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ period, user_id: userId })
            },
            REQUEST_TIMEOUT
        );

        if (!response.ok) {
            throw new Error(`Failed to load user calendar: ${response.status}`);
        }

        const data = await response.json();

        const dataByDate = new Map(
            (Array.isArray(data) ? data : []).map(day => [dateValue(new Date(day.meal_date)), day])
        );

        grid.innerHTML = buildCalendarCellsHtml(period, cellValue => {

            const day = dataByDate.get(cellValue);

            if (!day) return "";

            const total = (Number(day.normal_meal ?? day.normal_meals) || 0)
                        + (Number(day.guest_meal ?? day.guest_meals) || 0);

            if (total <= 0) return "";

            if (total === 1) {
                return `<span class="calendar-day-mark ok" aria-label="1 meal">&#10003;</span>`;
            }

            return `<span class="calendar-day-mark over" aria-label="${total} meals">${total}</span>`;
        });

    } catch (error) {

        console.error(error);

        showStateBox(
            grid,
            "Something went wrong",
            "Could not load this user's calendar. Please try again.",
            () => loadUserCalendar(overlay, period, userId)
        );
    }
}

/* ============================================================================
   SECTION: Per-User Calendar Modal                                        END
============================================================================ */


/* ============================================================================
   SECTION: Options — Dark Mode, Change Month, Logout                   START
   ============================================================================
   The Hall Representative Dashboard link is only added for people who may
   open it: GET /auth/me must answer with { ..., role: "hr", ... }. The check
   runs again every time the Options tab is opened, and a failed request
   counts as "not allowed".
============================================================================ */

// Guards against an older, slower check overwriting a newer one.
let optionsAccessToken = 0;


function renderRepresentativeOption(show) {

    const group = document.getElementById("dashboardOptionsGroup");

    group.querySelector("[data-representative-link]")?.remove();

    if (!show) {
        return;
    }

    // Added (not just unhidden) so the last item in the group never keeps
    // a stray bottom border.
    group.insertAdjacentHTML("beforeend", `
        <a class="options-item" href="representative.html" data-representative-link>
            <span>Hall Representative Dashboard</span>
            <span class="options-chevron">&rsaquo;</span>
        </a>
    `);
}


async function loadOptionsAccess() {

    const token = ++optionsAccessToken;

    let isRepresentative = false;

    try {

        const response = await fetchWithTimeout(
            API.me,
            { headers: { "Accept": "application/json" } },
            REQUEST_TIMEOUT
        );

        if (!response.ok) {
            throw new Error(`Failed to load the user's role: ${response.status}`);
        }

        const me = await response.json();

        isRepresentative = String(me?.role ?? "").toLowerCase() === "hr";

    } catch (error) {

        console.error("Failed to check the user's role:", error);
    }

    if (token !== optionsAccessToken) {
        return;
    }

    renderRepresentativeOption(isRepresentative);
}


const DARK_MODE_KEY = "rtec-dark-mode";

const darkModeToggle = document.getElementById("darkModeToggle");
const logoutButton = document.getElementById("logoutButton");


function applyTheme(isDark) {

    document.body.classList.toggle("dark-mode", isDark);
    document.body.classList.toggle("light-mode", !isDark);

    darkModeToggle.checked = isDark;
}


function updateChangeMonthOption() {

    const group = document.getElementById("periodOptionsGroup");

    if (managerPeriods.length <= 1) {
        group.style.display = "none";
        return;
    }

    group.style.display = "block";
    document.getElementById("changeMonthCurrentLabel").textContent = periodLabel(getPeriod());
}


/* Period status action (Close / Request reopen / Cancel ...)

   Which button shows depends on the current period's status:

     reopened                          -> "Close this month"            (success)  setStatus: "close"
     open, not the current month       -> "Close this month"            (success)  setStatus: "close"
     close                             -> "Cancel closing request"      (danger)   setStatus: "reopened"
     closed                            -> "Request to reopen the month" (normal)   setStatus: "reopen"
     reopen                            -> "Cancel reopening request"    (danger)   setStatus: "closed"

   Every request is POST { period: "YYYY-MM", setStatus }. The legacy value
   "requested_to_reopen" is treated the same as "reopen". */

function getPeriodStatusAction() {

    const period = getPeriod();
    const status = getPeriodStatus();

    switch (status) {

        case "reopened":
            return { label: "Close This Month", tone: "success", setStatus: "close" };

        case "open":
            if (period === monthValue(new Date())) {
                return null;
            }
            return { label: "Close This Month", tone: "success", setStatus: "close" };

        case "close":
            return { label: "Cancel Closing Request", tone: "danger", setStatus: "reopened" };

        case "closed":
            return { label: "Request to Reopen This Month", tone: "", setStatus: "reopen" };

        case "reopen":
        case "requested_to_reopen":
            return { label: "Cancel Reopening Request", tone: "danger", setStatus: "closed" };

        default:
            return null;
    }
}


function updatePeriodStatusOption() {

    const group = document.getElementById("periodStatusOptionsGroup");
    const button = document.getElementById("periodStatusOption");
    const action = getPeriodStatusAction();

    if (!action) {
        group.style.display = "none";
        return;
    }

    document.getElementById("periodStatusOptionLabel").textContent = action.label;

    button.classList.remove("success", "danger");

    if (action.tone) {
        button.classList.add(action.tone);
    }

    button.disabled = false;
    group.style.display = "block";
}


async function submitPeriodStatusChange() {

    const action = getPeriodStatusAction();
    const button = document.getElementById("periodStatusOption");

    if (!action) {
        return;
    }

    const period = getPeriod();

    button.disabled = true;

    try {

        const response = await fetchWithTimeout(
            API.periodStatus,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ period, setStatus: action.setStatus })
            },
            REQUEST_TIMEOUT
        );

        if (!response.ok) {
            throw new Error(`Failed to update period status: ${response.status}`);
        }

        // Keep the local copy of the period list and the page state in sync.
        const entry = managerPeriods.find(p => p.period === period);

        if (entry) {
            entry.status = action.setStatus;
        }

        setPeriod(period, action.setStatus);

        updatePeriodStatusOption();
        updateCountUsersOption();
        updateMealConfigOptionState();

    } catch (error) {

        console.error(error);

        alert("Could not update the month status. Please try again.");

        button.disabled = false;
    }
}


// Count Users is only available while the selected period is "open".
function updateCountUsersOption() {
    document.getElementById("countUsersOptionsGroup").style.display =
        getPeriodStatus() === "open" ? "block" : "none";
}


function updateMealConfigOptionState() {
    document.getElementById("mealConfigOption").disabled = !isPeriodEditable();
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

    document.getElementById("changeMonthOption").addEventListener("click", () => {

        openPeriodPickerModal(entry => {

            setPeriod(entry.period, entry.status);
            updateChangeMonthOption();
            updateMealConfigOptionState();
            updatePeriodStatusOption();
            updateCountUsersOption();
            setupDayPicker();

            // The active tab reloads itself below. Every other tab will
            // pick up the new period automatically next time it's
            // switched into, since every switch now reloads regardless.
            initializeSection(getActiveSectionName());

        }, { blocking: false });
    });

    updateMealConfigOptionState();
    updatePeriodStatusOption();
    updateCountUsersOption();

    document.getElementById("periodStatusOption").addEventListener("click", submitPeriodStatusChange);

    document.getElementById("mealConfigOption").addEventListener("click", () => {

        if (!isPeriodEditable()) {
            return;
        }

        openMealConfigModal();
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
   SECTION: Options — Dark Mode, Change Month, Logout                      END
============================================================================ */


/* ============================================================================
   SECTION: Initialize                                                   START
   ============================================================================ */

document.addEventListener("DOMContentLoaded", () => {

    // Everything else waits on this — see finishStartup() at the end of
    // resolveManagerPeriod().
    resolveManagerPeriod();
});

/* ============================================================================
   SECTION: Initialize                                                     END
============================================================================ */
