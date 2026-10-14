import type { TaskImage } from "./types";
export const IMAGE_LIMIT = 96 * 1024;
export const MAX_IMAGES = 3;
export const BOARD_IMAGE_LIMIT = 2 * 1024 * 1024;
export function validateImages(value: unknown): TaskImage[] {
  if (!Array.isArray(value) || value.length > MAX_IMAGES)
    throw new Error("Use up to three images per item.");
  return value.map((image) => {
    if (
      !image ||
      typeof image !== "object" ||
      typeof image.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        image.id,
      ) ||
      typeof image.name !== "string" ||
      image.name.length > 120 ||
      typeof image.src !== "string" ||
      !/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(
        image.src,
      ) ||
      image.src.length > Math.ceil((IMAGE_LIMIT * 4) / 3) + 40
    )
      throw new Error("Use a small compressed image.");
    return { id: image.id, name: image.name, src: image.src };
  });
}
export async function compressImage(file: File): Promise<TaskImage> {
  if (
    ![
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "image/avif",
    ].includes(file.type)
  )
    throw new Error("Choose a PNG, JPEG, WebP, GIF or AVIF image.");
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Choose an image under 15 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 50000000)
      throw new Error("This image is too large to process.");
    let edge = 1280;
    for (let attempt = 0; attempt < 7; attempt++) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot process images.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(
          resolve,
          "image/webp",
          Math.max(0.52, 0.82 - attempt * 0.05),
        ),
      );
      if (blob && blob.size <= IMAGE_LIMIT) {
        const src = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Couldn’t read this image."));
          reader.readAsDataURL(blob);
        });
        return {
          id: crypto.randomUUID(),
          name: file.name.slice(0, 120) || "Pasted image",
          src,
        };
      }
      edge = Math.round(edge * 0.8);
    }
    throw new Error(
      "Couldn’t make this image small enough. Try a cropped version.",
    );
  } finally {
    bitmap.close();
  }
}
