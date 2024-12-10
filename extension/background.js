// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Route message to appropriate handler
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
    // Default to OpenAI if no provider set
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
        // Skip internal browser pages which can't be analyzed
        if (!activeTab || !activeTab.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('about:')) {
          console.error("Active tab is invalid.");
          return;
        }

        // Show processing screen while analysis runs
        chrome.tabs.create({ url: chrome.runtime.getURL("processing.html") }, (processingTab) => {
          const processingTabId = processingTab.id;
          // Set 5-minute timeout for analysis (300000ms)
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
                // Update processing tab with analysis results
                const contentId = data.content_id;
                const analysisUrl = `http://localhost:5000/display_analysis?id=${contentId}`;
                chrome.tabs.update(processingTabId, { url: analysisUrl }, (updatedTab) => {
                  if (chrome.runtime.lastError) {
                    console.error("Error updating tab:", chrome.runtime.lastError);
                  }
                });
                // Clear timeout, since analysis completed
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
        // Verify tab is analyzable
        if (!activeTab || !activeTab.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('about:')) {
          console.error("Active tab is invalid.");
          return;
        }

        // Show processing screen while analysis runs
        chrome.tabs.create({ url: chrome.runtime.getURL("processing.html") }, (processingTab) => {
          const processingTabId = processingTab.id;
          // Set timeout to prevent infinite processing
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
                // Display results in the processing tab
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

function handleCodeAnalysis(provider, apiKey, inputCode) {
  console.log("Starting code analysis:", { inputCode, provider });

  if (inputCode) {
    // Direct code input from textarea - no need to scrape page
    chrome.tabs.create({ url: chrome.runtime.getURL("processing.html") }, (processingTab) => {
      const processingTabId = processingTab.id;
      // Set timeout for analysis completion
      const timeoutId = setTimeout(() => {
        chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
      }, 300000);

      // Create single code block from input
      const codeBlocks = [{ id: 'user-input-code', content: inputCode }];
      sendToServer(provider, apiKey, codeBlocks, processingTabId, timeoutId);
    });
  } else {
    // No input code - need to scrape code blocks from current page
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const activeTab = tabs[0];
      // Verify we can access the page content
      if (!activeTab || !activeTab.id || !activeTab.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('about:')) {
        console.error("Active tab is invalid or no URL available for code scraping.");
        return;
      }

      console.log("No input code, scraping page on tab:", activeTab.id);

      // Execute code block extraction in the context of the webpage
      chrome.scripting.executeScript(
        {
          target: { tabId: activeTab.id },
          func: extractCodeBlocks
        },
        (results) => {
          if (chrome.runtime.lastError) {
            console.error("ExecuteScript Error:", chrome.runtime.lastError.message);
            return; // Can't scrape code, user sees no result
          }

          if (results && results[0] && results[0].result) {
            const codeBlocks = results[0].result;
            if (!codeBlocks || codeBlocks.length === 0) {
              console.error('No code found on this page.');
              return; // No code to analyze
            }

            // Show processing screen while analysis runs
            chrome.tabs.create({ url: chrome.runtime.getURL("processing.html") }, (processingTab) => {
              const processingTabId = processingTab.id;
              const timeoutId = setTimeout(() => {
                chrome.tabs.update(processingTabId, { url: chrome.runtime.getURL('error.html') });
              }, 300000);

              sendToServer(provider, apiKey, codeBlocks, processingTabId, timeoutId);
            });
          } else {
            console.error("No results returned from executeScript when scraping code.");
          }
        }
      );
    });
  }
}

function extractCodeBlocks() {
  // Find all potential code-containing elements
  const codeElements = document.querySelectorAll('pre, code, .code, .code-block');
  const codeBlocks = [];

  codeElements.forEach((el, index) => {
    const codeContent = el.innerText.trim();
    const minLength = 50;  // Minimum characters
    const minWords = 5;    // Minimum word count
    if (codeContent.length >= minLength && codeContent.split(/\s+/).length >= minWords) {
      // Add unique identifier to track block in page
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
  // Log analysis attempt details
  console.log("Sending to server:", {
    numBlocks: codeBlocks.length,
    provider,
    hasApiKey: !!apiKey
  });

  // Send code blocks to Flask backend for analysis
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
        // Update tab to show analysis results
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
