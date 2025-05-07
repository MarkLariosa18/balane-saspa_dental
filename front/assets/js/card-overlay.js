document.addEventListener('DOMContentLoaded', function () {
  // Get all service cards
  const serviceCards = document.querySelectorAll('.service-item');
  console.log('Service cards found:', serviceCards.length);

  // Create overlay elements
  const overlay = document.createElement('div');
  overlay.className = 'image-overlay fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center transition-opacity duration-300';
  overlay.style.display = 'none'; // Initially hidden

  // Create container for image and text
  const contentContainer = document.createElement('div');
  contentContainer.className = 'bg-white rounded-2xl shadow-lg w-full max-w-4xl mx-4 flex flex-col md:flex-row overflow-hidden transform transition-transform duration-300 scale-95';

  // Create image container
  const imageContainer = document.createElement('div');
  imageContainer.className = 'md:w-1/2 flex items-center justify-center p-6 bg-gray-100';

  // Create image element
  const overlayImg = document.createElement('img');
  overlayImg.className = 'max-w-full max-h-96 object-contain rounded-lg';
  overlayImg.alt = 'Service Image';
  overlayImg.src = 'https://via.placeholder.com/300'; // Fallback image

  // Add image to container
  imageContainer.appendChild(overlayImg);

  // Create text panel
  const textPanel = document.createElement('div');
  textPanel.className = 'md:w-1/2 p-6 md:p-8 flex flex-col justify-between bg-white';

  // Create title and description elements
  const panelTitle = document.createElement('h2');
  panelTitle.className = 'text-2xl md:text-3xl font-bold text-gray-800 mb-4 font-poppins';
  panelTitle.textContent = 'Service Details';

  const panelDescription = document.createElement('p');
  panelDescription.className = 'text-gray-600 text-base md:text-lg leading-relaxed mb-6 font-poppins';
  panelDescription.textContent = 'Details about this service will appear here.';

  // Append elements to the panel
  textPanel.appendChild(panelTitle);
  textPanel.appendChild(panelDescription);

  // Build the content container
  contentContainer.appendChild(imageContainer);
  contentContainer.appendChild(textPanel);

  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '×';
  closeBtn.className = 'absolute top-4 right-4 text-white text-2xl font-bold bg-primary bg-opacity-80 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-100 transition-colors duration-200 focus:outline-none';
  closeBtn.setAttribute('aria-label', 'Close overlay');

  // Build the overlay
  overlay.appendChild(contentContainer);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);

  // Add click event to each card
  serviceCards.forEach(card => {
    card.addEventListener('click', function (e) {
      e.preventDefault(); // Prevent default behavior
      console.log('Card clicked:', card);

      // Get content from the card
      const imgElement = card.querySelector('img');
      const cardTitleElement = card.querySelector('h3');
      
      if (!imgElement || !cardTitleElement) {
        console.error('Missing image or title in service card:', card);
        overlayImg.src = 'https://via.placeholder.com/300';
        panelTitle.textContent = 'Service Details';
        panelDescription.textContent = 'Details about this service will appear here.';
      } else {
        overlayImg.src = imgElement.src;
        panelTitle.textContent = cardTitleElement.textContent;
        console.log('Setting overlay content:', {
          imgSrc: imgElement.src,
          title: cardTitleElement.textContent
        });
      }

      // Set custom description based on card title
      setCardDescription(cardTitleElement ? cardTitleElement.textContent : '', panelDescription, textPanel);

      // Show the overlay with animation
      overlay.style.display = 'flex';
      overlay.style.opacity = '0';
      contentContainer.style.transform = 'scale(0.95)';
      setTimeout(() => {
        overlay.style.opacity = '1';
        contentContainer.style.transform = 'scale(1)';
      }, 10);
      document.body.style.overflow = 'hidden';
    });
  });

  // Close overlay when clicking close button or outside the content
  closeBtn.addEventListener('click', closeOverlay);

  // Add event listener for keyboard (ESC key)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeOverlay();
    }
  });

  // Close overlay when clicking outside the content
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) {
      closeOverlay();
    }
  });

  // Prevent clicks inside the content container from closing the overlay
  contentContainer.addEventListener('click', function (e) {
    e.stopPropagation();
  });

  /**
   * Close the overlay and clean up
   */
  function closeOverlay() {
    overlay.style.opacity = '0';
    contentContainer.style.transform = 'scale(0.95)';
    setTimeout(() => {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
      // Clear any additional content
      while (textPanel.childNodes.length > 2) {
        textPanel.removeChild(textPanel.lastChild);
      }
    }, 300);
  }

  /**
   * Set description content based on card title
   * @param {string} cardTitle - The title of the card
   * @param {HTMLElement} descriptionElement - The description element
   * @param {HTMLElement} panelElement - The parent panel element
   */
  function setCardDescription(cardTitle, descriptionElement, panelElement) {
    let description = "Details about this service will appear here.";
    let additionalInfo;

    switch (cardTitle.trim()) {
      case "Consultation":
        description = "Professional examination and discussion about your oral health status and treatment options.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Initial consultation</li>
            <li>Follow-up sessions</li>
            <li>Online consultation</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p class="mb-2">Book your appointment by calling (+63) 920 797 6690 or emailing dmdannsaspa@yahoo.com</p>
            <p>Available Schedule: Monday - Saturday, 11AM to 4PM</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Oral Prophylaxis":
        description = "Professional cleaning procedure to remove plaque, tartar, and stains from the teeth to prevent oral diseases.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Light</li>
            <li>Moderate</li>
            <li>Heavy</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>The procedure typically includes scaling, polishing, and sometimes fluoride treatment to protect the teeth from decay.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Restorations Temporary Filling":
        description = "Dental restoration used to protect a tooth until a permanent filling or other treatment can be completed.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Small</li>
            <li>Medium</li>
            <li>Large</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>Temporary fillings are usually made from soft materials like zinc oxide eugenol, glass ionomer, or composite resin.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Composite Filling":
        description = "Type of dental filling made from a tooth-colored resin material that is used to repair cavities, cracks, or fractures in teeth.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Small</li>
            <li>Medium</li>
            <li>Large</li>
            <li>Anterior</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>It is designed to blend naturally with the surrounding tooth structure, making it a popular choice for both front and back teeth.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Surgery Extraction":
        description = "Tooth removal procedure that involves making an incision in the gum and possibly removing bone to extract the tooth.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Deciduous ant/post</li>
            <li>Anterior</li>
            <li>Posterior</li>
            <li>Canine</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>A surgical extraction may involve stitches to help the gums heal properly. It is usually done under local anesthesia or sedation for comfort.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Special Case":
        description = "Unique or complex dental conditions that require specialized treatment approaches.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Mesio/Distoangular</li>
            <li>Upright Position</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>One of the most common special cases in oral surgery is the extraction of impacted wisdom teeth, which may be positioned abnormally, requiring advanced surgical techniques.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Prosthodontic":
        description = "Focuses on the design, creation, and fitting of artificial teeth to restore oral function, appearance, and comfort.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
 Tallahassee, FL 32304
            <li>Removable Partial Ordinary Acrylic/Stayplate</li>
            <li>1-2 units plastic</li>
            <li>3-4 units plastic</li>
            <li>5 or more units plastic</li>
            <li>Wire clasps</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>Replacing missing teeth and restoring damaged oral structures to improve a patient’s ability to chew, speak, and smile.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Casted Metal":
        description = "Metal framework or structure that is precisely fabricated using a casting process for dental restorations.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Unilateral</li>
            <li>Bilateral</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>Casted metal dentures are stronger and thinner compared to acrylic-only dentures and provide better support and fit due to their rigid structure.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Jacket Crown":
        description = "Full-coverage dental crown to restore and protect damaged, discolored, or weakened teeth while maintaining a natural appearance.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Plastic with or without metal backing</li>
            <li>Porcelain fused to metal</li>
            <li>Tilite</li>
            <li>Ceramage</li>
            <li>Emax</li>
            <li>Zirconia</li>
            <li>Anterior</li>
            <li>Posterior</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>Primarily made of tooth-colored material (such as porcelain or ceramic).</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Laminates":
        description = "Ultra-thin, tooth-colored shells made of porcelain or composite material, designed to cover the front surface of teeth for cosmetic enhancement.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Anterior</li>
            <li>Posterior</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>They are a minimally invasive solution for improving tooth color, shape, and alignment with little to no enamel removal.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Veneers":
        description = "Thin, custom-made shell of porcelain or composite resin that covers the front surface of a tooth to improve its appearance.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Anterior</li>
            <li>Posterior</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>Commonly used in cosmetic dentistry to enhance smiles by addressing imperfections such as discoloration, chips, gaps, and minor misalignment.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Complete Denture":
        description = "Removable dental prosthesis used to replace all missing teeth in the upper or lower jaw.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Plastic new ace</li>
            <li>New ace px</li>
            <li>Bioform</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>Made from acrylic resin, metal, or a combination of both and are supported by the gums and underlying bone.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Flexite":
        description = "Type of flexible denture material used in removable partial dentures (RPDs).";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Unilateral</li>
            <li>Bilateral</li>
            <li>Anteropostero</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>It is made from biocompatible, lightweight, and flexible thermoplastic resin, offering improved comfort and aesthetics.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Retainers":
        description = "Custom-made dental appliance used to hold teeth in place after orthodontic treatment.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Up/down</li>
            <li>Up/down w/ pontic</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>Retainers help prevent teeth from shifting back to their original position.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Repair of Denture":
        description = "Denture repair refers to the process of fixing broken, worn-out, or ill-fitting dentures to restore their function and comfort.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Rebasing u/l</li>
            <li>Relining u/l</li>
            <li>Crack denture</li>
            <li>Crown recementation</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>It can involve rebasing, relining, repairing cracks, or recementing crowns on dentures.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Fiber Post":
        description = "Small, flexible, and lightweight post made of glass or carbon fiber that is placed inside a root canal-treated tooth.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Anterior</li>
            <li>Posterior</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>It is commonly used in restorative dentistry to reinforce weak teeth after a root canal treatment (RCT).</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Root Canal":
        description = "Used to treat an infected or damaged tooth pulp (the soft tissue inside the tooth containing nerves and blood vessels).";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Mono rooted</li>
            <li>Multi rooted/canal</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>The procedure involves removing the infected pulp, cleaning and disinfecting the root canals, filling with biocompatible material, and sealing the tooth.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Pediatrics":
        description = "Specializes in the oral health of children from infancy through adolescence.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>OP and Fluoride</li>
            <li>Pulpotomy</li>
            <li>Stainless steel crown</li>
            <li>Strip off crown</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>It focuses on preventive care, early detection, and treatment of dental issues in children.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Sealant":
        description = "Thin, protective coating applied to the chewing surfaces of teeth to prevent cavities.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Premolar</li>
            <li>Molar</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>It acts as a barrier against food particles and bacteria, reducing the risk of tooth decay.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Orthodontics":
        description = "Specialized dental treatment focused on correcting misaligned teeth and jaws.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4 font-poppins">
            <li>Conventional</li>
            <li>Self-ligating</li>
            <li>Depends on severity of the case</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-primary text-primary rounded-lg font-poppins">
            <p>Orthodontic treatments improve bite function, aesthetics, and oral health through braces or aligners.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      default:
        description = "Detailed information about this dental service. Contact us for specific pricing and availability.";
    }

    // Set the description
    descriptionElement.textContent = description;
  }

  // Add custom styles to ensure consistency with index.html
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --primary: #007bff;
      --accent: #0056b3;
      --light: #ffffff;
      --text: #333333;
    }
    .image-overlay {
      opacity: 0;
      font-family: 'Poppins', sans-serif;
    }
    .bg-primary {
      background-color: var(--primary);
    }
    .text-primary {
      color: var(--primary);
    }
    .border-primary {
      border-color: var(--primary);
    }
    .font-poppins {
      font-family: 'Poppins', sans-serif;
    }
    @media (max-width: 768px) {
      .image-overlay .bg-white {
        flex-direction: column;
      }
      .image-overlay .md\\:w-1/2 {
        width: 100%;
      }
      .image-overlay img {
        max-height: 50vh;
      }
    }
  `;
  document.head.appendChild(style);
});