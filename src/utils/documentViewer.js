/**
 * Utility helper to safely view, open, and download documents and base64 data URIs
 * Solves browser security restrictions where navigating top frame to data: URIs results in blank pages.
 */

export function dataURItoBlob(dataURI) {
  if (!dataURI) return null;
  try {
    const parts = dataURI.split(',');
    const byteString = parts[0].indexOf('base64') >= 0 ? atob(parts[1]) : decodeURIComponent(parts[1]);
    const mimeString = parts[0].split(':')[1].split(';')[0];
    const ia = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ia], { type: mimeString });
  } catch (err) {
    console.error('Error converting dataURI to Blob:', err);
    return null;
  }
}

export function openDocumentSafely(docUrl, fileName = 'document') {
  if (!docUrl) return;

  // If already standard URL or object URL
  if (docUrl.startsWith('http://') || docUrl.startsWith('https://') || docUrl.startsWith('blob:')) {
    window.open(docUrl, '_blank');
    return;
  }

  // If base64 data URI
  if (docUrl.startsWith('data:')) {
    const blob = dataURItoBlob(docUrl);
    if (blob) {
      const blobUrl = URL.createObjectURL(blob);
      const newWin = window.open(blobUrl, '_blank');
      if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
        downloadDocument(docUrl, fileName);
      }
      return;
    }
  }

  // Fallback
  window.open(docUrl, '_blank');
}

export function downloadDocument(docUrl, fileName = 'document') {
  if (!docUrl) return;
  try {
    let finalUrl = docUrl;
    let isBlobCreated = false;

    if (docUrl.startsWith('data:')) {
      const blob = dataURItoBlob(docUrl);
      if (blob) {
        finalUrl = URL.createObjectURL(blob);
        isBlobCreated = true;
      }
    }

    const a = document.createElement('a');
    a.href = finalUrl;
    a.download = fileName || 'document';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (isBlobCreated) {
      setTimeout(() => URL.revokeObjectURL(finalUrl), 5000);
    }
  } catch (err) {
    console.error('Error downloading document:', err);
  }
}
