// assets/js/search.js

document.addEventListener('DOMContentLoaded', function() {
    // Search functionality
    console.log('Search script loaded and running');
    const searchForm = document.querySelector('.search-form');
    const searchInput = document.getElementById('searchInput');
    const searchToggle = document.querySelector('.search-bar-toggle');
    const searchButton = searchForm ? searchForm.querySelector('button[type="submit"]') : null;
    
    // Create toast notification element for search alerts
    createSearchToast();
    
    // Toggle search bar on mobile
    if (searchToggle) {
      searchToggle.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelector('.search-bar').classList.toggle('search-bar-show');
        
        // Focus on search input when showing search bar
        if (document.querySelector('.search-bar').classList.contains('search-bar-show')) {
          searchInput.focus();
        }
      });
    }
    
    // Focus event - validate on focus
    if (searchInput) {
      searchInput.addEventListener('focus', function() {
        // Clear any previous error styling
        this.classList.remove('is-invalid');
        
        // Show placeholder text animation or effect if needed
        this.placeholder = "Type to search...";
      });
      
      const searchButton = document.getElementById('searchButton');
if (searchButton) {
  searchButton.addEventListener('click', function() {
    const query = searchInput.value.trim();
    if (query.length > 0) {
      performSearch(query);
    } else {
      showSearchToast('Please enter a keyword to search');
    }
  });
}
      
      // Blur event - restore placeholder
      searchInput.addEventListener('blur', function() {
        this.placeholder = "Search";
      });
    }
    
    // Handle search icon click - focus on input
    if (searchButton) {
      searchButton.addEventListener('click', function(e) {
        if (!searchForm) return;
        
        // If the input is empty, prevent form submission and show error
        if (searchInput.value.trim().length === 0) {
          e.preventDefault();
          searchInput.classList.add('is-invalid');
          showSearchToast('Please enter a keyword to search');
          searchInput.focus();
        }
      });
    }
  
    // Handle search submission
    if (searchForm) {
      searchForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const query = searchInput.value.trim();
        
        if (query.length > 0) {
          // Save search query to sessionStorage so it persists between pages
          sessionStorage.setItem('lastSearchQuery', query);
          
          // Remove any validation errors
          searchInput.classList.remove('is-invalid');
          
          // Perform search
          performSearch(query);
        } else {
          // Show validation error
          searchInput.classList.add('is-invalid');
          showSearchToast('Please enter a keyword to search');
          searchInput.focus();
        }
      });
    }
  
    // Restore search input value from sessionStorage when page loads
    if (searchInput && sessionStorage.getItem('lastSearchQuery')) {
      searchInput.value = sessionStorage.getItem('lastSearchQuery');
      
      // Enable search button if there's a saved query
      if (searchButton && searchInput.value.trim().length > 0) {
        searchButton.classList.remove('disabled');
      }
    }
  
    // Function to create and append search toast element
    function createSearchToast() {
      const toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
      toastContainer.id = 'searchToastContainer';
      
      // Create the toast element
      const toast = document.createElement('div');
      toast.id = 'searchToast';
      toast.className = 'toast align-items-center text-white bg-danger';
      toast.setAttribute('role', 'alert');
      toast.setAttribute('aria-live', 'assertive');
      toast.setAttribute('aria-atomic', 'true');
      
      // Create toast content
      toast.innerHTML = `
        <div class="d-flex">
          <div class="toast-body" id="searchToastMessage">
            Please enter a search keyword
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      `;
      
      // Append to container and to body
      toastContainer.appendChild(toast);
      document.body.appendChild(toastContainer);
    }
    
    // Function to show toast with a message
    function showSearchToast(message) {
      const toastEl = document.getElementById('searchToast');
      const messageEl = document.getElementById('searchToastMessage');
      
      if (toastEl && messageEl) {
        messageEl.textContent = message;
        
        // Use Bootstrap's Toast API if available, otherwise fallback
        if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
          const toast = new bootstrap.Toast(toastEl);
          toast.show();
        } else {
          // Simple fallback if Bootstrap JS is not loaded
          toastEl.classList.add('show');
          setTimeout(() => {
            toastEl.classList.remove('show');
          }, 3000);
        }
      }
    }
  
    // Enhanced search function with different search types
    function performSearch(query) {
      console.log('Searching for:', query);
      
      // Track search in analytics if available
      if (typeof gtag === 'function') {
        gtag('event', 'search', {
          search_term: query
        });
      }
      
      // Save to recent searches (limit to 5 recent searches)
      saveRecentSearch(query);
      
      // Determine search type based on query patterns
      if (query.startsWith('#')) {
        // Tag search
        searchByTag(query.substring(1));
      } else if (query.includes(':')) {
        // Field-specific search (e.g. "author:Smith")
        const [field, value] = query.split(':');
        searchByField(field.trim(), value.trim());
      } else {
        // General search - redirect to search results page
        window.location.href = 'search-results.html?q=' + encodeURIComponent(query);
      }
    }
    
    // Save recent searches to localStorage
    function saveRecentSearch(query) {
      let recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');
      
      // Remove if already exists (to move it to the top)
      recentSearches = recentSearches.filter(item => item.toLowerCase() !== query.toLowerCase());
      
      // Add to beginning of array
      recentSearches.unshift(query);
      
      // Limit to 5 items
      if (recentSearches.length > 5) {
        recentSearches = recentSearches.slice(0, 5);
      }
      
      // Save back to localStorage
      localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
    }
    
    // Tag search implementation
    function searchByTag(tag) {
      console.log('Searching for tag:', tag);
      window.location.href = 'search-results.html?tag=' + encodeURIComponent(tag);
    }
    
    // Field-specific search implementation
    function searchByField(field, value) {
      console.log(`Searching for ${field}:`, value);
      window.location.href = `search-results.html?field=${encodeURIComponent(field)}&value=${encodeURIComponent(value)}`;
    }
    
    // Add recent searches dropdown (if you want this feature)
    function setupRecentSearchesDropdown() {
      // Check if the recent searches dropdown element exists
      const recentSearchesDropdown = document.getElementById('recentSearchesDropdown');
      if (!recentSearchesDropdown) return;
      
      // Get recent searches from localStorage
      const recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');
      
      // Clear existing items
      recentSearchesDropdown.innerHTML = '';
      
      // Add header
      const header = document.createElement('h6');
      header.className = 'dropdown-header';
      header.textContent = 'Recent Searches';
      recentSearchesDropdown.appendChild(header);
      
      // Add divider
      const divider = document.createElement('div');
      divider.className = 'dropdown-divider';
      recentSearchesDropdown.appendChild(divider);
      
      // Add search items
      if (recentSearches.length > 0) {
        recentSearches.forEach(search => {
          const item = document.createElement('a');
          item.className = 'dropdown-item';
          item.href = '#';
          item.textContent = search;
          
          item.addEventListener('click', function(e) {
            e.preventDefault();
            searchInput.value = search;
            searchForm.dispatchEvent(new Event('submit'));
          });
          
          recentSearchesDropdown.appendChild(item);
        });
      } else {
        // No recent searches
        const noResults = document.createElement('span');
        noResults.className = 'dropdown-item-text text-muted';
        noResults.textContent = 'No recent searches';
        recentSearchesDropdown.appendChild(noResults);
      }
      
      // Add clear all option if there are searches
      if (recentSearches.length > 0) {
        const clearDivider = document.createElement('div');
        clearDivider.className = 'dropdown-divider';
        recentSearchesDropdown.appendChild(clearDivider);
        
        const clearAll = document.createElement('a');
        clearAll.className = 'dropdown-item text-danger';
        clearAll.href = '#';
        clearAll.textContent = 'Clear All';
        
        clearAll.addEventListener('click', function(e) {
          e.preventDefault();
          localStorage.removeItem('recentSearches');
          setupRecentSearchesDropdown(); // Refresh the dropdown
        });
        
        recentSearchesDropdown.appendChild(clearAll);
      }
    }
    
    // Call this function to initialize the recent searches dropdown if you have that feature
    // setupRecentSearchesDropdown();
  });