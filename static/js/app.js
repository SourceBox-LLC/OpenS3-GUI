document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const connectionForm = document.getElementById('connection-form');
    const connectionStatus = document.getElementById('connection-status');
    const connectionRequest = document.getElementById('connection-request');
    const bucketList = document.getElementById('bucket-list');
    const bucketListContainer = document.querySelector('.bucket-list');
    const objectsContainer = document.querySelector('.objects-container');
    const objectsTable = document.getElementById('objects-table');
    const objectPath = document.getElementById('object-path');
    const objectActions = document.querySelector('.object-actions');
    const selectAllCheckbox = document.getElementById('select-all');
    const deleteSelectedBtn = document.getElementById('delete-selected-btn');
    const createBucketForm = document.getElementById('create-bucket-form');
    const uploadObjectForm = document.getElementById('upload-object-form');
    const addMetadataBtn = document.getElementById('add-metadata-btn');
    const metadataFields = document.getElementById('metadata-fields');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const deleteMessage = document.getElementById('delete-message');
    const notificationToast = document.getElementById('notification-toast');
    const toastBody = document.getElementById('toast-body');
    const toastTitle = document.getElementById('toast-title');
    const settingsForm = document.getElementById('settings-form');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const accessKeyIdInput = document.getElementById('access-key-id');
    const secretAccessKeyInput = document.getElementById('secret-access-key');
    const rememberCredentialsCheckbox = document.getElementById('remember-credentials');

    // State variables
    let currentBucket = null;
    let currentPrefix = '';
    let selectedObjects = [];
    let deleteType = null;
    let deleteTarget = null;
    let toastInstance = null;
    let credentials = {
        accessKeyId: 'admin',         // Default credentials
        secretAccessKey: 'password',  // Default credentials
        rememberCredentials: false    // Default setting
    };

    // Bootstrap toast initialization
    toastInstance = new bootstrap.Toast(notificationToast);
    
    // Load saved credentials on page load if they exist
    loadCredentials();

    // Functions for handling credentials
    function saveCredentials() {
        if (credentials.rememberCredentials) {
            localStorage.setItem('openS3Credentials', JSON.stringify({
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey,
                rememberCredentials: true
            }));
        } else {
            // If not remembering, clear any previously saved credentials
            localStorage.removeItem('openS3Credentials');
        }
    }
    
    function loadCredentials() {
        const savedCredentials = localStorage.getItem('openS3Credentials');
        if (savedCredentials) {
            try {
                const parsed = JSON.parse(savedCredentials);
                credentials = {
                    accessKeyId: parsed.accessKeyId || 'admin',
                    secretAccessKey: parsed.secretAccessKey || 'password',
                    rememberCredentials: parsed.rememberCredentials || false
                };
                
                // Update the settings form with saved values
                accessKeyIdInput.value = credentials.accessKeyId;
                secretAccessKeyInput.value = credentials.secretAccessKey;
                rememberCredentialsCheckbox.checked = credentials.rememberCredentials;
            } catch (error) {
                console.error('Error parsing saved credentials:', error);
                // If error, keep the defaults
            }
        }
    }
    
    // Settings form save button
    saveSettingsBtn.addEventListener('click', function() {
        credentials.accessKeyId = accessKeyIdInput.value || 'admin';
        credentials.secretAccessKey = secretAccessKeyInput.value || 'password';
        credentials.rememberCredentials = rememberCredentialsCheckbox.checked;
        
        saveCredentials();
        
        // Close the modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
        modal.hide();
        
        showNotification('Settings Saved', 'Your OpenS3 credentials have been saved', 'success');
    });

    // Connect to OpenS3 server
    connectionForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const host = document.getElementById('host').value || 'localhost';
        const port = document.getElementById('port').value || '9000';
        
        showNotification('Connecting...', 'Attempting to connect to OpenS3 server', 'info');
        
        fetch('/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                host, 
                port, 
                access_key_id: credentials.accessKeyId,
                secret_access_key: credentials.secretAccessKey
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // Update UI to show connected status
                connectionStatus.classList.remove('d-none');
                connectionRequest.classList.add('d-none');
                bucketListContainer.classList.remove('d-none');
                
                // Load buckets
                loadBuckets();
                
                showNotification('Connected', 'Successfully connected to OpenS3 server', 'success');
            } else {
                showNotification('Connection Failed', data.message, 'error');
            }
        })
        .catch(error => {
            showNotification('Connection Error', error.message, 'error');
        });
    });

    // Load buckets
    function loadBuckets() {
        fetch('/buckets')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                bucketList.innerHTML = '';
                
                if (data.buckets.length === 0) {
                    bucketList.innerHTML = '<div class="list-group-item text-center text-muted">No buckets found</div>';
                    return;
                }
                
                data.buckets.forEach(bucket => {
                    const bucketItem = document.createElement('a');
                    bucketItem.href = '#';
                    bucketItem.classList.add('list-group-item', 'list-group-item-action', 'bucket-item');
                    bucketItem.dataset.bucket = bucket;
                    bucketItem.innerHTML = `
                        <i class="bi bi-bucket-fill me-2"></i>
                        ${bucket}
                    `;
                    
                    bucketItem.addEventListener('click', function(e) {
                        e.preventDefault();
                        // Clear any selected bucket
                        document.querySelectorAll('.bucket-item').forEach(item => {
                            item.classList.remove('active');
                        });
                        
                        // Set this bucket as active
                        bucketItem.classList.add('active');
                        
                        // Load objects for this bucket
                        currentBucket = bucket;
                        currentPrefix = '';
                        loadObjects(bucket, '');
                    });
                    
                    bucketList.appendChild(bucketItem);
                });
            } else {
                showNotification('Error', data.message, 'error');
            }
        })
        .catch(error => {
            showNotification('Error', error.message, 'error');
        });
    }

    // Load objects in a bucket
    function loadObjects(bucket, prefix = '') {
        objectsContainer.classList.remove('d-none');
        objectActions.classList.remove('d-none');
        
        // Update breadcrumb
        updateBreadcrumb(bucket, prefix);
        
        // Show loading state
        objectsTable.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </td>
            </tr>
        `;
        
        fetch(`/buckets/${bucket}/objects?prefix=${prefix}`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                objectsTable.innerHTML = '';
                selectedObjects = [];
                updateDeleteSelectedButton();
                
                if (data.objects.length === 0) {
                    objectsTable.innerHTML = `
                        <tr>
                            <td colspan="5" class="text-center">
                                <p class="text-muted my-5">This bucket is empty</p>
                            </td>
                        </tr>
                    `;
                    return;
                }
                
                // Group objects by common prefixes (folders)
                const prefixes = new Set();
                const files = [];
                
                data.objects.forEach(object => {
                    if (object.key.endsWith('/')) {
                        // This is a folder
                        prefixes.add(object.key);
                    } else {
                        // Check if this object is in a subfolder
                        const parts = object.key.split('/');
                        if (parts.length > 1) {
                            // Add the prefix to our set of folders
                            const folderPrefix = parts.slice(0, -1).join('/') + '/';
                            prefixes.add(folderPrefix);
                        }
                        
                        // This is a file
                        files.push(object);
                    }
                });
                
                // First add folders
                prefixes.forEach(folderPrefix => {
                    // Skip if this is just the current prefix
                    if (folderPrefix === prefix) return;
                    
                    // Get folder name (last part of the prefix)
                    let folderName = folderPrefix;
                    if (prefix && folderPrefix.startsWith(prefix)) {
                        folderName = folderPrefix.substring(prefix.length);
                    }
                    
                    // Remove trailing slash for display
                    if (folderName.endsWith('/')) {
                        folderName = folderName.slice(0, -1);
                    }
                    
                    const row = document.createElement('tr');
                    row.className = 'object-row folder-row';
                    row.innerHTML = `
                        <td>
                            <input class="form-check-input object-checkbox" type="checkbox" data-key="${folderPrefix}" data-type="folder">
                        </td>
                        <td>
                            <i class="bi bi-folder-fill object-icon folder-icon"></i>
                            <span class="folder-name">${folderName}</span>
                        </td>
                        <td>-</td>
                        <td>-</td>
                        <td>
                            <button class="btn btn-sm btn-outline-danger delete-btn" data-type="folder" data-key="${folderPrefix}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </td>
                    `;
                    
                    // Add click event to navigate into folder
                    row.querySelector('.folder-name').addEventListener('click', function() {
                        loadObjects(bucket, folderPrefix);
                    });
                    
                    // Add event listeners for delete button
                    const deleteBtn = row.querySelector('.delete-btn');
                    deleteBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        deleteType = 'folder';
                        deleteTarget = {
                            bucket,
                            key: folderPrefix
                        };
                        deleteMessage.textContent = `Are you sure you want to delete the folder '${folderName}' and all its contents?`;
                        const modal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
                        modal.show();
                    });
                    
                    objectsTable.appendChild(row);
                });
                
                // Then add files
                files.forEach(object => {
                    let objectName = object.key;
                    
                    // If inside a prefix, only show the filename
                    if (prefix && objectName.startsWith(prefix)) {
                        objectName = objectName.substring(prefix.length);
                    }
                    
                    const size = formatBytes(object.size);
                    const lastModified = formatDate(object.last_modified);
                    
                    const row = document.createElement('tr');
                    row.className = 'object-row file-row';
                    row.innerHTML = `
                        <td>
                            <input class="form-check-input object-checkbox" type="checkbox" data-key="${object.key}" data-type="file">
                        </td>
                        <td>
                            <i class="bi bi-file-earmark object-icon file-icon"></i>
                            ${objectName}
                        </td>
                        <td>${size}</td>
                        <td>${lastModified}</td>
                        <td>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-sm btn-outline-primary download-btn" data-key="${object.key}">
                                    <i class="bi bi-download"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-info metadata-btn" data-key="${object.key}">
                                    <i class="bi bi-info-circle"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger delete-btn" data-type="file" data-key="${object.key}">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </td>
                    `;
                    
                    // Add event listeners
                    const downloadBtn = row.querySelector('.download-btn');
                    downloadBtn.addEventListener('click', function() {
                        window.location.href = `/buckets/${bucket}/objects/${encodeURIComponent(object.key)}`;
                    });
                    
                    const metadataBtn = row.querySelector('.metadata-btn');
                    metadataBtn.addEventListener('click', function() {
                        showObjectMetadata(bucket, object.key);
                    });
                    
                    const deleteBtn = row.querySelector('.delete-btn');
                    deleteBtn.addEventListener('click', function() {
                        deleteType = 'file';
                        deleteTarget = {
                            bucket,
                            key: object.key
                        };
                        deleteMessage.textContent = `Are you sure you want to delete the file '${objectName}'?`;
                        const modal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
                        modal.show();
                    });
                    
                    objectsTable.appendChild(row);
                });
                
                // Add event listeners for checkboxes
                document.querySelectorAll('.object-checkbox').forEach(checkbox => {
                    checkbox.addEventListener('change', function() {
                        if (this.checked) {
                            selectedObjects.push({
                                key: this.dataset.key,
                                type: this.dataset.type
                            });
                        } else {
                            selectedObjects = selectedObjects.filter(obj => obj.key !== this.dataset.key);
                        }
                        
                        updateDeleteSelectedButton();
                    });
                });
                
                // Reset select all checkbox
                selectAllCheckbox.checked = false;
            } else {
                showNotification('Error', data.message, 'error');
            }
        })
        .catch(error => {
            showNotification('Error', error.message, 'error');
        });
    }

    // Update breadcrumb
    function updateBreadcrumb(bucket, prefix) {
        objectPath.innerHTML = '';
        
        // Add bucket
        const bucketItem = document.createElement('li');
        bucketItem.classList.add('breadcrumb-item');
        const bucketLink = document.createElement('a');
        bucketLink.href = '#';
        bucketLink.textContent = bucket;
        bucketLink.addEventListener('click', function(e) {
            e.preventDefault();
            loadObjects(bucket, '');
        });
        bucketItem.appendChild(bucketLink);
        objectPath.appendChild(bucketItem);
        
        // Add folders in the path
        if (prefix) {
            const parts = prefix.split('/').filter(part => part);
            let currentPath = '';
            
            parts.forEach((part, index) => {
                currentPath += part + '/';
                
                const folderItem = document.createElement('li');
                folderItem.classList.add('breadcrumb-item');
                
                if (index === parts.length - 1 && prefix.endsWith('/')) {
                    // Current folder
                    folderItem.classList.add('active');
                    folderItem.setAttribute('aria-current', 'page');
                    folderItem.textContent = part;
                } else {
                    // Folder in path
                    const folderLink = document.createElement('a');
                    folderLink.href = '#';
                    folderLink.textContent = part;
                    const pathCopy = currentPath; // Create a copy for the closure
                    folderLink.addEventListener('click', function(e) {
                        e.preventDefault();
                        loadObjects(bucket, pathCopy);
                    });
                    folderItem.appendChild(folderLink);
                }
                
                objectPath.appendChild(folderItem);
            });
        }
    }

    // Create bucket
    createBucketForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const bucketName = document.getElementById('bucket-name').value;
        
        fetch('/buckets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ bucket_name: bucketName })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('createBucketModal'));
                modal.hide();
                
                // Clear form
                document.getElementById('bucket-name').value = '';
                
                // Reload buckets
                loadBuckets();
                
                showNotification('Success', `Bucket '${bucketName}' created successfully`, 'success');
            } else {
                showNotification('Error', data.message, 'error');
            }
        })
        .catch(error => {
            showNotification('Error', error.message, 'error');
        });
    });

    // Upload object
    uploadObjectForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (!currentBucket) {
            showNotification('Error', 'Please select a bucket first', 'error');
            return;
        }
        
        const fileInput = document.getElementById('object-file');
        const objectKey = document.getElementById('object-key').value;
        
        if (!fileInput.files || fileInput.files.length === 0) {
            showNotification('Error', 'Please select a file to upload', 'error');
            return;
        }
        
        const file = fileInput.files[0];
        let finalObjectKey = objectKey || file.name;
        
        // If we're in a prefix (folder), prepend it to the object key
        if (currentPrefix) {
            finalObjectKey = currentPrefix + finalObjectKey;
        }
        
        // Collect metadata
        const metadata = {};
        document.querySelectorAll('.metadata-row').forEach(row => {
            const keyInput = row.querySelector('.metadata-key');
            const valueInput = row.querySelector('.metadata-value');
            if (keyInput.value) {
                metadata[keyInput.value] = valueInput.value;
            }
        });
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('object_key', finalObjectKey);
        formData.append('metadata', JSON.stringify(metadata));
        
        showNotification('Uploading', `Uploading ${file.name}...`, 'info');
        
        fetch(`/buckets/${currentBucket}/objects`, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('uploadObjectModal'));
                modal.hide();
                
                // Clear form
                fileInput.value = '';
                document.getElementById('object-key').value = '';
                metadataFields.innerHTML = '';
                
                // Reload objects
                loadObjects(currentBucket, currentPrefix);
                
                showNotification('Success', `Object uploaded successfully`, 'success');
            } else {
                showNotification('Error', data.message, 'error');
            }
        })
        .catch(error => {
            showNotification('Error', error.message, 'error');
        });
    });

    // Add metadata field
    addMetadataBtn.addEventListener('click', function() {
        const metadataRow = document.createElement('div');
        metadataRow.classList.add('row', 'metadata-row', 'mb-2');
        metadataRow.innerHTML = `
            <div class="col-5">
                <input type="text" class="form-control form-control-sm metadata-key" placeholder="Key">
            </div>
            <div class="col-5">
                <input type="text" class="form-control form-control-sm metadata-value" placeholder="Value">
            </div>
            <div class="col-2">
                <button type="button" class="btn btn-sm btn-outline-danger remove-metadata-btn">
                    <i class="bi bi-x"></i>
                </button>
            </div>
        `;
        
        metadataRow.querySelector('.remove-metadata-btn').addEventListener('click', function() {
            metadataRow.remove();
        });
        
        metadataFields.appendChild(metadataRow);
    });

    // Show object metadata
    function showObjectMetadata(bucket, key) {
        const metadataTable = document.getElementById('metadata-table');
        metadataTable.innerHTML = `
            <tr>
                <td colspan="2" class="text-center">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </td>
            </tr>
        `;
        
        const modal = new bootstrap.Modal(document.getElementById('objectMetadataModal'));
        modal.show();
        
        fetch(`/buckets/${bucket}/objects/${encodeURIComponent(key)}/metadata`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                metadataTable.innerHTML = '';
                
                if (Object.keys(data.metadata).length === 0) {
                    metadataTable.innerHTML = `
                        <tr>
                            <td colspan="2" class="text-center">No metadata found</td>
                        </tr>
                    `;
                    return;
                }
                
                Object.entries(data.metadata).forEach(([key, value]) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td><strong>${key}</strong></td>
                        <td>${value}</td>
                    `;
                    metadataTable.appendChild(row);
                });
            } else {
                metadataTable.innerHTML = `
                    <tr>
                        <td colspan="2" class="text-center text-danger">${data.message}</td>
                    </tr>
                `;
            }
        })
        .catch(error => {
            metadataTable.innerHTML = `
                <tr>
                    <td colspan="2" class="text-center text-danger">${error.message}</td>
                </tr>
            `;
        });
    }

    // Select all checkbox
    selectAllCheckbox.addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('.object-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
            
            if (this.checked) {
                if (!selectedObjects.some(obj => obj.key === checkbox.dataset.key)) {
                    selectedObjects.push({
                        key: checkbox.dataset.key,
                        type: checkbox.dataset.type
                    });
                }
            } else {
                selectedObjects = [];
            }
        });
        
        updateDeleteSelectedButton();
    });

    // Delete selected button
    function updateDeleteSelectedButton() {
        if (selectedObjects.length > 0) {
            deleteSelectedBtn.disabled = false;
            deleteSelectedBtn.textContent = `Delete Selected (${selectedObjects.length})`;
        } else {
            deleteSelectedBtn.disabled = true;
            deleteSelectedBtn.textContent = 'Delete Selected';
        }
    }

    // Delete selected objects
    deleteSelectedBtn.addEventListener('click', function() {
        if (selectedObjects.length === 0) return;
        
        deleteType = 'multiple';
        deleteTarget = selectedObjects;
        deleteMessage.textContent = `Are you sure you want to delete ${selectedObjects.length} selected items?`;
        const modal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
        modal.show();
    });

    // Confirm delete
    confirmDeleteBtn.addEventListener('click', function() {
        if (!deleteType || !deleteTarget) return;
        
        if (deleteType === 'file') {
            // Delete a single file
            deleteSingleObject(deleteTarget.bucket, deleteTarget.key);
        } else if (deleteType === 'folder') {
            // Delete a folder and all its contents
            deleteFolderContents(deleteTarget.bucket, deleteTarget.key);
        } else if (deleteType === 'multiple') {
            // Delete multiple selected objects
            deleteMultipleObjects(currentBucket, deleteTarget);
        }
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('confirmDeleteModal'));
        modal.hide();
    });

    // Delete a single object
    function deleteSingleObject(bucket, key) {
        fetch(`/buckets/${bucket}/objects/${encodeURIComponent(key)}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // Reload objects
                loadObjects(bucket, currentPrefix);
                
                showNotification('Success', 'Object deleted successfully', 'success');
            } else {
                showNotification('Error', data.message, 'error');
            }
        })
        .catch(error => {
            showNotification('Error', error.message, 'error');
        });
    }

    // Delete a folder and all its contents
    function deleteFolderContents(bucket, prefix) {
        // Get all objects with the prefix
        fetch(`/buckets/${bucket}/objects?prefix=${prefix}`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const deletePromises = data.objects.map(object => {
                    return fetch(`/buckets/${bucket}/objects/${encodeURIComponent(object.key)}`, {
                        method: 'DELETE'
                    });
                });
                
                Promise.all(deletePromises)
                .then(() => {
                    // Reload objects
                    loadObjects(bucket, currentPrefix);
                    
                    showNotification('Success', 'Folder and its contents deleted successfully', 'success');
                });
            } else {
                showNotification('Error', data.message, 'error');
            }
        })
        .catch(error => {
            showNotification('Error', error.message, 'error');
        });
    }

    // Delete multiple objects
    function deleteMultipleObjects(bucket, objects) {
        const deletePromises = objects.map(object => {
            if (object.type === 'folder') {
                return deleteFolderContents(bucket, object.key);
            } else {
                return fetch(`/buckets/${bucket}/objects/${encodeURIComponent(object.key)}`, {
                    method: 'DELETE'
                });
            }
        });
        
        Promise.all(deletePromises)
        .then(() => {
            // Reload objects
            loadObjects(bucket, currentPrefix);
            
            // Clear selections
            selectedObjects = [];
            updateDeleteSelectedButton();
            
            showNotification('Success', 'Selected items deleted successfully', 'success');
        })
        .catch(error => {
            showNotification('Error', error.message, 'error');
        });
    }

    // Show notification
    function showNotification(title, message, type) {
        toastTitle.textContent = title;
        toastBody.textContent = message;
        
        // Remove previous classes
        notificationToast.classList.remove('bg-success', 'bg-danger', 'bg-info', 'text-white');
        
        // Add appropriate class
        if (type === 'success') {
            notificationToast.classList.add('bg-success', 'text-white');
        } else if (type === 'error') {
            notificationToast.classList.add('bg-danger', 'text-white');
        } else if (type === 'info') {
            notificationToast.classList.add('bg-info', 'text-white');
        }
        
        // Show toast
        toastInstance.show();
    }

    // Utility functions
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function formatDate(dateString) {
        return moment(dateString).format('YYYY-MM-DD HH:mm:ss');
    }
});
