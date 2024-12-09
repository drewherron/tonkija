document.addEventListener('DOMContentLoaded', function () {
  // Elements
  const settingsIcon = document.getElementById('settings-icon');
  const mainContent = document.getElementById('main-content');
  const settingsContent = document.getElementById('settings-content');
  const cancelButton = document.getElementById('cancel-settings');
  const apiKeyInput = document.getElementById('api-key');

  // Clear the API key and load the selected provider's key
  document.querySelectorAll('input[name="provider"]').forEach((radio) => {
    radio.addEventListener('change', function () {
      const selectedProvider = this.value;
      // Clear the input and load the saved key for the selected provider
      apiKeyInput.value = '';
      chrome.storage.sync.get([selectedProvider], function (data) {
        if (data[selectedProvider]) {
          apiKeyInput.value = data[selectedProvider];
        }
      });
    });
  });

  // Show settings page
  settingsIcon.addEventListener('click', function () {
    mainContent.style.display = 'none';
    settingsContent.style.display = 'block';
    document.body.classList.add('settings-hidden');
    loadSettings();
  });

  // Cancel button: Return to the main content without saving
  cancelButton.addEventListener('click', function () {
    settingsContent.style.display = 'none';
    mainContent.style.display = 'block';
    document.body.classList.remove('settings-hidden');
  });

  // Save settings
  document.getElementById('save-settings').addEventListener('click', function () {
    const provider = document.querySelector('input[name="provider"]:checked').value;
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      alert('Please enter your API key.');
      return;
    }

    // Save the API key under the selected provider and save the provider
    const keyToSave = {};
    keyToSave[provider] = apiKey;
    keyToSave['provider'] = provider;

    chrome.storage.sync.set(keyToSave, function () {
      alert('Settings saved successfully!');
      settingsContent.style.display = 'none';
      mainContent.style.display = 'block';
      document.body.classList.remove('settings-hidden');
      updateApiStatusMessage();
    });
  });

  // Function to load saved settings
  function loadSettings() {
    chrome.storage.sync.get(['provider'], function (data) {
      if (data.provider) {
        document.querySelector(`input[name="provider"][value="${data.provider}"]`).checked = true;
        chrome.storage.sync.get([data.provider], function (keyData) {
          if (keyData[data.provider]) {
            apiKeyInput.value = keyData[data.provider];
          } else {
            apiKeyInput.value = '';
          }
        });
      } else {
        document.querySelector(`input[name="provider"][value="openai"]`).checked = true;
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

  // Function to update the API status message
  function updateApiStatusMessage() {
    chrome.storage.sync.get(['provider'], function (data) {
      const apiStatusMessage = document.getElementById('api-status-message');
      if (data.provider) {
        let providerDisplayName;
        // Map provider keys to properly formatted names
        switch (data.provider) {
          case 'openai': providerDisplayName = 'OpenAI'; break;
          case 'anthropic': providerDisplayName = 'Anthropic'; break;
          case 'google': providerDisplayName = 'Google'; break;
          default: providerDisplayName = data.provider;
        }
        apiStatusMessage.textContent = `Currently using ${providerDisplayName}.`;
      } else {
        apiStatusMessage.textContent = 'Please add an API key.';
      }
    });
  }

  // Initial load
  loadSettings();
  updateApiStatusMessage();

  // Analyze Server button
  document.getElementById('analyze-server').addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: "analyzeServer" });
  });

  // Analyze Page button
  document.getElementById('analyze-page').addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: "analyzePage" });
  });

  // Analyze Code button
  document.getElementById('analyze-code').addEventListener('click', function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const originalTab = tabs[0];  // Get the original tab info

      chrome.storage.sync.get(['provider'], function (data) {
        const provider = data.provider || 'openai';
        chrome.storage.sync.get([provider], function (keyData) {
          const apiKey = keyData[provider] || '';
          if (!apiKey) {
            alert('Please enter your API key in the settings.');
            return;
          }

          const codeContent = document.getElementById('code-input').value.trim();
          
          // Send message with original tab info
          chrome.runtime.sendMessage({ 
            action: "analyzeCode", 
            provider, 
            apiKey,
            inputCode: codeContent,
            originalTabId: originalTab.id  // Pass the original tab ID
          });
        });
      });
    });
  });
});
