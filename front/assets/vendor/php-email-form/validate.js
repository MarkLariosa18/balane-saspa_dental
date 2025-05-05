document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#contact-form'); // Adjust to your form's ID
  const submitButton = form.querySelector('button[type="submit"]') || form.querySelector('input[type="submit"]');
  let csrfToken = null;

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
      alert('Failed to initialize form. Please refresh the page.');
    }
  }

  // Initialize reCAPTCHA
  function initializeRecaptcha() {
    if (typeof grecaptcha === 'undefined') {
      console.error('reCAPTCHA script not loaded');
      alert('reCAPTCHA failed to load. Please refresh the page.');
    }
  }

  // Handle form submission
  async function handleSubmit(event) {
    event.preventDefault();
    if (!submitButton) {
      console.error('Submit button not found');
      return;
    }
    submitButton.disabled = true;
    submitButton.textContent = 'Sending...';

    if (!csrfToken) {
      alert('Form not initialized. Please refresh the page.');
      submitButton.disabled = false;
      submitButton.textContent = 'Send Message';
      return;
    }

    let recaptchaResponse;
    try {
      recaptchaResponse = await new Promise((resolve, reject) => {
        grecaptcha.ready(() => {
          grecaptcha.execute('your-recaptcha-site-key', { action: 'submit' })
            .then(token => resolve(token))
            .catch(error => reject(error));
        });
      });
    } catch (error) {
      console.error('reCAPTCHA error:', error);
      alert('reCAPTCHA verification failed. Please try again.');
      submitButton.disabled = false;
      submitButton.textContent = 'Send Message';
      return;
    }

    const formData = new FormData(form);
    formData.append('_csrf', csrfToken);
    formData.append('g-recaptcha-response', recaptchaResponse);

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert('Email sent successfully!');
        form.reset();
        grecaptcha.reset();
      } else {
        console.error('Server response:', data);
        if (data.error === 'invalid_csrf_token') {
          alert('Invalid CSRF token. Please refresh the page and try again.');
        } else if (data.error === 'recaptcha_error') {
          alert('reCAPTCHA verification failed. Please try again.');
        } else if (data.error === 'too_many_requests') {
          alert('Too many submissions. Please try again later.');
        } else {
          alert(data.message || 'Failed to send email. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error sending email:', error);
      alert('An error occurred. Please try again later.');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Send Message';
    }
  }

  // Initialize
  fetchCsrfToken();
  initializeRecaptcha();

  // Attach submit handler
  form.addEventListener('submit', handleSubmit);
});