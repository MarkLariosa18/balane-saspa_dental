    document.addEventListener('DOMContentLoaded', function() {
    const seeMoreBtn = document.getElementById('see-more-btn');
    const hiddenCards = document.querySelectorAll('.service-card-hidden');
    const visibleCardsContainer = document.querySelector('.visible-cards-container');
    let isExpanded = false;
    
    // Create a placeholder to remember the original position
    const buttonPlaceholder = document.createElement('div');
    buttonPlaceholder.style.display = 'none';
    seeMoreBtn.parentNode.insertBefore(buttonPlaceholder, seeMoreBtn);
    
    // Store original parent for later use
    const originalParent = seeMoreBtn.parentNode;
    
    // Create a container for the button when moved
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'button-container';
    buttonContainer.style.marginTop = '20px';
    buttonContainer.style.textAlign = 'center';
    
    seeMoreBtn.addEventListener('click', function(event) {
      // Prevent default behavior (like navigating to href)
      event.preventDefault();
      
      isExpanded = !isExpanded;
      
      hiddenCards.forEach(card => {
        card.style.display = isExpanded ? 'block' : 'none';
        
        // Animation when showing cards
        if (isExpanded) {
          card.setAttribute('data-aos', 'fade-up');
          // Reset AOS animation if it's being used
          if (typeof AOS !== 'undefined') {
            setTimeout(() => {
              AOS.refresh();
            }, 10);
          }
        }
      });
      
      // Update button text
      seeMoreBtn.textContent = isExpanded ? 'See Less' : 'See More';
      
      if (isExpanded) {
        // Move button after the last hidden card
        const lastHiddenCard = hiddenCards[hiddenCards.length - 1];
        if (lastHiddenCard) {
          // Move button to new container
          buttonContainer.appendChild(seeMoreBtn);
          lastHiddenCard.parentNode.insertBefore(buttonContainer, lastHiddenCard.nextSibling);
          
          // Scroll to the button's new position
          setTimeout(() => {
            seeMoreBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        }
      } else {
        // Return button to original position
        originalParent.insertBefore(seeMoreBtn, buttonPlaceholder.nextSibling);
        
        // If visible cards container exists, scroll there
        if (visibleCardsContainer) {
          setTimeout(() => {
            visibleCardsContainer.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      }
    });
    
    // Additional prevention for anchor tags
    if (seeMoreBtn.tagName === 'A' && seeMoreBtn.getAttribute('href')) {
      seeMoreBtn.addEventListener('click', function(event) {
        event.preventDefault();
      });
    }
  });