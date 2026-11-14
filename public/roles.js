/*
|--------------------------------------------------------------------------
| API configuration
|--------------------------------------------------------------------------
*/

const API = {
    managers: "roles/managers",
    representatives: "roles/representatives",
    administrators: "roles/administrators"
};


/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

const REQUEST_TIMEOUT = 1000 * 60;


/*
|--------------------------------------------------------------------------
| DOM
|--------------------------------------------------------------------------
*/

const userList = document.getElementById("userList");

const tabs = document.querySelectorAll(".tab");

const managersCount =
    document.getElementById("managersCount");

const representativesCount =
    document.getElementById("representativesCount");

const administratorsCount =
    document.getElementById("administratorsCount");


/*
|--------------------------------------------------------------------------
| State
|--------------------------------------------------------------------------
*/

let currentTab = "managers";


const users = {
    managers: [],
    representatives: [],
    administrators: []
};


/*
|--------------------------------------------------------------------------
| Tabs
|--------------------------------------------------------------------------
*/

function setupTabs() {

    tabs.forEach(tab => {

        tab.addEventListener("click", () => {

            const tabName = tab.dataset.tab;

            if (tabName === currentTab) {
                return;
            }

            currentTab = tabName;

            updateActiveTab(tabName);

            loadUsers(tabName);
        });
    });
}


function updateActiveTab(tabName) {

    tabs.forEach(tab => {

        tab.classList.toggle(
            "active",
            tab.dataset.tab === tabName
        );

    });
}


/*
|--------------------------------------------------------------------------
| Get endpoint
|--------------------------------------------------------------------------
*/

function getEndpoint(tabName) {

    switch (tabName) {

        case "managers":
            return API.managers;

        case "representatives":
            return API.representatives;

        case "administrators":
            return API.administrators;

        default:
            throw new Error(
                `Unknown tab: ${tabName}`
            );
    }
}


/*
|--------------------------------------------------------------------------
| Load users
|--------------------------------------------------------------------------
*/

async function loadUsers(tabName) {

    showLoading();

    try {

        const response = await fetchWithTimeout(
            getEndpoint(tabName),
            {
                method: "GET",
            },
            REQUEST_TIMEOUT
        );


        /*
        |--------------------------------------------------------------------------
        | Read JSON & Redirect if needed
        |--------------------------------------------------------------------------
        */
 
        const reply = await response.json();

        if (reply.redirect) {

            window.location.href = reply.redirect;

            return;
        }

        

        /*
        |--------------------------------------------------------------------------
        | HTTP error
        |--------------------------------------------------------------------------
        */


        if (!response.ok) {

            throw new Error(
                `Failed to load users: ${response.status}`
            );
        }



        /*
        |--------------------------------------------------------------------------
        | Validate user data
        |--------------------------------------------------------------------------
        */

        if (!Array.isArray(reply)) {

            throw new Error(
                "Backend returned an invalid users format."
            );
        }


        /*
        |--------------------------------------------------------------------------
        | Store users
        |--------------------------------------------------------------------------
        */

        users[tabName] = reply;


        /*
        |--------------------------------------------------------------------------
        | Update count
        |--------------------------------------------------------------------------
        */

        updateCounts();


        /*
        |--------------------------------------------------------------------------
        | Render
        |--------------------------------------------------------------------------
        */

        renderUsers(tabName);

    }

    catch (error) {

        console.error(error);

        showError(
            "Unable to load users",
            "Something went wrong while loading the users."
        );
    }
}


/*
|--------------------------------------------------------------------------
| Render users
|--------------------------------------------------------------------------
*/

function renderUsers(tabName) {

    const userData = users[tabName];


    /*
    |--------------------------------------------------------------------------
    | Empty state
    |--------------------------------------------------------------------------
    */

    if (!userData || userData.length === 0) {

        const messages = {

            managers:
                "There are no managers.",

            representatives:
                "There are no representatives.",

            administrators:
                "There are no administratior users."
        };


        userList.innerHTML = `
            <div class="state-box">

                <h2 class="state-title">
                    No users found
                </h2>

                <p class="state-message">
                    ${messages[tabName]}
                </p>

            </div>
        `;

        return;
    }


    /*
    |--------------------------------------------------------------------------
    | Create cards
    |--------------------------------------------------------------------------
    */

    const userCardArray = userData.map(
        user => createUserCard(user, tabName)
    );


    userList.innerHTML = userCardArray.join("");
}


/*
|--------------------------------------------------------------------------
| Create user card
|--------------------------------------------------------------------------
*/

function createUserCard(user, tabName) {

    /*
    |--------------------------------------------------------------------------
    | Profile picture
    |--------------------------------------------------------------------------
    */

    const profilePicture =
        user.profilePicture ||
        user.profile_picture ||
        createInitialAvatar(user.name);


    /*
    |--------------------------------------------------------------------------
    | administrators card
    |--------------------------------------------------------------------------
    |
    | administrators users only have:
    |
    | profilePicture
    | name
    | username
    | phone
    |
    */

    if (tabName === "administrators") {

        return `
            <article
                class="user-card"
                data-user-id="${escapeHtml(user.id)}"
            >

                <img
                    class="profile-picture"
                    src="${escapeHtml(profilePicture)}"
                    alt="${escapeHtml(user.name)}"
                    loading="lazy"
                    onerror="this.src='${createInitialAvatar(user.name)}'"
                >


                <div class="user-info">

                    <h2 class="name">
                        ${escapeHtml(user.name)}
                    </h2>


                    <div class="user-details">

                        <span class="username">
                            ${escapeHtml(user.username)}
                        </span>


                        <span class="detail-separator"></span>
                        
                        <span class="department-batch">
                        ${escapeHtml(user.department)}
                        </span>
                        
                        <span class="detail-separator"></span>

                        <span class="phone">
                            ${escapeHtml(user.phone)}
                        </span>

                    </div>

                </div>

            </article>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | Manager / Representative card
    |--------------------------------------------------------------------------
    */

    return `
        <article
            class="user-card"
            data-user-id="${escapeHtml(user.id)}"
        >

            <img
                class="profile-picture"
                src="${escapeHtml(profilePicture)}"
                alt="${escapeHtml(user.name)}"
                loading="lazy"
                onerror="this.src='${createInitialAvatar(user.name)}'"
            >


            <div class="user-info">

                <h2 class="name">
                    ${escapeHtml(user.name)}
                </h2>


                <div class="user-details">

                    <span class="username">
                        ${escapeHtml(user.username)}
                    </span>


                    <span class="detail-separator"></span>


                    <span class="department-batch">
                        ${escapeHtml(user.department)}
                        |
                        ${escapeHtml(user.batch)}
                    </span>


                    <span class="detail-separator"></span>


                    <span class="phone">
                        ${escapeHtml(user.phone)}
                    </span>

                </div>

            </div>

        </article>
    `;
}


/*
|--------------------------------------------------------------------------
| Update tab counts
|--------------------------------------------------------------------------
*/

function updateCounts() {

    managersCount.textContent =
        users.managers.length;


    representativesCount.textContent =
        users.representatives.length;


    administratorsCount.textContent =
        users.administrators.length;
}


/*
|--------------------------------------------------------------------------
| Loading state
|--------------------------------------------------------------------------
*/

function showLoading() {

    userList.innerHTML = `
        <div class="loading-state">

            <div class="loading-dots">

                <span></span>
                <span></span>
                <span></span>

            </div>

            <span>
                Loading users...
            </span>

        </div>
    `;
}


/*
|--------------------------------------------------------------------------
| Error state
|--------------------------------------------------------------------------
*/

function showError(title, message) {

    userList.innerHTML = `
        <div class="state-box">

            <h2 class="state-title">
                ${escapeHtml(title)}
            </h2>

            <p class="state-message">
                ${escapeHtml(message)}
            </p>

            <button
                type="button"
                class="retry-button"
                id="retryButton"
            >
                Try again
            </button>

        </div>
    `;


    document
        .getElementById("retryButton")
        .addEventListener(
            "click",
            () => loadUsers(currentTab)
        );
}


/*
|--------------------------------------------------------------------------
| Fetch with timeout
|--------------------------------------------------------------------------
*/

async function fetchWithTimeout(
    url,
    options = {},
    timeout = 10000
) {

    const controller =
        new AbortController();


    const timeoutId = setTimeout(
        () => {
            controller.abort();
        },
        timeout
    );


    try {

        return await fetch(
            url,
            {
                ...options,
                signal: controller.signal
            }
        );

    }

    finally {

        clearTimeout(timeoutId);
    }
}


/*
|--------------------------------------------------------------------------
| Escape HTML
|--------------------------------------------------------------------------
*/

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/*
|--------------------------------------------------------------------------
| Default avatar
|--------------------------------------------------------------------------
*/

function createInitialAvatar(name) {

    const initial =
        String(name || "?")
            .trim()
            .charAt(0)
            .toUpperCase();


    const svg = `
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="100"
            height="100"
            viewBox="0 0 100 100"
        >

            <rect
                width="100"
                height="100"
                rx="50"
                fill="#e5eae8"
            />

            <text
                x="50"
                y="60"
                text-anchor="middle"
                font-family="Arial, sans-serif"
                font-size="40"
                fill="#555"
            >
                ${initial}
            </text>

        </svg>
    `;


    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}


/*
|--------------------------------------------------------------------------
| Initialize
|--------------------------------------------------------------------------
*/

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        setupTabs();

        /*
        |----------------------------------------------------------------------
        | Load the first tab only.
        |----------------------------------------------------------------------
        |
        | Other tabs are loaded when the user selects them.
        |
        */
        
        await loadUsers("administrators");
        await loadUsers("representatives");
        await loadUsers("managers");
    }
);