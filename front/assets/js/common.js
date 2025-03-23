document.addEventListener('DOMContentLoaded', function() {
    fetch('header.html')
      .then(response => response.text())
      .then(data => {
        document.getElementById('header').innerHTML = data;
        
        const currentPage = window.location.pathname.split('/').pop();
        const navLinks = document.querySelectorAll('#navmenu a');
        navLinks.forEach(link => {
          if (link.getAttribute('href') === currentPage) {
            link.classList.add('active');
          }
        });
      });
    
    fetch('footer.html')
      .then(response => response.text())
      .then(data => {
        document.getElementById('footer').innerHTML = data;
      });
  });