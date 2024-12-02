document.addEventListener('DOMContentLoaded', function () {
  // Add event listener to the button
  document.getElementById('log-html').addEventListener('click', function () {
    // Get the HTML content of the current page
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          func: () => document.documentElement.outerHTML
        },
        (results) => {
          if (results && results[0] && results[0].result) {
            const htmlContent = results[0].result;

            // Send the HTML to the Flask server
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
    });
  });
});
