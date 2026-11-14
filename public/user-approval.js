/*
|--------------------------------------------------------------------------
| API configuration
|--------------------------------------------------------------------------
|
| Change these URLs if your backend uses different routes.
|
*/

const API = {
    pending: "user-approval/pending",
    approved: "user-approval/approved",
    banned: "user-approval/banned",

    approve: (id) => `user-approval/${encodeURIComponent(id)}/approve`,
    ban: (id) => `user-approval/${encodeURIComponent(id)}/ban`,
    unban: (id) => `user-approval/${encodeURIComponent(id)}/unban`
};


/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

const REQUEST_TIMEOUT = 1000*60;


/*
|--------------------------------------------------------------------------
| DOM
|--------------------------------------------------------------------------
*/

const userList = document.getElementById("userList");

const tabs = document.querySelectorAll(".tab");

const pendingCount = document.getElementById("pendingCount");
const approvedCount = document.getElementById("approvedCount");
const bannedCount = document.getElementById("bannedCount");


/*
|--------------------------------------------------------------------------
| State
|--------------------------------------------------------------------------
*/

let currentTab = "pending";

const users = {
    pending: [],
    approved: [],
    banned: []
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
            
            updateactiveTab(tabName);
            
            loadUsers(tabName);
        });
    });
}


function updateactiveTab(tabName) {
    
    tabs.forEach(tab => {
        
        tab.classList.toggle("active", tab.dataset.tab === tabName);
    
    });
}


/*
|--------------------------------------------------------------------------
| API URL for each tab
|--------------------------------------------------------------------------
*/

function getEndpoint(tabName) {
    
    switch (tabName) {
        
        case "pending": return API.pending;
            
        case "approved": return API.approved;
                
        case "banned": return API.banned;
                    
        default: throw new Error(`Unknown tab: ${tabName}`);
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
                
                headers: {
                    "Accept": "application/json"
                }
            },
            REQUEST_TIMEOUT
        );
        
        
        if (!response.ok) {
            throw new Error(
                `Failed to load users: ${response.status}`
            );
        }
        
        
        const data = await response.json();
        
        
        if (!Array.isArray(data)) {
            throw new Error(
                "Backend returned an invalid users format."
            );
        }
        
        
        users[tabName] = data;

        updateCounts();
        
        renderUsers(tabName);
        
    } catch (error) {
        
        console.error(error);
        
        // Display error state with retry button

        userList.innerHTML = `
            <div class="state-box">
        
                <h2 class="state-title">${escapeHtml(title)}</h2>
                
                <p class="state-message">${escapeHtml(message)}</p>
                
                <button type="button" class="retry-button" id="retryButton">Try again</button>
                
            </div>
        `;
                 
        document.getElementById("retryButton").addEventListener(
            "click",
            () => loadUsers(currentTab)
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
    
    
    if (!userData || userData.length === 0) {
        
        const messages = {
            pending: "There are no pending users.",
            approved: "There are no approved users.",
            banned: "There are no banned users."
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
    
    

    userCardArray = userData.map(user => createUserCard(user, tabName));

    userList.innerHTML = userCardArray.join("");
}


/*
|--------------------------------------------------------------------------
| Create user card
|--------------------------------------------------------------------------
*/

function createUserCard(user, tabName) {
    
    const profilePicture = user.profile_picture || createInitialAvatar(user.name);
    
    
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
                    
    <div class="action-area"> ${createActionButton(user, tabName)}</div>
                    
    </article>
    `;
}
                

/*
|--------------------------------------------------------------------------
| Create action button
|--------------------------------------------------------------------------
*/
               
function createActionButton(user, tabName) {
                   
    let label;
    let action;
    let className;
                   
    switch (tabName) {
                       
        case "pending":
                           
            label = "Approve";
            action = "approve";
            className = "approve";
                           
            break;
          
        case "approved":
            
            label = "Ban";
            action = "ban";
            className = "ban";
        
            break;
    
        case "banned":
                                   
            label = "Unban";
            action = "unban";
            className = "unban";
            
            break;
            
        default: return "";
    }
            
       
    return `
        <button type="button" class="action-button ${className}" data-action="${action}" data-user-id="${escapeHtml(user.id)}">${label}</button>
    `;
}
        
        
/*
|--------------------------------------------------------------------------
| Handle action buttons
|--------------------------------------------------------------------------
*/
       
userList.addEventListener("click", async (event) => {
    
    const button = event.target.closest("[data-action]");
    
    
    if (!button || button.disabled) {
        return;
    }
    

    const action = button.dataset.action;
    const userId = button.dataset.userId;
    

    await performUserAction(userId, action, button);

});


/*
|--------------------------------------------------------------------------
| Perform approve / ban / unban
|--------------------------------------------------------------------------
*/

async function performUserAction(userId, action, button) {
    
    const endpoint = getActionEndpoint(userId, action);

    // Disable button while request is running.
   
    button.disabled = true;
   
    // Store original text to restore later.

    const originalText = button.innerHTML.trim();
   
   
    button.innerHTML = `<span class="button-spinner"></span>`;
   
   
    try {
       
        const response = await fetchWithTimeout(endpoint,
            {
               method: "POST",
               
               headers: {
                   "Content-Type": "application/json",
                    "Accept": "application/json"
                }
            },
            REQUEST_TIMEOUT
        );
        
        
        /*
        * Try to read backend response.
        *
        * The backend should ideally return:
        *
        * {
        *     "success": true
        * }
        */
       
       let result = null;
       
       try {
           
           result = await response.json();
           
        } catch {
            
            /*
            * Empty response is considered a failure
            * because we need backend confirmation.
            */
           
           throw new Error(
               "Backend returned no valid response."
            );
        }


        /*
         * Backend explicitly rejected action.
        */

        if (!response.ok || response.status !== 200) {
            if (result?.message) {
                console.error(result.message);
            }

            throw new Error(
                result?.message ||
                `Request failed: ${response.status}`
            );
        }
        
        
        /*
        * SUCCESS
        *
        * Remove the user from the current list.
        */
        
        removeUserFromCurrentList(userId);

        // Keep all tab counts synchronized after a successful action.
        refreshUserCounts();

       
       
       
    } catch (error) {
        
        console.error(
            `Failed to ${action} user ${userId}:`,
            error
        );
        
        
        /*
        * Restore button.
        */
       
       button.disabled = false;
       
       button.innerHTML = originalText;
       
       
       /*
       * Small failure animation.
       */
      
      button.classList.remove("action-error");
      
      void button.offsetWidth;
      
      button.classList.add("action-error");
      
      
      setTimeout(() => {
          button.classList.remove("action-error");
        }, 400);
    }
}


/*
|--------------------------------------------------------------------------
| Get action endpoint
|--------------------------------------------------------------------------
*/

function getActionEndpoint(userId, action) {
    
    switch (action) {
        
        case "approve": return API.approve(userId);
            
        case "ban": return API.ban(userId);
                
        case "unban": return API.unban(userId);
                    
        default: throw new Error(`Unknown action: ${action}`);
    }
}
                
                
/*
|--------------------------------------------------------------------------
| Remove user after successful action
|--------------------------------------------------------------------------
*/

function removeUserFromCurrentList(userId) {
    
    const currentUsers = users[currentTab];
    
    
    users[currentTab] = currentUsers.filter(
        user =>
        String(user.id) !== String(userId)
    );
    
    
    updateCounts();
    
    renderUsers(currentTab);
}


/*
|--------------------------------------------------------------------------
| Update tab counts
|--------------------------------------------------------------------------
*/

function updateCounts() {
    
    pendingCount.textContent =
    users.pending.length;
    
    approvedCount.textContent =
    users.approved.length;
    
    bannedCount.textContent =
    users.banned.length;
}


/*
|--------------------------------------------------------------------------
| Refresh counts for all tabs
|--------------------------------------------------------------------------
*/

async function refreshUserCounts() {

    const tabNames = ["pending", "approved", "banned"];

    try {
        await Promise.all(tabNames.map(async tabName => {

            const response = await fetchWithTimeout(
                getEndpoint(tabName),
                {
                    method: "GET",
                    headers: {"Accept": "application/json"}
                },
                REQUEST_TIMEOUT
            );

            if (!response.ok) {
                throw new Error(`Failed to refresh ${tabName}: ${response.status}`);
            }

            const data = await response.json();

            if (!Array.isArray(data)) {
                throw new Error(`Invalid ${tabName} users format.`);
            }

            users[tabName] = data;
        }));

        updateCounts();

        // Refresh the visible list without changing the selected tab.
        renderUsers(currentTab);

    } catch (error) {
        console.error("Failed to refresh user counts:", error);
    }
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
                <span>Loading users...</span>
        </div>
    `;
}
            
        
        
/*
|--------------------------------------------------------------------------
| Fetch with timeout
|--------------------------------------------------------------------------
*/
       
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
        
    const controller = new AbortController();
    
    const timeoutId = setTimeout(() => {controller.abort();}, timeout);

    
    try {
        return await fetch(url, {...options, signal: controller.signal});
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




/*
|--------------------------------------------------------------------------
| Initialize
|--------------------------------------------------------------------------
*/

document.addEventListener("DOMContentLoaded", async () => {

    setupTabs();

    await loadUsers("banned");
    await loadUsers("approved");
    await loadUsers("pending");
});