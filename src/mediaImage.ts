export interface MediaAsset {
  name: string;
  type: string;
  data: string;
}
// Bound the encrypted request as well as the original photo. iOS does not
// consistently encode WebP; JPEG quality works across Safari and Chromium.
export const MAX_IMAGE_BYTES = 1_200_000;
export async function imageAsset(file: File): Promise<MediaAsset> {
  if (
    !/^image\/(jpeg|jpg|png|webp|heic|heif|avif|gif)$/i.test(file.type) &&
    !/\.(jpe?g|png|webp|heic|heif|avif|gif)$/i.test(file.name)
  )
    throw new Error("Choisissez une photo JPG, PNG, HEIC ou WebP.");
  if (file.size > 100 * 1024 * 1024)
    throw new Error(
      "Cette photo dépasse 100 Mo. Choisissez une version moins volumineuse.",
    );
  const url = URL.createObjectURL(file),
    img = new Image();
  try {
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error(
        "Le téléphone ne peut pas lire cette photo. Choisissez sa version JPG ou PNG.",
      );
    }
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");
    if (!context || !img.naturalWidth || !img.naturalHeight)
      throw new Error("Cette photo ne peut pas être préparée.");
    let blob: Blob | null = null;
    for (const dimension of [1600, 1280, 1024, 800]) {
      const scale = Math.min(
        1,
        dimension / Math.max(img.naturalWidth, img.naturalHeight),
      );
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.88, 0.76, 0.64]) {
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
        if (blob && blob.size <= MAX_IMAGE_BYTES) break;
      }
      if (blob && blob.size <= MAX_IMAGE_BYTES) break;
    }
    if (!blob || blob.size > MAX_IMAGE_BYTES)
      throw new Error(
        "La préparation de cette photo a échoué. Réessayez avec une autre photo.",
      );
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error("Lecture de la photo impossible."));
      reader.readAsDataURL(blob);
    });
    canvas.width = canvas.height = 1;
    return {
      name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
      type: "image/jpeg",
      data,
    };
  } finally {
    img.src = "";
    URL.revokeObjectURL(url);
  }
}

export async function thumbnailAsset(asset: MediaAsset): Promise<MediaAsset> {
  const img = new Image();
  img.src = asset.data;
  await img.decode();
  const canvas = document.createElement("canvas"),
    scale = Math.min(1, 280 / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL("image/jpeg", 0.65);
  canvas.width = canvas.height = 1;
  img.src = "";
  return { name: asset.name, type: "image/jpeg", data };
}
