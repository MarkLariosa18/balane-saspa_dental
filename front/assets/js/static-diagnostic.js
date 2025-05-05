document.addEventListener('DOMContentLoaded', () => {
    // Create diagnostic container
    const diagContainer = document.createElement('div');
    diagContainer.style.position = 'fixed';
    diagContainer.style.bottom = '10px';
    diagContainer.style.right = '10px';
    diagContainer.style.background = 'rgba(0,0,0,0.8)';
    diagContainer.style.color = 'white';
    diagContainer.style.padding = '10px';
    diagContainer.style.fontSize = '12px';
    diagContainer.style.maxWidth = '300px';
    diagContainer.style.zIndex = '1000';
    diagContainer.style.overflow = 'auto';
    diagContainer.style.maxHeight = '200px';
    document.body.appendChild(diagContainer);
  
    // Log function
    const log = (message) => {
      const logEntry = document.createElement('div');
      logEntry.textContent = message;
      diagContainer.appendChild(logEntry);
      console.log(message);
    };
  
    // Check reCAPTCHA script
    const recaptchaScript = document.querySelector('script[src*="recaptcha/api.js"]');
    if (recaptchaScript) {
      recaptchaScript.addEventListener('load', () => {
        log('Success: reCAPTCHA script loaded');
      });
      recaptchaScript.addEventListener('error', () => {
        log('Error: Failed to load reCAPTCHA script');
      });
    } else {
      log('Error: reCAPTCHA script not found in DOM');
    }
  
    // Check if grecaptcha is defined
    const checkGrecaptcha = setInterval(() => {
      if (typeof grecaptcha !== 'undefined') {
        log('Success: grecaptcha object available');
        clearInterval(checkGrecaptcha);
      }
    }, 500);
    setTimeout(() => {
      if (typeof grecaptcha === 'undefined') {
        log('Error: grecaptcha object not available after 5s');
        clearInterval(checkGrecaptcha);
      }
    }, 5000);
  
    // List of static files to check
    const staticFiles = [
      '/assets/vendor/bootstrap/css/bootstrap.min.css',
      '/assets/vendor/bootstrap-icons/bootstrap-icons.css',
      '/assets/vendor/aos/aos.css',
      '/assets/vendor/fontawesome-free/css/all.min.css',
      '/assets/vendor/glightbox/css/glightbox.min.css',
      '/assets/vendor/swiper/swiper-bundle.min.css',
      '/assets/css/main.css',
      '/assets/js/main.js',
      '/assets/js/contact.js',
      '/assets/js/see-more.js',
      '/assets/js/card-overlay.js'
    ];
  
    // Check each static file
    staticFiles.forEach(file => {
      fetch(file, { method: 'HEAD' })
        .then(response => {
          log(`Success: ${file} loaded (Status: ${response.status})`);
        })
        .catch(error => {
          log(`Error: Failed to load ${file} (${error.message})`);
        });
    });
  });