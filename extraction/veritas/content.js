const createFloatingImage = () => {
  console.log("Creating floating image...");
  const img = document.createElement("img");
  img.id = "veritas-ai-image";
  img.src = chrome.runtime.getURL("images/veritas-logo.png");
  img.alt = "VERITAS AI";
  img.style.cssText = `
    position: fixed;
    right: 5px;
    top: 70px;
    width: 70px;
    height: 70px;
    cursor: pointer;
    z-index: 999999;
    transition: all 0.3s ease;
  `;

  img.addEventListener("mouseover", () => {
    img.style.transform = "scale(1.1)";
  });

  img.addEventListener("mouseout", () => {
    img.style.transform = "scale(1)";
  });

  img.addEventListener("click", () => {
    console.log("Image clicked, sending message to background...");
    chrome.runtime.sendMessage({ action: "openPopup" });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.appendChild(img);
      console.log("Image added to document body");
    });
  } else {
    document.body.appendChild(img);
    console.log("Image added to document body");
  }
};

console.log("Content script loaded");
createFloatingImage();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractContent") {
    const content = document.body.innerText;
    sendResponse({ content: content });
  }
  return true;
});
