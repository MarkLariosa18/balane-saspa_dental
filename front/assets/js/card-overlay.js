document.addEventListener('DOMContentLoaded', function () {
  // Get all service cards
  const serviceCards = document.querySelectorAll('.service-item .card');

  // Create overlay elements
  const overlay = document.createElement('div');
  overlay.className = 'image-overlay fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center transition-opacity duration-300';

  // Create container for image and text
  const contentContainer = document.createElement('div');
  contentContainer.className = 'bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 md:mx-0 flex flex-col md:flex-row overflow-hidden transform transition-transform duration-300 scale-95';

  // Create image container
  const imageContainer = document.createElement('div');
  imageContainer.className = 'md:w-1/2 flex items-center justify-center p-6 bg-gray-50';

  // Create image element
  const overlayImg = document.createElement('img');
  overlayImg.className = 'max-w-full max-h-96 object-contain rounded-lg';

  // Add image to container
  imageContainer.appendChild(overlayImg);

  // Create text panel
  const textPanel = document.createElement('div');
  textPanel.className = 'md:w-1/2 p-8 flex flex-col justify-between bg-white';

  // Create title and description elements
  const panelTitle = document.createElement('h2');
  panelTitle.className = 'text-2xl md:text-3xl font-bold text-gray-800 mb-4';

  const panelDescription = document.createElement('p');
  panelDescription.className = 'text-gray-600 text-base md:text-lg leading-relaxed mb-6';

  // Append elements to the panel
  textPanel.appendChild(panelTitle);
  textPanel.appendChild(panelDescription);

  // Build the content container
  contentContainer.appendChild(imageContainer);
  contentContainer.appendChild(textPanel);

  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '×';
  closeBtn.className = 'absolute top-4 right-4 text-white text-3xl font-bold bg-gray-800 bg-opacity-50 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-75 transition-colors duration-200 focus:outline-none';

  // Build the overlay
  overlay.appendChild(contentContainer);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);

  // Add click event to each card
  serviceCards.forEach(card => {
    card.addEventListener('click', function () {
      // Get content from the card
      const imgSrc = this.querySelector('img').src;
      const cardTitle = this.closest('.service-item').querySelector('h3').textContent;

      // Set the overlay content
      overlayImg.src = imgSrc;
      panelTitle.textContent = cardTitle;

      // Set custom description based on card title
      setCardDescription(cardTitle, panelDescription, textPanel);

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
    // Default description
    let description = "Details about this service will appear here.";
    let additionalInfo;

    switch (cardTitle) {
      case "Consultation":
        description = "Professional examination and discussion about your oral health status and treatment options.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Initial consultation</li>
            <li>Follow-up sessions</li>
            <li>Online consultation</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Light</li>
            <li>Moderate</li>
            <li>Heavy</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Small</li>
            <li>Medium</li>
            <li>Large</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Small</li>
            <li>Medium</li>
            <li>Large</li>
            <li>Anterior</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Deciduous ant/post</li>
            <li>Anterior</li>
            <li>Posterior</li>
            <li>Canine</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Mesio/Distoangular</li>
            <li>Upright Position</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Removable Partial Ordinary Acrylic/Stayplate</li>
            <li>1-2 units plastic</li>
            <li>3-4 units plastic</li>
            <li>5 or more units plastic</li>
            <li>Wire clasps</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Unilateral</li>
            <li>Bilateral</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Plastic with or without metal backing</li>
            <li>Porcelain fused to metal</li>
            <li>Tilite</li>
            <li>Ceramage</li>
            <li>Emax</li>
            <li>Zirconia</li>
            <li>Anterior</li>
            <li>Posterior</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Anterior</li>
            <li>Posterior</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Anterior</li>
            <li>Posterior</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Plastic new ace</li>
            <li>New ace px</li>
            <li>Bioform</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Unilateral</li>
            <li>Bilateral</li>
            <li>Anteropostero</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Up/down</li>
            <li>Up/down w/ pontic</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Rebasing u/l</li>
            <li>Relining u/l</li>
            <li>Crack denture</li>
            <li>Crown recementation</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Anterior</li>
            <li>Posterior</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Mono rooted</li>
            <li>Multi rooted/canal</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>OP and Fluoride</li>
            <li>Pulpotomy</li>
            <li>Stainless steel crown</li>
            <li>Strip off crown</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
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
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Premolar</li>
            <li>Molar</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
            <p>It acts as a barrier against food particles and bacteria, reducing the risk of tooth decay.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Orthodontic":
        description = "Focuses on diagnosing, preventing, and correcting misaligned teeth and jaw problems.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Conventional</li>
            <li>Self-ligating</li>
            <li>Depends on severity of the case</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
            <p>Orthodontic treatments help improve dental function, aesthetics, and overall oral health by using braces, aligners, and other corrective devices.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "CNDA Pricelist":
        description = "Come to the clinic for the latest pricelist and best deals.";
        additionalInfo = document.createElement('div');
        additionalInfo.className = 'mt-4';
        additionalInfo.innerHTML = `
          <ul class="list-disc list-inside text-gray-600 mb-4">
            <li>Consultation</li>
            <li>Oral Prophylaxis</li>
            <li>Restorations Temporary Filling</li>
            <li>Composite Filling</li>
            <li>Surgery Extraction</li>
            <li>Special Case</li>
            <li>Prosthodontic</li>
            <li>Casted Metal</li>
            <li>Jacket Crown</li>
            <li>Laminates</li>
            <li>Veneers</li>
            <li>Complete Denture</li>
            <li>Flexite</li>
            <li>Retainers</li>
            <li>Repair of Denture</li>
            <li>Fiber Post</li>
            <li>Root Canal</li>
            <li>Pediatrics</li>
            <li>Sealant</li>
            <li>Orthodontic</li>
          </ul>
          <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded-lg">
            <p>Depending on the severity of the case.</p>
          </div>
        `;
        panelElement.appendChild(additionalInfo);
        break;

      case "Imelda":
        description = "Professional cleaning procedure to remove plaque and tartar. Available in light, moderate, and heavy treatments depending on your needs.";
        break;

      default:
        description = "Detailed information about this dental service. Contact us for specific pricing and availability.";
    }

    // Set the description
    descriptionElement.textContent = description;
  }

  // Add Tailwind CSS CDN and custom styles
  const tailwindScript = document.createElement('script');
  tailwindScript.src = 'https://cdn.tailwindcss.com';
  document.head.appendChild(tailwindScript);

  const style = document.createElement('style');
  style.textContent = `
    .image-overlay {
      opacity: 0;
    }
    .image-overlay.show {
      opacity: 1;
    }
    @media (max-width: 768px) {
      .image-overlay .bg-white {
        flex-direction: column;
      }
      .image-overlay .md\\:w-1\\/2 {
        width: 100%;
      }
    }
  `;
  document.head.appendChild(style);
});