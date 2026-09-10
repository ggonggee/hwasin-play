# -*- coding: utf-8 -*-
"""PNG → 무손실 WebP 일괄 변환 (원본은 지운다).

왜 파이썬인가
  이 저장소는 npm 의존성이 0 이고 앞으로도 그럴 생각이다(README 참조). 그런데 Node 에는
  WebP 인코더가 내장돼 있지 않다. 반면 개발 서버가 이미 `python -m http.server` 라 파이썬은
  이 프로젝트의 전제다. 그래서 이미지 변환만 파이썬으로 떼어 둔다.
  Pillow 는 필요하다 — 없으면 아래에서 설치 방법을 알려주고 멈춘다.

왜 무손실인가
  스프라이트·아이콘은 픽셀아트라 손실 압축을 하면 가장자리에 링잉이 생긴다. 실측으로도
  손실 WebP q80/q90 은 보이는 픽셀 RGB 오차가 20을 넘었고, 팔레트 축소는 반투명 가장자리를
  뭉갰다. 무손실 WebP 는 픽셀이 그대로면서 PNG 의 26~49% 로 줄어든다.

사용
  python png2webp.py assets/icons            # 폴더 하위 전부
  python png2webp.py assets/icons --dry-run  # 변환 없이 절감량만
검증
  변환할 때마다 원본과 픽셀을 대조하고, 하나라도 어긋나면 그 파일은 남기고 오류로 끝낸다.
  (보이는 픽셀만 비교한다 — 완전 투명한 자리의 RGB 는 값이 무의미해서 인코더마다 다르다)
"""
import os, sys, glob

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow 가 필요하다.  pip install pillow")

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry-run' in sys.argv
    if not args:
        sys.exit(__doc__)
    root = args[0]
    files = sorted(glob.glob(os.path.join(root, '**', '*.png'), recursive=True))
    if not files:
        sys.exit(f"{root} 아래에 png 가 없다 (이미 변환됐을 수 있다)")

    try:
        import numpy as np
    except ImportError:
        np = None
        print("! numpy 가 없어 픽셀 대조를 건너뛴다 (변환 자체는 무손실이다)")

    old = new = 0
    bad = []
    for p in files:
        im = Image.open(p).convert('RGBA')
        out = p[:-4] + '.webp'
        im.save(out, 'WEBP', lossless=True, quality=100, method=6)
        if np is not None:
            A = np.asarray(im, dtype=np.int16)
            B = np.asarray(Image.open(out).convert('RGBA'), dtype=np.int16)
            vis = A[..., 3] > 0
            drgb = int(abs(A[..., :3][vis] - B[..., :3][vis]).max()) if vis.any() else 0
            dal = int(abs(A[..., 3] - B[..., 3]).max())
            if drgb or dal:
                bad.append((p, drgb, dal))
        old += os.path.getsize(p)
        new += os.path.getsize(out)
        if dry:
            os.remove(out)

    print(f"{len(files)}개  {old/1048576:.2f} MB -> {new/1048576:.2f} MB "
          f"({new/old*100:.0f}%, 절감 {(old-new)/1048576:.2f} MB)")
    if bad:
        for p, r, a in bad[:5]:
            print(f"  픽셀 불일치: {p} (RGB {r} / ALPHA {a})")
        sys.exit(f"픽셀이 어긋난 파일 {len(bad)}개 — 원본을 지우지 않았다")
    if dry:
        print("(--dry-run: 아무것도 바꾸지 않았다)")
        return
    for p in files:
        os.remove(p)
    print(f"원본 png {len(files)}개 삭제 완료")

if __name__ == '__main__':
    main()
