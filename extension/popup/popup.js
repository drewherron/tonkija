document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('log-html').addEventListener('click', function () {
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

              // Send the HTML content to the Flask backend
              fetch('http://localhost:5000/log_html', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ html: htmlContent })
              })
                .then(response => response.json())
                .then(data => {
                  if (data.success) {
                    alert('HTML logged successfully!');
                  } else {
                    alert(`Error: ${data.error}`);
                  }
                })
                .catch(error => {
                  console.error('Error logging HTML:', error);
                  alert('An error occurred while logging the HTML.');
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
