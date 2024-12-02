document.addEventListener('DOMContentLoaded', function () {
  // Analyze Page button
  document.getElementById('analyze-page').addEventListener('click', function () {
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
              fetch('http://localhost:5000/analyze_page', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ html: htmlContent })
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

  // Analyze Code button
  document.getElementById('analyze-code').addEventListener('click', function () {
    const codeContent = document.getElementById('code-input').value.trim();

    if (codeContent) {
      // Send the code content to the Flask backend
      fetch('http://localhost:5000/analyze_code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code: codeContent })
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
    } else {
      alert('Please paste your code into the text box.');
    }
  });
});
