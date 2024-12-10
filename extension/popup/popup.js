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
    updateApiStatusMessage();
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
    const apiStatusMessage = document.getElementById('api-status-message');
    // The element should always exist in popup.html
    if (!apiStatusMessage) {
      console.error("api-status-message element not found");
      return;
    }
    chrome.storage.sync.get(['provider'], function (data) {
      if (data.provider) {
        const provider = data.provider;
        chrome.storage.sync.get([provider], function (keyData) {
          const apiKey = keyData[provider] || '';
          if (!apiKey) {
            apiStatusMessage.textContent = 'Please add an API key.';
          } else {
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
    chrome.storage.sync.get(['provider'], function (data) {
      const provider = data.provider || 'openai';
      chrome.storage.sync.get([provider], function (keyData) {
        const apiKey = keyData[provider] || '';
        if (!apiKey) {
          alert('Please enter your API key in the settings.');
          return;
        }

        const codeContent = document.getElementById('code-input').value.trim();

        chrome.runtime.sendMessage({
          action: "analyzeCode",
          provider,
          apiKey,
          inputCode: codeContent
        });
      });
    });
  });
  loadSettings();
  updateApiStatusMessage();
});
