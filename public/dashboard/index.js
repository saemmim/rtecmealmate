/* ============================================================================
   SECTION: API Configuration                                            START
   ============================================================================
   Change these URLs if your backend uses different routes.
   shared/bulletin.js and shared/receipts.js have their own API blocks.
============================================================================ */

const API = {

    today: "/user/today",                      // GET   -> { meal_status: "on" | "off", guest_meals }
    toggleMeal: "/user/toggle-meal",           // GET   -> { meal_status: "on" | "off", effective_date: "YYYY-MM-DD" }
                                               // POST  { meal_status, effective_date } -> { meal_status, effective_date, message }
    guestMeals: "/user/guest-meals",           // GET   -> { guest_meals: number, effective_date: "YYYY-MM-DD", message? }
                                               // POST  { guest_meals, effective_date } -> { guest_meals, effective_date, message }
    mealConfig: "/meal-config",                // GET   -> { actual_meal_rate } | { expected_meal_rate }
                                               // GET   ?query=YYYY-MM  (past months only)
    calendar: "/user/calendar",                // GET   ?query=YYYY-MM
    transactions: "/user/transactions",        // GET   ?query=YYYY-MM

    managerPeriods: "/manager/period",         // GET   -> [ { period: "YYYY-MM", status: "open" | "closed" } ]
                                               //          (the months this user served as meal manager)
    me: "/auth/me",                            // GET   -> { ..., role, ... }

    logout: "/auth/logout"
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


async function fetchJson(url, options = {}) {

    const response = await fetchWithTimeout(
        url,
        { method: "GET", headers: { "Accept": "application/json" }, ...options },
        REQUEST_TIMEOUT
    );

    
    const body = await response.json();
    
    if (body.redirect) {
        window.location.href = body.redirect;
    }

    if (!response.ok) {
        throw new Error(`Request to ${url} failed: ${response.status}`);
    }
    return body;
}


function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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
            ${onRetry ? '<button type="button" class="retry-button" data-retry>Try again</button>' : ""}
        </div>
    `;

    if (onRetry) {
        container.querySelector("[data-retry]").addEventListener("click", onRetry);
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


// Shown whenever a backend effective date is neither today nor tomorrow —
// the only realistic cause is a wrong clock or timezone on the device.
const DATE_ERROR_MESSAGE =
    "Your device's date or time looks incorrect. Please correct the date and time on your device and use the GMT+6 timezone.";


// Compares a backend "YYYY-MM-DD" date with today and tomorrow as rendered
// by this device. Returns "today", "tomorrow", or null for anything else.
function classifyEffectiveDate(value) {

    if (typeof value !== "string") {
        return null;
    }

    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    if (value === dateValue(now)) return "today";
    if (value === dateValue(tomorrow)) return "tomorrow";

    return null;
}


// "YYYY-MM" for a Date object, in local time.
function monthValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}


// "September 2026" from a "YYYY-MM" string.
function monthLabel(month) {

    const [year, monthNumber] = String(month).split("-").map(Number);

    if (!year || !monthNumber) {
        return month;
    }

    return new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, {
        month: "long", year: "numeric"
    });
}


// "YYYY-MM" for right now — used as the "current month" key.
function currentMonth() {
    return monthValue(new Date());
}


// True for any month after the current one. "YYYY-MM" strings sort
// correctly as plain text, so a string compare is enough.
function isFutureMonth(month) {
    return String(month) > currentMonth();
}


function formatTransactionDate(value) {

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    // "Jan 26" — month and day only, whatever the device's language.
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ============================================================================
   SECTION: Shared Helpers                                                 END
============================================================================ */


/* ============================================================================
   SECTION: Data Caches                                                  START
   ============================================================================
   Several cards need the same data — Home's Monthly Summary and the
   Calendar tab both read a month's calendar, and both summary cards plus
   the Transactions card read that month's /transactions. These helpers
   share one in-flight/finished request per month instead of refetching.
   A failed request is dropped from the cache so "Try again" really retries.
============================================================================ */

const calendarCache = new Map();      // "YYYY-MM" -> Promise<array>
const transactionsCache = new Map();  // "YYYY-MM" -> Promise<array>
const mealConfigCache = new Map();    // "YYYY-MM" -> Promise<object>


function getCalendarMonth(month) {

    if (!calendarCache.has(month)) {

        const request = fetchJson(`${API.calendar}?query=${encodeURIComponent(month)}`)
            .then(data => {

                if (!Array.isArray(data)) {
                    throw new Error("Backend returned an invalid calendar format.");
                }

                return data;
            })
            .catch(error => {
                calendarCache.delete(month);
                throw error;
            });

        calendarCache.set(month, request);
    }

    return calendarCache.get(month);
}


// Transactions are per month — the Calendar tab passes whichever month it is
// showing, the Home summary always passes the current one.
function getTransactions(month) {

    const key = month || currentMonth();

    if (!transactionsCache.has(key)) {

        const request = fetchJson(`${API.transactions}?query=${encodeURIComponent(key)}`)
            .then(data => {

                if (!Array.isArray(data)) {
                    throw new Error("Backend returned an invalid transactions format.");
                }

                return data;
            })
            .catch(error => {
                transactionsCache.delete(key);
                throw error;
            });

        transactionsCache.set(key, request);
    }

    return transactionsCache.get(key);
}


// The live rate lives at the bare /meal-config endpoint. Only past months
// carry a ?query=YYYY-MM, because the backend already resolves the current
// month's rate from the live config.
function getMealConfig(month) {

    const key = month || currentMonth();

    if (!mealConfigCache.has(key)) {

        const url = key === currentMonth()
            ? API.mealConfig
            : `${API.mealConfig}?query=${encodeURIComponent(key)}`;

        const request = fetchJson(url)
            .catch(error => {
                mealConfigCache.delete(key);
                throw error;
            });

        mealConfigCache.set(key, request);
    }

    return mealConfigCache.get(key);
}

/* ============================================================================
   SECTION: Data Caches                                                    END
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

    reloadSection(sectionName);
}


// Every cached request is dropped, so a reload really asks the backend again.
function clearDataCaches() {

    calendarCache.clear();
    transactionsCache.clear();
    mealConfigCache.clear();
}


// Reloads a section's data. Runs on EVERY click of a bottom tab — including
// a click on the tab that is already open — and once at startup for Home.
function reloadSection(sectionName) {

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

        case "home":
            clearDataCaches();
            loadToday();
            loadMonthlySummary();
            break;

        case "calendar":
            // Stays on the month being viewed.
            clearDataCaches();
            renderCalendarTab();
            break;

        case "options":
            loadOptionsAccess();
            break;
    }
}

/* ============================================================================
   SECTION: Bottom Tab Switching                                           END
============================================================================ */


/* ============================================================================
   SECTION: Home — Today Card + Meal Toggle Card                       START
   ============================================================================
   Two GETs are made together:

       GET /user/today        -> { meal_status: "on" | "off", guest_meals }
       GET /user/toggle-meal  -> { meal_status: "on" | "off", effective_date }

   "today" is what the meal actually is right now; "toggle" is the user's
   latest choice and "effective_date" is the day that choice starts. The
   effective date is compared with today/tomorrow as rendered on this device.

   effective_date is today:
       on  -> green switch, on        off -> red switch, off

   effective_date is tomorrow:
       today on,  toggle on   -> green,  on,  "Change will be effective from tomorrow"
       today off, toggle off  -> red,    off, "Change will be effective from tomorrow"
       today on,  toggle off  -> purple, off, "Meal will be off from tomorrow"
       today off, toggle on   -> yellow, on,  "Meal will be on from tomorrow"

   Anything else -> error asking for the device date/time to be corrected
   (GMT+6). The switch turns into a Retry button.

   Clicking the switch POSTs { meal_status, effective_date } to
   /user/toggle-meal, which answers with { meal_status, effective_date,
   message }. On an OK status the card is re-rendered from that answer and
   the message is shown in the hint line.

   A failed toggle slides the knob back and shakes the switch with the
   same .action-error animation used in the administrator dashboard.
============================================================================ */

const todayDateValue = document.getElementById("todayDateValue");
const mealTogglePill = document.getElementById("mealTogglePill");
const mealToggleLabel = document.getElementById("mealToggleLabel");
const mealStatusRow = document.getElementById("mealStatusRow");
const mealStatusValue = document.getElementById("mealStatusValue");
const guestMealsItem = document.getElementById("guestMealsItem");
const guestMealsValue = document.getElementById("guestMealsValue");
const mealToggleHint = document.getElementById("mealToggleHint");

const MEAL_HINT_DEFAULT = "Tap the switch to turn your meal on or off.";

const MEAL_HINTS = {
    sameTomorrow: "Change will be effective from tomorrow",
    onFromTomorrow: "Meal will be on from tomorrow",
    offFromTomorrow: "Meal will be off from tomorrow"
};

const MEAL_STATUS_CLASSES = ["status-on", "status-off", "status-onFromTomorrow", "status-offFromTomorrow"];

const MEAL_PENDING_CLASSES = ["is-pending", "requesting-on", "requesting-off"];

const MEAL_STATUS_LABELS = {
    on: "On",
    off: "Off",
    onFromTomorrow: "On tomorrow",
    offFromTomorrow: "Off tomorrow"
};

// The last confirmed state: { today, toggle, effectiveDate }. null while
// loading, or when loading failed (the switch then reads "Retry").
let mealState = null;

// The last rendered { key, hint }, used to put the switch back after a
// failed toggle.
let mealView = null;


function normalizeMealStatus(raw) {

    const value = String(raw ?? "").toLowerCase();

    return value === "on" || value === "off" ? value : null;
}


// The read-only status line on the Today card: what the meal is today.
function renderMealStatus(status) {

    mealStatusRow.classList.remove("is-on", "is-off");

    if (!status) {
        mealStatusValue.textContent = "—";
        return;
    }

    mealStatusValue.textContent = status === "on" ? "On" : "Off";

    // The class sits on the row so the icon and the value color together,
    // the same way the guest meals icon matches its count.
    mealStatusRow.classList.add(status === "on" ? "is-on" : "is-off");
}


// Guest meals sit at the bottom of the Today card's right column and are
// always shown, with 0 when there are none.
function renderGuestMeals(value) {

    guestMealsValue.textContent = Number(value) || 0;
}


// The line under "Toggle Meal". Errors are tinted red.
function setMealHint(text, isError = false) {

    mealToggleHint.textContent = text || MEAL_HINT_DEFAULT;
    mealToggleHint.classList.toggle("is-error", isError);
}


// Pulls { message } out of a response body without ever throwing — error
// responses are not guaranteed to be JSON.
async function readResponseMessage(response) {

    try {
        const data = await response.json();
        return typeof data?.message === "string" ? data.message : "";
    } catch (error) {
        return "";
    }
}


// Works out how the switch should look for a given state. Returns
// { key, hint } — key is one of the status-* classes — or null when the
// effective date is neither today nor tomorrow.
function buildMealView(state) {

    const when = classifyEffectiveDate(state.effectiveDate);

    if (when === "today") {
        return { key: state.toggle, hint: "" };
    }

    if (when === "tomorrow") {

        if (state.today === state.toggle) {
            return { key: state.toggle, hint: MEAL_HINTS.sameTomorrow };
        }

        // Different from today: the knob shows the NEW state, the color
        // says "this is a pending change".
        return state.toggle === "off"
            ? { key: "offFromTomorrow", hint: MEAL_HINTS.offFromTomorrow }
            : { key: "onFromTomorrow", hint: MEAL_HINTS.onFromTomorrow };
    }

    return null;
}


// Paints the switch. Changing the status class is what moves the knob and
// recolors the switch (both are CSS transitions). `hint` overrides the
// state's own hint line, e.g. with the backend's message.
function renderMealView(view, hint) {

    mealView = view;

    mealTogglePill.classList.remove(...MEAL_STATUS_CLASSES, ...MEAL_PENDING_CLASSES);
    mealTogglePill.classList.add(`status-${view.key}`);

    mealToggleLabel.textContent = MEAL_STATUS_LABELS[view.key];

    mealTogglePill.setAttribute("aria-checked", String(mealState.toggle === "on"));

    mealTogglePill.disabled = false;

    setMealHint(hint ?? view.hint);
}


// The switch becomes a Retry button, with an explanation in the hint line.
function showMealProblem(hint) {

    mealState = null;
    mealView = null;

    mealTogglePill.classList.remove(...MEAL_STATUS_CLASSES, ...MEAL_PENDING_CLASSES);
    mealTogglePill.setAttribute("aria-checked", "false");
    mealTogglePill.disabled = false;

    mealToggleLabel.textContent = "Retry";

    setMealHint(hint, true);
}


// Neutral, non-clickable look while a request is in flight. When the new
// direction is known ("on" | "off") the knob slides toward that side right
// away; otherwise (initial load) it rests in the middle.
function setMealPillPending(requested) {

    mealTogglePill.disabled = true;

    mealTogglePill.classList.remove(...MEAL_STATUS_CLASSES, ...MEAL_PENDING_CLASSES);
    mealTogglePill.classList.add("is-pending");

    if (requested === "on" || requested === "off") {
        mealTogglePill.classList.add(`requesting-${requested}`);
    }
}


// Same shake the administrator dashboard uses (.action-error). Removing the
// class and forcing a reflow lets it replay on back-to-back failures.
function shakeMealPill() {

    mealTogglePill.classList.remove("action-error");

    void mealTogglePill.offsetWidth;

    mealTogglePill.classList.add("action-error");

    mealTogglePill.addEventListener(
        "animationend",
        () => mealTogglePill.classList.remove("action-error"),
        { once: true }
    );
}


function showTodayDate() {

    todayDateValue.textContent = new Date().toLocaleDateString(undefined, {
        month: "long", day: "numeric", year: "numeric"
    });
}


async function loadToday() {

    showTodayDate();
    setMealPillPending();

    // Independent requests: a failure of one shouldn't blank the other.
    const [todayResult, toggleResult] = await Promise.allSettled([
        fetchJson(API.today),
        fetchJson(API.toggleMeal)
    ]);

    // const body = await todayResult.json();
    // console.log(body);

    let todayStatus = null;

    if (todayResult.status === "fulfilled") {
        renderGuestMeals(todayResult.value?.guest_meals ?? 0);
        todayStatus = normalizeMealStatus(todayResult.value?.meal_status);
    } else {
        console.error("Failed to load today's meal:", todayResult.reason);
        renderGuestMeals(0);
    }

    renderMealStatus(todayStatus);

    const toggleData = toggleResult.status === "fulfilled" ? toggleResult.value : null;
    const toggleStatus = normalizeMealStatus(toggleData?.meal_status);

    if (toggleResult.status === "rejected") {
        console.error("Failed to load the meal toggle:", toggleResult.reason);
    }

    if (todayStatus === null || toggleStatus === null) {
        showMealProblem("Could not load your meal status. Tap Retry to try again.");
        return;
    }

    const state = {
        today: todayStatus,
        toggle: toggleStatus,
        effectiveDate: toggleData.effective_date
    };

    const view = buildMealView(state);

    if (view === null) {
        showMealProblem(DATE_ERROR_MESSAGE);
        return;
    }

    mealState = state;

    renderMealView(view);
}


mealTogglePill.addEventListener("click", async () => {

    if (mealTogglePill.disabled) {
        return;
    }

    // Failed load, or a bad device date: the switch reads "Retry" and reloads.
    if (mealState === null) {
        loadToday();
        return;
    }

    const previousState = mealState;
    const previousView = mealView;

    // Flip the user's latest choice.
    const requested = previousState.toggle === "on" ? "off" : "on";

    setMealPillPending(requested);

    try {

        const response = await fetchWithTimeout(
            API.toggleMeal,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({
                    meal_status: requested,
                    effective_date: previousState.effectiveDate
                })
            },
            REQUEST_TIMEOUT
        );

        if (!response.ok) {
            const message = await readResponseMessage(response);
            throw Object.assign(new Error(`Failed to toggle meal: ${response.status}`), { userMessage: message });
        }

        const data = await response.json();

        const newToggle = normalizeMealStatus(data?.meal_status);

        if (newToggle === null) {
            throw new Error("Backend returned an unknown meal status.");
        }

        const newState = {
            today: previousState.today,
            toggle: newToggle,
            effectiveDate: data?.effective_date
        };

        // A change that starts today also changes today's meal.
        if (classifyEffectiveDate(newState.effectiveDate) === "today") {
            newState.today = newToggle;
        }

        const view = buildMealView(newState);

        if (view === null) {
            showMealProblem(DATE_ERROR_MESSAGE);
            return;
        }

        // Re-render the whole card from the answer.
        mealState = newState;

        renderMealStatus(newState.today);

        renderMealView(view, data?.message || view.hint);

    } catch (error) {

        console.error("Failed to toggle meal status:", error);

        // Slide the switch back to how it was, then shake it.
        mealState = previousState;

        renderMealView(previousView);

        setMealHint(error.userMessage || "Could not update your meal status. Please try again.", true);

        shakeMealPill();
    }
});

/* ============================================================================
   SECTION: Home — Today Card                                              END
============================================================================ */


/* ============================================================================
   SECTION: Home — Guest Meal Management Popup                          START
   ============================================================================
   Opened from the "Manage Guest Meals" button in the meal toggle card.

       GET  /user/guest-meals  -> { guest_meals: number, effective_date: "YYYY-MM-DD" }
       POST /user/guest-meals  { guest_meals: number, effective_date: "YYYY-MM-DD" }
                               -> { guest_meals: number, effective_date, message }

   effective_date is the day the count starts to apply. It is compared with
   today/tomorrow as rendered on this device: today shows nothing extra,
   tomorrow shows "Will be effective from tomorrow", anything else shows the
   device date/time error. The POST sends back the effective_date that the
   GET provided.

   Any { message } the backend sends is shown right above the Save button:
   green when the status code is OK, red when it is not. After a successful save the Today card, the
   monthly summary and (if already opened) the Calendar tab are reloaded,
   since they all count guest meals.
============================================================================ */

const guestManageButton = document.getElementById("guestManageButton");
const guestModal = document.getElementById("guestModal");
const guestModalClose = document.getElementById("guestModalClose");
const guestMealsInput = document.getElementById("guestMealsInput");
const guestMinusButton = document.getElementById("guestMinusButton");
const guestPlusButton = document.getElementById("guestPlusButton");
const guestMessage = document.getElementById("guestMessage");
const guestHint = document.getElementById("guestHint");
const guestSaveButton = document.getElementById("guestSaveButton");

const GUEST_MAX_DIGITS = 4;

// Bumped on every open so a slow GET from an earlier open can't overwrite
// the current one.
let guestLoadToken = 0;

// The effective_date last confirmed by the backend; sent back on save.
let guestEffectiveDate = null;


function setGuestMessage(text, type) {

    guestMessage.textContent = text || "";

    guestMessage.classList.toggle("is-error", type === "error");
    guestMessage.classList.toggle("is-success", type === "success");
}


// The small note under the number row, e.g. "Will be effective from tomorrow".
function setGuestHint(text) {

    guestHint.textContent = text || "";
    guestHint.hidden = !text;
}


// effective_date tells which day the saved count starts counting:
//   today    -> nothing to add
//   tomorrow -> hint that it only applies from tomorrow
//   other    -> the device clock is wrong; show the date error
// Returns false for the error case so callers can stop.
function applyGuestEffectiveDate(value) {

    const when = classifyEffectiveDate(value);

    if (when === null) {
        guestEffectiveDate = null;
        setGuestHint("");
        setGuestMessage(DATE_ERROR_MESSAGE, "error");
        return false;
    }

    guestEffectiveDate = value;

    setGuestHint(when === "tomorrow" ? "Will be effective from tomorrow" : "");

    return true;
}


function setGuestControlsEnabled(enabled) {

    guestMealsInput.disabled = !enabled;
    guestMinusButton.disabled = !enabled;
    guestPlusButton.disabled = !enabled;
    guestSaveButton.disabled = !enabled;
}


function getGuestValue() {

    const value = parseInt(guestMealsInput.value, 10);

    return Number.isNaN(value) ? 0 : value;
}


function setGuestValue(value) {

    guestMealsInput.value = String(Math.max(0, Number(value) || 0));
}


function shakeElement(element) {

    element.classList.remove("action-error");

    void element.offsetWidth;

    element.classList.add("action-error");

    element.addEventListener(
        "animationend",
        () => element.classList.remove("action-error"),
        { once: true }
    );
}


// One request helper for both verbs: always resolves to
// { ok, data } so callers can show data.message whatever the status was.
async function guestMealsRequest(options = {}) {

    const response = await fetchWithTimeout(
        API.guestMeals,
        {
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            ...options
        },
        REQUEST_TIMEOUT
    );

    let data = null;

    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

    return { ok: response.ok, data };
}


async function loadGuestMeals() {

    const token = ++guestLoadToken;

    setGuestControlsEnabled(false);
    setGuestHint("");
    setGuestMessage("Loading...");

    try {

        const { ok, data } = await guestMealsRequest();

        if (token !== guestLoadToken) {
            return;
        }

        const count = data?.guest_meals;

        if (!ok || typeof count !== "number") {
            setGuestMessage(data?.message || "Could not load your guest meals. Please close and try again.", "error");
            return;
        }

        // A bad effective_date leaves the controls disabled with the date error.
        if (!applyGuestEffectiveDate(data.effective_date)) {
            return;
        }

        setGuestValue(count);
        setGuestMessage(data.message || "");
        setGuestControlsEnabled(true);

    } catch (error) {

        console.error("Failed to load guest meals:", error);

        if (token !== guestLoadToken) {
            return;
        }

        setGuestMessage("Could not load your guest meals. Please close and try again.", "error");
    }
}


async function saveGuestMeals() {

    if (guestSaveButton.disabled) {
        return;
    }

    setGuestControlsEnabled(false);
    guestSaveButton.textContent = "Saving...";
    setGuestMessage("");

    try {

        const { ok, data } = await guestMealsRequest({
            method: "POST",
            body: JSON.stringify({
                guest_meals: getGuestValue(),
                effective_date: guestEffectiveDate
            })
        });

        // Status not OK: the backend's message in red.
        if (!ok) {
            setGuestMessage(data?.message || "Could not save guest meals. Please try again.", "error");
            shakeElement(guestSaveButton);
            return;
        }

        // Status OK: the count was saved, so everything that shows it is stale.
        refreshAfterGuestMealsSaved();

        if (typeof data?.guest_meals === "number") {
            setGuestValue(data.guest_meals);
        }

        // The answer carries the effective_date for the saved count.
        if (data?.effective_date !== undefined && !applyGuestEffectiveDate(data.effective_date)) {
            shakeElement(guestSaveButton);
            return;
        }

        // The backend's message in green.
        setGuestMessage(data?.message || "Guest meals saved.", "success");

    } catch (error) {

        console.error("Failed to save guest meals:", error);

        setGuestMessage("Could not save guest meals. Please try again.", "error");
        shakeElement(guestSaveButton);

    } finally {
        guestSaveButton.textContent = "Save";
        setGuestControlsEnabled(true);
    }
}


// Everything that counts guest meals is now out of date.
function refreshAfterGuestMealsSaved() {

    calendarCache.clear();

    // The Calendar tab reloads by itself the next time it is opened.
    loadToday();
    loadMonthlySummary();
}


function openGuestModal() {

    guestEffectiveDate = null;

    guestModal.hidden = false;
    document.body.style.overflow = "hidden";

    loadGuestMeals();
}


function closeGuestModal() {

    guestLoadToken++;

    guestModal.hidden = true;
    document.body.style.overflow = "";

    guestManageButton.focus();
}


guestManageButton.addEventListener("click", openGuestModal);
guestModalClose.addEventListener("click", closeGuestModal);

guestModal.addEventListener("click", event => {
    if (event.target === guestModal) {
        closeGuestModal();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !guestModal.hidden) {
        closeGuestModal();
    }
});

guestMinusButton.addEventListener("click", () => setGuestValue(getGuestValue() - 1));

guestPlusButton.addEventListener("click", () => {
    setGuestValue(Math.min(getGuestValue() + 1, Number("9".repeat(GUEST_MAX_DIGITS))));
});

// Digits only; an emptied box reads as 0 once the user leaves it.
guestMealsInput.addEventListener("input", () => {
    guestMealsInput.value = guestMealsInput.value.replace(/\D/g, "").slice(0, GUEST_MAX_DIGITS);
});

guestMealsInput.addEventListener("blur", () => setGuestValue(getGuestValue()));

guestMealsInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        saveGuestMeals();
    }
});

guestSaveButton.addEventListener("click", saveGuestMeals);

/* ============================================================================
   SECTION: Home — Guest Meal Management Popup                            END
============================================================================ */


/* ============================================================================
   SECTION: Monthly Summary (shared by Home and Calendar)             START
   ============================================================================
   One table, three sources — all for a single month, passed in as
   "YYYY-MM":

       Meals / Guest Meals   <- sum of GET /user/calendar?query=YYYY-MM
       Meal Rate             <- GET /meal-config (current month)
                                GET /meal-config?query=YYYY-MM (past months)
                                  actual_meal_rate   -> normal color
                                  expected_meal_rate -> red
       Deposit Amount        <- GET /user/transactions?query=YYYY-MM

   Total Meals     = Meals + Guest Meals
   Total Meal Cost = Total Meals x Meal Rate
   Balance         = Deposit Amount - Total Meal Cost

   The Home tab always passes the current month; the Calendar tab passes
   whichever month its calendar is showing, and reloads this table when the
   month changes.
============================================================================ */

const monthlySummaryCard = document.getElementById("monthlySummaryCard");
const calendarSummaryCard = document.getElementById("calendarSummaryCard");


// "actual" wins when the backend sends one — only the fallback "expected"
// rate gets flagged as a rate that isn't settled yet.
function resolveMealRate(config) {

    if (config?.actual_meal_rate !== undefined && config?.actual_meal_rate !== null) {
        return { rate: Number(config.actual_meal_rate) || 0, rateClass: "rate-actual" };
    }

    if (config?.expected_meal_rate !== undefined && config?.expected_meal_rate !== null) {
        return { rate: Number(config.expected_meal_rate) || 0, rateClass: "rate-expected" };
    }

    return { rate: null, rateClass: "" };
}


function summaryTableHtml(calendarData, config, transactions) {

    const meals = calendarData.reduce((sum, day) => sum + (Number(day?.normal_meals) || 0), 0);
    const guestMeals = calendarData.reduce((sum, day) => sum + (Number(day?.guest_meals) || 0), 0);
    const totalMeals = meals + guestMeals;

    const { rate, rateClass } = resolveMealRate(config);

    // Transactions were already narrowed to this month by the endpoint.
    const deposit = transactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

    const totalCost = rate === null ? null : totalMeals * rate;
    const balance = totalCost === null ? null : deposit - totalCost;

    return `
        <table class="summary-table">
            <tbody>
                <tr>
                    <td>Meals</td>
                    <td class="numeric">${meals}</td>
                </tr>
                <tr>
                    <td>Guest Meals</td>
                    <td class="numeric">${guestMeals}</td>
                </tr>
                <tr class="total-row">
                    <td>Total Meals</td>
                    <td class="numeric">${totalMeals}</td>
                </tr>
                <tr>
                    <td>Meal Rate</td>
                    <td class="numeric ${rateClass}">${rate === null ? "—" : formatAmount(rate)}</td>
                </tr>
                <tr>
                    <td>Total Meal Cost</td>
                    <td class="numeric">${totalCost === null ? "—" : formatAmount(totalCost)}</td>
                </tr>
                <tr>
                    <td>Deposit Amount</td>
                    <td class="numeric">${formatAmount(deposit)}</td>
                </tr>
                <tr class="total-row">
                    <td>Balance</td>
                    <td class="numeric ${balance !== null && balance < 0 ? "negative" : ""}">${balance === null ? "—" : formatAmount(balance)}</td>
                </tr>
            </tbody>
        </table>
    `;
}


// Fills whichever summary card was passed with one month's numbers.
// isStale lets the Calendar tab drop a response that arrived after the
// user already moved to a different month.
async function loadSummaryCard(card, month, isStale) {

    showLoading(card);

    try {

        const [calendarData, config, transactions] = await Promise.all([
            getCalendarMonth(month),
            getMealConfig(month),
            getTransactions(month)
        ]);

        if (isStale?.(month)) {
            return;
        }

        card.innerHTML = summaryTableHtml(calendarData, config, transactions);

    } catch (error) {

        console.error(`Failed to load summary for ${month}:`, error);

        if (isStale?.(month)) {
            return;
        }

        showStateBox(
            card,
            "Something went wrong",
            `Could not load ${monthLabel(month)}'s summary. Please try again.`,
            () => loadSummaryCard(card, month, isStale)
        );
    }
}


function loadMonthlySummary() {

    return loadSummaryCard(monthlySummaryCard, currentMonth());
}

/* ============================================================================
   SECTION: Home — Monthly Summary                                         END
============================================================================ */


/* ============================================================================
   SECTION: Calendar Tab — Calendar, Summary, Transactions          START
   ============================================================================
   All three cards below follow ONE piece of state: calendarViewDate.

   Expected shape of GET /user/calendar?query=YYYY-MM:

       [ { meal_date, normal_meals, guest_meals } ]

   Under each date: a green tick when the day's total is exactly 1 meal,
   the count in red when it is more, nothing at all for 0 — same as the
   per-user calendar in the Meal Manager's Users tab.

   Changing the month reloads the calendar, the summary card and the
   transactions table together. Months after the current one can't be
   reached, so the next button is disabled on the current month.

   NOTE ON DATES: meal_date arrives as a full timestamp
   (e.g. "2026-09-28T18:00:00.000Z") and is converted with the browser's
   local timezone, which assumes it matches the one the backend intended
   (Asia/Dhaka). If days ever look off by one, check here first.
============================================================================ */

const calendarGrid = document.getElementById("calendarGrid");
const calendarMonthLabel = document.getElementById("calendarMonthLabel");
const calendarPrevButton = document.getElementById("calendarPrevButton");
const calendarNextButton = document.getElementById("calendarNextButton");

// First-of-month Date for whichever month is currently displayed.
let calendarViewDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);


calendarPrevButton.addEventListener("click", () => {

    calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1);

    renderCalendarTab();
});

calendarNextButton.addEventListener("click", () => {

    const next = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1);

    // No browsing into the future.
    if (isFutureMonth(monthValue(next))) {
        return;
    }

    calendarViewDate = next;

    renderCalendarTab();
});


// Calendar + summary + transactions all for the month on screen.
function renderCalendarTab() {

    updateCalendarNavState();

    loadCalendarCard();
    loadCalendarSummaryCard();
    loadTransactionsCard();
}


function updateCalendarNavState() {

    // No month exists after the current one, so the next button only
    // goes dead once the calendar has been navigated up to the present.
    const atCurrentMonth = monthValue(calendarViewDate) === currentMonth();

    calendarNextButton.disabled = atCurrentMonth;
    calendarNextButton.setAttribute("aria-disabled", String(atCurrentMonth));
}


async function loadCalendarCard() {

    const month = monthValue(calendarViewDate);

    calendarMonthLabel.textContent = monthLabel(month);

    showLoading(calendarGrid);

    try {

        const data = await getCalendarMonth(month);

        // Ignore a slow response if the user has already moved to another month.
        if (monthValue(calendarViewDate) !== month) {
            return;
        }

        renderCalendarGrid(data);

    } catch (error) {

        console.error(error);

        if (monthValue(calendarViewDate) !== month) {
            return;
        }

        showStateBox(
            calendarGrid,
            "Something went wrong",
            "Could not load the calendar. Please try again.",
            () => loadCalendarCard()
        );
    }
}


function renderCalendarGrid(days) {

    const mealsByDate = new Map(
        days.map(day => {

            const total = (Number(day?.normal_meals) || 0)
                        + (Number(day?.guest_meals) || 0);

            return [dateValue(new Date(day.meal_date)), total];
        })
    );

    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingBlanks = new Date(year, month, 1).getDay();

    const todayValue = dateValue(new Date());

    let html = "";

    for (let i = 0; i < leadingBlanks; i++) {
        html += `<div class="calendar-day empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {

        const cellValue = dateValue(new Date(year, month, day));
        const count = mealsByDate.get(cellValue) || 0;

        let markHtml = "";

        if (count === 1) {
            markHtml = `<span class="calendar-day-mark ok" aria-label="1 meal">&#10003;</span>`;
        } else if (count > 1) {
            markHtml = `<span class="calendar-day-mark over" aria-label="${count} meals">${count}</span>`;
        }

        html += `
            <div class="calendar-day ${cellValue === todayValue ? "today" : ""}">
                <span class="calendar-day-number">${day}</span>
                ${markHtml}
            </div>
        `;
    }

    calendarGrid.innerHTML = html;
}


// The Calendar tab's summary card — identical to the Home tab's, but it
// re-reads everything whenever the calendar month changes.
function loadCalendarSummaryCard() {

    return loadSummaryCard(
        calendarSummaryCard,
        monthValue(calendarViewDate),
        month => monthValue(calendarViewDate) !== month
    );
}

/* ============================================================================
   SECTION: Calendar Card                                                  END
============================================================================ */


/* ============================================================================
   SECTION: Transactions Card                                           START
   ============================================================================
   Expected shape of GET /user/transactions?query=YYYY-MM:

       [ { created_at, amount, collected_by, note } ]

   Scoped to the month the calendar is showing, so this table reloads on
   every month change alongside the calendar and the summary card.

   Same table layout as the Transaction History in the Meal Manager's
   Users tab, in the order the backend returns them. The date column is
   month and day only ("Jan 26"). A note longer than 10 characters is cut
   short with "…" and opens in a popup when clicked.
============================================================================ */

const transactionsCard = document.getElementById("transactionsCard");

const noteModal = document.getElementById("noteModal");
const noteModalClose = document.getElementById("noteModalClose");
const noteModalText = document.getElementById("noteModalText");

// Notes longer than this are cut short in the table; clicking opens the full text.
const NOTE_PREVIEW_LENGTH = 10;

// The element that opened the popup, so focus can go back to it on close.
let noteOpener = null;


function noteCellHtml(note) {

    const text = String(note ?? "");

    // Spread so emoji and other multi-unit characters count as one.
    const characters = [...text];

    if (characters.length <= NOTE_PREVIEW_LENGTH) {
        return escapeHtml(text);
    }

    const preview = characters.slice(0, NOTE_PREVIEW_LENGTH).join("") + "…";

    return `<button type="button" class="note-link" data-full-note="${escapeHtml(text)}" aria-haspopup="dialog">${escapeHtml(preview)}</button>`;
}


function openNoteModal(text, opener) {

    noteOpener = opener;

    noteModalText.textContent = text;

    noteModal.hidden = false;
    document.body.style.overflow = "hidden";

    noteModalClose.focus();
}


function closeNoteModal() {

    noteModal.hidden = true;
    document.body.style.overflow = "";

    noteOpener?.focus();
    noteOpener = null;
}


// One listener on the card: the table inside is rebuilt on every load.
transactionsCard.addEventListener("click", event => {

    const link = event.target.closest(".note-link");

    if (link) {
        openNoteModal(link.dataset.fullNote, link);
    }
});

noteModalClose.addEventListener("click", closeNoteModal);

noteModal.addEventListener("click", event => {
    if (event.target === noteModal) {
        closeNoteModal();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !noteModal.hidden) {
        closeNoteModal();
    }
});


async function loadTransactionsCard() {

    const month = monthValue(calendarViewDate);

    showLoading(transactionsCard);

    try {

        const data = await getTransactions(month);

        if (monthValue(calendarViewDate) !== month) {
            return;
        }

        if (data.length === 0) {
            transactionsCard.innerHTML = `<p class="state-message" style="padding:16px 0;">No transactions in ${escapeHtml(monthLabel(month))}.</p>`;
            return;
        }

        transactionsCard.innerHTML = `
            <div class="table-scroll">
                <table class="transactions-card-table">
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
                                <td>${noteCellHtml(tx.note)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;

    } catch (error) {

        console.error(error);

        if (monthValue(calendarViewDate) !== month) {
            return;
        }

        showStateBox(
            transactionsCard,
            "Something went wrong",
            `Could not load ${escapeHtml(monthLabel(month))}'s transactions. Please try again.`,
            () => loadTransactionsCard()
        );
    }
}

/* ============================================================================
   SECTION: Transactions Card                                              END
============================================================================ */


/* ============================================================================
   SECTION: Options — Dashboards, Dark Mode, Logout                      START
   ============================================================================
   The dashboard links are only shown to people who may open them, and the
   check runs again every time the Options tab is opened:

       Meal Manager Dashboard
           GET /manager/period must answer with a list like
           [ { "period": "2026-10", "status": "open" }, ... ]
           (the months this user served as meal manager). An empty list, an
           error status or any other shape means no link.

       Hall Representative Dashboard
           GET /auth/me must answer with { ..., role: "hr", ... }.

   If neither applies the whole group stays hidden. A failed request counts
   as "not allowed", so a link never appears unless the backend confirmed it.
============================================================================ */

const dashboardOptionsGroup = document.getElementById("dashboardOptionsGroup");

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


function dashboardLinkHtml(href, label) {

    return `
        <a class="options-item" href="${href}">
            <span>${label}</span>
            <span class="options-chevron">&rsaquo;</span>
        </a>
    `;
}


function renderDashboardOptions(showManager, showRepresentative) {

    const links = [];

    if (showManager) {
        links.push(dashboardLinkHtml("manager.html", "Meal Manager Dashboard"));
    }

    if (showRepresentative) {
        links.push(dashboardLinkHtml("representative.html", "Hall Representative Dashboard"));
    }

    dashboardOptionsGroup.innerHTML = links.join("");
    dashboardOptionsGroup.hidden = links.length === 0;
}


async function loadOptionsAccess() {

    const token = ++optionsAccessToken;

    // Independent checks: one failing doesn't hide the other's link.
    const [periodsResult, meResult] = await Promise.allSettled([
        fetchJson(API.managerPeriods),
        fetchJson(API.me)
    ]);

    if (token !== optionsAccessToken) {
        return;
    }

    const showManager =
        periodsResult.status === "fulfilled" && isManagerPeriodList(periodsResult.value);

    const showRepresentative =
        meResult.status === "fulfilled"
        && String(meResult.value?.role ?? "").toLowerCase() === "hr";

    renderDashboardOptions(showManager, showRepresentative);
}


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
   SECTION: Options — Dashboards, Dark Mode, Logout                        END
============================================================================ */


/* ============================================================================
   SECTION: Initialize                                                   START
   ============================================================================ */

document.addEventListener("DOMContentLoaded", () => {

    setupBottomTabs();
    setupOptions();

    // Home is the default active tab for this dashboard.
    reloadSection("home");
});

/* ============================================================================
   SECTION: Initialize                                                     END
============================================================================ */
