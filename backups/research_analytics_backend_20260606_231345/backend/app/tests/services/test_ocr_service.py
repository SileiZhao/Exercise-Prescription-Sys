from app.services.ocr_service import PaddleOCRService


class FakePaddleOCR:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def ocr(self, path, cls=True):
        self.calls.append({"path": path, "cls": cls})
        return self.result


class FakeModernPaddleOCR:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def ocr(self, path, cls=True):
        raise TypeError("PaddleOCR.predict() got an unexpected keyword argument 'cls'")

    def predict(self, path):
        self.calls.append({"path": path})
        return self.result


def test_paddle_ocr_service_extracts_text_from_result(tmp_path):
    image = tmp_path / "scan.png"
    image.write_bytes(b"fake")
    service = PaddleOCRService(ocr_engine=FakePaddleOCR([[[None, ("运动处方", 0.98)]]]))

    text = service.extract_image_text(image)

    assert "运动处方" in text


def test_paddle_ocr_service_falls_back_to_predict_for_modern_api(tmp_path):
    image = tmp_path / "scan.png"
    image.write_bytes(b"fake")
    service = PaddleOCRService(
        ocr_engine=FakeModernPaddleOCR(
            [
                {
                    "rec_texts": ["运动处方", "低置信噪声"],
                    "rec_scores": [0.98, 0.2],
                }
            ]
        )
    )

    text = service.extract_image_text(image)

    assert text == "运动处方"
    assert service.ocr_engine.calls == [{"path": str(image)}]


def test_paddle_ocr_service_builds_engine_without_legacy_gpu_args(monkeypatch):
    calls = []

    class ModernPaddleOCR:
        def __init__(self, **kwargs):
            calls.append(kwargs)
            if "use_gpu" in kwargs or "show_log" in kwargs:
                raise ValueError(f"Unknown argument: {next(iter(kwargs))}")

    monkeypatch.setitem(__import__("sys").modules, "paddleocr", type("Module", (), {"PaddleOCR": ModernPaddleOCR}))

    PaddleOCRService()

    assert calls[-1] == {"lang": "ch"}
