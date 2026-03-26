/**
 * ar-loader.js
 * Reusable camera permission + loading-state handler for AR.js apps.
 *
 * Exports:
 *   requestCameraPermission() → Promise<boolean>
 *   showLoader()
 *   hideLoader()
 */

const permissionScreen = document.getElementById('permission-screen');
const arContainer      = document.getElementById('ar-container');
const loader           = document.getElementById('loader');
const startBtn         = document.getElementById('start-btn');

/**
 * Shows the permission prompt and waits for the user to click the start button,
 * then requests camera access via the MediaDevices API.
 *
 * @returns {Promise<boolean>} true if camera access was granted, false otherwise.
 */
export function requestCameraPermission() {
  return new Promise((resolve) => {
    if (!startBtn) {
      resolve(false);
      return;
    }

    startBtn.addEventListener('click', async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        permissionScreen?.classList.add('hidden');
        arContainer?.classList.remove('hidden');
        resolve(true);
      } catch (err) {
        console.error('[ar-loader] Camera permission denied:', err);
        startBtn.textContent = 'Camera access denied';
        startBtn.disabled = true;
        resolve(false);
      }
    }, { once: true });
  });
}

/** Reveals the loader overlay. */
export function showLoader() {
  loader?.classList.remove('hidden');
}

/** Hides the loader overlay. */
export function hideLoader() {
  loader?.classList.add('hidden');
}
