/**
 * Compresses an image file on the client side using HTML5 Canvas.
 * Supports resizing and quality adjustments to reduce file size.
 *
 * @param {File|Blob} file The input image file.
 * @param {Object} options Compression options.
 * @param {number} [options.maxWidth=1280] Maximum width of the output image.
 * @param {number} [options.maxHeight=1280] Maximum height of the output image.
 * @param {number} [options.quality=0.8] Compression quality (0.0 to 1.0) for JPEG.
 * @returns {Promise<string>} A promise that resolves with the compressed base64 JPEG data URL.
 */
export function compressImage(file, { maxWidth = 1600, maxHeight = 1600, quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('O arquivo fornecido não é uma imagem válida.'));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      // Clean up object URL memory immediately
      URL.revokeObjectURL(objectUrl);

      let width = img.width;
      let height = img.height;

      // Calculate new dimensions keeping the aspect ratio
      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Não foi possível obter o contexto 2D do canvas.'));
        return;
      }

      // Draw the image onto the canvas at new dimensions
      ctx.drawImage(img, 0, 0, width, height);

      try {
        // Export canvas content as a compressed JPEG data URL
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };

    img.src = objectUrl;
  });
}
