/*
|--------------------------------------------------------------------------
| API configuration
|--------------------------------------------------------------------------
*/

const API = {
    changePassword: "/change-password"
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

const content = document.getElementById("content");


/*
|--------------------------------------------------------------------------
| State
|--------------------------------------------------------------------------
*/

let userProfile = null;


/*
|--------------------------------------------------------------------------
| Load profile (GET /change-password)
|--------------------------------------------------------------------------
*/

async function loadProfile() {

    showLoading();

    try {

        const response = await fetchWithTimeout(
            API.changePassword,
            {
                method: "GET"
            },
            REQUEST_TIMEOUT
        );


        const reply = await response.json();


        /*
        |--------------------------------------------------------------------------
        | Redirect if needed
        |--------------------------------------------------------------------------
        */

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
                reply.message || `Failed to load profile: ${response.status}`
            );
        }


        /*
        |--------------------------------------------------------------------------
        | Validate
        |--------------------------------------------------------------------------
        */

        if (
            typeof reply !== "object" ||
            reply === null ||
            !("name" in reply) ||
            !("username" in reply)
        ) {
            throw new Error("Backend returned an invalid profile format.");
        }


        userProfile = {
            name: reply.name,
            username: reply.username,
            profile_picture:
                reply.profile_picture ||
                reply.profilePicture ||
                null
        };


        renderForm();

    } catch (error) {

        console.error(error);

        showError(
            "Unable to load profile",
            "Something went wrong while loading your profile."
        );
    }
}


/*
|--------------------------------------------------------------------------
| Render form
|--------------------------------------------------------------------------
*/

function renderForm() {

    const profilePicture =
        userProfile.profile_picture ||
        createInitialAvatar(userProfile.name);


    content.innerHTML = `
        <!-- Profile (centered) -->
        <section class="profile-section">

            <img
                class="profile-picture-large"
                src="${escapeHtml(profilePicture)}"
                alt="${escapeHtml(userProfile.name)}"
                loading="lazy"
                onerror="this.src='${createInitialAvatar(userProfile.name)}'"
            >

            <h2 class="profile-name">
                ${escapeHtml(userProfile.name)}
            </h2>

            <p class="profile-username">
                @${escapeHtml(userProfile.username)}
            </p>

        </section>


        <!-- Form -->
        <form
            id="changePasswordForm"
            class="form-card"
            novalidate
        >

            <div class="form-group">
                <label class="form-label" for="oldPassword">
                    Current password
                </label>
                <input
                    type="password"
                    id="oldPassword"
                    name="oldPassword"
                    class="form-input"
                    autocomplete="current-password"
                    required
                    placeholder="Enter current password"
                >
            </div>


            <div class="form-group">
                <label class="form-label" for="newPassword">
                    New password
                </label>
                <input
                    type="password"
                    id="newPassword"
                    name="newPassword"
                    class="form-input"
                    autocomplete="new-password"
                    required
                    placeholder="Enter new password"
                >
            </div>


            <div class="form-group">
                <label class="form-label" for="confirmPassword">
                    Confirm new password
                </label>
                <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    class="form-input"
                    autocomplete="new-password"
                    required
                    placeholder="Confirm new password"
                >
            </div>


            <button
                type="submit"
                id="submitButton"
                class="submit-button"
            >
                Change password
            </button>


            <div
                id="formMessage"
                class="form-message"
                role="alert"
                aria-live="polite"
            ></div>

        </form>
    `;


    document
        .getElementById("changePasswordForm")
        .addEventListener("submit", handleSubmit);
}


/*
|--------------------------------------------------------------------------
| Handle form submit (POST /change-password)
|--------------------------------------------------------------------------
*/

async function handleSubmit(event) {

    event.preventDefault();


    const oldPasswordInput = document.getElementById("oldPassword");
    const newPasswordInput = document.getElementById("newPassword");
    const confirmPasswordInput = document.getElementById("confirmPassword");
    const submitButton = document.getElementById("submitButton");
    const formMessage = document.getElementById("formMessage");


    const oldPassword = oldPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;


    /*
    |--------------------------------------------------------------------------
    | Clear previous errors
    |--------------------------------------------------------------------------
    */

    clearFieldErrors([
        oldPasswordInput,
        newPasswordInput,
        confirmPasswordInput
    ]);

    hideMessage(formMessage);


    /*
    |--------------------------------------------------------------------------
    | Client-side validation
    |--------------------------------------------------------------------------
    */

    if (!oldPassword) {
        markError(oldPasswordInput);
        showMessage(formMessage, "error", "Please enter your current password.");
        return;
    }

    if (!newPassword) {
        markError(newPasswordInput);
        showMessage(formMessage, "error", "Please enter a new password.");
        return;
    }

    if (newPassword.length < 6) {
        markError(newPasswordInput);
        showMessage(
            formMessage,
            "error",
            "New password must be at least 6 characters."
        );
        return;
    }

    if (newPassword !== confirmPassword) {
        markError(newPasswordInput);
        markError(confirmPasswordInput);
        showMessage(
            formMessage,
            "error",
            "New password and confirmation do not match."
        );
        return;
    }

    if (oldPassword === newPassword) {
        markError(newPasswordInput);
        showMessage(
            formMessage,
            "error",
            "New password must be different from the current password."
        );
        return;
    }


    /*
    |--------------------------------------------------------------------------
    | Submit
    |--------------------------------------------------------------------------
    */

    submitButton.disabled = true;
    submitButton.textContent = "Updating...";


    try {

        const response = await fetchWithTimeout(
            API.changePassword,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    oldPassword,
                    newPassword
                })
            },
            REQUEST_TIMEOUT
        );


        const reply = await response.json();


        /*
        |--------------------------------------------------------------------------
        | Redirect if needed
        |--------------------------------------------------------------------------
        */

        if (reply.redirect) {
            window.location.href = reply.redirect;
            return;
        }


        /*
        |--------------------------------------------------------------------------
        | HTTP error / backend error
        |--------------------------------------------------------------------------
        */

        if (!response.ok) {
            const message =
                reply.message ||
                reply.error ||
                `Failed to change password (${response.status})`;

            showMessage(formMessage, "error", message);
            return;
        }


        /*
        |--------------------------------------------------------------------------
        | Success
        |--------------------------------------------------------------------------
        */

        showMessage(
            formMessage,
            "success",
            reply.message || "Password changed successfully."
        );


        // Clear fields after success
        oldPasswordInput.value = "";
        newPasswordInput.value = "";
        confirmPasswordInput.value = "";

    } catch (error) {

        console.error(error);

        showMessage(
            formMessage,
            "error",
            "Something went wrong. Please try again."
        );

    } finally {

        submitButton.disabled = false;
        submitButton.textContent = "Change password";
    }
}


/*
|--------------------------------------------------------------------------
| UI helpers
|--------------------------------------------------------------------------
*/

function showLoading() {

    content.innerHTML = `
        <div class="loading-state">
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <span>Loading profile...</span>
        </div>
    `;
}


function showError(title, message) {

    content.innerHTML = `
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
        .addEventListener("click", loadProfile);
}


function markError(input) {
    input.classList.add("error");
}


function clearFieldErrors(inputs) {
    inputs.forEach(input => input.classList.remove("error"));
}


function showMessage(el, type, text) {
    el.className = `form-message visible ${type}`;
    el.textContent = text;
}


function hideMessage(el) {
    el.className = "form-message";
    el.textContent = "";
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

    const controller = new AbortController();

    const timeoutId = setTimeout(
        () => controller.abort(),
        timeout
    );

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
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

    const initial = String(name || "?")
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

document.addEventListener("DOMContentLoaded", () => {
    loadProfile();
});