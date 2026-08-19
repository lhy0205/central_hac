"""data/processed/<productId>__<name>/*.jpg 를 SKU 분류용 데이터셋으로 로드.
SKU당 이미지 1장을 검증셋으로 떼어내고 나머지로 학습한다 (이미지가 매우 적은 SKU는
검증 없이 전량 학습에 사용).
"""
import json
import random
from pathlib import Path

import torch
from PIL import Image
from torch.utils.data import Dataset
from torchvision import transforms

IMG_SIZE = 224
NORM_MEAN = [0.485, 0.456, 0.406]
NORM_STD = [0.229, 0.224, 0.225]

train_transform = transforms.Compose([
    transforms.RandomResizedCrop(IMG_SIZE, scale=(0.7, 1.0), interpolation=transforms.InterpolationMode.BICUBIC),
    transforms.RandomHorizontalFlip(),
    transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.02),
    transforms.RandomRotation(10),
    transforms.ToTensor(),
    transforms.Normalize(mean=NORM_MEAN, std=NORM_STD),
])

eval_transform = transforms.Compose([
    transforms.Resize(256, interpolation=transforms.InterpolationMode.BICUBIC),
    transforms.CenterCrop(IMG_SIZE),
    transforms.ToTensor(),
    transforms.Normalize(mean=NORM_MEAN, std=NORM_STD),
])


def build_splits(processed_dir: Path, seed: int = 0):
    rng = random.Random(seed)
    product_ids = []
    train_items = []  # (path, label_idx)
    val_items = []

    folders = sorted(d for d in processed_dir.iterdir() if d.is_dir())
    for folder in folders:
        meta_path = folder / "meta.json"
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        pid = meta.get("productId", folder.name)
        imgs = sorted(folder.glob("*.jpg"))
        if not imgs:
            continue
        label = len(product_ids)
        product_ids.append(pid)

        imgs = imgs.copy()
        rng.shuffle(imgs)
        if len(imgs) >= 4:
            val_items.append((imgs[0], label))
            train_imgs = imgs[1:]
        else:
            train_imgs = imgs  # 이미지가 너무 적으면 검증 없이 전부 학습
        for p in train_imgs:
            train_items.append((p, label))

    return product_ids, train_items, val_items


class SkuDataset(Dataset):
    def __init__(self, items, transform):
        self.items = items
        self.transform = transform

    def __len__(self):
        return len(self.items)

    def __getitem__(self, idx):
        path, label = self.items[idx]
        img = Image.open(path).convert("RGB")
        return self.transform(img), label
