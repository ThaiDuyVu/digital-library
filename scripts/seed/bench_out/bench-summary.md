| Phép đo | CSDL | n | Trung bình (ms) | Trung vị (ms) | p95 (ms) | p99 (ms) | Mongo/Redis (trung vị) |
|---|---|---|---|---|---|---|---|
| read_progress | redis | 1000 | 0.848 | 0.802 | 1.273 | 1.461 |  |
| read_progress | mongo | 1000 | 1.162 | 1.059 | 1.870 | 2.115 | 1.32x |
| write_progress | redis | 1000 | 0.869 | 0.831 | 1.210 | 1.524 |  |
| write_progress | mongo | 1000 | 1.181 | 1.114 | 1.671 | 2.508 | 1.34x |
| ranking_incr | redis | 1000 | 0.875 | 0.837 | 1.258 | 1.604 |  |
| ranking_incr | mongo | 1000 | 1.227 | 1.148 | 1.842 | 2.250 | 1.37x |
| ranking_top10 | redis | 1000 | 0.823 | 0.790 | 1.033 | 1.201 |  |
| ranking_top10 | mongo | 1000 | 1.060 | 1.031 | 1.341 | 1.678 | 1.30x |
