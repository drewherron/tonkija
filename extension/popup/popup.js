document.addEventListener('DOMContentLoaded', function () {
  // Elements
  const settingsIcon = document.getElementById('settings-icon');
  const backButton = document.getElementById('back-button');
  const mainContent = document.getElementById('main-content');
  const settingsContent = document.getElementById('settings-content');

  // Show settings page
  settingsIcon.addEventListener('click', function () {
    mainContent.style.display = 'none';
    settingsContent.style.display = 'block';
    document.body.classList.add('settings-hidden');
    loadSettings();
  });

  // Back to main content
  backButton.addEventListener('click', function () {
    settingsContent.style.display = 'none';
    mainContent.style.display = 'block';
    document.body.classList.remove('settings-hidden');
    updateApiStatusMessage();
  });

  // Save settings
  document.getElementById('save-settings').addEventListener('click', function () {
    const provider = document.querySelector('input[name="provider"]:checked').value;
    const apiKey = document.getElementById('api-key').value.trim();

    if (!apiKey) {
      alert('Please enter your API key.');
      return;
    }

    // Save settings using Chrome storage API
    chrome.storage.sync.set({ provider, apiKey }, function () {
      alert('Settings saved successfully!');
      // Optionally, return to the main content
      settingsContent.style.display = 'none';
      mainContent.style.display = 'block';
    });
  });

  // Load saved settings
  function loadSettings() {
    chrome.storage.sync.get(['provider', 'apiKey'], function (data) {
      if (data.provider) {
        document.querySelector(`input[name="provider"][value="${data.provider}"]`).checked = true;
      }
      if (data.apiKey) {
        document.getElementById('api-key').value = data.apiKey;
      }
    });
  }

  // Analyze Page button
  document.getElementById('analyze-page').addEventListener('click', function () {
    // Retrieve user settings
    chrome.storage.sync.get(['provider', 'apiKey'], function (data) {
      const provider = data.provider || 'openai'; // Default to OpenAI if not set
      const apiKey = data.apiKey || '';

      if (!apiKey) {
        alert('Please enter your API key in the settings.');
        return;
      }

      // Query the currently active tab
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const tab = tabs[0];

        // Check if the URL is valid
        if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
          // Execute the script to get the HTML content
          chrome.scripting.executeScript(
            {
              target: { tabId: tab.id },
              func: () => document.documentElement.outerHTML
            },
            (results) => {
              if (results && results[0] && results[0].result) {
                const htmlContent = results[0].result;

                // Prepare the payload
                const payload = {
                  provider,
                  apiKey,
                  html: htmlContent
                };

                // Send the HTML content and settings to the Flask backend
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

                      // Open a new tab to display the analysis page
                      const analysisUrl = `http://localhost:5000/display_analysis?id=${contentId}`;
                      chrome.tabs.create({ url: analysisUrl });
                    } else {
                      alert(`Error: ${data.error}`);
                    }
                  })
                  .catch(error => {
                    console.error('Error sending HTML:', error);
                    alert('An error occurred while sending the HTML.');
                  });
              } else {
                alert('Failed to retrieve HTML content.');
              }
            }
          );
        } else {
          alert('This extension cannot run on special Chrome pages (e.g., chrome://, about:).');
        }
      });
    });
  });

  // Analyze Code button
  document.getElementById('analyze-code').addEventListener('click', function () {
    const codeContent = document.getElementById('code-input').value.trim();

    if (!codeContent) {
      alert('Please paste your code into the text box.');
      return;
    }

    // Retrieve user settings
    chrome.storage.sync.get(['provider', 'apiKey'], function (data) {
      const provider = data.provider || 'openai'; // Default to OpenAI if not set
      const apiKey = data.apiKey || '';

      if (!apiKey) {
        alert('Please enter your API key in the settings.');
        return;
      }

      // Prepare the payload
      const payload = {
        provider,
        apiKey,
        code: codeContent
      };

      // Send the code content and settings to the Flask backend
      fetch('http://localhost:5000/analyze_code', {
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

            // Open a new tab to display the analysis page
            const analysisUrl = `http://localhost:5000/display_analysis?id=${contentId}`;
            chrome.tabs.create({ url: analysisUrl });
          } else {
            alert(`Error: ${data.error}`);
          }
        })
        .catch(error => {
          console.error('Error sending code:', error);
          alert('An error occurred while sending the code.');
        });
    });
  });
});
