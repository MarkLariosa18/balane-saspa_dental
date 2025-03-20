// assets/js/notifications.js

document.addEventListener('DOMContentLoaded', function() {
    // Get notification elements
    const notificationDropdown = document.getElementById('notificationDropdown');
    const notificationCount = document.getElementById('notificationCount');
    const notificationHeaderCount = document.getElementById('notificationHeaderCount');
    const notificationsList = document.getElementById('notificationsList');
    
    // Get messages elements
    const messagesDropdown = document.getElementById('messagesDropdown');
    const messagesCount = document.getElementById('messagesCount');
    const messagesHeaderCount = document.getElementById('messagesHeaderCount');
    const messagesList = document.getElementById('messagesList');
    
    // Load saved notifications and messages from localStorage
    loadNotifications();
    loadMessages();
    
    // Fetch new notifications (simulated)
    fetchNotificationsAndMessages();
    
    // Set up periodic checks for new notifications (every 5 minutes)
    setInterval(fetchNotificationsAndMessages, 5 * 60 * 1000);
    
    // Functions to handle notifications
    function loadNotifications() {
      // Try to load notifications from localStorage
      let notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
      
      // Update the notification count
      updateNotificationCount(notifications.length);
      
      // Clear existing notifications (except header and footer)
      clearList(notificationsList);
      
      // Add notifications to the list
      if (notifications.length > 0) {
        notifications.forEach(notification => {
          addNotificationToList(notification);
        });
      }
    }
    
    function loadMessages() {
      // Try to load messages from localStorage
      let messages = JSON.parse(localStorage.getItem('messages') || '[]');
      
      // Update the messages count
      updateMessagesCount(messages.length);
      
      // Clear existing messages (except header and footer)
      clearList(messagesList);
      
      // Add messages to the list
      if (messages.length > 0) {
        messages.forEach(message => {
          addMessageToList(message);
        });
      }
    }
    
    function fetchNotificationsAndMessages() {
      // This function would normally fetch data from your backend API
      // For this example, we'll simulate with dummy data
      
      // Simulate receiving new notifications
      const dummyNotifications = [
        {
          icon: 'bi-exclamation-circle text-warning',
          title: 'System Update',
          text: 'System maintenance scheduled for tonight',
          time: '5 min. ago'
        },
        {
          icon: 'bi-check-circle text-success',
          title: 'Task Completed',
          text: 'Your report has been generated successfully',
          time: '10 min. ago'
        }
      ];
      
      // Simulate receiving new messages
      const dummyMessages = [
        {
          image: 'assets/img/messages-1.jpg',
          name: 'Maria Hudson',
          text: 'Could you review the latest design proposal?',
          time: '15 min. ago'
        },
        {
          image: 'assets/img/messages-2.jpg',
          name: 'Anna Nelson',
          text: 'The client meeting has been rescheduled to tomorrow',
          time: '30 min. ago'
        }
      ];
      
      // Save and display new notifications and messages
      saveNotifications(dummyNotifications);
      saveMessages(dummyMessages);
    }
    
    function saveNotifications(newNotifications) {
      if (!newNotifications || newNotifications.length === 0) return;
      
      // Get existing notifications
      let notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
      
      // Add new notifications
      notifications = [...newNotifications, ...notifications];
      
      // Save back to localStorage
      localStorage.setItem('notifications', JSON.stringify(notifications));
      
      // Update the UI
      loadNotifications();
    }
    
    function saveMessages(newMessages) {
      if (!newMessages || newMessages.length === 0) return;
      
      // Get existing messages
      let messages = JSON.parse(localStorage.getItem('messages') || '[]');
      
      // Add new messages
      messages = [...newMessages, ...messages];
      
      // Save back to localStorage
      localStorage.setItem('messages', JSON.stringify(messages));
      
      // Update the UI
      loadMessages();
    }
    
    function updateNotificationCount(count) {
      if (notificationCount) notificationCount.textContent = count;
      if (notificationHeaderCount) notificationHeaderCount.textContent = count;
    }
    
    function updateMessagesCount(count) {
      if (messagesCount) messagesCount.textContent = count;
      if (messagesHeaderCount) messagesHeaderCount.textContent = count;
    }
    
    function addNotificationToList(notification) {
      // Create notification item
      const li = document.createElement('li');
      li.className = 'notification-item';
      li.innerHTML = `
        <i class="bi ${notification.icon}"></i>
        <div>
          <h4>${notification.title}</h4>
          <p>${notification.text}</p>
          <p>${notification.time}</p>
        </div>
      `;
      
      // Add divider after the item
      const divider = document.createElement('li');
      divider.innerHTML = '<hr class="dropdown-divider">';
      
      // Insert before the footer
      const footer = notificationsList.querySelector('.dropdown-footer');
      notificationsList.insertBefore(li, footer);
      notificationsList.insertBefore(divider, footer);
    }
    
    function addMessageToList(message) {
      // Create message item
      const li = document.createElement('li');
      li.className = 'message-item';
      li.innerHTML = `
        <a href="#">
          <img src="${message.image}" alt="" class="rounded-circle">
          <div>
            <h4>${message.name}</h4>
            <p>${message.text}</p>
            <p>${message.time}</p>
          </div>
        </a>
      `;
      
      // Add divider after the item
      const divider = document.createElement('li');
      divider.innerHTML = '<hr class="dropdown-divider">';
      
      // Insert before the footer
      const footer = messagesList.querySelector('.dropdown-footer');
      messagesList.insertBefore(li, footer);
      messagesList.insertBefore(divider, footer);
    }
    
    function clearList(list) {
      // Remove all notification/message items but keep header and footer
      const header = list.querySelector('.dropdown-header');
      const footer = list.querySelector('.dropdown-footer');
      const divider = list.querySelector('.dropdown-divider');
      
      while (list.firstChild) {
        list.removeChild(list.firstChild);
      }
      
      // Add back the header, first divider, and footer
      list.appendChild(header);
      const newDivider = document.createElement('li');
      newDivider.innerHTML = '<hr class="dropdown-divider">';
      list.appendChild(newDivider);
      list.appendChild(footer);
    }
    
    // Add event listener for logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        // Clear notifications and messages when logging out
        localStorage.removeItem('notifications');
        localStorage.removeItem('messages');
        // Redirect to login page or perform other logout actions
        // window.location.href = 'login.html';
        console.log('User logged out');
      });
    }
  });