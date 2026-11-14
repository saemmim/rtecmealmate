/* ============================================================================
   SECTION: shared/receipts.js — Overview                                START
   ============================================================================
   Renders the Receipts list inside whatever container element it is
   given (see window.ReceiptsModule.init below). Used identically by
   index.html, manager.html, representative.html and administrator.html —
   the container element's [data-role] attribute (or, if absent, the page
   filename) tells this module which dashboard it is running on:

       index.html            -> "user"  (view only)
       manager.html           -> "mm"    (add / edit own)
       representative.html    -> "hr"    (view only)
       administrator.html     -> "hs"    (view only)

   Only the Meal Manager (mm) role can add or edit receipts.

   Receipts are period-scoped (GET /receipts?period=YYYY-MM). The period
   comes from document.body.dataset.period when present (manager.html
   sets this, since a manager can be serving a past month) — on dashboards
   that don't have that concept, this module just falls back to the
   current real month.

   Expected shape of each object returned by GET /receipts:

       {
           id,
           receipt_date,   // timestamptz
           created_at,     // timestamptz
           updated_at,     // timestamptz | null — present only if edited
           image_url,
           user_id,
           username,
           items: [ { id, description, price } ]
       }

   Change the endpoints below if your backend uses different routes.
============================================================================ */

const RECEIPT_API = {
    list: "/receipts",           // GET ?period=YYYY-MM
    create: "/receipts",         // POST (multipart/form-data)
    edit: "/receipts/edit",      // POST (multipart/form-data, includes id)

    me: "/auth/me"
};

const RECEIPT_REQUEST_TIMEOUT = 1000 * 60;

// Own receipts can only be edited within this window of being created.
const RECEIPT_EDIT_WINDOW_MS = 60 * 60 * 1000;

/* ============================================================================
   SECTION: shared/receipts.js — Overview                                  END
============================================================================ */


/* ============================================================================
   SECTION: Current User Resolution                                     START
   ============================================================================
   Same convention as shared/bulletin.js: role is derived from which
   dashboard page we're on, id is fetched once from /auth/me and cached.
============================================================================ */

function receiptRoleFromPage() {

    const page = window.location.pathname.split("/").pop();

    switch (page) {
        case "manager.html": return "mm";
        case "representative.html": return "hr";
        case "administrator.html": return "hs";
        case "index.html":
        case "": return "user";
        default: return "user";
    }
}

let cachedReceiptUser = null;

async function getReceiptCurrentUser(root) {

    if (cachedReceiptUser && cachedReceiptUser.id !== null) {
        return cachedReceiptUser;
    }

    const role = root.dataset.role || receiptRoleFromPage();

    let id = null;

    try {

        const response = await receiptFetchWithTimeout(
            RECEIPT_API.me,
            { method: "GET", headers: { "Accept": "application/json" } },
            RECEIPT_REQUEST_TIMEOUT
        );

        if (response.ok) {
            const data = await response.json();
            id = data?.id ?? data?.user_id ?? data?.userId ?? null;
        }

    } catch (error) {
        console.error("Could not resolve current user for receipt permissions:", error);
    }

    cachedReceiptUser = { id, role };

    return cachedReceiptUser;
}

function canManageReceipts(role) {
    return role === "mm";
}


// manager.html stores the active period's status on <body
// data-period-status> (see manager.js). Only that page has the concept
// of a period being "closed" / "requested_to_reopen" — everywhere else
// there's no such attribute, so adding stays unrestricted by default.
function receiptIsPeriodEditable() {

    const status = document.body.dataset.periodStatus;

    if (!status) return true;

    return status === "open" || status === "reopened";
}

/* ============================================================================
   SECTION: Current User Resolution                                        END
============================================================================ */


/* ============================================================================
   SECTION: Period Helper                                                START
   ============================================================================
   manager.html stores the active period on <body data-period>, since a
   Meal Manager can be serving a past month. Other dashboards have no
   such concept, so this just falls back to the current real month.
============================================================================ */

function receiptMonthValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function receiptGetPeriod() {
    return document.body.dataset.period || receiptMonthValue(new Date());
}


// "YYYY-MM" shifted by a number of months (negative = earlier).
function receiptShiftMonth(month, delta) {

    const [year, monthNumber] = month.split("-").map(Number);

    return receiptMonthValue(new Date(year, monthNumber - 1 + delta, 1));
}


// The months the switcher may land on: nothing in the future, and
// nothing older than one year back from the current month. "YYYY-MM"
// strings compare correctly as plain strings.
function receiptMonthRange() {

    const currentMonth = receiptMonthValue(new Date());

    return {
        min: receiptShiftMonth(currentMonth, -12),
        max: currentMonth
    };
}

/* ============================================================================
   SECTION: Period Helper                                                  END
============================================================================ */


/* ============================================================================
   SECTION: Helpers                                                      START
   ============================================================================ */

async function receiptFetchWithTimeout(url, options = {}, timeout = 10000) {

    const controller = new AbortController();

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

function receiptEscapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function receiptFormatDate(isoString) {

    if (!isoString) return "";

    try {
        return new Date(isoString).toLocaleDateString(undefined, {
            day: "numeric", month: "short", year: "numeric"
        });
    } catch {
        return isoString;
    }
}

function receiptFormatPrice(value) {

    const num = Number(value) || 0;

    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "YYYY-MM-DD" for a Date object, in local time (not UTC).
function receiptDateValue(date) {

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

// True if createdAt is less than RECEIPT_EDIT_WINDOW_MS ago.
function receiptIsWithinEditWindow(createdAt) {

    if (!createdAt) return false;

    const createdTime = new Date(createdAt).getTime();

    if (Number.isNaN(createdTime)) return false;

    return Date.now() - createdTime < RECEIPT_EDIT_WINDOW_MS;
}

/* ============================================================================
   SECTION: Helpers                                                         END
============================================================================ */


/* ============================================================================
   SECTION: Module State                                                 START
   ============================================================================ */

const receiptState = new WeakMap();

/* ============================================================================
   SECTION: Module State                                                   END
============================================================================ */


/* ============================================================================
   SECTION: Init                                                         START
   ============================================================================ */

async function receiptInit(root) {

    if (!root || root.dataset.receiptInitialized === "true") {
        return;
    }

    root.dataset.receiptInitialized = "true";

    // Month switcher at the very top, then the total-expense summary,
    // then the Add button (same placement as shared/bulletin.js), then
    // the list.
    root.innerHTML = `
        <div class="receipt-month-switcher">
            <button type="button" class="receipt-month-nav-button" data-receipt-month-prev aria-label="Previous month">&lsaquo;</button>
            <span class="receipt-month-label" data-receipt-month-label></span>
            <button type="button" class="receipt-month-nav-button" data-receipt-month-next aria-label="Next month">&rsaquo;</button>
        </div>

        <div class="receipt-total-summary" data-receipt-total-summary></div>

        <div class="receipt-toolbar" style="display:none;">
            <button type="button" class="receipt-add-button" data-receipt-add>+ Add Receipt</button>
        </div>

        <div class="receipt-list" data-receipt-list></div>
    `;

    const listEl = root.querySelector("[data-receipt-list]");
    const toolbarEl = root.querySelector(".receipt-toolbar");
    const addButton = root.querySelector("[data-receipt-add]");

    // viewMonth: the month currently shown ("YYYY-MM"). It starts at the
    // active period (see receiptLoad) and the arrows move it from there.
    // lastPeriod: lets receiptLoad notice when the period itself changed
    // (manager.html > Options > Change Month) and snap back to it.
    // loadToken: guards against a slow response for an earlier month
    // overwriting a newer one when the arrows are clicked quickly.
    receiptState.set(root, {
        items: [],
        user: null,
        listEl,
        toolbarEl,
        addButton,
        viewMonth: null,
        lastPeriod: null,
        loadToken: 0,
        monthLabelEl: root.querySelector("[data-receipt-month-label]"),
        prevButton: root.querySelector("[data-receipt-month-prev]"),
        nextButton: root.querySelector("[data-receipt-month-next]")
    });

    root.querySelector("[data-receipt-month-prev]").addEventListener("click", () => switchReceiptMonth(root, -1));
    root.querySelector("[data-receipt-month-next]").addEventListener("click", () => switchReceiptMonth(root, 1));

    const user = await getReceiptCurrentUser(root);

    receiptState.get(root).user = user;

    if (canManageReceipts(user.role)) {
        toolbarEl.style.display = "flex";
        addButton.addEventListener("click", () => {
            if (!addButton.disabled) {
                openReceiptForm(root);
            }
        });
    }

    updateReceiptAddButtonState(root);

    await receiptLoad(root);
}


// Disables Add Receipt while the active period is closed / pending
// reopen. Re-checked on every load, since manager.html reloads this tab
// on every switch and the period can change via Options > Change Month.
function updateReceiptAddButtonState(root) {

    const state = receiptState.get(root);

    if (!state?.addButton) return;

    state.addButton.disabled = !receiptIsPeriodEditable();
}


// Moves the displayed month by one step, if the range allows it, and
// reloads the list (which also refreshes the Total Expense summary).
function switchReceiptMonth(root, delta) {

    const state = receiptState.get(root);
    const { min, max } = receiptMonthRange();

    const target = receiptShiftMonth(state.viewMonth, delta);

    if (target < min || target > max) {
        return;
    }

    state.viewMonth = target;

    receiptLoad(root);
}


// Shows the month name and greys out an arrow that can't go any further:
// "previous" stops at one year back, "next" stops at the current month.
function updateReceiptMonthSwitcher(root) {

    const state = receiptState.get(root);
    const { min, max } = receiptMonthRange();

    const [year, month] = state.viewMonth.split("-").map(Number);

    state.monthLabelEl.textContent = new Date(year, month - 1, 1)
        .toLocaleDateString(undefined, { month: "long", year: "numeric" });

    state.prevButton.disabled = state.viewMonth <= min;
    state.nextButton.disabled = state.viewMonth >= max;
}

/* ============================================================================
   SECTION: Init                                                           END
============================================================================ */


/* ============================================================================
   SECTION: Fetching                                                     START
   ============================================================================ */

async function receiptLoad(root) {

    const state = receiptState.get(root);
    const { listEl } = state;

    updateReceiptAddButtonState(root);

    // The displayed month starts at the active period (the real current
    // month on dashboards without one). If the period itself changes
    // later (manager.html > Options > Change Month), snap back to it;
    // otherwise keep whichever month the arrows last moved to.
    const period = receiptGetPeriod();

    if (state.lastPeriod !== period) {
        state.lastPeriod = period;
        state.viewMonth = period;
    }

    const month = state.viewMonth;
    const token = ++state.loadToken;

    updateReceiptMonthSwitcher(root);

    // Blank the total until this month's receipts arrive, so the old
    // month's figure is never shown next to the new month's name.
    renderReceiptTotalSummary(root, true);

    listEl.innerHTML = `
        <div class="receipt-loading">
            <span>Loading receipts...</span>
        </div>
    `;

    try {

        const response = await receiptFetchWithTimeout(
            `${RECEIPT_API.list}?period=${encodeURIComponent(month)}`,
            { method: "GET", headers: { "Accept": "application/json" } },
            RECEIPT_REQUEST_TIMEOUT
        );

        if (!response.ok) {
            throw new Error(`Failed to load receipts: ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("Backend returned an invalid receipts format.");
        }

        // A newer load has started (the arrows were clicked again) —
        // this response is for a month that is no longer on screen.
        if (token !== state.loadToken) {
            return;
        }

        // Newest first, oldest at the bottom.
        state.items = [...data].sort(
            (a, b) => new Date(b.receipt_date).getTime() - new Date(a.receipt_date).getTime()
        );

        receiptRender(root);

    } catch (error) {

        console.error(error);

        if (token !== state.loadToken) {
            return;
        }

        listEl.innerHTML = `
            <div class="receipt-state-box">
                <h3 class="receipt-state-title">Something went wrong</h3>
                <p class="receipt-state-message">Could not load receipts. Please try again.</p>
                <button type="button" class="receipt-retry-button" data-receipt-retry>Try again</button>
            </div>
        `;

        listEl.querySelector("[data-receipt-retry]").addEventListener("click", () => receiptLoad(root));
    }
}

/* ============================================================================
   SECTION: Fetching                                                        END
============================================================================ */


/* ============================================================================
   SECTION: Rendering                                                    START
   ============================================================================ */

function receiptItemsTotal(item) {

    const items = Array.isArray(item.items) ? item.items : [];

    return items.reduce((sum, row) => sum + (Number(row.price) || 0), 0);
}


function renderReceiptTotalSummary(root, loading = false) {

    const state = receiptState.get(root);
    const summaryEl = root.querySelector("[data-receipt-total-summary]");

    const grandTotal = (state.items || []).reduce((sum, item) => sum + receiptItemsTotal(item), 0);

    summaryEl.innerHTML = `
        <span class="receipt-total-summary-label">Total Expense</span>
        <span class="receipt-total-summary-value">${loading ? "—" : receiptFormatPrice(grandTotal)}</span>
    `;
}


function receiptRender(root) {

    const state = receiptState.get(root);
    const { listEl, items, user } = state;

    // Shown regardless of whether the list itself is empty, so the
    // total is always visible at the very top.
    renderReceiptTotalSummary(root);

    if (!items || items.length === 0) {

        listEl.innerHTML = `
            <div class="receipt-state-box">
                <h3 class="receipt-state-title">No receipts yet</h3>
                <p class="receipt-state-message">Receipts added for this month will show up here.</p>
            </div>
        `;

        return;
    }

    listEl.innerHTML = items.map(item => receiptCardHtml(item, user)).join("");

    listEl.querySelectorAll("[data-receipt-edit]").forEach(button => {

        button.addEventListener("click", () => {

            const id = button.dataset.receiptEdit;
            const item = state.items.find(r => String(r.id) === String(id));

            if (item) {
                openReceiptForm(root, item);
            }
        });
    });
}


function receiptCardHtml(item, user) {

    const items = Array.isArray(item.items) ? item.items : [];
    const total = receiptItemsTotal(item);

    const isOwn = user && user.id !== null && String(item.user_id) === String(user.id);
    const canEdit = canManageReceipts(user?.role) && isOwn && receiptIsWithinEditWindow(item.created_at);

    // updated_at (not modified_at) — present only once a receipt has
    // actually been edited.
    const isEdited = Boolean(item.updated_at);

    const rowsHtml = items.map(row => `
        <tr>
            <td>${receiptEscapeHtml(row.description)}</td>
            <td class="receipt-col-price">${receiptFormatPrice(row.price)}</td>
        </tr>
    `).join("");

    return `
        <article class="receipt-card" data-receipt-id="${receiptEscapeHtml(item.id)}">

            <div class="receipt-header">
                <div class="receipt-header-info">
                    <p class="receipt-date">${receiptFormatDate(item.receipt_date)}</p>
                    <p class="receipt-meta">${receiptEscapeHtml(item.username)}</p>
                </div>

                <div class="receipt-header-actions">
                    ${isEdited ? `<span class="receipt-edited-chip">Edited</span>` : ""}
                    ${canEdit ? `<button type="button" class="receipt-edit-button" data-receipt-edit="${receiptEscapeHtml(item.id)}">Edit</button>` : ""}
                </div>
            </div>

            ${item.image_url
                ? `<img class="receipt-image" src="${receiptEscapeHtml(item.image_url)}" alt="Receipt" loading="lazy">`
                : ""
            }

            <table class="receipt-table">
                <tbody>
                    ${rowsHtml}
                    <tr class="receipt-total-row">
                        <td>Total</td>
                        <td class="receipt-col-price">${receiptFormatPrice(total)}</td>
                    </tr>
                </tbody>
            </table>

        </article>
    `;
}

/* ============================================================================
   SECTION: Rendering                                                       END
============================================================================ */


/* ============================================================================
   SECTION: Add / Edit Form (modal)                                     START
   ============================================================================
   The receipt date is bounded to the active period's month, and can
   never be in the future — same "contiguous min/max" approach used for
   the Meal Manager Home day picker:

       min = first day of the active period
       max = whichever is earlier: last day of the period, or today
============================================================================ */

function receiptDateBounds() {

    const period = receiptGetPeriod();
    const [year, month] = period.split("-").map(Number);

    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0);

    const today = new Date();

    const maxDate = periodEnd < today ? periodEnd : today;

    return {
        min: receiptDateValue(periodStart),
        max: receiptDateValue(maxDate),
        default: (today >= periodStart && today <= maxDate) ? receiptDateValue(today) : receiptDateValue(maxDate)
    };
}


function openReceiptForm(root, existingItem = null) {

    const isEdit = Boolean(existingItem);
    const bounds = receiptDateBounds();

    const overlay = document.createElement("div");
    overlay.className = "receipt-modal-overlay";

    const existingItems = existingItem?.items?.length
        ? existingItem.items
        : [{ description: "", price: "" }];

    const dateValue = isEdit
        ? receiptDateValue(new Date(existingItem.receipt_date))
        : bounds.default;

    overlay.innerHTML = `
        <div class="receipt-modal-box">
            <h3 class="receipt-modal-title">${isEdit ? "Edit Receipt" : "Add Receipt"}</h3>

            <div class="receipt-form-field">
                <label for="receiptDateInput">Receipt date</label>
                <input type="date" id="receiptDateInput" class="receipt-date-input" min="${bounds.min}" max="${bounds.max}" value="${receiptEscapeHtml(dateValue)}">
            </div>

            <div class="receipt-form-field">
                <label for="receiptImageInput">Receipt image ${isEdit ? "(leave empty to keep current)" : ""}</label>
                <input type="file" id="receiptImageInput" accept="image/*">

                <img class="receipt-image-preview" data-receipt-image-preview src="${isEdit && existingItem.image_url ? receiptEscapeHtml(existingItem.image_url) : ""}" style="${isEdit && existingItem.image_url ? "" : "display:none;"}" alt="Preview">
            </div>

            <div class="receipt-form-field">
                <label>Items</label>

                <div class="receipt-items-editor" data-receipt-items-editor></div>

                <button type="button" class="receipt-add-item-button" data-receipt-add-item>+ Add More</button>
            </div>

            <div class="receipt-items-total">
                <span>Total</span>
                <span data-receipt-total-display>0.00</span>
            </div>

            <p class="receipt-form-error" data-receipt-form-error style="display:none;"></p>

            <div class="receipt-modal-actions">
                <button type="button" data-receipt-cancel>Cancel</button>
                <button type="button" class="primary" data-receipt-save>${isEdit ? "Save Changes" : "Add Receipt"}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const itemsEditor = overlay.querySelector("[data-receipt-items-editor]");
    const totalDisplay = overlay.querySelector("[data-receipt-total-display]");

    function addItemRow(description = "", price = "") {

        const row = document.createElement("div");
        row.className = "receipt-item-row";

        row.innerHTML = `
            <input type="text" placeholder="Description" class="receipt-item-description" value="${receiptEscapeHtml(description)}">
            <input type="number" placeholder="Price" min="0" step="0.01" class="receipt-item-price" value="${receiptEscapeHtml(price)}">
            <button type="button" class="receipt-item-remove" title="Remove item">&times;</button>
        `;

        row.querySelector(".receipt-item-remove").addEventListener("click", () => {
            row.remove();
            recalculateTotal();
        });

        row.querySelector(".receipt-item-price").addEventListener("input", recalculateTotal);

        itemsEditor.appendChild(row);
    }

    function recalculateTotal() {

        const total = [...itemsEditor.querySelectorAll(".receipt-item-price")]
            .reduce((sum, input) => sum + (Number(input.value) || 0), 0);

        totalDisplay.textContent = receiptFormatPrice(total);
    }

    existingItems.forEach(row => addItemRow(row.description, row.price));
    recalculateTotal();

    overlay.querySelector("[data-receipt-add-item]").addEventListener("click", () => addItemRow());

    // Live image preview, width 100% / height auto (no fixed aspect ratio).
    overlay.querySelector("#receiptImageInput").addEventListener("change", (event) => {

        const file = event.target.files[0];
        const preview = overlay.querySelector("[data-receipt-image-preview]");

        if (!file) {
            return;
        }

        preview.src = URL.createObjectURL(file);
        preview.style.display = "block";
    });

    const close = () => overlay.remove();

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
    });

    overlay.querySelector("[data-receipt-cancel]").addEventListener("click", close);

    overlay.querySelector("[data-receipt-save]").addEventListener("click", async () => {

        const dateInput = overlay.querySelector("#receiptDateInput");
        const imageInput = overlay.querySelector("#receiptImageInput");
        const errorEl = overlay.querySelector("[data-receipt-form-error]");
        const saveButton = overlay.querySelector("[data-receipt-save]");

        const receiptDate = dateInput.value;

        const items = [...itemsEditor.querySelectorAll(".receipt-item-row")].map(row => ({
            description: row.querySelector(".receipt-item-description").value.trim(),
            price: Number(row.querySelector(".receipt-item-price").value) || 0
        })).filter(row => row.description);

        if (!receiptDate) {
            errorEl.textContent = "Please select a receipt date.";
            errorEl.style.display = "block";
            return;
        }

        if (receiptDate < bounds.min || receiptDate > bounds.max) {
            errorEl.textContent = "Receipt date must be within the current period and not in the future.";
            errorEl.style.display = "block";
            return;
        }

        if (items.length === 0) {
            errorEl.textContent = "Please add at least one item.";
            errorEl.style.display = "block";
            return;
        }

        if (!isEdit && !imageInput.files[0]) {
            errorEl.textContent = "Please attach the receipt image.";
            errorEl.style.display = "block";
            return;
        }

        errorEl.style.display = "none";
        saveButton.disabled = true;
        saveButton.textContent = isEdit ? "Saving..." : "Adding...";

        try {

            // multipart/form-data so the image file rides alongside the
            // rest of the receipt fields in a single request.
            const formData = new FormData();

            if (isEdit) {
                formData.append("id", existingItem.id);
            }

            formData.append("receipt_date", receiptDate);
            formData.append("items", JSON.stringify(items));

            if (imageInput.files[0]) {
                formData.append("image", imageInput.files[0]);
            }

            const endpoint = isEdit ? RECEIPT_API.edit : RECEIPT_API.create;

            const response = await receiptFetchWithTimeout(
                endpoint,
                {
                    method: "POST",
                    headers: { "Accept": "application/json" },
                    // No Content-Type header — the browser sets the correct
                    // multipart boundary automatically for FormData bodies.
                    body: formData
                },
                RECEIPT_REQUEST_TIMEOUT
            );

            let result = null;

            try {
                result = await response.json();
            } catch {
                throw new Error("Backend returned no valid response.");
            }

            if (!response.ok) {
                console.error("Backend error response:", result);
                throw new Error(result?.message || `Request failed: ${response.status}`);
            }

            close();

            // The form only accepts dates inside the active period, which
            // may not be the month currently being browsed — follow the
            // saved date so the receipt is actually on screen afterwards.
            receiptState.get(root).viewMonth = receiptDate.slice(0, 7);

            await receiptLoad(root);

        } catch (error) {

            console.error("Failed to save receipt:", error);

            errorEl.textContent = error.message || "Could not save the receipt. Please try again.";
            errorEl.style.display = "block";

            saveButton.disabled = false;
            saveButton.textContent = isEdit ? "Save Changes" : "Add Receipt";
        }
    });
}

/* ============================================================================
   SECTION: Add / Edit Form (modal)                                        END
============================================================================ */


/* ============================================================================
   SECTION: Public API                                                   START
   ============================================================================ */

window.ReceiptsModule = {
    init: receiptInit,
    refresh: (root) => receiptLoad(root)
};

/* ============================================================================
   SECTION: Public API                                                     END
============================================================================ */
