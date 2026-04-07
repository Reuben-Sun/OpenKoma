export type ImageResponse = {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
};

function getImageSizeFromUrl(url: string): Promise<{ naturalWidth: number; naturalHeight: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight
      });
    };

    image.onerror = () => {
      reject(new Error("无法解析图片尺寸"));
    };

    image.src = url;
  });
}

export async function uploadLocalImage(file: File): Promise<ImageResponse> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const size = await getImageSizeFromUrl(objectUrl);
    return {
      url: objectUrl,
      naturalWidth: size.naturalWidth,
      naturalHeight: size.naturalHeight
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}
