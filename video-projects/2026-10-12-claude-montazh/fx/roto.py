# Rotoscope the speaker on the clean timeline with SAM 2 (object-separation skill, adapted).
# Run with the .object-separation venv from the repo root:
#   .object-separation/bin/python video-projects/2026-10-12-claude-montazh/fx/roto.py [seg ...]
# Writes fx/masks/<seg>/<frame:05d>.png (960 wide, white = speaker), frame = clean-timeline frame.
import os, sys, numpy as np, torch, cv2
from transformers import Sam2VideoModel, Sam2VideoProcessor

HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO = os.path.join(HERE, "..", "renders", "clean.mp4")
W = 960
# start/end frames at 30 fps; click points on the START frame (960-wide px), 1 = speaker, 0 = background
SEGS = {
    "hook":  dict(start=0,    end=152,  pts=[[480, 560], [480, 1150], [80, 1200], [200, 400], [880, 800]], lbl=[1, 1, 1, 0, 0]),
    "never": dict(start=1006, end=1082, pts=[[560, 660], [400, 1300], [180, 500], [840, 300]],              lbl=[1, 1, 0, 0]),
}

if torch.cuda.is_available():
    dev, MODEL = "cuda", "facebook/sam2.1-hiera-large"
elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
    dev, MODEL = "mps", "facebook/sam2.1-hiera-base-plus"
else:
    dev, MODEL = "cpu", "facebook/sam2.1-hiera-tiny"
print("device:", dev, "| model:", MODEL, flush=True)
model = Sam2VideoModel.from_pretrained(MODEL).to(dev).eval()
proc = Sam2VideoProcessor.from_pretrained(MODEL)


def read_frames(a, b):
    cap = cv2.VideoCapture(VIDEO); cap.set(cv2.CAP_PROP_POS_FRAMES, a); out = []
    for _ in range(a, b + 1):
        ok, im = cap.read()
        if not ok: break
        out.append(cv2.cvtColor(cv2.resize(im, (W, int(im.shape[0] * W / im.shape[1]))), cv2.COLOR_BGR2RGB))
    return out


def separate_chunk(frames, points=None, labels=None, mask=None):
    H = frames[0].shape[0]
    s = proc.init_video_session(video=frames, inference_device=dev, video_storage_device="cpu",
                                inference_state_device="cpu", dtype=torch.float32)
    if mask is None:
        proc.add_inputs_to_inference_session(inference_session=s, frame_idx=0, obj_ids=1,
                                             input_points=[[points]], input_labels=[[labels]])
    else:
        proc.add_inputs_to_inference_session(inference_session=s, frame_idx=0, obj_ids=1,
                                             input_masks=mask.astype(np.uint8))
    res = {}
    with torch.inference_mode():
        model(inference_session=s, frame_idx=0)
        for o in model.propagate_in_video_iterator(s, start_frame_idx=0):
            m = proc.post_process_masks([o.pred_masks], original_sizes=[[H, W]], binarize=True)[0]
            res[o.frame_idx] = m.squeeze().cpu().numpy().astype(bool)
    return res


def separate(start, end, pts, lbl, ch=60):
    out, a, seed = {}, start, None
    while a < end:
        b = min(end, a + ch)
        fr = read_frames(a, b)
        r = separate_chunk(fr, points=pts, labels=lbl) if seed is None else separate_chunk(fr, mask=seed)
        for k, m in r.items():
            out[a + k] = m
        seed, a = r[len(fr) - 1], b
        print(f"  frames {a}/{end}", flush=True)
    return out


for name in (sys.argv[1:] or SEGS):
    s = SEGS[name]
    print("segment", name, s["start"], "→", s["end"], flush=True)
    masks = separate(s["start"], s["end"], s["pts"], s["lbl"])
    d = os.path.join(HERE, "masks", name); os.makedirs(d, exist_ok=True)
    for f, m in masks.items():
        cv2.imwrite(os.path.join(d, f"{f:05d}.png"), m.astype(np.uint8) * 255)
    print("saved", len(masks), "masks →", d, flush=True)
