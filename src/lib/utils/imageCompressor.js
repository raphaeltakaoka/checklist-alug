/**
 * Compresses an image file on the client side using HTML5 Canvas.
 * Supports resizing and quality adjustments to reduce file size.
 *
 * @param {File|Blob} file The input image file.
 * @param {Object} options Compression options.
 * @param {number} [options.maxWidth=1280] Maximum width of the output image.
 * @param {number} [options.maxHeight=1280] Maximum height of the output image.
 * @param {number} [options.quality=0.8] Initial JPEG quality (0.0 to 1.0).
 * @param {number} [options.maxBytes=1500000] Maximum compressed byte size.
 * @returns {Promise<Blob>} The bounded compressed JPEG blob.
 */
export function compressImage(
  file,
  { maxWidth = 1600, maxHeight = 1600, quality = 0.85, maxBytes = 1_500_000 } = {},
) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('O arquivo fornecido não é uma imagem válida.'));
      return;
    }
		if (file.size > 20_000_000) {
			reject(new Error('A imagem original excede o limite de 20 MB.'));
			return;
		}

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

		img.onload = async () => {
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
				URL.revokeObjectURL(objectUrl);
        reject(new Error('Não foi possível obter o contexto 2D do canvas.'));
        return;
      }

      // Draw the image onto the canvas at new dimensions
      ctx.drawImage(img, 0, 0, width, height);

			try {
				let currentQuality = Math.min(0.92, Math.max(0.45, quality));
				let output = null;
				while (currentQuality >= 0.45) {
					output = await new Promise((resolveBlob) =>
						canvas.toBlob(resolveBlob, 'image/jpeg', currentQuality),
					);
					if (!output) throw new Error('Não foi possível codificar a imagem.');
					if (output.size <= maxBytes) break;
					currentQuality -= 0.1;
				}
				if (!output || output.size > maxBytes) {
					throw new Error('A imagem não pôde ser reduzida ao tamanho permitido.');
				}
				resolve(output);
			} catch (error) {
				reject(error);
			} finally {
				URL.revokeObjectURL(objectUrl);
			}
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };

    img.src = objectUrl;
  });
}
