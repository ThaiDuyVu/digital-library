import { useEffect, useId, useState } from 'react'
import { apiGet, apiPost, apiPut } from '../../shared/api'

/**
 * initial = null  -> thêm sách mới (POST /books)
 * initial = BookDetail -> sửa thông tin sách (PUT /books/{id}), không đụng tới chương
 */
export function BookForm({ initial = null, onSaved, onCancel }) {
  const isEdit = Boolean(initial)
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    author: initial?.author ?? '',
    description: initial?.description ?? '',
    coverUrl: initial?.coverUrl ?? '',
  })
  const [categories, setCategories] = useState(initial?.categories ?? []) // thể loại đã chọn
  const [available, setAvailable] = useState([]) // thể loại đã có trong kho sách
  const [newCategory, setNewCategory] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const categoryLabelId = useId()

  // Lấy các thể loại đã có để chọn, tránh gõ sai chính tả tạo ra thể loại trùng
  useEffect(() => {
    let active = true
    apiGet('/books/categories')
      .then((names) => { if (active) setAvailable(names) })
      .catch(() => { if (active) setAvailable([]) })
    return () => { active = false }
  }, [])

  // Hiển thị: thể loại có sẵn + các thể loại đã chọn nhưng chưa có trong kho (mới thêm)
  const options = [...available, ...categories.filter((name) => !available.includes(name))]

  function toggleCategory(name) {
    setCategories((prev) => (
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    ))
  }

  function addCategory() {
    const name = newCategory.trim()
    if (!name) return
    // Trùng tên (không phân biệt hoa thường) với thể loại sẵn có thì chọn lại thể loại đó
    const existing = options.find((item) => item.toLowerCase() === name.toLowerCase())
    const finalName = existing ?? name
    setCategories((prev) => (prev.includes(finalName) ? prev : [...prev, finalName]))
    setNewCategory('')
  }

  function handleCategoryKey(event) {
    if (event.key === 'Enter') {
      event.preventDefault() // Enter chỉ thêm thể loại, không gửi form
      addCategory()
    }
  }

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  function validate(categories) {
    if (!form.title.trim()) return 'Vui lòng nhập tên sách.'
    if (form.title.trim().length > 300) return 'Tên sách tối đa 300 ký tự.'
    if (!form.author.trim()) return 'Vui lòng nhập tác giả.'
    if (form.author.trim().length > 200) return 'Tên tác giả tối đa 200 ký tự.'
    if (categories.length > 20) return 'Tối đa 20 thể loại.'
    if (categories.some((name) => name.length > 100)) return 'Mỗi thể loại tối đa 100 ký tự.'
    if (form.description.length > 5000) return 'Mô tả tối đa 5000 ký tự.'
    if (form.coverUrl.length > 2000) return 'Đường dẫn ảnh bìa tối đa 2000 ký tự.'
    return ''
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const problem = validate(categories)
    if (problem) {
      setError(problem)
      return
    }

    const payload = {
      title: form.title.trim(),
      author: form.author.trim(),
      categories,
      description: form.description.trim(),
      coverUrl: form.coverUrl.trim(),
    }

    setError('')
    setBusy(true)
    try {
      const saved = isEdit
        ? await apiPut(`/books/${initial.id}`, payload)
        : await apiPost('/books', { ...payload, chapters: [] })
      onSaved(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <h3>{isEdit ? 'Sửa thông tin sách' : 'Thêm sách mới'}</h3>

      <label className="field">
        <span>Tên sách *</span>
        <input value={form.title} onChange={update('title')} maxLength={300} required />
      </label>
      <label className="field">
        <span>Tác giả *</span>
        <input value={form.author} onChange={update('author')} maxLength={200} required />
      </label>
      <div className="field">
        <span id={categoryLabelId}>Thể loại</span>
        {options.length > 0 ? (
          <div className="chip-picker" role="group" aria-labelledby={categoryLabelId}>
            {options.map((name) => {
              const selected = categories.includes(name)
              return (
                <button
                  key={name}
                  type="button"
                  className={selected ? 'chip-option selected' : 'chip-option'}
                  aria-pressed={selected}
                  onClick={() => toggleCategory(name)}
                >
                  {selected && <span className="icon sm" aria-hidden="true">check</span>}
                  {name}
                </button>
              )
            })}
          </div>
        ) : (
          <span className="muted small">Chưa có thể loại nào, hãy thêm thể loại mới bên dưới.</span>
        )}
        <div className="chip-add">
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={handleCategoryKey}
            placeholder="Thêm thể loại mới…"
            maxLength={100}
            aria-label="Tên thể loại mới"
          />
          <button type="button" className="btn" onClick={addCategory} disabled={!newCategory.trim()}>
            <span className="icon sm" aria-hidden="true">add</span>
            Thêm
          </button>
        </div>
        <span className="muted small">Đã chọn {categories.length} thể loại.</span>
      </div>
      <label className="field">
        <span>Mô tả</span>
        <textarea value={form.description} onChange={update('description')} rows={4} maxLength={5000} />
      </label>
      <label className="field">
        <span>Đường dẫn ảnh bìa</span>
        <input
          type="url"
          value={form.coverUrl}
          onChange={update('coverUrl')}
          placeholder="https://…"
        />
      </label>

      {isEdit && (
        <p className="muted small">
          Form này chỉ sửa thông tin sách. Để thêm hoặc sửa chương, dùng mục “Chương” trong trang quản trị.
        </p>
      )}
      {error && <p className="error-text" role="alert">{error}</p>}

      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Đang lưu…' : isEdit ? 'Lưu thay đổi' : 'Tạo sách'}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>Hủy</button>
      </div>
    </form>
  )
}