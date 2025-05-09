/**
 * profile-ui.js
 * Handles profile page functionality, including map setup, appointments, and history.
 * 
 * Notes:
 * - Fixed "Map container not found" error by skipping setupMap for profile.html, which uses a Google Maps iframe.
 * - To address "net::ERR_BLOCKED_BY_CLIENT" error in main.js:284, check if main.js loads the Google Maps JavaScript API
 *   unnecessarily for profile.html. If not needed, skip the API load:
 *     if (window.location.pathname.includes('profile.html')) return;
 *   Ensure ad blockers are disabled or add an exception for maps.googleapis.com.
 * - Chrome's third-party cookie deprecation may affect the Google Maps iframe or Socket.IO. Consider replacing the iframe
 *   with a Leaflet map using OpenStreetMap (cookie-free) or adding a user notification about enabling third-party cookies.
 */

AOS.init();

const ITEMS_PER_LOAD = 3;
let displayedHistoryCount = 0;
let editModalControls;
let cancelModalControls;

function showError(message) {
  console.error(message);
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: message,
      confirmButtonColor: '#b994c0'
    });
  } else {
    alert(`Error: ${message}`);
  }
}

function showSuccess(message) {
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'success',
      title: 'Success',
      text: message,
      confirmButtonColor: '#b994c0'
    });
  } else {
    alert(`Success: ${message}`);
  }
}

function isValidDate(dateString) {
  if (!dateString || typeof dateString !== 'string' || dateString.trim() === '' || dateString.toLowerCase() === 'n/a') {
    console.log(`Invalid date string: ${dateString} (rejected as empty or non-date)`);
    return false;
  }
  const date = new Date(dateString);
  if (date instanceof Date && !isNaN(date.getTime())) {
    const today = new Date();
    const minDate = new Date('1900-01-01');
    if (date <= today && date >= minDate) {
      console.log(`Valid date string: ${dateString} (parsed as ${date.toISOString()})`);
      return true;
    } else {
      console.log(`Invalid date string: ${dateString} (out of range)`);
      return false;
    }
  }
  console.log(`Invalid date string: ${dateString} (failed parsing)`);
  return false;
}

function initializeRescheduleDatePicker(bookedAppointments, currentAppointmentId) {
  const bookedTimes = (Array.isArray(bookedAppointments) ? bookedAppointments : [])
    .filter(appt => String(appt.id) !== String(currentAppointmentId))
    .map(appt => {
      const date = new Date(appt.appointment_date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hour = String(date.getHours()).padStart(2, '0');
      return `${year}-${month}-${day} ${hour}:00`;
    });

  const fp = flatpickr('#editDate', {
    enableTime: true,
    time_24hr: true,
    dateFormat: "Y-m-d H:i",
    minDate: "today",
    inline: true,
    appendTo: document.getElementById('datePickerContainer'),
    disable: [
      function(date) {
        const now = new Date();
        const day = date.getDay();
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        if (day === 0) return true;
        if (dateStr === now.toISOString().slice(0, 10) && now.getHours() >= 15) return true;
        const hours = [9, 10, 11, 12, 13, 14, 15, 16];
        return hours.every(hour => bookedTimes.includes(`${dateStr} ${hour.toString().padStart(2, '0')}:00`));
      }
    ],
    onReady: (selectedDates, dateStr, instance) => {
      const container = instance.calendarContainer;
      container.classList.add('flatpickr-calendar');
      const timePickerBottom = document.getElementById('timePickerBottom');
      const times = [
        { hour: 9, label: '9 AM' },
        { hour: 10, label: '10 AM' },
        { hour: 11, label: '11 AM' },
        { hour: 12, label: '12 PM' },
        { hour: 13, label: '1 PM' },
        { hour: 14, label: '2 PM' },
        { hour: 15, label: '3 PM' },
        { hour: 16, label: '4 PM' }
      ];

      function createTimeSlots(container) {
        container.innerHTML = '<div class="time-picker-header">Select Time</div><div class="time-picker-slots"></div>';
        const slotsContainer = container.querySelector('.time-picker-slots');
        times.forEach(time => {
          const slot = document.createElement('div');
          slot.className = 'time-slot';
          slot.textContent = time.label;
          slot.dataset.hour = time.hour;
          slotsContainer.appendChild(slot);
        });
      }

      createTimeSlots(timePickerBottom);
      if (selectedDates.length > 0) {
        instance.config.onChange.forEach(fn => fn.call(instance, selectedDates, dateStr, instance));
      }
    },
    onChange: (selectedDates, dateStr, instance) => {
      const selectedDate = selectedDates[0];
      if (!selectedDate) return;

      const dateStrPart = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
      const timePicker = document.getElementById('timePickerBottom');
      const timeSlots = timePicker.querySelectorAll('.time-slot');

      timeSlots.forEach(slot => {
        const hour = parseInt(slot.dataset.hour);
        const timeStr = `${dateStrPart} ${hour.toString().padStart(2, '0')}:00`;
        const isBooked = bookedTimes.includes(timeStr);

        slot.classList.remove('selected', 'disabled');
        slot.style.pointerEvents = 'auto';
        slot.onclick = null;

        if (isBooked) {
          slot.classList.add('disabled');
        } else {
          slot.onclick = () => {
            timePicker.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
            slot.classList.add('selected');
            selectedDate.setHours(hour, 0, 0, 0);
            instance.setDate(selectedDate);
          };
        }
      });

      const firstAvailable = timePicker.querySelector('.time-slot:not(.disabled)');
      if (firstAvailable && !timePicker.querySelector('.time-slot.selected')) {
        firstAvailable.click();
      } else if (!firstAvailable) {
        instance.clear();
        showError('No available times for this date.');
      }
    }
  });

  return fp;
}

function setupEditAppointmentModal() {
  const editModalElement = document.getElementById('editAppointmentModal');
  const editModal = new bootstrap.Modal(editModalElement);
  let fpInstance;

  function openEditModal(appointmentId) {
    const appointmentData = currentAppointments.find(appt => String(appt.id) === String(appointmentId));
    if (!appointmentData) {
      showError('Appointment not found.');
      return;
    }

    if (fpInstance) fpInstance.destroy();

    fetchAllBookedAppointments().then(() => {
      fpInstance = initializeRescheduleDatePicker(allBookedAppointments, appointmentId);
      fpInstance.setDate(new Date(appointmentData.appointment_date));
      document.getElementById('editService').value = appointmentData.services?.name || 'Unknown Service';
      document.getElementById('editReason').value = appointmentData.cancel_reason || '';
      document.getElementById('edit-appointment-form').dataset.appointmentId = appointmentId;
      document.getElementById('edit-appointment-form').dataset.status = appointmentData.status;

      editModal.show();
    });
  }

  document.getElementById('saveEditAppointment').addEventListener('click', async function () {
    const form = document.getElementById('edit-appointment-form');
    const appointmentId = form.dataset.appointmentId;
    const status = form.dataset.status.toLowerCase();
    const reason = document.getElementById('editReason').value.trim();

    if (status === 'cancelled') {
      showError('Cannot reschedule cancelled appointments.');
      editModal.hide();
      return;
    }

    const selectedDate = fpInstance.selectedDates[0];
    if (!selectedDate) {
      showError('Please select a date and time.');
      return;
    }

    if (!reason) {
      showError('Please provide a reason for rescheduling.');
      return;
    }
    if (reason.length < 5) {
      showError('Rescheduling reason must be at least 5 characters long.');
      return;
    }

    const isoDateString = selectedDate.toISOString();

    const requestData = {
      appointment_date: isoDateString,
      cancel_reason: reason
    };

    try {
      await fetchCsrfToken();
      const response = await fetch(`${BASE_URL}/api/appointments/${appointmentId}/reschedule`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify(requestData),
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to request reschedule');
      }

      const updatedAppointment = {
        ...currentAppointments.find(appt => String(appt.id) === String(appointmentId)),
        status: 'pending',
        pending_action: 'reschedule',
        appointment_date: isoDateString,
        cancel_reason: reason
      };
      currentAppointments = currentAppointments.map(appt => 
        String(appt.id) === String(appointmentId) ? updatedAppointment : appt
      );

      editModal.hide();
      renderAppointments();
      await fetchHistory();
      showSuccess('Reschedule request submitted successfully! Awaiting admin approval.');
    } catch (err) {
      showError('Failed to request reschedule: ' + err.message);
    }
  });

  return { openEditModal };
}

function setupCancelAppointmentModal() {
  const cancelModalElement = document.getElementById('cancelAppointmentModal');
  const cancelModal = new bootstrap.Modal(cancelModalElement, { backdrop: 'static', keyboard: false });

  function openCancelModal(appointmentId) {
    const appointmentData = currentAppointments.find(appt => String(appt.id) === String(appointmentId));
    if (!appointmentData) {
      showError('Appointment not found.');
      return;
    }

    document.getElementById('cancelReason').value = '';
    document.getElementById('cancel-appointment-form').dataset.appointmentId = appointmentId;
    document.getElementById('cancel-appointment-date').textContent = 
      `Date: ${new Date(appointmentData.appointment_date).toLocaleString()}`;
    document.getElementById('cancel-appointment-service').textContent = 
      `Service: ${appointmentData.services?.name || 'Unknown Service'}`;

    cancelModal.show();
  }

  document.getElementById('confirmCancelAppointment').addEventListener('click', async function () {
    const form = document.getElementById('cancel-appointment-form');
    const appointmentId = form.dataset.appointmentId;
    const cancelReason = document.getElementById('cancelReason').value.trim();

    if (!cancelReason) {
      showError('Please provide a reason for cancellation.');
      return;
    }
    if (cancelReason.length < 5) {
      showError('Cancellation reason must be at least 5 characters long.');
      return;
    }

    try {
      await fetchCsrfToken();
      const response = await fetch(`${BASE_URL}/api/appointments/${appointmentId}`, {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({ cancel_reason: cancelReason }),
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to cancel appointment');
      }

      const updatedAppointment = {
        ...currentAppointments.find(appt => String(appt.id) === String(appointmentId)),
        status: 'pending',
        pending_action: 'cancel',
        cancel_reason: cancelReason
      };
      currentAppointments = currentAppointments.map(appt => 
        String(appt.id) === String(appointmentId) ? updatedAppointment : appt
      );

      cancelModal.hide();
      renderAppointments();
      await fetchHistory();
      showSuccess('Cancellation request submitted successfully! Awaiting admin approval.');
    } catch (err) {
      showError('Failed to cancel appointment: ' + err.message);
    }
  });

  return { openCancelModal };
}

function renderAppointments() {
  const tbody = document.getElementById('appointments-table');
  const noAppointmentsDiv = document.getElementById('no-appointments');

  if (currentAppointments.length === 0) {
    tbody.innerHTML = '';
    noAppointmentsDiv.style.display = 'block';
    return;
  }

  noAppointmentsDiv.style.display = 'none';
  tbody.innerHTML = '';

  currentAppointments.forEach(appointment => {
    const displayDate = appointment.rescheduled_at || appointment.appointment_date;
    let statusText;
    let statusClass;
    let notesContent = appointment.notes || 'N/A';

    if (appointment.pending_action) {
      let actionText;
      if (appointment.pending_action === 'confirm') {
        actionText = 'confirm';
      } else if (appointment.pending_action === 'reschedule') {
        actionText = 'reschedule';
      } else {
        actionText = 'cancel';
      }
      statusText = `<small>(Pending ${actionText})</small>`;
      statusClass = 'status-pending';
      if (['cancel', 'reschedule'].includes(appointment.pending_action)) {
        notesContent = `Reason: ${appointment.cancel_reason || 'Not specified'}`;
      }
    } else {
      statusText = appointment.status;
      statusClass = {
        pending: 'status-pending',
        confirmed: 'status-confirmed',
        cancelled: 'status-cancelled',
        completed: 'status-completed'
      }[appointment.status.toLowerCase()] || '';
    }

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${new Date(displayDate).toLocaleString()}</td>
      <td>${appointment.services?.name || 'Unknown Service'}</td>
      <td><span class="appointment-status ${statusClass}">${statusText}</span></td>
      <td>${notesContent}</td>
      <td>
        ${['pending', 'confirmed', 'completed'].includes(appointment.status.toLowerCase()) ? `
          <button class="btn btn-sm btn-warning edit-appointment me-1" data-id="${appointment.id}" title="Edit" 
            ${appointment.pending_action ? 'disabled' : ''}>
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-danger cancel-appointment" data-id="${appointment.id}" title="Cancel"
            ${appointment.pending_action ? 'disabled' : ''}>
            <i class="fas fa-trash-alt"></i>
          </button>
        ` : '-'}
      </td>
    `;
    tbody.appendChild(row);
  });

  document.querySelectorAll('.edit-appointment').forEach(button => {
    button.addEventListener('click', function () {
      const appointmentId = this.getAttribute('data-id');
      if (appointmentId && editModalControls) {
        editModalControls.openEditModal(appointmentId);
      } else {
        showError('Error: No appointment ID found or edit modal not initialized');
      }
    });
  });

  document.querySelectorAll('.cancel-appointment').forEach(button => {
    button.addEventListener('click', function() {
      const appointmentId = this.getAttribute('data-id');
      if (appointmentId && cancelModalControls) {
        cancelModalControls.openCancelModal(appointmentId);
      } else {
        showError('Error: No appointment ID found or cancel modal not initialized');
      }
    });
  });
}

function renderHistory(history) {
  const timeline = document.getElementById('history-timeline');
  const noHistoryDiv = document.getElementById('no-history');
  const loadMoreButton = document.getElementById('load-more-history');
  const searchQuery = document.getElementById('history-search').value.trim().toLowerCase();

  const filteredHistory = history.filter(appointment => {
    const dateStr = new Date(appointment.appointment_date).toLocaleString().toLowerCase();
    const serviceName = (appointment.services?.name || 'Unknown Service').toLowerCase();
    const cancelReason = (appointment.cancel_reason || 'N/A').toLowerCase();
    const rejectReason = (appointment.reject_reason || 'N/A').toLowerCase();
    return dateStr.includes(searchQuery) || serviceName.includes(searchQuery) || 
           cancelReason.includes(searchQuery) || rejectReason.includes(searchQuery);
  });

  if (filteredHistory.length === 0) {
    timeline.innerHTML = '';
    noHistoryDiv.style.display = 'block';
    loadMoreButton.style.display = 'none';
    return;
  }

  noHistoryDiv.style.display = 'none';
  timeline.innerHTML = '';

  const itemsToShow = filteredHistory.slice(0, Math.min(displayedHistoryCount + ITEMS_PER_LOAD, filteredHistory.length));
  itemsToShow.forEach(appointment => {
    const statusClass = {
      confirmed: 'status-confirmed',
      cancelled: 'status-cancelled',
      completed: 'status-completed',
      rejected: 'status-cancelled'
    }[appointment.status.toLowerCase()] || '';

    const timelineItem = document.createElement('div');
    timelineItem.className = 'timeline-item';

    let cancelReasonHtml = '';
    if (appointment.status.toLowerCase() === 'cancelled') {
      cancelReasonHtml = `<p><strong>Cancel Reason:</strong> ${appointment.cancel_reason || 'N/A'}</p>`;
    }

    let rejectReasonHtml = '';
    if (appointment.status.toLowerCase() === 'rejected') {
      rejectReasonHtml = `<p><strong>Reject Reason:</strong> ${appointment.reject_reason || 'N/A'}</p>`;
    }

    timelineItem.innerHTML = `
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <h6>${new Date(appointment.appointment_date).toLocaleString()}</h6>
        <p><strong>Service:</strong> ${appointment.services?.name || 'Unknown Service'}</p>
        <p><strong>Status:</strong> <span class="appointment-status ${statusClass}">${appointment.status}</span></p>
        ${cancelReasonHtml}
        ${rejectReasonHtml}
      </div>
    `;
    timeline.appendChild(timelineItem);
  });

  displayedHistoryCount = itemsToShow.length;
  loadMoreButton.style.display = displayedHistoryCount < filteredHistory.length ? 'block' : 'none';
}

function loadMoreHistory() {
  displayedHistoryCount += ITEMS_PER_LOAD;
  renderHistory(allHistory);
}

function setupMap() {
  // Skip map initialization for profile.html, which uses a Google Maps iframe
  if (window.location.pathname.includes('profile.html')) {
    console.log('Skipping map initialization for profile.html (uses Google Maps iframe)');
    return;
  }

  // Initialize Leaflet map for other pages with a #map container
  try {
    const map = L.map('map').setView([14.1107, 122.9568], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    L.marker([14.1107, 122.9568]).addTo(map)
      .bindPopup('Balane-Saspa Dental Clinic')
      .openPopup();
  } catch (error) {
    console.warn('Failed to initialize Leaflet map:', error);
    // Allow page to continue loading
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    console.log('DOMContentLoaded started');
    console.log('BASE_URL:', BASE_URL);
    console.log('WS_URL:', WS_URL);
    console.log('Cookies:', document.cookie);

    await fetchCsrfToken();
    editModalControls = setupEditAppointmentModal();
    cancelModalControls = setupCancelAppointmentModal();

    // Attempt to initialize map, but don't let it block profile loading
    try {
      setupMap();
    } catch (mapError) {
      console.warn('Map setup failed:', mapError);
    }

    console.log('Fetching /check-auth...');
    const authResponse = await fetch(`${BASE_URL}/check-auth`, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    console.log('Check-auth status:', authResponse.status);
    if (!authResponse.ok) {
      const errorData = await authResponse.json();
      console.error('Check-auth error:', errorData);
      throw new Error(errorData.message || 'Authentication check failed');
    }
    const authData = await authResponse.json();
    console.log('Check-auth data:', authData);
    if (!authData.isLoggedIn) {
      console.log('Not logged in, redirecting...');
      showError('You are not logged in. Redirecting to login page.');
      setTimeout(() => {
        window.location.replace('pages-login.html');
      }, 2000);
      return;
    }

    console.log('Fetching /patients/profile...');
    const profileResponse = await fetch(`${BASE_URL}/patients/profile`, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    console.log('Profile status:', profileResponse.status);
    if (!profileResponse.ok) {
      const errorData = await profileResponse.json();
      console.error('Profile error:', errorData);
      throw new Error(errorData.message || 'Failed to fetch profile');
    }
    profileData = await profileResponse.json();
    console.log('Profile data:', profileData);

    console.log('Initializing Socket.IO...');
    setTimeout(initializeWebSocket, 1000);

    document.getElementById('account-link').style.display = 'none';
    document.getElementById('profile-link').style.display = 'block';
    document.querySelectorAll('#navmenu a').forEach(link => link.classList.remove('active'));
    document.querySelector('#profile-link a').classList.add('active');

    const safeProfileData = {
      full_name: profileData.full_name || 'N/A',
      email: profileData.email || 'N/A',
      phone: profileData.phone || 'N/A',
      dob: isValidDate(profileData.dob) ? new Date(profileData.dob).toISOString().split('T')[0] : 'N/A',
      gender: profileData.gender || 'N/A',
      address: profileData.address || 'N/A',
      religion: profileData.religion || 'N/A',
      nationality: profileData.nationality || 'N/A',
      home_number: profileData.home_number || 'N/A'
    };

    document.getElementById('profile-name').textContent = safeProfileData.full_name;
    document.getElementById('profile-email').textContent = safeProfileData.email;
    document.getElementById('profile-phone').textContent = safeProfileData.phone;

    document.getElementById('overview-name').textContent = safeProfileData.full_name;
    document.getElementById('overview-dob').textContent = safeProfileData.dob !== 'N/A' ? safeProfileData.dob : 'Not provided';
    document.getElementById('overview-gender').textContent = safeProfileData.gender;
    document.getElementById('overview-address').textContent = safeProfileData.address;
    document.getElementById('overview-religion').textContent = safeProfileData.religion;
    document.getElementById('overview-nationality').textContent = safeProfileData.nationality;
    document.getElementById('overview-homeNumber').textContent = safeProfileData.home_number;
    document.getElementById('overview-phone').textContent = safeProfileData.phone;
    document.getElementById('overview-email').textContent = safeProfileData.email;

    document.getElementById('fullName').value = safeProfileData.full_name;
    document.getElementById('dob').value = safeProfileData.dob !== 'N/A' ? safeProfileData.dob : '';
    document.getElementById('gender').value = safeProfileData.gender.toLowerCase();
    document.getElementById('Address').value = safeProfileData.address;
    document.getElementById('religion').value = safeProfileData.religion;
    document.getElementById('nationality').value = safeProfileData.nationality;
    document.getElementById('homeNumber').value = safeProfileData.home_number;
    document.getElementById('Phone').value = safeProfileData.phone;
    document.getElementById('Email').value = safeProfileData.email;

    document.getElementById('logoutButton').addEventListener('click', function() {
      Swal.fire({
        title: 'Are you sure?',
        text: 'Do you want to log out of your account?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#b994c0',
        cancelButtonColor: '#dc3545',
        confirmButtonText: 'Yes, log out'
      }).then((result) => {
        if (result.isConfirmed) {
          performLogout();
        }
      });
    });

    await Promise.all([fetchAppointments(), fetchHistory()]);
    renderAppointments();
    renderHistory(allHistory);

    document.getElementById('history-search').addEventListener('input', () => {
      displayedHistoryCount = 0;
      renderHistory(allHistory);
    });

    document.getElementById('load-more-history').addEventListener('click', loadMoreHistory);

    const preloader = document.getElementById('preloader');
    if (preloader) preloader.remove();
  } catch (err) {
    console.error('Initialization error:', err);
    showError('Failed to load profile: ' + err.message);
    setTimeout(() => {
      window.location.replace('pages-login.html');
    }, 2000);
  }
});