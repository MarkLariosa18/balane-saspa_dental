document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#contact-form');
  const submitButton = form.querySelector('button[type="submit"]') || form.querySelector('input[type="submit"]');
  const recaptchaError = document.querySelector('#recaptcha-error');
  let csrfToken = null;

  // Fetch CSRF token
  async function fetchCsrfToken() {
    try {
      const response = await fetch('/csrf-token', {
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
      if (recaptchaError) recaptchaError.style.display = 'block';
    }
  }

  // Initialize reCAPTCHA with retry
  async function initializeRecaptcha(maxRetries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (typeof grecaptcha !== 'undefined') {
        return new Promise((resolve) => {
          grecaptcha.ready(() => {
            console.log('reCAPTCHA initialized');
            if (recaptchaError) recaptchaError.style.display = 'none';
            resolve(true);
          });
        });
      }
      console.warn(`reCAPTCHA not loaded, attempt ${attempt}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    console.error('reCAPTCHA script failed to load after retries');
    if (recaptchaError) recaptchaError.style.display = 'block';
    return false;
  }

  // Handle form submission
  async function handleSubmit(event) {
    event.preventDefault();
    if (!submitButton) {
      console.error('Submit button not found');
      alert('Form configuration error. Please contact support.');
      return;
    }
    submitButton.disabled = true;
    submitButton.textContent = 'Sending...';
    if (recaptchaError) recaptchaError.style.display = 'none';

    if (!csrfToken) {
      alert('Form not initialized. Please refresh the page.');
      submitButton.disabled = false;
      submitButton.textContent = 'Send Message';
      return;
    }

    if (!(await initializeRecaptcha())) {
      alert('reCAPTCHA failed to load. Please refresh the page.');
      submitButton.disabled = false;
      submitButton.textContent = 'Send Message';
      return;
    }

    let recaptchaResponse;
    try {
      // Replace YOUR_RECAPTCHA_SITE_KEY with your actual site key
      recaptchaResponse = await Promise.race([
        new Promise((resolve, reject) => {
          grecaptcha.ready(() => {
            grecaptcha.execute('YOUR_RECAPTCHA_SITE_KEY', { action: 'submit' })
              .then(token => resolve(token))
              .catch(error => reject(error));
          });
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('reCAPTCHA timeout')), 5000))
      ]);
    } catch (error) {
      console.error('reCAPTCHA error:', error.message);
      alert(`reCAPTCHA verification failed: ${error.message}. Please try again.`);
      if (recaptchaError) recaptchaError.style.display = 'block';
      submitButton.disabled = false;
      submitButton.textContent = 'Send Message';
      return;
    }

    const formData = new FormData(form);
    formData.append('_csrf', csrfToken);
    formData.append('g-recaptcha-response', recaptchaResponse);

    // Log form data and cookies for debugging
    console.log('Form data:', Object.fromEntries(formData));
    console.log('Cookies sent:', document.cookie);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

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
        alert('Email sent successfully!');
        form.reset();
        if (typeof grecaptcha !== 'undefined') {
          grecaptcha.reset();
        }
      } else {
        console.error('Server response:', data);
        if (data.error === 'csrf_error') {
          // Refetch CSRF token and prompt retry
          await fetchCsrfToken();
          alert('Session expired or invalid token. A new token has been fetched. Please try submitting again.');
        } else if (data.error === 'recaptcha_error') {
          alert(`reCAPTCHA verification failed: ${data.message}.`);
          if (recaptchaError) recaptchaError.style.display = 'block';
        } else if (data.error === 'too_many_requests') {
          alert('Too many submissions. Please try again later.');
        } else if (data.error === 'missing_fields') {
          alert('All fields are required, including reCAPTCHA.');
        } else if (data.error === 'email_error') {
          alert(`Failed to send email: ${data.message}.`);
        } else {
          alert(data.message || 'Failed to send email. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error sending email:', error);
      if (error.name === 'AbortError') {
        alert('Request timed out. Please try again later.');
      } else {
        alert(`An error occurred: ${error.message}. Please try again later.`);
      }
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