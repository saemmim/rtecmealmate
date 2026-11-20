const remainingContainer = document.getElementById("remainingUsers");
const completedContainer = document.getElementById("completedUsers");

const remainingCount = document.getElementById("remainingCount");
const completedCount = document.getElementById("completedCount");

const tabs = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");

const users = {
    remaining: [],
    completed: []
};


let currentTab = "remaining";


document.addEventListener("DOMContentLoaded", () => {

    loadUsers();

    setupTabs();

});


async function loadUsers() {

    try {

        showLoading();

        const response = await fetch("/count-users");

        
        const reply = await response.json();

        if (reply.redirect) {
            window.location.href = reply.redirect;
            return;
        }


        if (!response.ok) {
            throw new Error("Failed to load users.");
        }





        users.remaining = Array.isArray(reply)
            ? reply
            : (Array.isArray(reply.users) ? reply.users : []);
        users.completed = [];


        renderUsers();

    }

    catch (error) {

        console.error(error);

        showError();

    }

}


function setupTabs() {

    tabs.forEach(tab => {

        tab.addEventListener("click", () => {

            const tabName = tab.dataset.tab;

            if (!tabName) {
                return;
            }


            currentTab = tabName;


            updateActiveTab();

            renderUsers();

        });

    });

}


function updateActiveTab() {

    tabs.forEach(tab => {

        tab.classList.toggle(
            "active",
            tab.dataset.tab === currentTab
        );

    });


    tabContents.forEach(content => {

        content.classList.toggle(
            "active",
            content.dataset.tabContent === currentTab
        );

    });

}


function renderUsers() {
    
    const remainingUsers = [...users.remaining]
        .sort(sortUsersByName);

    const completedUsers = [...users.completed]
        .sort(sortUsersByName);


    users.remaining = remainingUsers;
    users.completed = completedUsers;


    remainingContainer.innerHTML = "";
    completedContainer.innerHTML = "";


    updateCounts();


    renderUserList(
        remainingUsers,
        remainingContainer,
        "Complete"
    );


    renderUserList(
        completedUsers,
        completedContainer,
        "Remaining"
    );

}


function renderUserList(userList, container, buttonText) {

    if (userList.length === 0) {

        container.innerHTML = `
            <div class="empty-message">
                No users found.
            </div>
        `;

        return;

    }


    userList.forEach(user => {

        const card = createUserCard(
            user,
            buttonText
        );


        container.appendChild(card);

    });

}


function createUserCard(user, buttonText) {

    const card = document.createElement("div");

    card.className = "user-card";

/*    const profilePicture = user.profile_picture
        ? (user.profile_picture.startsWith("/") || user.profile_picture.startsWith("http")
            ? user.profile_picture
            : `/${user.profile_picture}`)
        : "/images/default-profile.png";
        */

    const profilePicture = user.profile_picture;

    const actionClass = buttonText === "Complete" ? "complete" : "remaining";

    card.innerHTML = `
        <img class="profile-picture"
            src="${escapeHTML(profilePicture)}"
            alt="${escapeHTML(user.name || "Unknown")}" loading="lazy"
            onerror="this.src='${createInitialAvatar(user.name)}'">

        <div class="user-info">
            <h3 class="name">${escapeHTML(user.name || "Unknown")}</h3>
            <div class="user-details">
                <span class="username">${escapeHTML(user.username || "")}</span>
                <span class="detail-separator"></span>
                <span class="department-batch">${escapeHTML(user.department || "")}</span>
                <span class="detail-separator"></span>
                <span class="phone">${escapeHTML(user.phone || "")}</span>
            </div>
        </div>

        <div class="action-area">
            <button class="action-button ${actionClass}" type="button">
                ${buttonText}
            </button>
        </div>
    `;

    const button = card.querySelector(".action-button");


    button.addEventListener("click", () => {

        toggleUserStatus(user);

    });


    return card;

}


function toggleUserStatus(user) {

    if (currentTab === "remaining") {

        users.remaining = users.remaining.filter(
            currentUser => currentUser.username !== user.username
        );


        users.completed.push(user);

    }

    else {

        users.completed = users.completed.filter(
            currentUser => currentUser.username !== user.username
        );


        users.remaining.push(user);

    }


    renderUsers();

}


function sortUsersByName(a, b) {

    const nameA =
        (a.name || "").toLowerCase();

    const nameB =
        (b.name || "").toLowerCase();


    return nameA.localeCompare(nameB);

}


function updateCounts() {

    remainingCount.textContent =
        users.remaining.length;


    completedCount.textContent =
        users.completed.length;

}


function showLoading() {

    remainingContainer.innerHTML = `
        <div class="loading-message">
            Loading users...
        </div>
    `;


    completedContainer.innerHTML = `
        <div class="loading-message">
            Loading users...
        </div>
    `;

}


function showError() {

    remainingContainer.innerHTML = `
        <div class="error-message">
            Failed to load users.
            <button
                type="button"
                id="retryButton"
            >
                Retry
            </button>
        </div>
    `;


    completedContainer.innerHTML = "";


    const retryButton =
        document.getElementById("retryButton");


    retryButton.addEventListener(
        "click",
        loadUsers
    );

}


function escapeHTML(value) {

    const div = document.createElement("div");

    div.textContent = value ?? "";

    return div.innerHTML;

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