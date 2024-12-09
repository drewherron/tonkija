chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "analyzeServer") {
    handleServerAnalysis();
  } else if (message.action === "analyzePage") {
    handlePageAnalysis();
  } else if (message.action === "analyzeCode") {
    handleCodeAnalysis(message.provider, message.apiKey, message.inputCode);
  }
  sendResponse({status: "ok"});
});

function handleServerAnalysis() {
  // First, get provider and apiKey
  chrome.storage.sync.get(['provider'], function (data) {
    const provider = data.provider || 'openai';
    chrome.storage.sync.get([provider], function (keyData) {
      const apiKey = keyData[provider] || '';
      if (!apiKey) {
        console.error("No API key found for provider.");
        return;
      }

      // Get the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('about:')) {
          console.error("Active tab is invalid.");
          return;
        }

        // Open processing.html immediately
        chrome.tabs.create({ url: chrome.runtime.getURL("processing.html") }, (processingTab) => {
          const processingTabId = processingTab.id;
          const timeoutId = setTimeout(() => {
            chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
          }, 300000);

          // Create payload with URL and domain
          const domain = new URL(activeTab.url).hostname;
          const payload = {
            provider,
            apiKey,
            url: activeTab.url,
            domain
          };

          // Send request to analyze server security
          fetch('http://localhost:5000/analyze_server', {
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
                console.error(`Error from server: ${data.error}`);
                chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
                clearTimeout(timeoutId);
              }
            })
            .catch(error => {
              console.error('Error in server analysis:', error);
              chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
              clearTimeout(timeoutId);
            });
        });
      });
    });
  });
}

function handlePageAnalysis() {
  // First, get provider and apiKey
  chrome.storage.sync.get(['provider'], function (data) {
    const provider = data.provider || 'openai';
    chrome.storage.sync.get([provider], function (keyData) {
      const apiKey = keyData[provider] || '';
      if (!apiKey) {
        console.error("No API key found for provider.");
        return;
      }

      // Get the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('about:')) {
          console.error("Active tab is invalid.");
          return;
        }

        // Open processing.html immediately
        chrome.tabs.create({ url: chrome.runtime.getURL("processing.html") }, (processingTab) => {
          const processingTabId = processingTab.id;
          const timeoutId = setTimeout(() => {
            chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
          }, 300000);

          // Create payload with URL
          const payload = {
            provider,
            apiKey,
            url: activeTab.url
          };

          // Send request to analyze page security
          fetch('http://localhost:5000/analyze_page', {
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
                console.error(`Error from server: ${data.error}`);
                chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
                clearTimeout(timeoutId);
              }
            })
            .catch(error => {
              console.error('Error in page analysis:', error);
              chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
              clearTimeout(timeoutId);
            });
        });
      });
    });
  });
}

function handleCodeAnalysis(provider, apiKey, inputCode, originalTabId) {
  console.log("Starting code analysis with:", { hasInputCode: !!inputCode, provider, originalTabId });
  
  // Open processing.html immediately
  chrome.tabs.create({ url: chrome.runtime.getURL("processing.html") }, (processingTab) => {
    const processingTabId = processingTab.id;
    console.log("Created processing tab:", processingTabId);
    
    const timeoutId = setTimeout(() => {
      chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
    }, 300000);

    if (inputCode) {
      console.log("Using input code:", inputCode.substring(0, 50) + "...");
      const codeBlocks = [{ id: 'user-input-code', content: inputCode }];
      sendToServer(provider, apiKey, codeBlocks, processingTabId, timeoutId);
    } else {
      // Use the original tab ID directly
      console.log("No input code, trying to scrape page. Original tab ID:", originalTabId);
      
      chrome.scripting.executeScript(
        {
          target: { tabId: originalTabId },
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
              console.error('No code found on this page.');
              chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
              clearTimeout(timeoutId);
              return;
            }

            sendToServer(provider, apiKey, codeBlocks, processingTabId, timeoutId);
          } else {
            console.error("No results returned from executeScript.");
            chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
            clearTimeout(timeoutId);
          }
        }
      );
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

    // Filter to blocks worth analyzing
    if (codeContent.length >= minLength && codeContent.split(/\s+/).length >= minWords) {
      const uniqueId = `tonkija-code-block-${index}`;
      el.setAttribute('data-tonkija-id', uniqueId);
      codeBlocks.push({
        id: uniqueId,
        content: codeContent
      });
    }
  });

  // Deduplicate code blocks by their content
  const seen = new Set();
  const uniqueBlocks = [];
  for (const block of codeBlocks) {
    if (!seen.has(block.content)) {
      seen.add(block.content);
      uniqueBlocks.push(block);
    }
  }

  return uniqueBlocks;
}

function sendToServer(provider, apiKey, codeBlocks, processingTabId, timeoutId) {
  console.log("Sending to server:", { 
    numBlocks: codeBlocks.length,
    provider,
    hasApiKey: !!apiKey
  });

  fetch('http://localhost:5000/analyze_code_blocks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider,
      apiKey,
      codeBlocks
    })
  })
    .then(response => {
      console.log("Server response status:", response.status);
      return response.json();
    })
    .then(data => {
      console.log("Server response data:", data);
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
        console.error(`Error from server:`, data);
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
