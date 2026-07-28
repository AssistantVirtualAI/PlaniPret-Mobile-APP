(function() {
  // Prevent multiple initializations
  if (window.chatWidgetInitialized) return;
  window.chatWidgetInitialized = true;

  // Get configuration
  var config = window.ChatWidgetConfig || {};
  var agentId = config.agentId;
  var position = config.position || 'bottom-right';
  var primaryColor = config.primaryColor || '#8B5CF6';
  var buttonSize = config.buttonSize || 60;

  if (!agentId) {
    console.error('[ChatWidget] agentId is required');
    return;
  }

  // Determine base URL
  var scriptTag = document.currentScript || document.querySelector('script[src*="widget.js"]');
  var baseUrl = config.baseUrl || (scriptTag ? scriptTag.src.replace('/widget.js', '') : window.location.origin);
  
  // If baseUrl ends with /widget.js, extract the origin
  if (baseUrl.includes('/widget.js')) {
    var url = new URL(baseUrl);
    baseUrl = url.origin;
  }

  // Create styles
  var styles = document.createElement('style');
  styles.textContent = `
    .cd-widget-container {
      position: fixed;
      ${position === 'bottom-right' ? 'right: 20px;' : 'left: 20px;'}
      bottom: 20px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    .cd-widget-button {
      width: ${buttonSize}px;
      height: ${buttonSize}px;
      border-radius: 50%;
      background-color: ${primaryColor};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    
    .cd-widget-button:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3);
    }
    
    .cd-widget-button svg {
      width: 28px;
      height: 28px;
      fill: white;
    }
    
    .cd-widget-button.cd-active svg.cd-mic {
      display: none;
    }
    
    .cd-widget-button:not(.cd-active) svg.cd-close {
      display: none;
    }
    
    .cd-widget-iframe-container {
      position: absolute;
      ${position === 'bottom-right' ? 'right: 0;' : 'left: 0;'}
      bottom: ${buttonSize + 15}px;
      width: 380px;
      height: 520px;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      transition: opacity 0.3s ease, transform 0.3s ease;
      pointer-events: none;
      background: white;
    }
    
    .cd-widget-iframe-container.cd-open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    
    .cd-widget-iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    
    @media (max-width: 480px) {
      .cd-widget-iframe-container {
        width: calc(100vw - 40px);
        height: calc(100vh - 140px);
        ${position === 'bottom-right' ? 'right: -10px;' : 'left: -10px;'}
      }
    }
  `;
  document.head.appendChild(styles);

  // Create widget container
  var container = document.createElement('div');
  container.className = 'cd-widget-container';
  container.id = 'cd-widget-container';

  // Create iframe container
  var iframeContainer = document.createElement('div');
  iframeContainer.className = 'cd-widget-iframe-container';
  iframeContainer.id = 'cd-widget-iframe-container';

  // Create iframe
  var iframe = document.createElement('iframe');
  iframe.className = 'cd-widget-iframe';
  iframe.src = baseUrl + '/iframe/' + agentId;
  iframe.allow = 'microphone';
  iframe.title = 'Chat Widget';
  
  iframeContainer.appendChild(iframe);

  // Create toggle button
  var button = document.createElement('button');
  button.className = 'cd-widget-button';
  button.id = 'cd-widget-button';
  button.innerHTML = `
    <svg class="cd-mic" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
    </svg>
    <svg class="cd-close" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>
  `;

  container.appendChild(iframeContainer);
  container.appendChild(button);

  // Add to page
  var targetElement = document.getElementById('cd-widget') || document.body;
  targetElement.appendChild(container);

  // Toggle widget
  var isOpen = false;
  
  button.addEventListener('click', function() {
    isOpen = !isOpen;
    button.classList.toggle('cd-active', isOpen);
    iframeContainer.classList.toggle('cd-open', isOpen);
  });

  // Listen for messages from iframe
  window.addEventListener('message', function(event) {
    if (!event.data || !event.data.type) return;
    
    switch (event.data.type) {
      case 'widget-close':
        isOpen = false;
        button.classList.remove('cd-active');
        iframeContainer.classList.remove('cd-open');
        break;
      case 'widget-minimize':
        isOpen = false;
        button.classList.remove('cd-active');
        iframeContainer.classList.remove('cd-open');
        break;
      case 'widget-status':
        // Can be used for visual feedback on button
        if (event.data.isConnected) {
          button.style.animation = 'pulse 2s infinite';
        } else {
          button.style.animation = '';
        }
        break;
    }
  });

  // Expose API
  window.ChatWidget = {
    open: function() {
      isOpen = true;
      button.classList.add('cd-active');
      iframeContainer.classList.add('cd-open');
    },
    close: function() {
      isOpen = false;
      button.classList.remove('cd-active');
      iframeContainer.classList.remove('cd-open');
    },
    toggle: function() {
      button.click();
    },
    isOpen: function() {
      return isOpen;
    }
  };

  // Dispatch ready event
  var readyEvent = new CustomEvent('chatWidgetReady', { detail: { agentId: agentId } });
  window.dispatchEvent(readyEvent);
})();
