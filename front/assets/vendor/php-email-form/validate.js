document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('.php-email-form');
  const submitButton = form.querySelector('button[type="submit"]');
  const errorMessage = document.querySelector('.error-message');
  let csrfToken = null;
  let isRecaptchaReady = false;

  // Fetch CSRF token
  async function fetchCsrfToken() {
    try {
      const response = await fetch('/api/csrf-token', {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const data = await response.json();
      csrfToken = data.csrfToken;
      console.log('CSRF token fetched:', csrfToken);
    } catch (error) {
      console.error('Error fetching CSRF token:', error);
      showError('Failed to initialize form. Please refresh the page.');
      if (errorMessage) errorMessage.textContent = 'Failed to initialize form. Please refresh the page.';
    }
  }

  // reCAPTCHA onload callback
  window.onRecaptchaLoad = function() {
    try {
      grecaptcha.render('g-recaptcha', {
        'sitekey': '6LcO5S4rAAAAADSxc4Tvy2WfL60jj7uG_MgSlT70', // Replace with your new v2 Checkbox site key
        'callback': function(response) {
          console.log('reCAPTCHA verified:', response);
          if (errorMessage) errorMessage.style.display = 'none';
        },
        'error-callback': function() {
          showError('reCAPTCHA error. Please try again or refresh the page.');
          if (errorMessage) errorMessage.textContent = 'reCAPTCHA error. Please try again.';
        }
      });
      isRecaptchaReady = true;
      console.log('reCAPTCHA initialized successfully');
      if (errorMessage) errorMessage.style.display = 'none';
    } catch (error) {
      console.error('reCAPTCHA initialization failed:', error);
      showError('Failed to load reCAPTCHA. Please refresh the page.');
      if (errorMessage) errorMessage.textContent = 'Failed to load reCAPTCHA. Please refresh the page.';
    }
  };

  // Show error message using SweetAlert2
  function showError(message) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: message,
      confirmButtonColor: '#4154f1'
    });
  }

  // Show success message
  function showSuccess(message) {
    Swal.fire({
      icon: 'success',
      title: 'Success',
      text: message,
      confirmButtonColor: '#4154f1'
    });
  }

  // Handle form submission
  async function handleSubmit(event) {
    event.preventDefault();
    if (!submitButton) {
      console.error('Submit button not found');
      showError('Form configuration error. Please contact support.');
      return;
    }
    submitButton.disabled = true;
    submitButton.textContent = 'Sending...';
    if (errorMessage) errorMessage.style.display = 'none';

    if (!csrfToken) {
      showError('Form not initialized. Please refresh the page.');
      submitButton.disabled = false;
      submitButton.textContent = 'Send Message';
      return;
    }

    if (!isRecaptchaReady || typeof grecaptcha === 'undefined') {
      showError('reCAPTCHA is not loaded. Please refresh the page.');
      submitButton.disabled = false;
      submitButton.textContent = 'Send Message';
      return;
    }

    const recaptchaResponse = grecaptcha.getResponse();
    if (!recaptchaResponse) {
      showError('Please complete the reCAPTCHA checkbox.');
      submitButton.disabled = false;
      submitButton.textContent = 'Send Message';
      return;
    }

    const formData = new FormData(form);
    formData.append('g-recaptcha-response', recaptchaResponse);

    // Log form data for debugging (obfuscate sensitive fields)
    console.log('Form data:', {
      name: formData.get('name') ? '[REDACTED]' : null,
      email: formData.get('email') ? '[REDACTED]' : null,
      subject: formData.get('subject'),
      message: formData.get('message') ? '[REDACTED]' : null,
      'g-recaptcha-response': recaptchaResponse ? '[REDACTED]' : null
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch('/api/send-email', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'X-CSRF-Token': csrfToken,
        },
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccess('Email sent successfully!');
        if (errorMessage) errorMessage.style.display = 'none';
        form.reset();
        grecaptcha.reset();
      } else {
        console.error('Server response:', data);
        if (data.error === 'csrf_error') {
          await fetchCsrfToken();
          showError('Session expired or invalid token. A new token has been fetched. Please try submitting again.');
        } else if (data.error === 'recaptcha_error') {
          showError(`reCAPTCHA verification failed: ${data.message}`);
          if (errorMessage) errorMessage.textContent = `reCAPTCHA verification failed: ${data.message}`;
        } else if (data.error === 'too_many_requests') {
          showError('Too many submissions. Please try again later.');
        } else if (data.error === 'missing_fields') {
          showError('All fields are required, including reCAPTCHA.');
        } else if (data.error === 'invalid_email') {
          showError('Invalid email address.');
        } else {
          showError(data.message || 'Failed to send email. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error sending email:', error);
      if (error.name === 'AbortError') {
        showError('Request timed out. Please try again later.');
      } else {
        showError(`An error occurred: ${error.message}. Please try again later.`);
      }
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Send Message';
    }
  }

  // Initialize
  fetchCsrfToken();
  // onRecaptchaLoad is called by reCAPTCHA script
  if (form) {
    form.addEventListener('submit', handleSubmit);
  } else {
    console.error('Form with class .php-email-form not found');
    showError('Form not found. Please contact support.');
  }
});