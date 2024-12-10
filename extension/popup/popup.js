document.addEventListener('DOMContentLoaded', function () {
  // Get DOM elements
  const settingsIcon = document.getElementById('settings-icon');
  const mainContent = document.getElementById('main-content');
  const settingsContent = document.getElementById('settings-content');
  const cancelButton = document.getElementById('cancel-settings');
  const apiKeyInput = document.getElementById('api-key');

  // Add change listeners to all provider radio buttons
  document.querySelectorAll('input[name="provider"]').forEach((radio) => {
    radio.addEventListener('change', function () {
      const selectedProvider = this.value;
      // Clear the input first
      apiKeyInput.value = '';
      // Load the saved API key for the newly selected provider
      chrome.storage.sync.get([selectedProvider], function (data) {
        if (data[selectedProvider]) {
          apiKeyInput.value = data[selectedProvider];
        }
      });
    });
  });

  // Toggle to settings view when gear icon is clicked
  settingsIcon.addEventListener('click', function () {
    mainContent.style.display = 'none';
    settingsContent.style.display = 'block';
    // Add class to hide settings icon while in settings view
    document.body.classList.add('settings-hidden');
    // Load current settings into the form
    loadSettings();
  });

  // Cancel button: return to main view without saving changes
  cancelButton.addEventListener('click', function () {
    settingsContent.style.display = 'none';
    mainContent.style.display = 'block';
    // Show settings icon again
    document.body.classList.remove('settings-hidden');
  });

  // Save settings button
  document.getElementById('save-settings').addEventListener('click', function () {
    // Get the currently selected provider and API key
    const provider = document.querySelector('input[name="provider"]:checked').value;
    const apiKey = apiKeyInput.value.trim();

    // Validate API key presence
    if (!apiKey) {
      alert('Please enter your API key.');
      return;
    }

    // Save both the provider choice and its API key
    const keyToSave = {};
    keyToSave[provider] = apiKey;      // Save API key under provider name
    keyToSave['provider'] = provider;  // Save provider as default

    // Save to Chrome storage and update UI
    chrome.storage.sync.set(keyToSave, function () {
      alert('Settings saved successfully!');
      // Return to main view
      settingsContent.style.display = 'none';
      mainContent.style.display = 'block';
      document.body.classList.remove('settings-hidden');
      updateApiStatusMessage();
    });
    // Update status message immediately for better UX
    updateApiStatusMessage();
  });

  // Load saved provider and API key from Chrome storage
  function loadSettings() {
    chrome.storage.sync.get(['provider'], function (data) {
      if (data.provider) {
        // Select the radio button for saved provider
        document.querySelector(`input[name="provider"][value="${data.provider}"]`).checked = true;
        // Load the corresponding API key
        chrome.storage.sync.get([data.provider], function (keyData) {
          if (keyData[data.provider]) {
            apiKeyInput.value = keyData[data.provider];
          } else {
            apiKeyInput.value = '';
          }
        });
      } else {
        // Default to OpenAI if no provider is saved
        document.querySelector(`input[name="provider"][value="openai"]`).checked = true;
        // Check for saved OpenAI key
        chrome.storage.sync.get(['openai'], function (keyData) {
          if (keyData['openai']) {
            apiKeyInput.value = keyData['openai'];
          } else {
            apiKeyInput.value = '';
          }
        });
      }
    });
  }

  // Update the status message showing current provider
  function updateApiStatusMessage() {
    const apiStatusMessage = document.getElementById('api-status-message');
    // Validate element exists in popup.html
    if (!apiStatusMessage) {
      console.error("api-status-message element not found");
      return;
    }

    // Get current provider from storage
    chrome.storage.sync.get(['provider'], function (data) {
      if (data.provider) {
        const provider = data.provider;
        // Check if we have an API key for this provider
        chrome.storage.sync.get([provider], function (keyData) {
          const apiKey = keyData[provider] || '';
          if (!apiKey) {
            apiStatusMessage.textContent = 'Please add an API key.';
          } else {
            // Switch for correct capitalization in providerDisplayName
            let providerDisplayName;
            switch (provider) {
              case 'openai': providerDisplayName = 'OpenAI'; break;
              case 'anthropic': providerDisplayName = 'Anthropic'; break;
              case 'google': providerDisplayName = 'Google'; break;
              default: providerDisplayName = provider;
            }
            apiStatusMessage.textContent = `Currently using ${providerDisplayName}.`;
          }
        });
      } else {
        // No provider set
        apiStatusMessage.textContent = 'Please add an API key.';
      }
    });
  }

  // Initial load
  loadSettings();
  updateApiStatusMessage();

  // Set up handlers for the 3 analysis buttons
  // Server analysis - sends message to background script
  document.getElementById('analyze-server').addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: "analyzeServer" });
  });

  // Page analysis - sends message to background script
  document.getElementById('analyze-page').addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: "analyzePage" });
  });

  // Code analysis - requires API key validation before sending
  document.getElementById('analyze-code').addEventListener('click', function () {
    // Get current provider and its API key
    chrome.storage.sync.get(['provider'], function (data) {
      const provider = data.provider || 'openai';  // Default to OpenAI
      chrome.storage.sync.get([provider], function (keyData) {
        const apiKey = keyData[provider] || '';
        // Verify API key exists before proceeding
        if (!apiKey) {
          alert('Please enter your API key in the settings.');
          return;
        }

        // Get code from text area if any
        const codeContent = document.getElementById('code-input').value.trim();

        // Send analysis request to background script
        chrome.runtime.sendMessage({
          action: "analyzeCode",
          provider,
          apiKey,
          inputCode: codeContent
        });
      });
    });
  });

  // Ensure settings are loaded on popup open
  loadSettings();
  updateApiStatusMessage();
});
