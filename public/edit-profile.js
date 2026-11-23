const editProfileForm =
    document.getElementById("editProfileForm");


const profileImage =
    document.getElementById("profileImage");

const profilePicture =
    document.getElementById("profilePicture");

const pictureMessage =
    document.getElementById("pictureMessage");


const profileName =
    document.getElementById("profileName");

const profileUsername =
    document.getElementById("profileUsername");

const profileBatch =
    document.getElementById("profileBatch");

const profileDepartment =
    document.getElementById("profileDepartment");

const profileEmail =
    document.getElementById("profileEmail");

const profilePhone =
    document.getElementById("profilePhone");


const formMessage =
    document.getElementById("formMessage");

const submitButton =
    editProfileForm.querySelector(".submit-btn");


// ========================================
// Load Profile Information
// ========================================

async function loadProfile() {

    try {

        const response =
            await fetch("/edit-profile");


        const reply =
            await response.json();


        // Backend may return redirect

        if (reply.redirect) {

            window.location.href =
                reply.redirect;

            return;
        }


        // Fill profile information

        profileName.value =
            reply.name || "";


        profileUsername.value =
            reply.username || "";


        profileBatch.value =
            reply.batch || "";


        profileDepartment.value =
            reply.department || "";


        profileEmail.value =
            reply.email || "";


        profilePhone.value =
            reply.phone || "";


        // Profile picture

        profileImage.src =
            reply.profile_picture ||
            "https://knibljndsnrbbiafwybd.supabase.co/storage/v1/object/public/mealmate_bucket/profile-pictures/default-profile-picture.webp";

    } catch (error) {

        console.error(
            "Error loading profile:",
            error
        );


        formMessage.textContent =
            "Unable to load profile information.";


        formMessage.style.color =
            "var(--danger-color)";
    }
}


// ========================================
// Profile Picture Preview
// ========================================

profilePicture.addEventListener(
    "change",
    () => {

        const file =
            profilePicture.files[0];


        if (!file) {
            return;
        }


        // Create temporary preview

        const imageURL =
            URL.createObjectURL(file);


        profileImage.src =
            imageURL;


        pictureMessage.textContent =
            "New profile picture selected.";


        pictureMessage.style.color =
            "var(--success-color)";
    }
);


// ========================================
// Upload Profile Picture
// ========================================

async function uploadProfilePicture() {

    const file =
        profilePicture.files[0];


    // No new picture selected

    if (!file) {

        return true;
    }


    pictureMessage.textContent =
        "Uploading profile picture...";


    pictureMessage.style.color =
        "var(--muted-text)";


    const formData =
        new FormData();


    formData.append(
        "profilePicture",
        file
    );


    const response =
        await fetch(
            "/profile-picture",
            {
                method: "POST",
                body: formData
            }
        );


    const reply =
        await response.json();


    // Check for failed upload

    if (!response.ok) {

        pictureMessage.textContent = "Uploading failed.";
        pictureMessage.style.color = "var(--dager-color)";

        throw new Error(reply.message || "Profile picture upload failed.");
    }


    pictureMessage.textContent =
        "Profile picture uploaded.";


    pictureMessage.style.color =
        "var(--success-color)";


    return true;
}


// ========================================
// Submit Profile Information
// ========================================

editProfileForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        formMessage.textContent = "";


        submitButton.disabled =
            true;


        submitButton.textContent =
            "Saving...";


        try {

            // ========================================
            // Step 1
            // Upload new profile picture if selected
            // ========================================

            const pictureUploaded =
                await uploadProfilePicture();


            /*
             * If uploadProfilePicture() returned false,
             * it means the backend already redirected us.
             */

            if (!pictureUploaded) {

                return;
            }


            // ========================================
            // Step 2
            // Update profile information
            // ========================================

            const name = profileName.value.trim();
            const department = profileDepartment.value;
            const phone = profilePhone.value.trim();


            const response = await fetch("/edit-profile",{
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        name, department, phone
                    })
                }
            );


            const reply = await response.json().catch(() => ({}));


            // ========================================
            // Step 3
            // Check response
            // ========================================

            if (!response.ok) {
                formMessage.textContent = reply.message;
                formMessage.style.color = "var(--danger-color)";
                pictureMessage.textContent = "";
                formMessage.classList.remove("hidden");


                throw new Error(reply.message || "Profile update failed.");
            }


            // ========================================
            // Success
            // ========================================

            formMessage.textContent = reply.message || "Profile updated successfully.";
            formMessage.style.color = "var(--success-color)";


            pictureMessage.textContent = "";

            formMessage.classList.remove("hidden");

            // Finally reload the page
            window.location.reload();


        } catch (error) {

            console.error(
                "Error updating profile:",
                error
            );


            formMessage.textContent =
                error.message ||
                "Unable to update profile.";


            formMessage.style.color =
                "var(--danger-color)";


        } finally {

            submitButton.disabled =
                false;


            submitButton.textContent =
                "Save Changes";
        }

    }
);


// ========================================
// Start
// ========================================

loadProfile();