/* ============================================================================
   SECTION: shared/bulletin.js — Overview                                START
   ============================================================================
   Renders the Bulletin board inside whatever container element it is
   given (see window.BulletinModule.init below). Used identically by
   index.html, manager.html, representative.html and administrator.html —
   the container element's [data-role] attribute (or, if absent, the page
   filename) tells this module which dashboard it is running on:

       index.html            -> "user"  (view only)
       manager.html           -> "mm"    (add / edit own)
       representative.html    -> "hr"    (add / edit own)
       administrator.html     -> "hs"    (add / edit own)

   Expected shape of each object returned by GET /bulletins, matching the
   `bulletins` table plus a join against `users`:

       {
           id,                 // bigint
           user_id,            // bigint — author's user id
           user_role,          // 'mm' | 'hr' | 'hs'
           title,              // string | null
           message,            // string
           created_at,         // timestamptz
           updated_at,         // timestamptz | null — present only if edited

           // joined from users, flat fields:
           name,
           username,
           phone,
           profile_picture
       }

   Change the endpoints below if your backend uses different routes.
============================================================================ */

const BULLETIN_API = {
    list: "/bulletins",
    create: "/bulletins",
    update: (id) => `/bulletins/${encodeURIComponent(id)}`,

    // Used only to resolve the current user's id (see below).
    me: "/auth/me"
};

const BULLETIN_REQUEST_TIMEOUT = 1000 * 60;

// Own bulletins can only be edited within this window of being posted.
// Adjust freely — currently set to 24 hours per the project's spec.
const BULLETIN_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/* ============================================================================
   SECTION: shared/bulletin.js — Overview                                  END
============================================================================ */


/* ============================================================================
   SECTION: Current User Resolution                                     START
   ============================================================================
   Role is derived from which dashboard page we're on, per the project's
   convention (one role per HTML file). The user's own id still has to
   come from the backend, since that's needed to tell "own" bulletins
   apart from everyone else's — fetched once and cached.
============================================================================ */

function bulletinRoleFromPage() {

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


let cachedBulletinUser = null;

async function getBulletinCurrentUser(root) {

    // Only reuse the cache once id resolution has actually succeeded —
    // a transient failure (e.g. /auth/me not ready yet on first load)
    // should not permanently disable Edit buttons for the whole session.
    if (cachedBulletinUser && cachedBulletinUser.id !== null) {
        return cachedBulletinUser;
    }

    const role = root.dataset.role || bulletinRoleFromPage();

    let id = null;

    try {

        const response = await bulletinFetchWithTimeout(
            BULLETIN_API.me,
            { method: "GET", headers: { "Accept": "application/json" } },
            BULLETIN_REQUEST_TIMEOUT
        );

        if (response.ok) {

            const data = await response.json();

            // Accept whichever key shape the backend actually returns —
            // some ORMs serialize the primary key as "id", others as the
            // raw column name "user_id", or camelCase "userId".
            id = data?.id ?? data?.user_id ?? data?.userId ?? null;

            if (id === null) {
                console.warn(
                    "BulletinModule: /auth/me responded but no id/user_id/userId field was found — " +
                    "Edit buttons will not appear on your own bulletins until this is fixed. Response was:",
                    data
                );
            }

        } else {
            console.warn(`BulletinModule: GET ${BULLETIN_API.me} returned ${response.status} — cannot resolve current user id.`);
        }

    } catch (error) {
        console.error("Could not resolve current user for bulletin permissions:", error);
    }

    cachedBulletinUser = { id, role };

    return cachedBulletinUser;
}


// Only mm / hr / hs can post bulletins — plain users only ever view.
function canPostBulletin(role) {
    return role === "mm" || role === "hr" || role === "hs";
}


// manager.html stores the active period's status on <body
// data-period-status> (see manager.js). Only that page has the concept
// of a period being "closed" / "requested_to_reopen" — everywhere else
// there's no such attribute, so posting stays unrestricted by default.
function bulletinIsPeriodEditable() {

    const status = document.body.dataset.periodStatus;

    if (!status) return true;

    return status === "open" || status === "reopened";
}

/* ============================================================================
   SECTION: Current User Resolution                                        END
============================================================================ */


/* ============================================================================
   SECTION: Helpers                                                      START
   ============================================================================ */

async function bulletinFetchWithTimeout(url, options = {}, timeout = 10000) {

    const controller = new AbortController();

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}


function bulletinEscapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function bulletinInitialAvatar(name) {

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


function bulletinRoleLabel(role) {
    switch (role) {
        case "mm": return "Meal Manager";
        case "hr": return "Hall Rep";
        case "hs": return "Hostel Super";
        default: return "";
    }
}


function bulletinFormatDate(isoString) {

    if (!isoString) return "";

    try {
        return new Date(isoString).toLocaleString(undefined, {
            day: "numeric", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit"
        });
    } catch {
        return isoString;
    }
}


// True if the bulletin was created less than BULLETIN_EDIT_WINDOW_MS ago.
// Guards against an unparsable/missing created_at by treating it as
// "not editable" rather than throwing.
function bulletinIsWithinEditWindow(createdAt) {

    if (!createdAt) return false;

    const createdTime = new Date(createdAt).getTime();

    if (Number.isNaN(createdTime)) return false;

    return Date.now() - createdTime < BULLETIN_EDIT_WINDOW_MS;
}

/* ============================================================================
   SECTION: Helpers                                                         END
============================================================================ */


/* ============================================================================
   SECTION: Module State                                                 START
   ============================================================================
   Keyed by container element, so this module works correctly even if a
   page ever mounts more than one bulletin board.
============================================================================ */

const bulletinState = new WeakMap();

/* ============================================================================
   SECTION: Module State                                                   END
============================================================================ */


/* ============================================================================
   SECTION: Init                                                         START
   ============================================================================ */

async function bulletinInit(root) {

    if (!root || root.dataset.bulletinInitialized === "true") {
        return;
    }

    root.dataset.bulletinInitialized = "true";

    // List first, add-button toolbar below it (per the requested layout).
    root.innerHTML = `
    <div class="bulletin-toolbar" style="display:none;">
    <button type="button" class="bulletin-add-button" data-bulletin-add>+ Add Bulletin</button>
    </div>

    <div class="bulletin-list" data-bulletin-list></div>
    `;

    const listEl = root.querySelector("[data-bulletin-list]");
    const toolbarEl = root.querySelector(".bulletin-toolbar");
    const addButton = root.querySelector("[data-bulletin-add]");

    bulletinState.set(root, { items: [], user: null, listEl, toolbarEl, addButton });

    const user = await getBulletinCurrentUser(root);

    bulletinState.get(root).user = user;

    if (canPostBulletin(user.role)) {
        toolbarEl.style.display = "flex";
        addButton.addEventListener("click", () => {
            if (!addButton.disabled) {
                openBulletinForm(root);
            }
        });
    }

    updateBulletinAddButtonState(root);

    await bulletinLoad(root);
}


// Disables Add Bulletin while the active period is closed / pending
// reopen. Re-checked on every load, since manager.html reloads this tab
// on every switch and the period can change via Options > Change Month.
function updateBulletinAddButtonState(root) {

    const state = bulletinState.get(root);

    if (!state?.addButton) return;

    state.addButton.disabled = !bulletinIsPeriodEditable();
}

/* ============================================================================
   SECTION: Init                                                           END
============================================================================ */


/* ============================================================================
   SECTION: Fetching                                                     START
   ============================================================================ */

async function bulletinLoad(root) {

    const state = bulletinState.get(root);
    const { listEl } = state;

    updateBulletinAddButtonState(root);

    listEl.innerHTML = `
        <div class="bulletin-loading">
            <span>Loading bulletins...</span>
        </div>
    `;

    try {

        const response = await bulletinFetchWithTimeout(
            BULLETIN_API.list,
            { method: "GET", headers: { "Accept": "application/json" } },
            BULLETIN_REQUEST_TIMEOUT
        );

        if (!response.ok) {
            throw new Error(`Failed to load bulletins: ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("Backend returned an invalid bulletin format.");
        }

        state.items = data;

        bulletinRender(root);

    } catch (error) {

        console.error(error);

        listEl.innerHTML = `
            <div class="bulletin-state-box">
                <h3 class="bulletin-state-title">Something went wrong</h3>
                <p class="bulletin-state-message">Could not load bulletins. Please try again.</p>
                <button type="button" class="bulletin-retry-button" data-bulletin-retry>Try again</button>
            </div>
        `;

        listEl.querySelector("[data-bulletin-retry]").addEventListener("click", () => bulletinLoad(root));
    }
}

/* ============================================================================
   SECTION: Fetching                                                        END
============================================================================ */


/* ============================================================================
   SECTION: Rendering                                                    START
   ============================================================================ */

function bulletinRender(root) {

    const state = bulletinState.get(root);
    const { listEl, items, user } = state;

    if (!items || items.length === 0) {

        listEl.innerHTML = `
            <div class="bulletin-state-box">
                <h3 class="bulletin-state-title">No bulletins yet</h3>
                <p class="bulletin-state-message">Announcements posted here will show up for everyone.</p>
            </div>
        `;

        return;
    }

    listEl.innerHTML = items.map(item => bulletinCardHtml(item, user)).join("");

    listEl.querySelectorAll("[data-bulletin-edit]").forEach(button => {

        button.addEventListener("click", () => {

            const id = button.dataset.bulletinEdit;
            const item = state.items.find(b => String(b.id) === String(id));

            if (item) {
                openBulletinForm(root, item);
            }
        });
    });
}


function bulletinCardHtml(item, user) {

    const role = item.user_role || "";
    const avatar = item.profile_picture || bulletinInitialAvatar(item.name);

    // "Own" bulletin — matched against the users.id row, not the role,
    // since two mm/hr/hs accounts must never be able to edit each other's.
    // Falls back to alternate key spellings in case the API serializes
    // the column as "userId" instead of the raw "user_id".
    const itemAuthorId = item.user_id ?? item.userId ?? null;
    const isOwn = user && user.id !== null && String(itemAuthorId) === String(user.id);

    // Edit is further restricted to bulletins posted less than
    // BULLETIN_EDIT_WINDOW_MS ago — an old post can no longer be edited,
    // even by its own author.
    const canEdit = canPostBulletin(user?.role) && isOwn && bulletinIsWithinEditWindow(item.created_at);

    // title is nullable — only render the heading line when present.
    const hasTitle = Boolean(item.title && item.title.trim());

    // updated_at is only ever set once a bulletin has been edited.
    const isEdited = Boolean(item.updated_at);

    return `
        <article class="bulletin-card ${role ? `role-${role}` : ""}" data-bulletin-id="${bulletinEscapeHtml(item.id)}">

            <div class="bulletin-header">
                <img class="bulletin-avatar" src="${bulletinEscapeHtml(avatar)}" alt="${bulletinEscapeHtml(item.name)}" loading="lazy" onerror="this.src='${bulletinInitialAvatar(item.name)}'">

                <div class="bulletin-identity">
                    <div class="bulletin-name-row">
                        <p class="bulletin-name">${bulletinEscapeHtml(item.name)}</p>
                        ${role ? `<span class="bulletin-role-badge role-${role}">${bulletinEscapeHtml(bulletinRoleLabel(role))}</span>` : ""}
                    </div>
                    <p class="bulletin-meta-row">${bulletinEscapeHtml(item.username)} &middot; ${bulletinEscapeHtml(item.phone)}</p>
                </div>
            </div>

            <div class="bulletin-body">
                ${hasTitle ? `<h3 class="bulletin-heading">${bulletinEscapeHtml(item.title)}</h3>` : ""}
                <p class="bulletin-message">${bulletinEscapeHtml(item.message)}</p>
            </div>

            <div class="bulletin-footer">
                <div>
                    <span class="bulletin-date">${bulletinFormatDate(item.created_at)}</span>
                    ${isEdited ? `<span class="bulletin-edited"> &middot; edited</span>` : ""}
                </div>

                ${canEdit ? `<button type="button" class="bulletin-edit-button" data-bulletin-edit="${bulletinEscapeHtml(item.id)}">Edit</button>` : ""}
            </div>

        </article>
    `;
}

/* ============================================================================
   SECTION: Rendering                                                       END
============================================================================ */


/* ============================================================================
   SECTION: Add / Edit Form (modal)                                     START
   ============================================================================ */

function openBulletinForm(root, existingItem = null) {

    const isEdit = Boolean(existingItem);

    const overlay = document.createElement("div");
    overlay.className = "bulletin-modal-overlay";

    overlay.innerHTML = `
        <div class="bulletin-modal-box">
            <h3 class="bulletin-modal-title">${isEdit ? "Edit Bulletin" : "Add Bulletin"}</h3>

            <div class="bulletin-form-field">
                <label for="bulletinTitleInput">Title <span style="font-weight:400;">(optional)</span></label>
                <input type="text" id="bulletinTitleInput" maxlength="255" value="${bulletinEscapeHtml(existingItem?.title || "")}">
            </div>

            <div class="bulletin-form-field">
                <label for="bulletinMessageInput">Message</label>
                <textarea id="bulletinMessageInput">${bulletinEscapeHtml(existingItem?.message || "")}</textarea>
            </div>

            <p class="bulletin-form-error" data-bulletin-form-error style="display:none;"></p>

            <div class="bulletin-modal-actions">
                <button type="button" data-bulletin-cancel>Cancel</button>
                <button type="button" class="primary" data-bulletin-save>${isEdit ? "Save Changes" : "Post"}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
    });

    overlay.querySelector("[data-bulletin-cancel]").addEventListener("click", close);

    overlay.querySelector("[data-bulletin-save]").addEventListener("click", async () => {

        const titleInput = overlay.querySelector("#bulletinTitleInput");
        const messageInput = overlay.querySelector("#bulletinMessageInput");
        const errorEl = overlay.querySelector("[data-bulletin-form-error]");
        const saveButton = overlay.querySelector("[data-bulletin-save]");

        const title = titleInput.value.trim();
        const message = messageInput.value.trim();

        // title is optional (nullable in the DB) — only message is required.
        if (!message) {
            errorEl.textContent = "Please write a message.";
            errorEl.style.display = "block";
            return;
        }

        errorEl.style.display = "none";
        saveButton.disabled = true;
        saveButton.textContent = isEdit ? "Saving..." : "Posting...";

        try {

            const endpoint = isEdit ? BULLETIN_API.update(existingItem.id) : BULLETIN_API.create;
            const method = isEdit ? "PUT" : "POST";

            // title sent as null (not an empty string) when left blank, to
            // match the nullable VARCHAR column cleanly.
            const response = await bulletinFetchWithTimeout(
                endpoint,
                {
                    method,
                    headers: { "Content-Type": "application/json", "Accept": "application/json" },
                    body: JSON.stringify({ title: title || null, message })
                },
                BULLETIN_REQUEST_TIMEOUT
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

            close();

            await bulletinLoad(root);

        } catch (error) {

            console.error("Failed to save bulletin:", error);

            errorEl.textContent = error.message || "Could not save the bulletin. Please try again.";
            errorEl.style.display = "block";

            saveButton.disabled = false;
            saveButton.textContent = isEdit ? "Save Changes" : "Post";
        }
    });
}

/* ============================================================================
   SECTION: Add / Edit Form (modal)                                        END
============================================================================ */


/* ============================================================================
   SECTION: Public API                                                   START
   ============================================================================ */

window.BulletinModule = {
    init: bulletinInit,
    refresh: (root) => bulletinLoad(root)
};

/* ============================================================================
   SECTION: Public API                                                     END
============================================================================ */
