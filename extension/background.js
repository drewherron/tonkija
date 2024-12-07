chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "analyzePage") {
    startAnalysisFlow(false);
    sendResponse({status: "ok"});
  } else if (message.action === "analyzeCode") {
    const { provider, apiKey, codeBlocks } = message;
    startAnalysisFlow(true, { provider, apiKey, codeBlocks });
    sendResponse({status: "ok"});
  }
});

function startAnalysisFlow(isUserCode, userData) {
  // Open processing.html immediately
  chrome.tabs.create({ url: chrome.runtime.getURL("processing.html") }, (processingTab) => {
    const processingTabId = processingTab.id;

    // Set a timeout for error fallback
    const timeoutId = setTimeout(() => {
      chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
    }, 60000); // 60 seconds

    if (isUserCode) {
      // If analyzing user-pasted code
      const { provider, apiKey, codeBlocks } = userData;
      sendToServer(provider, apiKey, codeBlocks, processingTabId, timeoutId);
    } else {
      // If analyzing page code
      // First, get provider and apiKey from storage
      chrome.storage.sync.get(['provider'], function (data) {
        const provider = data.provider || 'openai';
        chrome.storage.sync.get([provider], function (keyData) {
          const apiKey = keyData[provider] || '';
          if (!apiKey) {
            chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
            clearTimeout(timeoutId);
            return;
          }

          // Query the active tab to inject script
          chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const activeTab = tabs[0];
            if (!activeTab || !activeTab.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('about:')) {
              chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
              clearTimeout(timeoutId);
              return;
            }

            chrome.scripting.executeScript(
              {
                target: { tabId: activeTab.id },
                func: extractCodeBlocks
              },
              (results) => {
                if (chrome.runtime.lastError) {
                  console.error("ExecuteScript Error:", chrome.runtime.lastError.message);
                  chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
                  clearTimeout(timeoutId);
                  return;
                }

                if (results && results[0] && results[0].result) {
                  const codeBlocks = results[0].result;
                  if (!codeBlocks || codeBlocks.length === 0) {
                    alert('No code found on this page.');
                    chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
                    clearTimeout(timeoutId);
                    return;
                  }

                  sendToServer(provider, apiKey, codeBlocks, processingTabId, timeoutId);
                } else {
                  chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
                  clearTimeout(timeoutId);
                }
              }
            );
          });
        });
      });
    }
  });
}

function extractCodeBlocks() {
  const codeElements = document.querySelectorAll('pre, code, .code, .code-block');
  const codeBlocks = [];
  codeElements.forEach((el, index) => {
    const codeContent = el.innerText.trim();
    const minLength = 50;
    const minWords = 5;
    const keywords = ['function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'class', 'def', 'import', 'public', 'private', 'return', 'try', 'catch'];
    const containsKeyword = keywords.some(keyword => codeContent.includes(keyword));
    const syntaxChars = /[;{}()\[\]=><]/;
    const containsSyntax = syntaxChars.test(codeContent);

    if (
      (codeContent.length >= minLength && codeContent.split(/\s+/).length >= minWords)
      // || (containsKeyword && containsSyntax) // Not sure about this
    ) {
      const uniqueId = `tonkija-code-block-${index}`;
      el.setAttribute('data-tonkija-id', uniqueId);
      codeBlocks.push({
        id: uniqueId,
        content: codeContent
      });
    }
  });
  return codeBlocks;
}

function sendToServer(provider, apiKey, codeBlocks, processingTabId, timeoutId) {
  const payload = {
    provider,
    apiKey,
    codeBlocks
  };

  fetch('http://localhost:5000/analyze_code_blocks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        const contentId = data.content_id;
        const analysisUrl = `http://localhost:5000/display_analysis?id=${contentId}`;
        chrome.tabs.update(processingTabId, { url: analysisUrl }, (updatedTab) => {
          if (chrome.runtime.lastError) {
            console.error("Error updating tab:", chrome.runtime.lastError);
          }
        });
        clearTimeout(timeoutId);
      } else {
        alert(`Error: ${data.error}`);
        chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
        clearTimeout(timeoutId);
      }
    })
    .catch(error => {
      console.error('Error sending code blocks:', error);
      chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
      clearTimeout(timeoutId);
    });
}
