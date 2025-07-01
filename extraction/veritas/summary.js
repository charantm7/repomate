document.addEventListener('DOMContentLoaded', async function() {
  const backBtn = document.getElementById('backBtn');
  const summaryContent = document.getElementById('summaryContent');

  
  const { summary } = await chrome.storage.local.get('summary');
  if (summary) {
    summaryContent.innerHTML = summary;
  }

  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "setSummary") {
      summaryContent.innerHTML = request.summary;
      
      chrome.storage.local.set({ summary: request.summary });
    }
  });

  backBtn.addEventListener('click', function(e) {
    e.preventDefault();
    window.close(); 
  });
});
  