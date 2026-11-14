// =========================================================
// ELEMENTS
// =========================================================

const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

const authMessage = document.getElementById("authMessage");


// =========================================================
// SWITCH TO LOGIN
// =========================================================

loginTab.addEventListener("click", () => {

    loginTab.classList.add("active");
    signupTab.classList.remove("active");

    loginForm.classList.remove("hidden");
    signupForm.classList.add("hidden");

    authMessage.textContent = "";

});


// =========================================================
// SWITCH TO SIGNUP
// =========================================================

signupTab.addEventListener("click", () => {

    signupTab.classList.add("active");
    loginTab.classList.remove("active");

    signupForm.classList.remove("hidden");
    loginForm.classList.add("hidden");

    authMessage.textContent = "";

});


// =========================================================
// LOGIN
// =========================================================

loginForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const loginEmail = document.getElementById("loginEmail").value;
    const loginPassword = document.getElementById("loginPassword").value;

    try {

        const res = await fetch("/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                loginEmail,
                loginPassword
            })
        });

        const reply = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(reply.message || "Login failed.");
        }

        authMessage.textContent = reply.message || "Logged in successfully.";

        if (reply.redirect) {
            window.location.href = reply.redirect;
        }

    } catch (error) {

        console.error(error);

        authMessage.textContent =
            error.message || "Something went wrong. Please try again.";

    }

});


// =========================================================
// SIGNUP
// =========================================================

signupForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const name = document.getElementById("signupName").value;
    const username = document.getElementById("signupUsername").value;
    const batch = document.getElementById("signupBatch").value;
    const department = document.getElementById("signupDepartment").value;
    const email = document.getElementById("signupEmail").value;
    const phone = document.getElementById("signupPhone").value;
    const password = document.getElementById("signupPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;


    // Check passwords

    if (password !== confirmPassword) {

        authMessage.textContent =
            "Passwords do not match.";

        return;
    }



    // Send signup request to server
    
    try {

        const res = await fetch("/auth/signup", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                name,
                username,
                batch,
                department,
                email,
                phone,
                password
            })
        });

        const reply = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(reply.message || "Signup failed.");
        }

        authMessage.textContent = reply.message || "Signed up successfully.";

        if (reply.redirect) {
            window.location.href = reply.redirect;
        }

    } catch (error) {

        console.error(error);

        authMessage.textContent =
            error.message || "Something went wrong. Please try again.";

    }

});