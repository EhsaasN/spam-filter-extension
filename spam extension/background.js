const API_URL = " https://gmail-extension-152609296957.asia-southeast1.run.app/api";

const CLIENT_ID = "152609296957-cumfecvfiajk60vdq3mquog71qqhek63.apps.googleusercontent.com"; // Replace with your client ID
const REDIRECT_URI = chrome.identity.getRedirectURL();
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify"
];
const AUTH_URL = 
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  `client_id=${CLIENT_ID}&` +
  "response_type=token&" +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `scope=${encodeURIComponent(SCOPES.join(" "))}&` +
  "prompt=consent&" +
  "include_granted_scopes=true";

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("checkEmails", { periodInMinutes: 10 });
  console.log("⏰ Alarm created to check emails every 1 minutes.");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkEmails") {
    console.log("🔔 Alarm triggered: Checking emails...");
    checkEmails();
  }
});

async function checkEmails() {
  console.log("📬 checkEmails() triggered");
  try {
    const token = await getToken();
    const messages = await listUnreadMessages(token);
    console.log(`📨 Found ${messages.length} unread messages`);

    for (const message of messages) {
      console.log(`📩 Processing message ID: ${message.id}`);
      const email = await getEmailContent(token, message.id);
      console.log("📨 Email content:", email);
      const isSpam = await checkIfSpam(email.subject, email.body);
      if (isSpam) {
        console.log(`⚠️ Spam detected. Subject: "${email.subject}"`);
        await moveToSpam(token, message.id);
        console.log(`📥 Moved message ID ${message.id} to SPAM.`);
      } else {
        console.log("✅ Not spam:", email.subject);
      }
    }
  } catch (error) {
    console.error("❌ Error during checkEmails:", error);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkEmails") {
    console.log("📨 Received checkEmails request from popup.");
    checkEmails()
      .then(() => sendResponse({ status: "done" }))
      .catch((error) => sendResponse({ status: "error", message: error.message }));
    return true; // Required to allow async sendResponse
  }

  if (request.action === "wake") {
    console.log("👋 Received wake message from popup.");
    sendResponse({ status: "awake" });
  }
});


async function getToken() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["accessToken", "expiryTime"], async (result) => {
      const now = Date.now();
      if (result.accessToken && result.expiryTime && result.expiryTime > now) {
        // Token is still valid
        resolve(result.accessToken);
      } else {
        // Need to get new token via OAuth
        try {
          const tokenData = await launchOAuth2Flow();
          const expiryTime = Date.now() + tokenData.expires_in * 1000;
          chrome.storage.local.set({
            accessToken: tokenData.access_token,
            expiryTime: expiryTime,
          }, () => {
            resolve(tokenData.access_token);
          });
        } catch (err) {
          reject(err);
        }
      }
    });
  });
}

function launchOAuth2Flow() {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: AUTH_URL,
        interactive: true
      },
      (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        if (!redirectUrl) {
          reject(new Error("No redirect URL received"));
          return;
        }
        const urlFragment = redirectUrl.split("#")[1];
        if (!urlFragment) {
          reject(new Error("No access token found in redirect URL"));
          return;
        }
        const params = new URLSearchParams(urlFragment);
        const accessToken = params.get("access_token");
        const expiresIn = params.get("expires_in") || 3600; // default 1 hour expiry
        if (accessToken) {
          resolve({ access_token: accessToken, expires_in: Number(expiresIn) });
        } else {
          reject(new Error("Access token not found"));
        }
      }
    );
  });
}

async function listUnreadMessages(token) {
  const response = await fetch(
    "https://www.googleapis.com/gmail/v1/users/me/messages?q=is:unread",
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  const data = await response.json();
  return data.messages || [];
}

async function getEmailContent(token, messageId) {
  const response = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  const data = await response.json();
  const headers = data.payload.headers;
  const subjectHeader = headers.find((h) => h.name === "Subject");
  const subject = subjectHeader ? subjectHeader.value : "";
  const body = getBody(data.payload);
  return { subject, body };
}

function getBody(payload) {
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body && part.body.data) {
        return atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
      }
    }
  }
  if (payload.body && payload.body.data) {
    return atob(payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
  }
  return "";
}

async function checkIfSpam(subject, body) {
  console.log("🧪 Checking if spam:", { subject, body });
  try {
    const response = await fetch(`${API_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body })
    });
    const data = await response.json();
    console.log(`🔎 Prediction: ${data.prediction}, Probability: ${data.spam_probability}`);
    return data.prediction === "spam";
  } catch (err) {
    console.error("❌ Error checking spam:", err);
    return false;
  }
}

async function moveToSpam(token, messageId) {
  await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        addLabelIds: ["SPAM"],
        removeLabelIds: ["INBOX"]
      })
    }
  );
}

console.log("🚀 Background service worker loaded.");

chrome.runtime.onStartup.addListener(() => {
  console.log("🔁 Service worker activated on startup.");
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("🧩 Service worker activated on install.");
});
