document.addEventListener('DOMContentLoaded', () => {
    // Main chat elements
    const chatInput = document.querySelector('.chat-input');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const chatBox = document.getElementById('chat-box');
    const imagePreviewContainer = document.getElementById('image-previews');
    const codePreviewContainer = document.getElementById('code-previews');

    // Modal elements
    const codeModal = document.getElementById('code-modal');
    const pasteCodeButton = document.getElementById('paste-code-button');
    const addCodeButton = document.getElementById('add-code-button');
    const cancelCodeButton = document.getElementById('cancel-code-button');
    const codeInput = document.getElementById('code-input');

    // Focus mode elements
    const pageOverlay = document.getElementById('page-overlay');

    let placeholderMap = {};
    let codeCounter = 1;
    let imgCounter = 1;
    let lastCursorPosition = 0;
    let isFocusMode = false;
    let editingPlaceholder = null;

    // --- Event Listeners ---
    // Single send message handler
    sendButton.addEventListener('click', (e) => {
        e.preventDefault();
        sendMessage();
    });

    // Enter key handler for textarea
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    messageInput.addEventListener('click', () => {
        lastCursorPosition = messageInput.selectionStart;
    });
    
    messageInput.addEventListener('keyup', () => {
        lastCursorPosition = messageInput.selectionStart;
    });

    messageInput.addEventListener('paste', handlePaste);
    messageInput.addEventListener('input', updatePlaceholders);

    pasteCodeButton.addEventListener('click', (e) => {
        e.preventDefault();
        openCodeModal();
    });
    
    cancelCodeButton.addEventListener('click', (e) => {
        e.preventDefault();
        closeCodeModal();
    });
    
    addCodeButton.addEventListener('click', (e) => {
        e.preventDefault();
        addCodeFromModal();
    });

    // Focus Mode Listeners
    messageInput.addEventListener('focus', enterFocusMode);
    pageOverlay.addEventListener('click', exitFocusMode);

    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && codeModal.style.display === 'flex') {
            closeCodeModal();
        }
    });

    // --- Focus Mode Functions ---
    function enterFocusMode() {
        if (isFocusMode) return;
        isFocusMode = true;
        pageOverlay.classList.add('visible');
        chatInput.classList.add('input-focus');
    }

    function exitFocusMode() {
        if (!isFocusMode) return;
        isFocusMode = false;
        pageOverlay.classList.remove('visible');
        chatInput.classList.remove('input-focus');
        messageInput.blur();
    }

    // --- Core Functions ---
    async function sendMessage() {
        // Prevent multiple simultaneous sends
        if (sendButton.disabled) return;
        
        const messageText = messageInput.value.trim();

        if (messageText === '') {
            alert('Please enter a message.');
            return;
        }

        sendButton.disabled = true;

        if (isFocusMode) exitFocusMode();

        appendMessage(messageText, 'user');
        messageInput.value = '';
        
        const loadingAnimation = showLoadingAnimation();

        const requestBody = {
            steps: messageText,
        };

        try {
            const response = await fetch('/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    errorData = {};
                }
                throw new Error(errorData.detail || 'An unknown error occurred.');
            }

            hideLoadingAnimation(loadingAnimation);
            const botMessage = appendMessage('', 'bot');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let imageMapping = {};

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n\n');

                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        const data = JSON.parse(line.substring(5));
                        if (data.mapping) {
                            imageMapping = data.mapping;
                        }
                        if (data.content) {
                            botMessage.textContent += data.content;
                        }
                        if (data.error) {
                            throw new Error(data.error);
                        }
                    }
                }
            }

        } catch (error) {
            hideLoadingAnimation(loadingAnimation);
            appendMessage(`Error: ${error.message}`, 'bot');
            console.error('Error calling backend:', error);
        } finally {
            sendButton.disabled = false;
        }

        // Reset for next message
        placeholderMap = {};
        codeCounter = 1;
        imgCounter = 1;
        imagePreviewContainer.innerHTML = '';
        codePreviewContainer.innerHTML = '';
    }

    // --- Placeholder Management Functions ---
    function updatePlaceholders() {
        const currentText = messageInput.value;
        const existingImgPlaceholders = currentText.match(/\[\[img\d+\]\]/g) || [];
        const existingCodePlaceholders = currentText.match(/\[\[code\d+\]\]/g) || [];

        const allExistingPlaceholders = [...existingImgPlaceholders, ...existingCodePlaceholders];
        const newPlaceholderMap = {};
        let newImgCounter = 1;
        let newCodeCounter = 1;
        let updatedText = currentText;

        // Renumber and update placeholderMap
        allExistingPlaceholders.forEach(oldPlaceholder => {
            const type = oldPlaceholder.includes('img') ? 'img' : 'code';
            const content = placeholderMap[oldPlaceholder];

            if (content) {
                let newPlaceholder;
                if (type === 'img') {
                    newPlaceholder = `[[img${newImgCounter++}]]`;
                } else {
                    newPlaceholder = `[[code${newCodeCounter++}]]`;
                }
                newPlaceholderMap[newPlaceholder] = content;
                
                // Replace in text if placeholder changed
                if (oldPlaceholder !== newPlaceholder) {
                    updatedText = updatedText.replace(oldPlaceholder, newPlaceholder);
                }
            }
        });

        // Update input only if text changed
        if (updatedText !== currentText) {
            const cursorPos = messageInput.selectionStart;
            messageInput.value = updatedText;
            messageInput.setSelectionRange(cursorPos, cursorPos);
        }

        placeholderMap = newPlaceholderMap;
        imgCounter = newImgCounter;
        codeCounter = newCodeCounter;

        // Update previews
        updatePreviewDisplay();
    }

    function updatePreviewDisplay() {
        imagePreviewContainer.innerHTML = '';
        codePreviewContainer.innerHTML = '';

        const currentText = messageInput.value;
        const imgRegex = /\[\[img(\d+)\]\]/g;
        const codeRegex = /\[\[code(\d+)\]\]/g;

        let match;

        // Collect all image placeholders and their content
        const currentImgPlaceholders = [];
        while ((match = imgRegex.exec(currentText)) !== null) {
            const placeholder = match[0];
            const content = placeholderMap[placeholder];
            if (content) {
                currentImgPlaceholders.push({ placeholder, content });
            }
        }

        // Collect all code placeholders and their content
        const currentCodePlaceholders = [];
        while ((match = codeRegex.exec(currentText)) !== null) {
            const placeholder = match[0];
            const content = placeholderMap[placeholder];
            if (content) {
                currentCodePlaceholders.push({ placeholder, content });
            }
        }

        // Add image previews
        currentImgPlaceholders.forEach(({ placeholder, content }) => {
            addImagePreview(content, placeholder);
        });

        // Add code previews
        currentCodePlaceholders.forEach(({ placeholder, content }) => {
            addCodePreview(content, placeholder);
        });
    }

    function deletePlaceholder(placeholder) {
        // Remove from message input
        messageInput.value = messageInput.value.replace(placeholder, '');
        // Remove from placeholderMap
        delete placeholderMap[placeholder];
        // Trigger update to renumber and refresh previews
        updatePlaceholders();
    }

    function editPlaceholder(placeholder, type) {
        if (type === 'code') {
            editingPlaceholder = placeholder;
            codeInput.value = placeholderMap[placeholder];
            codeModal.style.display = 'flex';
            codeInput.focus();
        } else if (type === 'img') {
            if (confirm(`Are you sure you want to delete ${placeholder}?`)) {
                deletePlaceholder(placeholder);
            }
        }
    }

    function openCodeModal() {
        editingPlaceholder = null;
        codeInput.value = '';
        codeModal.style.display = 'flex';
        codeInput.focus();
    }

    function closeCodeModal() {
        codeModal.style.display = 'none';
        codeInput.value = '';
        editingPlaceholder = null;
    }

    function addCodeFromModal() {
        const codeText = codeInput.value;
        if (codeText.trim() === '') {
            alert('Please enter some code.');
            return;
        }

        if (editingPlaceholder) {
            // Update existing code placeholder
            placeholderMap[editingPlaceholder] = codeText;
        } else {
            // Add new code placeholder
            const placeholder = `[[code${codeCounter++}]]`;
            placeholderMap[placeholder] = codeText;
            insertPlaceholder(placeholder, lastCursorPosition);
        }
        
        closeCodeModal();
        updatePlaceholders();
    }

    function handlePaste(e) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                reader.onload = function(event) {
                    const base64Url = event.target.result;
                    const placeholder = `[[img${imgCounter++}]]`;
                    placeholderMap[placeholder] = base64Url;

                    insertPlaceholder(placeholder, messageInput.selectionStart);
                    updatePlaceholders();
                };
                reader.readAsDataURL(blob);
                break; // Only handle first image
            }
        }
    }

    // --- Helper Functions ---
    function insertPlaceholder(placeholder, position) {
        const text = messageInput.value;
        messageInput.value = text.substring(0, position) + placeholder + text.substring(position);
        messageInput.focus();
        const newCursorPos = position + placeholder.length;
        messageInput.setSelectionRange(newCursorPos, newCursorPos);
        lastCursorPosition = newCursorPos;
    }

    function addImagePreview(url, placeholder) {
        const previewWrapper = document.createElement('div');
        previewWrapper.className = 'image-preview';
        previewWrapper.id = `preview-${placeholder.replace(/[\[\]]/g, '')}`;
        
        const img = document.createElement('img');
        img.src = url;
        img.alt = placeholder;
        
        const p = document.createElement('p');
        p.textContent = placeholder;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'preview-actions';

        const editButton = document.createElement('button');
        editButton.textContent = 'Delete';
        editButton.onclick = () => deletePlaceholder(placeholder);

        actionsDiv.appendChild(editButton);

        previewWrapper.appendChild(img);
        previewWrapper.appendChild(p);
        previewWrapper.appendChild(actionsDiv);
        imagePreviewContainer.appendChild(previewWrapper);
    }

function addCodePreview(code, placeholder) {
    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'code-preview';
    previewWrapper.id = `preview-${placeholder.replace(/[\[\]]/g, '')}`;
    
    const pre = document.createElement('pre');
    pre.textContent = code;
    
    // Add click handler to expand/collapse code
    pre.addEventListener('click', () => {
        pre.classList.toggle('expanded');
    });
    
    const p = document.createElement('p');
    p.textContent = placeholder;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'preview-actions';

    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.onclick = () => editPlaceholder(placeholder, 'code');
    
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.onclick = () => deletePlaceholder(placeholder);

    actionsDiv.appendChild(editButton);
    actionsDiv.appendChild(deleteButton);

    previewWrapper.appendChild(pre);
    previewWrapper.appendChild(p);
    previewWrapper.appendChild(actionsDiv);
    codePreviewContainer.appendChild(previewWrapper);
}

function appendMessage(text, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);
        messageElement.textContent = text;
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
        return messageElement;
    }

    function showLoadingAnimation() {
        const loadingAnimation = document.createElement('div');
        loadingAnimation.className = 'loading-animation';
        loadingAnimation.style.display = 'block';
        chatBox.appendChild(loadingAnimation);
        chatBox.scrollTop = chatBox.scrollHeight;
        return loadingAnimation;
    }

    function hideLoadingAnimation(loadingAnimation) {
        if (loadingAnimation && loadingAnimation.parentNode) {
            loadingAnimation.parentNode.removeChild(loadingAnimation);
        }
    }
});