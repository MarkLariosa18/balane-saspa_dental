document.addEventListener('DOMContentLoaded', function() {
    fetch('header.html')
      .then(response => response.text())
      .then(data => {
        document.getElementById('header-container').innerHTML = data;
 
        const searchScript = document.createElement('script');
        searchScript.src = 'assets/js/search.js';
        document.body.appendChild(searchScript);
        
        const notificationsScript = document.createElement('script');
        notificationsScript.src = 'assets/js/notifications.js';
        document.body.appendChild(notificationsScript);
      });
  });