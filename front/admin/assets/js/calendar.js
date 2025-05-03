// Calendar state variables
let currentDate = new Date();
let selectedDate = null;
let appointments = {};

// DOM elements
const monthYearElement = document.getElementById('monthYear');
const calendarGrid = document.getElementById('calendarGrid');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const todayBtn = document.getElementById('todayBtn');
const appointmentModal = document.getElementById('appointmentModal');
const modalTitle = document.getElementById('modalTitle');
const appointmentsList = document.getElementById('appointmentsList');
const closeBtn = document.getElementById('closeBtn');

// Initialize the calendar
function initCalendar() {
    renderDayLabels();
    renderCalendar();
    setupEventListeners();
    
    // Load sample appointments for demonstration
    loadSampleAppointments();
}

// Render day labels (Sun, Mon, etc.)
function renderDayLabels() {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(day => {
        const dayLabel = document.createElement('div');
        dayLabel.className = 'day-label';
        dayLabel.textContent = day;
        calendarGrid.appendChild(dayLabel);
    });
}

// Get days in month
function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

// Get first day of month (0 = Sunday, 6 = Saturday)
function getFirstDayOfMonth(year, month) {
    return new Date(year, month, 1).getDay();
}

// Get month name
function getMonthName(month) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return months[month];
}

// Format date as YYYY-MM-DD
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Load sample appointments for demonstration
function loadSampleAppointments() {
    // Get today's date and add some sample appointments
    const today = new Date();
    const todayKey = formatDate(today);
    
    // Tomorrow
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = formatDate(tomorrow);
    
    // Create some sample appointments if none exist
    if (!localStorage.getItem('dentalAppointments')) {
        appointments = {
            [todayKey]: [
                {
                    name: "John Smith",
                    time: "09:00",
                    service: "Cleaning",
                    notes: "First-time patient",
                    status: "pending"
                },
                {
                    name: "Sarah Johnson",
                    time: "10:30",
                    service: "Checkup",
                    notes: "Follow-up appointment",
                    status: "approved"
                }
            ],
            [tomorrowKey]: [
                {
                    name: "Michael Brown",
                    time: "14:00",
                    service: "Filling",
                    notes: "Cavity on lower molar",
                    status: "pending"
                }
            ]
        };
        
        // Save to localStorage
        localStorage.setItem('dentalAppointments', JSON.stringify(appointments));
    } else {
        // Load saved appointments
        appointments = JSON.parse(localStorage.getItem('dentalAppointments'));
    }
    
    renderCalendar();
}

// Render the calendar
function renderCalendar() {
    // Clear existing calendar days (but keep day labels)
    const dayElements = calendarGrid.querySelectorAll('.calendar-day, .empty-day');
    dayElements.forEach(day => day.remove());

    // Update header
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    monthYearElement.textContent = `${getMonthName(month)} ${year}`;

    // Get days in month and first day of month
    const daysInMonth = getDaysInMonth(year, month);
    const firstDayOfMonth = getFirstDayOfMonth(year, month);

    // Add empty days before the first day of the month
    for (let i = 0; i < firstDayOfMonth; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'empty-day';
        calendarGrid.appendChild(emptyDay);
    }

    // Create calendar days
    const today = new Date();
    const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

    for (let day = 1; day <= daysInMonth; day++) {
        const calendarDay = document.createElement('div');
        calendarDay.className = 'calendar-day';
        
        // Check if it's today
        if (isCurrentMonth && today.getDate() === day) {
            calendarDay.classList.add('today');
        }
        
        // Add day number
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        calendarDay.appendChild(dayNumber);
        
        // Add date data attribute to the day element
        const date = new Date(year, month, day);
        const dateKey = formatDate(date);
        calendarDay.dataset.date = dateKey;
        
        // Add appointments for this day if any exist
        if (appointments[dateKey]) {
            // Count pending appointments
            const pendingCount = appointments[dateKey].filter(apt => apt.status === 'pending').length;
            
            // Add pending badge if there are any
            if (pendingCount > 0) {
                const pendingBadge = document.createElement('div');
                pendingBadge.className = 'badge badge-pending';
                pendingBadge.textContent = `${pendingCount} pending`;
                calendarDay.appendChild(pendingBadge);
            }
            
            // Display the first 3 appointments to avoid overcrowding
            appointments[dateKey].slice(0, 3).forEach(apt => {
                const appointmentDiv = document.createElement('div');
                appointmentDiv.className = `appointment ${apt.status}`;
                appointmentDiv.textContent = `${apt.time} - ${apt.name}`;
                calendarDay.appendChild(appointmentDiv);
            });
            
            // If there are more than 3 appointments, show a "more" indicator
            if (appointments[dateKey].length > 3) {
                const moreDiv = document.createElement('div');
                moreDiv.className = 'appointment more';
                moreDiv.textContent = `+ ${appointments[dateKey].length - 3} more`;
                calendarDay.appendChild(moreDiv);
            }
        }
        
        calendarGrid.appendChild(calendarDay);
    }
}

// Set up event listeners
function setupEventListeners() {
    // Navigation buttons
    prevBtn.addEventListener('click', goToPreviousMonth);
    nextBtn.addEventListener('click', goToNextMonth);
    todayBtn.addEventListener('click', goToCurrentMonth);
    
    // Calendar day click event
    calendarGrid.addEventListener('click', handleDayClick);
    
    // Modal close button
    closeBtn.addEventListener('click', closeModal);
    
    // Delegates click events for dynamically created approve buttons
    appointmentsList.addEventListener('click', handleAppointmentAction);
}

// Navigate to previous month
function goToPreviousMonth() {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    renderCalendar();
}

// Navigate to next month
function goToNextMonth() {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    renderCalendar();
}

// Navigate to current month
function goToCurrentMonth() {
    currentDate = new Date();
    renderCalendar();
}

// Handle day click
function handleDayClick(event) {
    const dayElement = event.target.closest('.calendar-day');
    if (dayElement) {
        const dateKey = dayElement.dataset.date;
        if (dateKey) {
            selectedDate = new Date(dateKey);
            openAppointmentsModal(selectedDate);
        }
    }
}

// Open appointments review modal
function openAppointmentsModal(date) {
    const formattedDate = date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    modalTitle.textContent = `Appointments For ${formattedDate}`;
    
    // Clear previous appointments
    appointmentsList.innerHTML = '';
    
    const dateKey = formatDate(date);
    
    // Check if there are any appointments for this date
    if (appointments[dateKey] && appointments[dateKey].length > 0) {
        // Create a card for each appointment
        appointments[dateKey].forEach((appointment, index) => {
            const card = createAppointmentCard(appointment, dateKey, index);
            appointmentsList.appendChild(card);
        });
    } else {
        // No appointments for this date
        const noAppointments = document.createElement('p');
        noAppointments.textContent = 'No appointments scheduled for this date.';
        appointmentsList.appendChild(noAppointments);
    }
    
    appointmentModal.style.display = 'block';
}

// Create appointment card for the modal
function createAppointmentCard(appointment, dateKey, index) {
    const card = document.createElement('div');
    card.className = `appointment-card ${appointment.status}`;
    
    const header = document.createElement('div');
    header.className = 'appointment-header';
    
    const nameElement = document.createElement('div');
    nameElement.className = 'appointment-name';
    nameElement.textContent = appointment.name;
    
    const timeElement = document.createElement('div');
    timeElement.className = 'appointment-time';
    timeElement.textContent = appointment.time;
    
    header.appendChild(nameElement);
    header.appendChild(timeElement);
    card.appendChild(header);
    
    const details = document.createElement('div');
    details.className = 'appointment-details';
    
    const serviceElement = document.createElement('p');
    serviceElement.innerHTML = `<strong>Service:</strong> ${appointment.service}`;
    details.appendChild(serviceElement);
    
    const notesElement = document.createElement('p');
    notesElement.innerHTML = `<strong>Notes:</strong> ${appointment.notes || 'None'}`;
    details.appendChild(notesElement);
    
    const statusElement = document.createElement('p');
    statusElement.innerHTML = `<strong>Status:</strong> <span class="badge badge-${appointment.status}">${appointment.status}</span>`;
    details.appendChild(statusElement);
    
    card.appendChild(details);
    
    // Add actions only if appointment is pending
    if (appointment.status === 'pending') {
        const actions = document.createElement('div');
        actions.className = 'appointment-actions';
        
        const approveButton = document.createElement('button');
        approveButton.className = 'approve-btn';
        approveButton.textContent = 'Approve';
        approveButton.dataset.date = dateKey;
        approveButton.dataset.index = index;
        actions.appendChild(approveButton);
        
        card.appendChild(actions);
    }
    
    return card;
}

// Handle appointment actions (approve button click)
function handleAppointmentAction(event) {
    if (event.target.matches('.approve-btn')) {
        const dateKey = event.target.dataset.date;
        const index = parseInt(event.target.dataset.index);
        
        if (appointments[dateKey] && appointments[dateKey][index]) {
            // Update the appointment status
            appointments[dateKey][index].status = 'approved';
            
            // Save to localStorage
            localStorage.setItem('dentalAppointments', JSON.stringify(appointments));
            
            // Update the UI
            const card = event.target.closest('.appointment-card');
            card.className = 'appointment-card approved';
            
            // Update the status badge
            const statusBadge = card.querySelector('.badge');
            statusBadge.className = 'badge badge-approved';
            statusBadge.textContent = 'approved';
            
            // Remove the action buttons
            const actions = card.querySelector('.appointment-actions');
            actions.remove();
            
            // Refresh the calendar view
            renderCalendar();
        }
    }
}

// Close modal
function closeModal() {
    appointmentModal.style.display = 'none';
}

// Load saved appointments from localStorage
function loadSavedAppointments() {
    const savedAppointments = localStorage.getItem('dentalAppointments');
    if (savedAppointments) {
        appointments = JSON.parse(savedAppointments);
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    loadSavedAppointments();
    initCalendar();
});