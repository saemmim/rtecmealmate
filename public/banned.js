const profileInformation =
    document.getElementById("profileInformation");

const deleteSection =
    document.getElementById("deleteSection");

const deleteProfileBtn =
    document.getElementById("deleteProfileBtn");

const errorMessage =
    document.getElementById("errorMessage");


// ==========================
// Load Banned Profile
// ==========================

async function loadBannedProfile() {

    try {

        const response = await fetch("/status/banned");

        const reply = await response.json();


        // --------------------------
        // If backend wants redirect
        // --------------------------

        if (reply.redirect) {

            window.location.href = reply.redirect;

            return;
        }


        // --------------------------
        // Else display profile information
        // --------------------------

        document.getElementById("profileName").textContent =
            reply.name || "";

        document.getElementById("profileUsername").textContent =
            reply.username || "";

        document.getElementById("profileDepartment").textContent =
            reply.department || "";

        document.getElementById("profileBatch").textContent =
            reply.batch || "";

        document.getElementById("profilePhone").textContent =
            reply.phone || "";


        // --------------------------
        // Profile picture
        // --------------------------

        if (reply.profile_picture) {

            document.getElementById("profileImage").src =
                reply.profile_picture;

        } else {

            // Hide image if there is no profile picture
            document.getElementById("profileImage").style.display =
                "none";
        }


        // --------------------------
        // Show the sections
        // --------------------------

        profileInformation.classList.remove("hidden");

        deleteSection.classList.remove("hidden");


    } catch (error) {

        console.error(
            "Failed to load banned profile:",
            error
        );

        errorMessage.textContent =
            "Unable to load your profile. Please try again.";
    }
}


// ==========================
// Delete Profile
// ==========================

async function deleteProfile() {

    const confirmed = confirm(
        "Are you sure you want to permanently delete your profile?\n\n" +
        "This action cannot be undone."
    );


    if (!confirmed) {
        return;
    }


    deleteProfileBtn.disabled = true;

    deleteProfileBtn.textContent =
        "Deleting...";

    errorMessage.textContent = "";


    try {

        const response = await fetch("/status/delete", {
            method: "POST",
        });


        const reply = await response.json();


        // --------------------------
        // Successful deletion
        // --------------------------

        if (reply.redirect) {

            window.location.href = reply.redirect;

            return;
        }


        // --------------------------
        // Unexpected response
        // --------------------------

        errorMessage.textContent =
            data.message ||
            "Unable to delete the profile.";

        deleteProfileBtn.disabled = false;

        deleteProfileBtn.textContent =
            "Delete Profile";


    } catch (error) {

        console.error(
            "Failed to delete profile:",
            error
        );

        errorMessage.textContent =
            "Something went wrong. Please try again.";

        deleteProfileBtn.disabled = false;

        deleteProfileBtn.textContent =
            "Delete Profile";
    }
}


// ==========================
// Event Listener
// ==========================

deleteProfileBtn.addEventListener(
    "click",
    deleteProfile
);


// ==========================
// Start
// ==========================

loadBannedProfile();