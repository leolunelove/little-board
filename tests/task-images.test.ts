import { test } from "node:test";
import assert from "node:assert/strict";
import { validateImages, IMAGE_LIMIT } from "../lib/task-images";
import { taskPatch } from "../lib/security";
const image = {
  id: "8b12e658-bb7b-4f56-9afc-799171ff50be",
  name: "Reference",
  src: "data:image/webp;base64,UklGRg==",
};
test("attachments keep only bounded raster data and reject external, SVG and excessive images", () => {
  assert.deepEqual(taskPatch({ images: [image] }), { images: [image] });
  assert.throws(() =>
    validateImages([{ ...image, src: "https://example.com/image.png" }]),
  );
  assert.throws(() =>
    validateImages([{ ...image, src: "data:image/svg+xml;base64,PHN2Zz4=" }]),
  );
  assert.throws(() => validateImages(Array(4).fill(image)));
  assert.throws(() =>
    validateImages([
      {
        ...image,
        src: "data:image/webp;base64," + "A".repeat(IMAGE_LIMIT * 2),
      },
    ]),
  );
  assert.deepEqual(taskPatch({ images: [] }), { images: [] });
});
