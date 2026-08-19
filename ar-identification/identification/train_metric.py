"""DINOv2 백본(마지막 N개 블록만 unfreeze) + ArcFace head로 SKU 분류 학습.
목표는 96-way 분류 자체가 아니라, 학습된 임베딩 공간에서 같은 SKU끼리 가깝게 모이도록
만드는 것 -> 실사용시엔 이 임베딩으로 최근접 검색(gallery)을 한다.
평가는 검증 이미지(SKU당 1장, held-out)를 쿼리로 삼아 train 이미지들로 만든 gallery에
대해 최근접 검색 top-1/top-5 정확도로 측정 (실제 배포 시나리오와 동일한 방식).
"""
import argparse
import math
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader

from dataset import SkuDataset, build_splits, eval_transform, train_transform

HERE = Path(__file__).parent
PROCESSED = HERE.parent / "data" / "processed"
CKPT_DIR = HERE / "checkpoints"

EMBED_DIM = 256
UNFREEZE_LAST_N_BLOCKS = 2


class ArcMarginProduct(nn.Module):
    def __init__(self, in_features, out_features, s=30.0, m=0.30):
        super().__init__()
        self.s, self.m = s, m
        self.weight = nn.Parameter(torch.randn(out_features, in_features))
        nn.init.xavier_uniform_(self.weight)
        self.cos_m, self.sin_m = math.cos(m), math.sin(m)
        self.th, self.mm = math.cos(math.pi - m), math.sin(math.pi - m) * m

    def forward(self, embeddings, labels):
        cosine = F.linear(F.normalize(embeddings), F.normalize(self.weight))
        sine = torch.sqrt((1.0 - cosine.pow(2)).clamp(0, 1))
        phi = cosine * self.cos_m - sine * self.sin_m
        phi = torch.where(cosine > self.th, phi, cosine - self.mm)
        one_hot = F.one_hot(labels, cosine.size(1)).float()
        logits = one_hot * phi + (1.0 - one_hot) * cosine
        return logits * self.s


class EmbeddingModel(nn.Module):
    def __init__(self, backbone, embed_dim):
        super().__init__()
        self.backbone = backbone
        self.head = nn.Linear(768, embed_dim)

    def forward(self, x):
        feats = self.backbone(x)
        emb = self.head(feats)
        return F.normalize(emb, dim=-1)


def setup_backbone(device):
    backbone = torch.hub.load("facebookresearch/dinov2", "dinov2_vitb14")
    for p in backbone.parameters():
        p.requires_grad = False
    for blk in backbone.blocks[-UNFREEZE_LAST_N_BLOCKS:]:
        for p in blk.parameters():
            p.requires_grad = True
    return backbone.to(device)


@torch.no_grad()
def embed_all(model, items, transform, device, batch_size=64):
    ds = SkuDataset(items, transform)
    dl = DataLoader(ds, batch_size=batch_size, shuffle=False, num_workers=4)
    model.eval()
    embs, labels = [], []
    for x, y in dl:
        e = model(x.to(device))
        embs.append(e.cpu())
        labels.append(y)
    return torch.cat(embs), torch.cat(labels)


@torch.no_grad()
def evaluate(model, train_items, val_items, device):
    if not val_items:
        return None
    gal_emb, gal_label = embed_all(model, train_items, eval_transform, device)
    val_emb, val_label = embed_all(model, val_items, eval_transform, device)
    sims = val_emb @ gal_emb.T
    top1 = top5 = 0
    for i in range(len(val_items)):
        order = torch.argsort(sims[i], descending=True)
        top5_labels = gal_label[order[:5]]
        if top5_labels[0] == val_label[i]:
            top1 += 1
        if val_label[i] in top5_labels:
            top5 += 1
    return top1 / len(val_items), top5 / len(val_items)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--lr-head", type=float, default=1e-3)
    ap.add_argument("--lr-backbone", type=float, default=1e-5)
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    CKPT_DIR.mkdir(parents=True, exist_ok=True)

    product_ids, train_items, val_items = build_splits(PROCESSED)
    n_classes = len(product_ids)
    print(f"[data] classes={n_classes} train={len(train_items)} val={len(val_items)}")

    backbone = setup_backbone(device)
    model = EmbeddingModel(backbone, EMBED_DIM).to(device)
    arcface = ArcMarginProduct(EMBED_DIM, n_classes).to(device)

    backbone_params = [p for p in model.backbone.parameters() if p.requires_grad]
    other_params = list(model.head.parameters()) + list(arcface.parameters())
    optim = torch.optim.AdamW([
        {"params": backbone_params, "lr": args.lr_backbone},
        {"params": other_params, "lr": args.lr_head},
    ], weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(optim, T_max=args.epochs)

    train_ds = SkuDataset(train_items, train_transform)
    train_dl = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=4, drop_last=True)

    best_top1 = -1
    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss, n_batches = 0.0, 0
        for x, y in train_dl:
            x, y = x.to(device), y.to(device)
            emb = model(x)
            logits = arcface(emb, y)
            loss = F.cross_entropy(logits, y)
            optim.zero_grad()
            loss.backward()
            optim.step()
            total_loss += loss.item()
            n_batches += 1
        sched.step()

        avg_loss = total_loss / max(n_batches, 1)
        metrics = evaluate(model, train_items, val_items, device)
        if metrics:
            top1, top5 = metrics
            print(f"[epoch {epoch}/{args.epochs}] loss={avg_loss:.4f} val_top1={top1:.3f} val_top5={top5:.3f}")
            if top1 > best_top1:
                best_top1 = top1
                torch.save(
                    {"backbone": model.backbone.state_dict(), "head": model.head.state_dict(),
                     "product_ids": product_ids, "embed_dim": EMBED_DIM},
                    CKPT_DIR / "best.pt",
                )
        else:
            print(f"[epoch {epoch}/{args.epochs}] loss={avg_loss:.4f}")

    print(f"[done] best val_top1={best_top1:.3f} -> {CKPT_DIR / 'best.pt'}")


if __name__ == "__main__":
    main()
