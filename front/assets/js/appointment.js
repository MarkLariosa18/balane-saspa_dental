const datetimeInput = document.getElementById('appointment');
const formattedDisplay = document.getElementById('formatted-datetime');
const placeholder = document.querySelector('.datetime-placeholder');

// Set minimum date to today (disables past dates)
function setMinDateTime() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const hours = String(today.getHours()).padStart(2, '0');
  const minutes = String(today.getMinutes()).padStart(2, '0');
  
  // Format: YYYY-MM-DDThh:mm
  const minDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
  datetimeInput.setAttribute('min', minDateTime);
}

// Format the datetime when selected
function updateFormattedDisplay() {
  if (datetimeInput.value) {
    const dateObj = new Date(datetimeInput.value);
    
    // Format the date as "Day, Month Date, Year at Hour:Minute AM/PM"
    const options = { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    
    formattedDisplay.textContent = dateObj.toLocaleDateString('en-US', options).replace(',', ' at');
    
    // Hide placeholder when value is selected
    placeholder.style.opacity = "0";
  } else {
    formattedDisplay.textContent = '';
    placeholder.style.opacity = "1";
  }
}

// Initialize the functionality
document.addEventListener('DOMContentLoaded', function() {
  // Set minimum date to prevent past dates
  setMinDateTime();
  
  // Update the minimum datetime every minute to ensure it stays current
  setInterval(setMinDateTime, 60000);
  
  // Update the formatted display whenever the input changes
  datetimeInput.addEventListener('input', updateFormattedDisplay);
  datetimeInput.addEventListener('change', updateFormattedDisplay);
  
  // Check if there's an initial value
  updateFormattedDisplay();
});