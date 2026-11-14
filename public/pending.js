const loadingMessage =
    document.getElementById("loadingMessage");

const profileCard =
    document.getElementById("profileCard");

const profileUpload =
    document.getElementById("profileUpload");

const errorMessage =
    document.getElementById("errorMessage");


// Profile elements
const profileInformation =
    document.getElementById("profileInformation");
const profileImage =
    document.getElementById("profileImage");

const profileName =
    document.getElementById("profileName");

const profileUsername =
    document.getElementById("profileUsername");

const profileDepartment =
    document.getElementById("profileDepartment");

const profileBatch =
    document.getElementById("profileBatch");

const profilePhone =
    document.getElementById("profilePhone");


// Upload elements
const profilePicture =
    document.getElementById("profilePicture");

const profilePreview =
    document.getElementById("profilePreview");

const profilePlaceholder =
    document.getElementById("profilePlaceholder");

const profilePictureWrapper =
    document.getElementById("profilePictureWrapper");

const choosePictureButton =
    document.getElementById("choosePictureButton");

const savePictureButton =
    document.getElementById("savePictureButton");

const uploadMessage =
    document.getElementById("uploadMessage");


// ---------------------------------
// Get pending user information
// ---------------------------------

async function loadPendingUser() {

    try {

        const response = await fetch("/status/pending");

        const reply = await response.json();
        

        if (reply.redirect) {
            window.location.href = reply.redirect;
        }


        if (!response.ok) {
            throw new Error(
                reply.message || "Unable to load profile."
            );
        }
        

        loadingMessage.classList.add("hidden");


        // ----------------------------------
        //   Profile picture already exists
        // ----------------------------------

        if (reply.profile_picture) {

            profileImage.src = reply.profile_picture;

            profileName.textContent = reply.name;

            profileUsername.textContent = reply.username;

            profileDepartment.textContent = reply.department;

            profileBatch.textContent = reply.batch;

            profilePhone.textContent = reply.phone;


            profileInformation.classList.remove("hidden");
            
        }


        // ---------------------------------
        //   No profile picture
        // ---------------------------------

        else {

            profileUpload.classList.remove("hidden");

        }


    }
    
    catch (error) {

        console.error(error);

        loadingMessage.classList.add("hidden");

        errorMessage.textContent =
            error.message || "Something went wrong.";

        errorMessage.classList.remove("hidden");
    }
}


// ---------------------------------
// Choose profile picture
// ---------------------------------

choosePictureButton.addEventListener(
    "click",
    () => {
        profilePicture.click();
    }
);


// Clicking the circular picture also opens selector
profilePictureWrapper.addEventListener(
    "click",
    () => {
        profilePicture.click();
    }
);


// ---------------------------------
// Preview selected picture
// ---------------------------------

profilePicture.addEventListener(
    "change",
    () => {

        const file =
            profilePicture.files[0];


        if (!file) {
            return;
        }


        if (!file.type.startsWith("image/")) {

            uploadMessage.textContent =
                "Please select a valid image.";

            savePictureButton.disabled = true;

            return;
        }


        const imageURL =
            URL.createObjectURL(file);


        profilePreview.src =
            imageURL;

        profilePreview.style.display =
            "block";

        profilePlaceholder.style.display =
            "none";


        savePictureButton.disabled =
            false;

        uploadMessage.textContent =
            "Picture selected.";
    }
);


// ---------------------------------
// Upload profile picture
// ---------------------------------

savePictureButton.addEventListener(
    "click",
    async () => {

        const file =
            profilePicture.files[0];


        if (!file) {
            return;
        }


        savePictureButton.disabled =
            true;

        uploadMessage.textContent =
            "Uploading...";


        try {

            const formData =
                new FormData();

            formData.append(
                "profilePicture",
                file
            );


            const response = await fetch(
                "/pending/profile-picture",
                {
                    method: "POST",
                    body: formData
                }
            );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.message ||
                    "Profile picture upload failed."
                );
            }


            // Successfully uploaded.
            // Reload so /status/pending
            // is requested again.

            window.location.reload();


        } catch (error) {

            console.error(error);

            uploadMessage.textContent =
                error.message ||
                "Something went wrong.";

            savePictureButton.disabled =
                false;
        }
    }
);


// ---------------------------------
// Start
// ---------------------------------

loadPendingUser();