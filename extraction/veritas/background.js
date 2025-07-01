const CLIENT_ID = "775715532183-7d75s1ptdeqllv7iqi76f6m040sqsm1c.apps.googleusercontent.com";
const REDIRECT_URL = chrome.identity.getRedirectURL();
const AUTH_URL = `https://accounts.google.com/o/oauth2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
  REDIRECT_URL
)}&response_type=token&scope=https://www.googleapis.com/auth/generative-language.retrieve`;

let accessToken = null;
let tokenExpiry = null;

function hasValidToken() {
  return accessToken && tokenExpiry && Date.now() < tokenExpiry;
}

async function getAccessToken() {
  // Return the cached token if it's valid
  if (hasValidToken()) {
    return { token: accessToken, isOAuth: true };
  }

  try {
    const data = await chrome.storage.local.get(["geminiApiKey"]);
    if (data.geminiApiKey) {
      console.log("Using API key for authentication");
      return { token: data.geminiApiKey, isOAuth: false };
    }

    console.log("Attempting OAuth authentication");
    const authResponse = await chrome.identity.launchWebAuthFlow({
      url: AUTH_URL,
      interactive: true,
    });

    const responseUrl = new URL(authResponse);
    const hash = responseUrl.hash.substring(1);
    const params = new URLSearchParams(hash);

    accessToken = params.get("access_token");
    const expiresIn = parseInt(params.get("expires_in") || "3600");
    tokenExpiry = Date.now() + expiresIn * 1000;

    chrome.storage.local.set({
      accessToken,
      tokenExpiry,
    });

    return { token: accessToken, isOAuth: true };
  } catch (error) {
    console.log("ERROR HERE");
    console.error("Authentication error:", error);

    const data = await chrome.storage.local.get(["geminiApiKey"]);
    if (data.geminiApiKey) {
      console.log("Falling back to API key after OAuth failure");
      return { token: data.geminiApiKey, isOAuth: false };
    }

    throw new Error("Authentication failed. Please set up an API key in settings.");
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["accessToken", "tokenExpiry"], (data) => {
    if (data.accessToken && data.tokenExpiry) {
      accessToken = data.accessToken;
      tokenExpiry = parseInt(data.tokenExpiry);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);

  if (message.action === "checkAuth") {
    console.log("Handling checkAuth message");
    checkAuthentication()
      .then((result) => {
        console.log("Auth check result:", result);
        sendResponse({ success: true, ...result });
      })
      .catch((error) => {
        console.error("Error in checkAuth handler:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep the message channel open for async response
  }

  if (message.action === "summarizeWithGemini") {
    handleGeminiRequest(message.prompt, message.maxTokens)
      .then((summary) => sendResponse({ success: true, summary }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === "saveApiKey") {
    chrome.storage.local.set({ geminiApiKey: message.apiKey }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === "openPopup") {
    try {
      chrome.action.openPopup();
    } catch (error) {
      console.error("Error opening popup:", error);
    }
    return true;
  }
});

async function checkAuthentication() {
  try {
    console.log("Checking authentication status...");
    const data = await chrome.storage.local.get(["geminiApiKey"]);
    const hasApiKey = !!data.geminiApiKey;
    console.log("API key status:", hasApiKey ? "Found" : "Not found");

    const hasOAuth = hasValidToken();
    console.log("OAuth token status:", hasOAuth ? "Valid" : "Invalid or missing");

    const result = {
      hasAuth: hasApiKey || hasOAuth,
      authType: hasOAuth ? "oauth" : hasApiKey ? "apikey" : "none",
    };
    console.log("Authentication result:", result);
    return result;
  } catch (error) {
    console.error("Error in checkAuthentication:", error);
    return { hasAuth: false, authType: "none" };
  }
}

async function handleGeminiRequest(prompt, maxTokens) {
  try {
    const auth = await getAccessToken();

    const endpoint = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent";

    const url = auth.isOAuth ? endpoint : `${endpoint}?key=${auth.token}`;

    const headers = {
      "Content-Type": "application/json",
    };

    if (auth.isOAuth) {
      headers["Authorization"] = `Bearer ${auth.token}`;
    }

    console.log("Making API request with auth type:", auth.isOAuth ? "OAuth" : "API Key");

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          topK: 32,
          topP: 1,
          maxOutputTokens: maxTokens || 300,
        },
      }),
    });

    if (!response.ok) {
      console.log("ERROR HERE");
      const errorData = await response.json();
      console.error("API Error hhf:", errorData);

      if (errorData.error?.message?.includes("models/gemini-1.5-pro is not found")) {
        return await fallbackToOlderModel(prompt, maxTokens, auth);
      }

      throw new Error(`Gemini API error: ${errorData.error?.message || "Unknown error"}`);
    }

    const data = await response.json();

    // Extract text from Gemini response
    if (
      data.candidates &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.length > 0
    ) {
      return data.candidates[0].content.parts[0].text;
    } else {
      throw new Error("Unexpected response format from Gemini API");
    }
  } catch (error) {
    console.error("API request error:", error);
    throw error;
  }
}

async function fallbackToOlderModel(prompt, maxTokens, auth) {
  try {
    console.log("Trying fallback to older model version (gemini-pro)");

    const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

    const url = auth.isOAuth ? endpoint : `${endpoint}?key=${auth.token}`;

    const headers = {
      "Content-Type": "application/json",
    };

    if (auth.isOAuth) {
      headers["Authorization"] = `Bearer ${auth.token}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          topK: 32,
          topP: 1,
          maxOutputTokens: maxTokens || 300,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Fallback API Error:", errorData);
      throw new Error(`Gemini API error: ${errorData.error?.message || "Unknown error"}`);
    }

    const data = await response.json();

    if (
      data.candidates &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.length > 0
    ) {
      return data.candidates[0].content.parts[0].text;
    } else {
      throw new Error("Unexpected response format from Gemini API");
    }
  } catch (error) {
    console.error("Fallback API request error:", error);
    throw error;
  }
}
