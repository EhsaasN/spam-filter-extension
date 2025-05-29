// When the button is clicked, send a message to background to check emails
document.getElementById("checkSpam").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "checkEmails" }, (response) => {
    console.log("✅ Response from background:", response);
  });
});

// Optional: Send a wake message when popup opens
chrome.runtime.sendMessage({ action: "wake" }, (response) => {
  console.log("👋 Wake response from background:", response);
});
