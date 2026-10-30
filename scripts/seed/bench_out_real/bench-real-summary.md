| Phép đo | CSDL | n | Trung bình (ms) | Trung vị (ms) | p95 (ms) | p99 (ms) | Mongo/Redis (trung vị) |
|---|---|---|---|---|---|---|---|
| read_progress | redis | 1000 | 0.172 | 0.168 | 0.204 | 0.304 |  |
| read_progress | mongo | 1000 | 0.259 | 0.257 | 0.294 | 0.371 | 1.53x |
| write_progress | redis | 1000 | 0.174 | 0.175 | 0.215 | 0.283 |  |
| write_progress | mongo | 1000 | 0.259 | 0.261 | 0.298 | 0.528 | 1.49x |
| ranking_incr | redis | 1000 | 0.175 | 0.167 | 0.231 | 0.490 |  |
| ranking_incr | mongo | 1000 | 0.274 | 0.263 | 0.384 | 0.664 | 1.57x |
| ranking_top10 | redis | 1000 | 0.291 | 0.223 | 0.668 | 1.170 |  |
| ranking_top10 | mongo | 1000 | 0.475 | 0.343 | 1.153 | 1.925 | 1.54x |
| read_chapter | mongo | 1000 | 0.265 | 0.262 | 0.297 | 0.327 | – |
