import {
  PHOTO_FINGERPRINT_GRID_SIZE,
  buildAverageHashFromGrayscaleValues,
} from "@shared/photoFingerprint";

async function loadImageBitmap(file: File): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== "function") {
    return null;
  }

  try {
    return await createImageBitmap(file);
  } catch {
    return null;
  }
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to decode image for fingerprinting."));
    };

    image.src = objectUrl;
  });
}

function canvasContextForFingerprint(canvas: HTMLCanvasElement) {
  return canvas.getContext("2d", { willReadFrequently: true });
}

export async function computePhotoFingerprint(file: File): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_FINGERPRINT_GRID_SIZE;
  canvas.height = PHOTO_FINGERPRINT_GRID_SIZE;

  const context = canvasContextForFingerprint(canvas);
  if (!context) {
    throw new Error("Unable to access canvas for fingerprinting.");
  }

  const bitmap = await loadImageBitmap(file);
  if (bitmap) {
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
  } else {
    const image = await loadImageElement(file);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const grayscaleValues: number[] = [];

  for (let index = 0; index < imageData.length; index += 4) {
    const red = imageData[index] ?? 0;
    const green = imageData[index + 1] ?? 0;
    const blue = imageData[index + 2] ?? 0;
    grayscaleValues.push(Math.round(red * 0.299 + green * 0.587 + blue * 0.114));
  }

  return buildAverageHashFromGrayscaleValues(grayscaleValues);
}
