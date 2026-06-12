from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from app.core.config import settings


class PaddleOCRService:
    def __init__(
        self,
        *,
        ocr_engine: Any | None = None,
        language: str | None = None,
        use_gpu: bool | None = None,
        min_confidence: float | None = None,
        pdf_max_pages: int | None = None,
    ):
        self.language = language or settings.OCR_LANGUAGE
        self.use_gpu = settings.OCR_USE_GPU if use_gpu is None else use_gpu
        self.min_confidence = settings.OCR_MIN_CONFIDENCE if min_confidence is None else min_confidence
        self.pdf_max_pages = settings.OCR_PDF_MAX_PAGES if pdf_max_pages is None else pdf_max_pages
        self.ocr_engine = ocr_engine or self._build_engine()

    def _build_engine(self):
        try:
            from paddleocr import PaddleOCR
        except ImportError as exc:
            raise RuntimeError("PaddleOCR 未安装；请安装 paddleocr 和 paddlepaddle CPU/GPU 运行时。") from exc
        try:
            return PaddleOCR(lang=self.language, use_gpu=self.use_gpu, show_log=False)
        except (TypeError, ValueError) as exc:
            if "Unknown argument" not in str(exc):
                raise
            return PaddleOCR(lang=self.language)

    def extract_image_text(self, path: Path) -> str:
        image_path = str(path)
        try:
            result = self.ocr_engine.ocr(image_path, cls=True)
        except TypeError as exc:
            if "unexpected keyword argument 'cls'" not in str(exc):
                raise
            result = self.ocr_engine.predict(image_path)
        return self._text_from_result(result)

    def extract_pdf_text(self, path: Path) -> tuple[str, list[tuple[int | None, int | None]]]:
        try:
            import pypdfium2 as pdfium
        except ImportError as exc:
            raise RuntimeError("PDF OCR 需要安装 pypdfium2。") from exc

        parts: list[str] = []
        page_ranges: list[tuple[int | None, int | None]] = []
        with TemporaryDirectory() as tmp_dir:
            pdf = pdfium.PdfDocument(str(path))
            page_count = min(len(pdf), self.pdf_max_pages)
            for page_index in range(page_count):
                page = pdf[page_index]
                image = page.render(scale=2).to_pil()
                image_path = Path(tmp_dir) / f"page-{page_index + 1}.png"
                image.save(image_path)
                text = self.extract_image_text(image_path).strip()
                if text:
                    parts.append(f"# Page {page_index + 1}\n{text}")
                    page_ranges.append((page_index + 1, page_index + 1))
        return "\n\n".join(parts), page_ranges

    def _text_from_result(self, result: Any) -> str:
        texts: list[str] = []
        for item in self._walk_ocr_items(result):
            if not isinstance(item, (list, tuple)) or len(item) < 2:
                continue
            payload = item[1]
            if not isinstance(payload, (list, tuple)) or len(payload) < 2:
                continue
            text, confidence = payload[0], payload[1]
            if isinstance(text, str) and float(confidence) >= self.min_confidence:
                texts.append(text.strip())
        return "\n".join(text for text in texts if text)

    def _walk_ocr_items(self, value: Any):
        if isinstance(value, dict):
            texts = value.get("rec_texts")
            scores = value.get("rec_scores")
            if isinstance(texts, list) and isinstance(scores, list):
                for text, score in zip(texts, scores, strict=False):
                    yield [None, (text, score)]
                return
            for child in value.values():
                yield from self._walk_ocr_items(child)
        if isinstance(value, (list, tuple)):
            if (
                len(value) >= 2
                and isinstance(value[1], (list, tuple))
                and len(value[1]) >= 2
                and isinstance(value[1][0], str)
            ):
                yield value
                return
            for child in value:
                yield from self._walk_ocr_items(child)
