# RAG Data Organization

本目录已按入库价值整理。建议 RAG 自动入库只使用 `_manifests/rag_ingest_allowlist.txt` 中列出的文件；该白名单现已包含 `80_reference_books_limited`。

- `00_core_guidelines`：通用身体活动、学校体育、跌倒预防、卒中康复等核心指南。
- `01_screening_risk`：运动前筛查、PAR-Q+、跌倒风险等安全筛查资料。
- `02_chronic_disease`：高血压、糖尿病、血脂异常、肥胖、COPD、骨质疏松、卒中等慢病资料。
- `03_fitness_assessment`：国民体质和学生体质评价标准。
- `04_traditional_qigong`：八段锦、健身气功运动处方相关资料。
- `05_supporting_evidence`：补充性证据资料。
- `90_web_archives`：网页归档和摘要。
- `80_reference_books_limited`：参考书/教材类。用户已确认允许入库；仍建议在对外商业使用前保留授权/采购记录。
- `_manifests`：整理和下载清单，不应作为知识内容入库。

低价值、重复、元数据过少或不建议入库的文件已移到同级目录 `rag_data_excluded_not_for_rag`。
