let selectedLevel = null;
const mainView = document.getElementById("mainView");
const summaryView = document.getElementById("summaryView");
const settingsView = document.getElementById("settingsView");
const summaryContent = document.getElementById("summaryContent");
const backBtn = document.getElementById("backBtn");
const showSettingsBtn = document.getElementById("showSettingsBtn");
const backFromSettingsBtn = document.getElementById("backFromSettingsBtn");
const saveApiKeyBtn = document.getElementById("saveApiKey");

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Popup loaded");

  try {
    // Check authentication status
    console.log("Sending checkAuth message");
    const response = await chrome.runtime.sendMessage({ action: "checkAuth" });
    console.log("Received response from background script:", response);

    if (!response) {
      console.error("No response received from background script");
      showAuthError("No response received from background script");
      return;
    }

    if (!response.success) {
      console.error("Auth check error:", response.error);
      showAuthError(response.error || "Authentication check failed");
      return;
    }

    if (!response.hasAuth) {
      console.log("No authentication found");
      showAuthError("Please set up your API key in settings");
      return;
    }

    console.log("Authentication successful, type:", response.authType);

    if (!response.hasAuth) {
      console.log("No auth found, showing reminder");
      const apiKeyReminder = document.createElement("div");
      apiKeyReminder.className = "api-key-reminder";
      apiKeyReminder.innerHTML = "⚠️ No API key set. Please add an API key in Settings.";
      mainView.insertBefore(apiKeyReminder, document.getElementById("summarizeBtn").nextSibling);
    }
  } catch (error) {
    console.error("Error checking authentication:", error);
    showAuthError(error.message || "Failed to check authentication");
  }
});

function showAuthError(message) {
  const mainView = document.getElementById("mainView");
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.textContent = message;
  mainView.appendChild(errorDiv);

  // Disable summarize button
  const summarizeBtn = document.getElementById("summarizeBtn");
  if (summarizeBtn) {
    summarizeBtn.disabled = true;
  }
}

backBtn.addEventListener("click", () => {
  mainView.style.display = "block";
  summaryView.style.display = "none";
});

showSettingsBtn.addEventListener("click", () => {
  chrome.storage.local.get(["geminiApiKey"], (result) => {
    if (result.geminiApiKey) {
      document.getElementById("apiKeyInput").value = result.geminiApiKey;
    }
  });

  mainView.style.display = "none";
  settingsView.style.display = "block";
});

backFromSettingsBtn.addEventListener("click", () => {
  settingsView.style.display = "none";
  mainView.style.display = "block";

  window.location.reload();
});

saveApiKeyBtn.addEventListener("click", () => {
  const apiKey = document.getElementById("apiKeyInput").value.trim();

  if (!apiKey) {
    alert("Please enter a valid API key");
    return;
  }

  chrome.runtime.sendMessage(
    {
      action: "saveApiKey",
      apiKey: apiKey,
    },
    (response) => {
      if (response.success) {
        alert("API key saved successfully!");
      } else {
        alert("Failed to save API key. Please try again.");
      }
    }
  );
});

document.querySelectorAll(".option-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".option-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedLevel = btn.getAttribute("data-value");
  });
});

async function translateText(text, targetLang) {
  if (!text || !targetLang || targetLang === "en" || targetLang === "") {
    return text;
  }

  try {
    console.log(`Translating to ${targetLang}...`);

    const translateRes = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(
        text
      )}`,
      {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      }
    );

    if (!translateRes.ok) {
      throw new Error(`Translation API error: ${translateRes.status}`);
    }

    const translateData = await translateRes.json();

    if (Array.isArray(translateData) && translateData.length > 0 && Array.isArray(translateData[0])) {
      return translateData[0]
        .filter((item) => item && item[0])
        .map((item) => item[0])
        .join("");
    } else {
      throw new Error("Unexpected response format from translation API");
    }
  } catch (translateError) {
    console.error("Translation Error:", translateError);
    return text + "\n\n[Translation failed. Original text shown.]";
  }
}

document.getElementById("summarizeBtn").addEventListener("click", async () => {
  const lang = document.getElementById("lang").value;

  if (!selectedLevel) {
    alert("Please select a summary level.");
    return;
  }

  try {
    const authResponse = await chrome.runtime.sendMessage({ action: "checkAuth" });
    if (!authResponse.success || !authResponse.hasAuth) {
      alert("Please set up your API key in Settings before using the summarizer.");
      showSettingsBtn.click();
      return;
    }
  } catch (error) {
    console.error("Auth check error:", error);
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    const [{ result: content }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => document.body.innerText,
    });

    if (!content) {
      alert("Could not extract content from the page. Please try again.");
      return;
    }

    if (content.length < 300) {
      alert("Page content is too short to summarize. Please try a different page.");
      return;
    }

    mainView.style.display = "none";
    summaryView.style.display = "block";
    summaryContent.innerHTML =
      '<div class="loading-animation">Generating summary<span class="dot-animation">...</span></div>';

    let maxTokens;

    if (selectedLevel === "short") {
      maxTokens = 150;
    } else if (selectedLevel === "medium") {
      maxTokens = 300;
    } else {
      maxTokens = 500;
    }

    try {
      let prompt;
      if (selectedLevel === "short") {
        prompt = `Summarize the following text in 1-2 sentences:\n\n${prepareContentForSummary(
          content,
          selectedLevel
        )}`;
      } else if (selectedLevel === "medium") {
        prompt = `Provide a medium-length summary (3-5 sentences) of the following text:\n\n${prepareContentForSummary(
          content,
          selectedLevel
        )}`;
      } else {
        prompt = `Provide a detailed summary of the following text, capturing all key points and main ideas:\n\n${prepareContentForSummary(
          content,
          selectedLevel
        )}`;
      }

      const response = await chrome.runtime.sendMessage({
        action: "summarizeWithGemini",
        prompt: prompt,
        maxTokens: maxTokens,
      });

      if (!response.success) {
        throw new Error(response.error || "Failed to generate summary");
      }

      let summary = response.summary;

      if (lang && lang !== "en" && lang !== "") {
        summaryContent.innerHTML =
          '<div class="loading-animation">Translating summary<span class="dot-animation">...</span></div>';
        summary = await translateText(summary, lang);
      }

      summaryContent.innerHTML = `<div>${summary}</div>`;
    } catch (apiError) {
      console.error("API Error:", apiError);
      summaryContent.innerHTML = `
        <div class="error-message">
          <p><strong>API Error:</strong> ${apiError.message}</p>
          <p>Please check your API key in Settings or try again later.</p>
        </div>
      `;
    }
  } catch (err) {
    console.error("Error:", err);
    summaryContent.innerHTML = `
      <div class="error-message">
        <p><strong>Error:</strong> ${err.message}</p>
        <p>Please try again with a different page or summary length.</p>
      </div>
    `;
  }
});

function prepareContentForSummary(content, level) {
  let maxChars;
  if (level === "short") {
    maxChars = 8000;
  } else if (level === "medium") {
    maxChars = 15000;
  } else {
    maxChars = 25000;
  }

  if (content.length > maxChars) {
    return content.substring(0, maxChars) + "...";
  }

  return content;
}

function fallbackToBasicSummary(content, selectedLevel, lang) {
  console.log("API failed, using advanced local summarization");

  try {
    // TF-IDF based extractive summarization
    const sentences = content
      .split(/[.!?]+/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 15);

    // Skip if not enough sentences
    if (sentences.length < 3) {
      useSimpleSummarization(sentences, selectedLevel, lang);
      return;
    }

    // Calculate word frequencies (TF)
    const wordFreq = {};
    const wordInSentence = {};

    sentences.forEach((sentence, idx) => {
      // Get unique words in sentence
      const words = [
        ...new Set(
          sentence
            .toLowerCase()
            .replace(/[^\w\s]/g, "")
            .split(/\s+/)
            .filter((w) => w.length > 3)
        ),
      ];

      // Count word frequencies
      words.forEach((word) => {
        wordFreq[word] = (wordFreq[word] || 0) + 1;

        // Track which sentences contain this word
        if (!wordInSentence[word]) {
          wordInSentence[word] = [];
        }
        wordInSentence[word].push(idx);
      });
    });

    // Calculate IDF
    const totalSentences = sentences.length;
    const wordScores = {};

    Object.keys(wordFreq).forEach((word) => {
      const idf = Math.log(totalSentences / (wordInSentence[word].length || 1));
      wordScores[word] = wordFreq[word] * idf;
    });

    // Score sentences
    const sentenceScores = sentences.map((sentence, idx) => {
      const words = sentence
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3);

      if (words.length === 0) return { idx, score: 0 };

      const score = words.reduce((sum, word) => sum + (wordScores[word] || 0), 0) / words.length;
      return { idx, score };
    });

    // Get top sentences
    const numSentences = selectedLevel === "short" ? 3 : selectedLevel === "medium" ? 5 : 8;

    const topSentences = sentenceScores.sort((a, b) => b.score - a.score).slice(0, numSentences);

    // Sort by original order
    topSentences.sort((a, b) => a.idx - b.idx);

    // Create summary
    const summary = topSentences.map((item) => sentences[item.idx]).join(". ") + ".";

    // Process translation and display
    processFallbackSummary(summary, lang);
  } catch (error) {
    console.error("Advanced summarization error:", error);
    // Fall back to simple summarization
    useSimpleSummarization(
      content
        .split(/[.!?]+/g)
        .map((s) => s.trim())
        .filter((s) => s.length > 15),
      selectedLevel,
      lang
    );
  }
}

// Add these helper functions after the fallbackToBasicSummary function
function useSimpleSummarization(sentences, selectedLevel, lang) {
  console.log("Using simple summarization");

  const numSentences = selectedLevel === "short" ? 3 : selectedLevel === "medium" ? 5 : 10;

  let summary;
  if (sentences.length > numSentences) {
    // Take first few sentences as summary
    summary = sentences.slice(0, numSentences).join(". ") + ".";
  } else {
    // Just use the content if it's short
    summary = sentences.join(". ") + ".";
  }

  processFallbackSummary(summary, lang);
}

function processFallbackSummary(summary, lang) {
  // Translate if needed
  if (lang && lang !== "en") {
    fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(
        summary
      )}`
    )
      .then((response) => response.json())
      .then((data) => {
        const translatedSummary = data[0].map((item) => item[0]).join("");
        displayFallbackSummary(translatedSummary);
      })
      .catch((error) => {
        console.error("Translation Error:", error);
        displayFallbackSummary(summary);
      });
  } else {
    displayFallbackSummary(summary);
  }
}

// Updated displayFallbackSummary with a more informative message
function displayFallbackSummary(summary) {
  summaryContent.innerHTML = `
    <div class="warning-message">
      <p><strong>Note:</strong> Using local summarization algorithm (all AI models unavailable).</p>
    </div>
    <div>${summary}</div>
  `;
}

// Add this function right after your model loop (around line 135)
function isValidSummary(text) {
  if (!text) return false;

  // Check for common instructions that shouldn't be in the summary
  const instructionKeywords = [
    "I can provide a summary",
    "Here is a summary",
    "Here's a summary",
    "I'll summarize",
    "I'd be happy to",
    "you can implement",
    "instructions",
    "following steps",
    "Sorry, I cannot",
    "I cannot access",
    "I don't have access",
  ];

  for (const keyword of instructionKeywords) {
    if (text.toLowerCase().includes(keyword.toLowerCase())) {
      return false;
    }
  }

  // Check if summary is too short
  if (text.length < 50) {
    return false;
  }

  // Check for repeated words which might indicate junk output
  const words = text.split(/\s+/);
  const uniqueWords = new Set(words);
  if (uniqueWords.size < words.length * 0.3) {
    return false; // Too many repeated words
  }

  // Check for strange repeated patterns
  const repeatedPatterns = ["ecauseecause", "vantagevantage", "ÃÂ", "487487"];
  for (const pattern of repeatedPatterns) {
    if (text.includes(pattern)) {
      return false;
    }
  }

  // Check if text has too many consecutive repeats of the same word
  let prevWord = "";
  let repeatCount = 0;
  for (const word of words) {
    if (word === prevWord) {
      repeatCount++;
      if (repeatCount > 3) return false; // More than 3 consecutive repeats
    } else {
      repeatCount = 0;
      prevWord = word;
    }
  }

  return true;
}

// Add this function after isValidSummary
function prepareContentForSummary(content, level) {
  // Clean up the content
  let cleanedContent = content
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/\n+/g, " ") // Remove newlines
    .trim();

  // Truncate content based on summary level (models have input limits)
  let maxInputLength;
  if (level === "short") {
    maxInputLength = 4000;
  } else if (level === "medium") {
    maxInputLength = 6000;
  } else {
    maxInputLength = 8000; // Use more content for detailed summaries
  }

  // If content is too long, try to find a good breaking point
  if (cleanedContent.length > maxInputLength) {
    // Try to find the end of a sentence near the cutoff point
    const endOfSentence = cleanedContent.lastIndexOf(".", maxInputLength);
    if (endOfSentence > maxInputLength * 0.8) {
      // If we found a good sentence end point, use it
      cleanedContent = cleanedContent.substring(0, endOfSentence + 1);
    } else {
      // Otherwise just truncate at the max length
      cleanedContent = cleanedContent.substring(0, maxInputLength);
    }
  }

  // For detailed summaries, add instruction to encourage completeness
  if (level === "detailed") {
    return (
      "Please provide a comprehensive summary of the following text, covering all important points: " +
      cleanedContent
    );
  } else if (level === "medium") {
    return "Summarize the following text in a clear and concise manner: " + cleanedContent;
  } else {
    return "Provide a brief summary of the following text: " + cleanedContent;
  }
}
