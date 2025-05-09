const BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : 'https://balane-saspa-dental-1.onrender.com';
const WS_URL = window.location.hostname === 'localhost' 
  ? 'ws://localhost:3000' 
  : 'wss://balane-saspa-dental-1.onrender.com';
const ENABLE_SOCKET_IO = true;

let profileData;
let allHistory = [];
let allBookedAppointments = [];
let currentAppointments = [];
let socket;
let csrfToken;

async function fetchCsrfToken() {
  try {
    console.log('Fetching CSRF token...');
    const response = await fetch(`${BASE_URL}/auth/csrf-token`, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    console.log('CSRF response status:', response.status);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch CSRF token');
    }
    const data = await response.json();
    csrfToken = data.csrfToken;
    console.log('CSRF token fetched:', csrfToken);
    return csrfToken;
  } catch (err) {
    console.error('Error fetching CSRF token:', err);
    showError('Failed to initialize security token. Please refresh the page.');
    throw err;
  }
}

function clearSessionCookie() {
  document.cookie = 'connect.sid=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  document.cookie = 'remember_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
}

function initializeWebSocket() {
  if (!ENABLE_SOCKET_IO) {
    console.log('Socket.IO disabled for testing');
    return;
  }

  if (typeof io === 'undefined') {
    console.error('Socket.IO library not loaded. Skipping WebSocket initialization.');
    showError('Real-time updates are unavailable. Please check the Socket.IO library.');
    return;
  }

  console.log('Initializing Socket.IO with URL:', WS_URL);
  socket = io(WS_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 5000,
    withCredentials: true,
    extraHeaders: {
      Cookie: document.cookie
    }
  });

  socket.on('connect', () => {
    console.log('Socket.IO connected');
  });

  socket.on('appointmentUpdate', (data) => {
    console.log('Socket.IO appointmentUpdate:', data);
    if (['reschedule_request', 'cancel_request', 'reschedule_response', 'cancel_response'].includes(data.type)) {
      showSuccess(`Appointment Update: ${data.message}`);
      fetchAppointments();
      fetchHistory();
    }
  });

  socket.on('connect_error', (error) => {
    console.error('Socket.IO connect error:', error.message);
  });

  socket.on('error', (error) => {
    console.error('Socket.IO error:', error);
  });

  socket.on('disconnect', () => {
    console.log('Socket.IO disconnected');
  });
}

async function fetchAllBookedAppointments() {
  try {
    console.log('Fetching all booked appointments...');
    const response = await fetch(`${BASE_URL}/api/appointments/booked`, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    console.log('Booked appointments status:', response.status);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch all appointments');
    }
    const data = await response.json();
    allBookedAppointments = Array.isArray(data.appointments) ? data.appointments : [];
    console.log('Booked appointments:', allBookedAppointments);
  } catch (err) {
    console.error('Error fetching all appointments:', err);
    allBookedAppointments = [];
  }
}

async function fetchAppointments() {
  try {
    console.log('Fetching appointments...');
    const response = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    console.log('Appointments status:', response.status);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch appointments');
    }
    const data = await response.json();
    currentAppointments = Array.isArray(data.appointments) ? data.appointments : [];
    console.log('Appointments data:', currentAppointments);
    return currentAppointments;
  } catch (err) {
    showError('Failed to load appointments: ' + err.message);
    throw err;
  }
}

async function fetchHistory() {
  try {
    console.log('Fetching history...');
    const response = await fetch(`${BASE_URL}/api/appointments?all=true`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    console.log('History status:', response.status);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch history');
    }
    const data = await response.json();
    allHistory = Array.isArray(data.appointments) ? data.appointments : [];
    console.log('History data:', allHistory);
    return allHistory;
  } catch (err) {
    showError('Failed to load history: ' + err.message);
    throw err;
  }
}

async function saveProfile() {
  const form = document.getElementById('profile-edit-form');
  if (!form) {
    console.error('Profile form not found');
    showError('Profile form not found. Please check the HTML.');
    return;
  }

  const formData = new FormData(form);
  const profileData = Object.fromEntries(formData);
  console.log('Profile data to save:', profileData);

  if (!profileData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileData.email)) {
    showError('A valid email address is required.');
    return;
  }
  if (profileData.dob && !isValidDate(profileData.dob)) {
    showError('Date of birth must be a valid date in YYYY-MM-DD format.');
    return;
  }
  if (profileData.phone && !/^\+?\d{7,15}$/.test(profileData.phone)) {
    showError('Phone number must be between 7 and 15 digits.');
    return;
  }

  try {
    console.log('Fetching CSRF token for saveProfile...');
    await fetchCsrfToken();
    console.log('Sending PUT /patients/profile...');
    const response = await fetch(`${BASE_URL}/patients/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'CSRF-Token': csrfToken,
        'Accept': 'application/json'
      },
      body: JSON.stringify(profileData),
      credentials: 'include'
    });
    console.log('Save profile status:', response.status);
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Save profile error:', errorData);
      throw new Error(errorData.message || `Failed to update profile (Status: ${response.status})`);
    }
    const responseData = await response.json();
    console.log('Save profile response:', responseData);
    showSuccess('Your profile has been updated successfully!');
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (err) {
    console.error('Save profile error:', err);
    showError('Failed to update profile: ' + err.message);
  }
}

async function saveSettings() {
  const formData = new FormData(document.getElementById('settings-form'));
  const settings = Object.fromEntries(formData);

  try {
    await fetchCsrfToken();
    const response = await fetch(`${BASE_URL}/patients/settings`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'CSRF-Token': csrfToken
      },
      body: JSON.stringify(settings),
      credentials: 'include'
    });

    if (response.ok) {
      showSuccess('Your settings have been saved successfully! Note: Some settings may not be fully implemented yet.');
    } else {
      const errorData = await response.json();
      showError(`Failed to save settings: ${errorData.message || 'Settings functionality is not fully implemented.'}`);
    }
  } catch (err) {
    showError('An error occurred while saving settings: ' + err.message);
  }
}

async function changePassword() {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const renewPassword = document.getElementById('renewPassword').value;

  if (newPassword !== renewPassword) {
    showError('New passwords do not match.');
    return;
  }

  try {
    if (!profileData || !profileData.email) {
      throw new Error('Profile data not loaded. Please refresh the page.');
    }
    const email = profileData.email;

    await fetchCsrfToken();
    const otpRequestResponse = await fetch(`${BASE_URL}/api/send-otp-password-change-user`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'CSRF-Token': csrfToken
      },
      body: JSON.stringify({ email, purpose: 'password_change_user' }),
      credentials: 'include'
    });
    if (!otpRequestResponse.ok) {
      const errorData = await otpRequestResponse.json();
      if (otpRequestResponse.status === 429) {
        showError('Too many OTP requests. Please try again later.');
        return;
      }
      throw new Error(errorData.message || 'Failed to request OTP');
    }

    const otpModal = new bootstrap.Modal(document.getElementById('otpModal'));
    otpModal.show();

    document.getElementById('verifyOtp').addEventListener('click', async function() {
      const otp = document.getElementById('otpInput').value.trim();
      if (!otp || otp.length !== 6) {
        showError('Please enter a valid 6-digit OTP.');
        return;
      }

      await fetchCsrfToken();
      const verifyOtpResponse = await fetch(`${BASE_URL}/api/verify-otp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({ email, otp, purpose: 'password_change_user' }),
        credentials: 'include'
      });

      if (!verifyOtpResponse.ok) {
        const errorData = await verifyOtpResponse.json();
        showError(errorData.message || 'Invalid OTP. Please try again.');
        return;
      }

      await fetchCsrfToken();
      const changePasswordResponse = await fetch(`${BASE_URL}/patients/change-password`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({ currentPassword, newPassword }),
        credentials: 'include'
      });
      if (changePasswordResponse.ok) {
        clearSessionCookie();
        showSuccess('Password changed successfully! Please log in again.');
        otpModal.hide();
        setTimeout(() => {
          window.location.replace('pages-login.html');
        }, 1000);
      } else {
        const errorData = await changePasswordResponse.json();
        if (errorData.error === 'invalid_password' && errorData.details) {
          showError(`Password requirements not met:\n- ${errorData.details.join('\n- ')}`);
        } else {
          showError(errorData.message || 'Failed to change password. Please check your current password.');
        }
      }
    }, { once: true });

    document.getElementById('resendOtp').addEventListener('click', async function() {
      await fetchCsrfToken();
      const resendResponse = await fetch(`${BASE_URL}/api/send-otp-password-change-user`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({ email, purpose: 'password_change_user' }),
        credentials: 'include'
      });
      if (resendResponse.ok) {
        showSuccess('A new OTP has been sent to your email.');
        document.getElementById('otpInput').value = '';
      } else {
        const errorData = await resendResponse.json();
        if (resendResponse.status === 429) {
          showError('Too many OTP requests. Please try again later.');
          return;
        }
        showError(errorData.message || 'Failed to resend OTP.');
      }
    }, { once: true });
  } catch (err) {
    showError('An error occurred during password change: ' + err.message);
  }
}

async function performLogout() {
  try {
    await fetchCsrfToken();
    const response = await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CSRF-Token': csrfToken
      },
      credentials: 'include'
    });
    if (response.ok) {
      clearSessionCookie();
      showSuccess('You have been successfully logged out.');
      setTimeout(() => {
        window.location.replace('index.html');
      }, 1000);
    } else {
      const errorData = await response.json();
      showError(errorData.message || 'Logout failed. Please try again.');
    }
  } catch (err) {
    console.error('Logout error:', err);
    showError('An error occurred during logout.');
  }
}