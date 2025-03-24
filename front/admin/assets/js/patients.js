// patients.js

let patients = [
    {
        id: 1,
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "(555) 123-4567",
        address: "123 Main St, Anytown, USA",
        dateOfBirth: "1980-05-15",
        appointments: [
            {
                id: 1,
                date: "2025-03-01",
                time: "09:30",
                purpose: "Annual Check-up",
                doctor: "Dr. Sarah Johnson",
                notes: "Patient reported feeling well overall. Blood pressure normal."
            },
            {
                id: 2,
                date: "2025-01-15",
                time: "14:00",
                purpose: "Flu Symptoms",
                doctor: "Dr. Michael Chen",
                notes: "Prescribed antibiotics. Follow-up in 2 weeks if symptoms persist."
            }
        ]
    },
    {
        id: 2,
        name: "Jane Smith",
        email: "jane.smith@example.com",
        phone: "(555) 987-6543",
        address: "456 Oak Ave, Somewhere, USA",
        dateOfBirth: "1992-11-22",
        appointments: [
            {
                id: 3,
                date: "2025-02-20",
                time: "11:00",
                purpose: "Dental Cleaning",
                doctor: "Dr. Lisa Wong",
                notes: "No cavities found. Recommended flossing more regularly."
            }
        ]
    },
    {
        id: 3,
        name: "Robert Johnson",
        email: "robert.johnson@example.com",
        phone: "(555) 456-7890",
        address: "789 Pine St, Elsewhere, USA",
        dateOfBirth: "1975-08-30",
        appointments: []
    }
];

// Global variables
let nextPatientId = 4;
let nextAppointmentId = 4;
let currentPatientId = null;
let currentAppointmentId = null;
let patientToDelete = null;

// DOM Elements
const patientsListSection = document.getElementById('patientsListSection');
const patientFormSection = document.getElementById('patientFormSection');
const patientDetailsSection = document.getElementById('patientDetailsSection');
const appointmentFormSection = document.getElementById('appointmentFormSection');

const viewAllBtn = document.getElementById('viewAllBtn');
const addPatientBtn = document.getElementById('addPatientBtn');
const patientForm = document.getElementById('patientForm');
const appointmentForm = document.getElementById('appointmentForm');
const formTitle = document.getElementById('formTitle');
const appointmentFormTitle = document.getElementById('appointmentFormTitle');

const patientsTableBody = document.getElementById('patientsTableBody');
const appointmentsTableBody = document.getElementById('appointmentsTableBody');

const searchPatient = document.getElementById('searchPatient');
const cancelBtn = document.getElementById('cancelBtn');
const cancelAppointmentBtn = document.getElementById('cancelAppointmentBtn');
const backToListBtn = document.getElementById('backToListBtn');
const editPatientDetailsBtn = document.getElementById('editPatientDetailsBtn');
const addAppointmentBtn = document.getElementById('addAppointmentBtn');

// Modal elements
const deleteConfirmModal = document.getElementById('deleteConfirmModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const messageModal = document.getElementById('messageModal');
const modalMessage = document.getElementById('modalMessage');
const closeMessageBtn = document.getElementById('closeMessageBtn');

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    loadPatientsList();
    setupEventListeners();
});

// Event Listeners Setup
function setupEventListeners() {
    viewAllBtn.addEventListener('click', showPatientsList);
    addPatientBtn.addEventListener('click', showAddPatientForm);
    backToListBtn.addEventListener('click', showPatientsList);
    editPatientDetailsBtn.addEventListener('click', editCurrentPatient);
    addAppointmentBtn.addEventListener('click', showAddAppointmentForm);
    
    patientForm.addEventListener('submit', savePatient);
    cancelBtn.addEventListener('click', showPatientsList);
    appointmentForm.addEventListener('submit', saveAppointment);
    cancelAppointmentBtn.addEventListener('click', () => {
        showPatientDetails(currentPatientId);
    });
    
    searchPatient.addEventListener('input', filterPatients);
    
    confirmDeleteBtn.addEventListener('click', confirmDeletePatient);
    cancelDeleteBtn.addEventListener('click', () => toggleModal(deleteConfirmModal, false));
    closeMessageBtn.addEventListener('click', () => toggleModal(messageModal, false));
}

// Load and display patients list
function loadPatientsList() {
    patientsTableBody.innerHTML = '';
    
    patients.forEach(patient => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${patient.id}</td>
            <td>${patient.name}</td>
            <td>${patient.email}</td>
            <td>${patient.phone}</td>
            <td>
                <button class="view-btn" data-id="${patient.id}">View</button>
                <button class="edit-btn" data-id="${patient.id}">Edit</button>
                <button class="delete-btn" data-id="${patient.id}">Delete</button>
            </td>
        `;
        
        patientsTableBody.appendChild(row);
    });
    
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const patientId = parseInt(e.target.getAttribute('data-id'));
            showPatientDetails(patientId);
        });
    });
    
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const patientId = parseInt(e.target.getAttribute('data-id'));
            editPatient(patientId);
        });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const patientId = parseInt(e.target.getAttribute('data-id'));
            showDeleteConfirmation(patientId);
        });
    });
}

// Show add patient form
function showAddPatientForm() {
    setActiveSection(patientFormSection);
    setActiveSidebarButton(addPatientBtn);
    formTitle.textContent = 'Add New Patient';
    patientForm.reset();
    document.getElementById('patientId').value = '';
    document.getElementById('patientId').removeAttribute('readonly'); // Ensure ID is editable for new patients
    currentPatientId = null;
}

// Edit patient
function editPatient(patientId) {
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return;
    
    setActiveSection(patientFormSection);
    formTitle.textContent = 'Edit Patient';
    
    document.getElementById('patientId').value = patient.id;
    document.getElementById('patientId').setAttribute('readonly', 'readonly'); // Make ID readonly
    document.getElementById('name').value = patient.name;
    document.getElementById('email').value = patient.email;
    document.getElementById('phone').value = patient.phone;
    document.getElementById('address').value = patient.address;
    document.getElementById('dateOfBirth').value = patient.dateOfBirth;
    
    currentPatientId = patientId;
}

// Edit current patient from details view
function editCurrentPatient() {
    if (currentPatientId) editPatient(currentPatientId);
}

// Save patient (add or update)
function savePatient(e) {
    e.preventDefault();
    
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const address = document.getElementById('address').value;
    const dateOfBirth = document.getElementById('dateOfBirth').value;
    
    if (currentPatientId !== null) {
        // Update existing patient
        const patientIndex = patients.findIndex(p => p.id === currentPatientId);
        if (patientIndex !== -1) {
            patients[patientIndex] = {
                ...patients[patientIndex], // Keep existing id and appointments
                name,
                email,
                phone,
                address,
                dateOfBirth
            };
            showMessage('Patient updated successfully');
        }
    } else {
        // Add new patient
        const newPatient = {
            id: nextPatientId++,
            name,
            email,
            phone,
            address,
            dateOfBirth,
            appointments: []
        };
        
        patients.push(newPatient);
        showMessage('Patient added successfully');
    }
    
    loadPatientsList();
    showPatientsList();
    
    setTimeout(() => toggleModal(messageModal, false), 2000);
}

// Show patient details
function showPatientDetails(patientId) {
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return;
    
    setActiveSection(patientDetailsSection);
    
    document.getElementById('patientName').textContent = patient.name;
    document.getElementById('patientEmail').textContent = patient.email;
    document.getElementById('patientPhone').textContent = patient.phone;
    document.getElementById('patientAddress').textContent = patient.address || 'Not provided';
    document.getElementById('patientDOB').textContent = formatDate(patient.dateOfBirth) || 'Not provided';
    
    loadAppointmentsTable(patient.appointments);
    
    currentPatientId = patientId;
}

// Load appointments table
function loadAppointmentsTable(appointments) {
    appointmentsTableBody.innerHTML = '';
    
    if (appointments.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="6" class="text-center">No appointments found</td>';
        appointmentsTableBody.appendChild(row);
        return;
    }
    
    const sortedAppointments = [...appointments].sort((a, b) => {
        return new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time);
    });
    
    sortedAppointments.forEach(appointment => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(appointment.date)}</td>
            <td>${formatTime(appointment.time)}</td>
            <td>${appointment.purpose}</td>
            <td>${appointment.doctor}</td>
            <td>${appointment.notes || '-'}</td>
            <td>
                <button class="edit-btn edit-appointment-btn" data-id="${appointment.id}">Edit</button>
            </td>
        `;
        
        appointmentsTableBody.appendChild(row);
    });
    
    document.querySelectorAll('.edit-appointment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const appointmentId = parseInt(e.target.getAttribute('data-id'));
            editAppointment(appointmentId);
        });
    });
}

// Show add appointment form
function showAddAppointmentForm() {
    setActiveSection(appointmentFormSection);
    appointmentFormTitle.textContent = 'Add New Appointment';
    appointmentForm.reset();
    
    document.getElementById('appointmentId').value = '';
    document.getElementById('appointmentPatientId').value = currentPatientId;
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('appointmentDate').value = today;
    
    currentAppointmentId = null;
}

// Edit appointment
function editAppointment(appointmentId) {
    const patient = patients.find(p => p.id === currentPatientId);
    if (!patient) return;
    
    const appointment = patient.appointments.find(a => a.id === appointmentId);
    if (!appointment) return;
    
    setActiveSection(appointmentFormSection);
    appointmentFormTitle.textContent = 'Edit Appointment';
    
    document.getElementById('appointmentId').value = appointment.id;
    document.getElementById('appointmentPatientId').value = currentPatientId;
    document.getElementById('appointmentDate').value = appointment.date;
    document.getElementById('appointmentTime').value = appointment.time;
    document.getElementById('appointmentPurpose').value = appointment.purpose;
    document.getElementById('appointmentDoctor').value = appointment.doctor;
    document.getElementById('appointmentNotes').value = appointment.notes || '';
    
    currentAppointmentId = appointmentId;
}

// Save appointment (add or update)
function saveAppointment(e) {
    e.preventDefault();
    
    const appointmentIdInput = document.getElementById('appointmentId').value;
    const patientId = parseInt(document.getElementById('appointmentPatientId').value);
    const date = document.getElementById('appointmentDate').value;
    const time = document.getElementById('appointmentTime').value;
    const purpose = document.getElementById('appointmentPurpose').value;
    const doctor = document.getElementById('appointmentDoctor').value;
    const notes = document.getElementById('appointmentNotes').value;
    
    const patientIndex = patients.findIndex(p => p.id === patientId);
    if (patientIndex === -1) return;
    
    if (appointmentIdInput) {
        const appointmentId = parseInt(appointmentIdInput);
        const appointmentIndex = patients[patientIndex].appointments.findIndex(a => a.id === appointmentId);
        
        if (appointmentIndex !== -1) {
            patients[patientIndex].appointments[appointmentIndex] = {
                id: appointmentId,
                date,
                time,
                purpose,
                doctor,
                notes
            };
            showMessage('Appointment updated successfully');
        }
    } else {
        const newAppointment = {
            id: nextAppointmentId++,
            date,
            time,
            purpose,
            doctor,
            notes
        };
        
        patients[patientIndex].appointments.push(newAppointment);
        showMessage('Appointment added successfully');
    }
    
    showPatientDetails(patientId);
    
    setTimeout(() => toggleModal(messageModal, false), 2000);
}

// Show delete confirmation modal
function showDeleteConfirmation(patientId) {
    patientToDelete = patientId;
    toggleModal(deleteConfirmModal, true);
}

// Confirm delete patient
function confirmDeletePatient() {
    if (patientToDelete === null) return;
    
    const patientIndex = patients.findIndex(p => p.id === patientToDelete);
    if (patientIndex !== -1) {
        patients.splice(patientIndex, 1);
        showMessage('Patient deleted successfully');
        loadPatientsList();
    }
    
    patientToDelete = null;
    toggleModal(deleteConfirmModal, false);
    showPatientsList();
    
    setTimeout(() => toggleModal(messageModal, false), 2000);
}

// Show patients list section
function showPatientsList() {
    setActiveSection(patientsListSection);
    setActiveSidebarButton(viewAllBtn);
    loadPatientsList();
}

// Filter patients by search term
function filterPatients() {
    const searchTerm = searchPatient.value.toLowerCase();
    
    const filteredPatients = patients.filter(patient => {
        return (
            patient.name.toLowerCase().includes(searchTerm) ||
            patient.email.toLowerCase().includes(searchTerm) ||
            patient.phone.toLowerCase().includes(searchTerm)
        );
    });
    
    patientsTableBody.innerHTML = '';
    
    if (filteredPatients.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5" class="text-center">No patients found</td>';
        patientsTableBody.appendChild(row);
        return;
    }
    
    filteredPatients.forEach(patient => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${patient.id}</td>
            <td>${patient.name}</td>
            <td>${patient.email}</td>
            <td>${patient.phone}</td>
            <td>
                <button class="view-btn" data-id="${patient.id}">View</button>
                <button class="edit-btn" data-id="${patient.id}">Edit</button>
                <button class="delete-btn" data-id="${patient.id}">Delete</button>
            </td>
        `;
        
        patientsTableBody.appendChild(row);
    });
    
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const patientId = parseInt(e.target.getAttribute('data-id'));
            showPatientDetails(patientId);
        });
    });
    
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const patientId = parseInt(e.target.getAttribute('data-id'));
            editPatient(patientId);
        });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const patientId = parseInt(e.target.getAttribute('data-id'));
            showDeleteConfirmation(patientId);
        });
    });
}

// Set active section
function setActiveSection(section) {
    patientsListSection.classList.remove('active');
    patientFormSection.classList.remove('active');
    patientDetailsSection.classList.remove('active');
    appointmentFormSection.classList.remove('active');
    
    section.classList.add('active');
}

// Set active sidebar button
function setActiveSidebarButton(button) {
    viewAllBtn.classList.remove('active');
    addPatientBtn.classList.remove('active');
    
    button.classList.add('active');
}

// Toggle modal visibility
function toggleModal(modal, show) {
    if (show) {
        modal.classList.add('show');
    } else {
        modal.classList.remove('show');
    }
}

// Show message in modal
function showMessage(message) {
    modalMessage.textContent = message;
    toggleModal(messageModal, true);
}

// Format date for display
function formatDate(dateString) {
    if (!dateString) return '';
    
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

// Format time for display
function formatTime(timeString) {
    if (!timeString) return '';
    
    const [hours, minutes] = timeString.split(':');
    const date = new Date();
    date.setHours(parseInt(hours));
    date.setMinutes(parseInt(minutes));
    
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}