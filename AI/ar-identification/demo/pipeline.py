import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from ultralytics import YOLO

HERE = Path(__file__).parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "identification"))
from dataset import eval_transform  # noqa: E402
from train_metric import EmbeddingModel, setup_backbone  # noqa: E402

DETECT_WEIGHTS = ROOT / "detection" / "weights" / "bag_detect.pt"
ID_CKPT = ROOT / "identification" / "checkpoints" / "best.pt"
GALLERY_NPZ = ROOT / "data" / "gallery" / "gallery_embeddings.npz"
GALLERY_NAMES = ROOT / "data" / "gallery" / "gallery_names.json"

DETECT_CONF = 0.35


class BagPipeline:
    def __init__(self, device: str | None = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")

        self.detector = YOLO(str(DETECT_WEIGHTS))

        ckpt = torch.load(ID_CKPT, map_location=self.device)
        backbone = setup_backbone(self.device)
        self.id_model = EmbeddingModel(backbone, ckpt["embed_dim"]).to(self.device)
        self.id_model.backbone.load_state_dict(ckpt["backbone"])
        self.id_model.head.load_state_dict(ckpt["head"])
        self.id_model.eval()

        gal = np.load(GALLERY_NPZ)
        self.gal_emb = torch.tensor(gal["embeddings"], dtype=torch.float32).to(self.device)
        self.gal_pids = gal["product_ids"]

        import json
        self.names = json.loads(GALLERY_NAMES.read_text(encoding="utf-8"))

    def detect(self, image: Image.Image):
        result = self.detector.predict(image, conf=DETECT_CONF, verbose=False)[0]
        boxes = []
        for b in result.boxes:
            xyxy = b.xyxy[0].tolist()
            conf = float(b.conf[0])
            cls = self.detector.names[int(b.cls[0])]
            boxes.append({"xyxy": xyxy, "conf": conf, "class": cls})
        return boxes

    @torch.no_grad()
    def identify(self, crop: Image.Image, topk: int = 3):
        x = eval_transform(crop.convert("RGB")).unsqueeze(0).to(self.device)
        emb = self.id_model(x)
        sims = (emb @ self.gal_emb.T).squeeze(0)
        order = torch.argsort(sims, descending=True)[:topk]
        return [
            {
                "productId": str(self.gal_pids[i]),
                "name": self.names.get(str(self.gal_pids[i])),
                "similarity": float(sims[i]),
            }
            for i in order
        ]

    def run(self, image_path: str, topk: int = 3):
        image = Image.open(image_path).convert("RGB")
        boxes = self.detect(image)
        results = []
        for box in boxes:
            x1, y1, x2, y2 = [int(v) for v in box["xyxy"]]
            crop = image.crop((x1, y1, x2, y2))
            candidates = self.identify(crop, topk=topk)
            results.append({"box": box, "candidates": candidates})
        return image, results


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--topk", type=int, default=3)
    args = ap.parse_args()

    pipeline = BagPipeline()
    image, results = pipeline.run(args.image, topk=args.topk)

    if not results:
        print("[no bag detected]")
    for r in results:
        print(f"box={r['box']['xyxy']} det_conf={r['box']['conf']:.2f}")
        for c in r["candidates"]:
            print(f"  {c['similarity']:.3f}  {c['productId']}  {c['name']}")
