document.addEventListener('DOMContentLoaded', function () {
  // Get all service cards
  const serviceCards = document.querySelectorAll('.service-item .card');

  // Create overlay elements
  const overlay = document.createElement('div');
  overlay.className = 'image-overlay';

  // Create container for image and text - Changed to column layout
  const contentContainer = document.createElement('div');
  contentContainer.style.cssText = 'display: flex; flex-direction: column; width: 90%; height: 90%; margin: auto; position: relative; top: 50%; transform: translateY(-50%); max-width: 1000px;';

  // Create image container
  const imageContainer = document.createElement('div');
  imageContainer.style.cssText = 'display: flex; justify-content: center; align-items: center; height: 60%;';

  // Create image element
  const overlayImg = document.createElement('img');
  overlayImg.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;';

  // Add image to container
  imageContainer.appendChild(overlayImg);

  // Create text panel - Now positioned below the image
  const textPanel = document.createElement('div');
  textPanel.style.cssText = 'background-color: white; padding: 30px; flex: 1; margin-top: 20px; overflow-y: auto; display: flex; flex-direction: column; justify-content: flex-start;';

  // Create title and description elements
  const panelTitle = document.createElement('h2');
  panelTitle.style.cssText = 'margin-bottom: 15px; color: #333; font-size: 24px;';

  const panelDescription = document.createElement('p');
  panelDescription.style.cssText = 'color: #666; font-size: 16px; line-height: 1.6;';

  // Append elements to the panel
  textPanel.appendChild(panelTitle);
  textPanel.appendChild(panelDescription);

  // Build the content container - Now in column layout
  contentContainer.appendChild(imageContainer);
  contentContainer.appendChild(textPanel);

  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '×';
  closeBtn.style.cssText = 'position: absolute; top: 10px; right: 10px; background: none; border: none; color: white; font-size: 30px; cursor: pointer; z-index: 1001;';

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

          // Show the overlay
          overlay.style.display = 'flex';
          document.body.style.overflow = 'hidden'; // Prevent scrolling when overlay is open
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
      overlay.style.display = 'none';
      document.body.style.overflow = ''; // Restore scrolling
      // Clear any additional content
      while (textPanel.childNodes.length > 2) {
          textPanel.removeChild(textPanel.lastChild);
      }
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

    switch (cardTitle) {
        case "Consultation":
            description = "Professional examination and discussion about your oral health status and treatment options.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Initial consultation</li>
                    <li style="margin-bottom: 10px;">Follow-up sessions</li>
                    <li style="margin-bottom: 10px;">Online consultation</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Book your appointment by calling us</p>
                    <p style="margin: 0;">(+63) 920 797 6690 or emailing dmdannsaspa@yahoo.com</p>
                    <p style="margin: 0;">Available Schedule: Monday - Saturday, 9AM to 4PM</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Oral Prophylaxis":
            description = "Professional cleaning procedure to remove plaque, tartar(calculus), and stains from the teeth to prevent oral diseases such as cavities and gum disease.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Light</li>
                    <li style="margin-bottom: 10px;">Moderate</li>
                    <li style="margin-bottom: 10px;">Heavy</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">The procedure typically includes scaling, polishing, and sometimes fluoride treatment to protect the teeth from decay.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Restorations Temporary Filling":
            description = "Dental restoration used to protect a tooth until a permanent filling or other treatment can be completed.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Small</li>
                    <li style="margin-bottom: 10px;">Medium</li>
                    <li style="margin-bottom: 10px;">Large</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Temporary fillings are usually made from soft materials like zinc oxide eugenol, glass ionomer, or composite resin.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Composite Filling":
            description = "Type of dental filling made from a tooth-colored resin material that is used to repair cavities, cracks, or fractures in teeth.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Small</li>
                    <li style="margin-bottom: 10px;">Medium</li>
                    <li style="margin-bottom: 10px;">Large</li>
                    <li style="margin-bottom: 10px;">Anterior</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">It blends naturally with the surrounding tooth structure, making it a popular choice for both front and back teeth.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Surgery Extraction":
            description = "Tooth removal procedure that involves making an incision in the gum and possibly removing bone to extract the tooth.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Deciduous ant/post</li>
                    <li style="margin-bottom: 10px;">Anterior</li>
                    <li style="margin-bottom: 10px;">Posterior</li>
                    <li style="margin-bottom: 10px;">Canine</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Usually done under local anesthesia or sedation for comfort.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Special Case":
            description = "Unique or complex dental conditions that require specialized treatment approaches.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Mesio/Distoangular</li>
                    <li style="margin-bottom: 10px;">Upright Position</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Commonly includes extraction of impacted wisdom teeth requiring advanced surgical techniques.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Prosthodontic":
            description = "Focuses on the design, creation, and fitting of artificial teeth to restore oral function and appearance.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Removable Partial Ordinary Acrylic/Stayplate</li>
                    <li style="margin-bottom: 10px;">1-2 units plastic</li>
                    <li style="margin-bottom: 10px;">3-4 units plastic</li>
                    <li style="margin-bottom: 10px;">5 or more units plastic</li>
                    <li style="margin-bottom: 10px;">Wire clasps</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Improves ability to chew, speak, and smile.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Casted Metal":
            description = "Metal framework precisely fabricated using a casting process for dental restorations.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Unilateral</li>
                    <li style="margin-bottom: 10px;">Bilateral</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Stronger and thinner compared to acrylic-only dentures.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Jacket Crown":
            description = "Full-coverage dental crown to restore and protect damaged or weakened teeth.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Plastic with or without metal backing</li>
                    <li style="margin-bottom: 10px;">Porcelain fused to metal</li>
                    <li style="margin-bottom: 10px;">Tilite</li>
                    <li style="margin-bottom: 10px;">Ceramage</li>
                    <li style="margin-bottom: 10px;">Emax</li>
                    <li style="margin-bottom: 10px;">Zirconia</li>
                    <li style="margin-bottom: 10px;">Anterior</li>
                    <li style="margin-bottom: 10px;">Posterior</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Made of tooth-colored material like porcelain or ceramic.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Laminates":
            description = "Ultra-thin, tooth-colored shells designed to cover the front surface of teeth for cosmetic enhancement.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Anterior</li>
                    <li style="margin-bottom: 10px;">Posterior</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Minimally invasive solution for improving tooth appearance.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Veneers":
            description = "Thin, custom-made shell to improve tooth appearance, shape, and alignment.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Anterior</li>
                    <li style="margin-bottom: 10px;">Posterior</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Enhances smiles by addressing imperfections.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Complete Denture":
            description = "Removable dental prosthesis to replace all missing teeth in a jaw.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Plastic new ace</li>
                    <li style="margin-bottom: 10px;">New ace px</li>
                    <li style="margin-bottom: 10px;">Bioform</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Restores chewing function, speech, and appearance.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Flexite":
            description = "Flexible denture material used in removable partial dentures.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Unilateral</li>
                    <li style="margin-bottom: 10px;">Bilateral</li>
                    <li style="margin-bottom: 10px;">Anteropostero</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Offers improved comfort and aesthetics.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Retainers":
            description = "Custom-made appliance to hold teeth in place after orthodontic treatment.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Up/down</li>
                    <li style="margin-bottom: 10px;">Up/down w/ pontic</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Prevents teeth from shifting back.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Repair of Denture":
            description = "Process of fixing broken or ill-fitting dentures.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Rebasing u/l</li>
                    <li style="margin-bottom: 10px;">Relining u/l</li>
                    <li style="margin-bottom: 10px;">Crack denture</li>
                    <li style="margin-bottom: 10px;">Crown recementation</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Restores function and comfort.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Fiber Post":
            description = "Flexible post placed inside a root canal-treated tooth for support.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Anterior</li>
                    <li style="margin-bottom: 10px;">Posterior</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Reinforces weak teeth after root canal treatment.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Root Canal":
            description = "Treatment for infected or damaged tooth pulp.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Mono rooted</li>
                    <li style="margin-bottom: 10px;">Multi rooted/canal</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Involves removing infected pulp and sealing the tooth.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Pediatrics":
            description = "Specializes in the oral health of children.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">OP and Fluoride</li>
                    <li style="margin-bottom: 10px;">Pulpotomy</li>
                    <li style="margin-bottom: 10px;">Stainless steel crown</li>
                    <li style="margin-bottom: 10px;">Strip off crown</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Focuses on preventive care for children.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Sealant":
            description = "Protective coating applied to teeth to prevent cavities.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Premolar</li>
                    <li style="margin-bottom: 10px;">Molar</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Reduces risk of tooth decay.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

        case "Orthodontic":
            description = "Corrects misaligned teeth and jaw problems.";
            additionalInfo = document.createElement('div');
            additionalInfo.innerHTML = `
                <ul style="margin-top: 10px;">
                    <li style="margin-bottom: 10px;">Conventional</li>
                    <li style="margin-bottom: 10px;">Self-ligating</li>
                    <li style="margin-bottom: 10px;">(depends on severity)</li>
                </ul>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                    <p style="margin: 0;">Improves dental function and aesthetics.</p>
                </div>
                <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
            `;
            panelElement.appendChild(additionalInfo);
            break;

          case "CNDA Pricelist":
              description = "Come to the clinic for the latest pricelist and best deals.";
              additionalInfo = document.createElement('div');
              additionalInfo.innerHTML = `
                  <ul style="margin-top: 10px;">
                      <li style="margin-bottom: 10px;">Consultation</li>
                      <li style="margin-bottom: 10px;">Oral Prophylaxis</li>
                      <li style="margin-bottom: 10px;">Restorations Temporary Filling</li>
                      <li style="margin-bottom: 10px;">Composite Filling</li>
                      <li style="margin-bottom: 10px;">Surgery Extraction</li>
                      <li style="margin-bottom: 10px;">Special Case</li>
                      <li style="margin-bottom: 10px;">Prosthodontic</li>
                      <li style="margin-bottom: 10px;">Casted Metal</li>
                      <li style="margin-bottom: 10px;">Jacket Crown</li>
                      <li style="margin-bottom: 10px;">Laminates</li>
                      <li style="margin-bottom: 10px;">Veneers</li>
                      <li style="margin-bottom: 10px;">Complete Denture</li>
                      <li style="margin-bottom: 10px;">Flexite</li>
                      <li style="margin-bottom: 10px;">Retainers</li>
                      <li style="margin-bottom: 10px;">Repair of Denture</li>
                      <li style="margin-bottom: 10px;">Fiber Post</li>
                      <li style="margin-bottom: 10px;">Root Canal</li>
                      <li style="margin-bottom: 10px;">Pediatrics</li>
                      <li style="margin-bottom: 10px;">Sealant</li>
                      <li style="margin-bottom: 10px;">Orthodontic</li>
                  </ul>
                  <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4e73df;">
                      <p style="margin: 0;">(depending on the severity of the case)</p>
                  </div>
                   <div style="margin-top: 15px;">
                    <a class="custom-book-btn" href="profile.html">Book Now</a>
                </div>
              `;
              panelElement.appendChild(additionalInfo);
              break;

          case "Imelda":
              description = "Professional cleaning procedure to remove plaque and tartar.";
              additionalInfo = document.createElement('div');
              additionalInfo.innerHTML = `
                  <ul style="margin-top: 10px;">
                      <li style="margin-bottom: 10px;">Light</li>
                      <li style="margin-bottom: 10px;">Moderate</li>
                      <li style="margin-bottom: 10px;">Heavy</li>
                  </ul>
                  <div style="margin-top: 15px;">
                      <a class="custom-book-btn" href="Make-Appointment.html">Book Now</a>
                  </div>
              `;
              panelElement.appendChild(additionalInfo);
              break;

          default:
              description = "Detailed information about this dental service. Contact us for specific pricing and availability.";
              additionalInfo = document.createElement('div');
              additionalInfo.innerHTML = `
                  <div style="margin-top: 15px;">
                      <a class="custom-book-btn" href="Make-Appointment.html">Book Now</a>
                  </div>
              `;
              panelElement.appendChild(additionalInfo);
      }

      descriptionElement.textContent = description;

    const bookButtons = panelElement.querySelectorAll('.custom-book-btn');
    bookButtons.forEach(button => {
        button.addEventListener('mouseover', function() {
            this.style.backgroundColor = '#6e4474'; // Hover color
            this.style.transform = 'scale(1.05)';
        });

        button.addEventListener('mouseout', function() {
            this.style.backgroundColor = '#84548c'; // Base color
            this.style.transform = 'scale(1)';
        });

        button.addEventListener('click', function() {
            this.style.backgroundColor = '#5a375f'; // Active color
            setTimeout(() => {
                this.style.backgroundColor = '#84548c'; // Return to base color
            }, 100);
        });
    });
}

  // Add CSS to the document head for the overlay
  const style = document.createElement('style');
  style.textContent = `
      .image-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.8);
          z-index: 1000;
          display: none;
          justify-content: center;
          align-items: center;
      }
  `;
  document.head.appendChild(style);
});