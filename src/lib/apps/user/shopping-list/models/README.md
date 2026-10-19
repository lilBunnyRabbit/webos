# Text models

PaddleOCR's PP-OCRv5 models, as published by PaddlePaddle on Hugging Face. Apache License 2.0, © PaddlePaddle Authors.

| File | Source | What |
|------|--------|------|
| `det.onnx` | [PaddlePaddle/PP-OCRv5_mobile_det_onnx](https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det_onnx) `inference.onnx` | Finds the text on the photo |
| `latin-rec.onnx` | [PaddlePaddle/latin_PP-OCRv5_mobile_rec_onnx](https://huggingface.co/PaddlePaddle/latin_PP-OCRv5_mobile_rec_onnx) `inference.onnx` | Reads each piece of text |
| `latin-dict.json` | `character_dict` of the same repo's `inference.yml` | The recogniser's 836 characters, in order |

Unchanged from the source. Vite ships them as hashed assets; the service worker caches them in `webos-wasm` on first use.

How they work, why these and the measured numbers: [docs/apps/shopping-list.md › Reading a photo](../../../../../../docs/apps/shopping-list.md#reading-a-photo).
