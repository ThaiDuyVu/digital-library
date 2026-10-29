import { useEffect, useState } from 'react'
import { apiGet } from '../../shared/api'
import { BookCover } from './BookCover'
import { RelatedBooks } from './RelatedBooks'

function ChapterReader({ bookId, chapterNo }) {
  const [chapter, setChapter] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setChapter(null)
    setError('')
    apiGet(`/books/${bookId}/chapters/${chapterNo}`)
      .then((data) => { if (active) setChapter(data) })
      .catch((err) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [bookId, chapterNo])

  if (error) return <p className="error-text" role="alert">{error}</p>
  if (!chapter) return <p className="muted">Đang tải chương…</p>

  return (
    <article className="chapter-text">
      <h3>Chương {chapter.chapterNo}: {chapter.title}</h3>
      {chapter.content && <p className="prose">{chapter.content}</p>}
      {chapter.sections?.map((section) => (
        <section key={section.sectionNo}>
          <h4>{section.heading}</h4>
          <p className="prose">{section.text}</p>
        </section>
      ))}
    </article>
  )
}

export function BookDetail({ bookId, onBack, onRead, onSelect }) {
  const [book, setBook] = useState(null)
  const [error, setError] = useState('')
  const [openChapter, setOpenChapter] = useState(null)

  useEffect(() => {
    let active = true
    setBook(null)
    setError('')
    setOpenChapter(null)
    apiGet(`/books/${bookId}`)
      .then((data) => { if (active) setBook(data) })
      .catch((err) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [bookId])

  return (
    <section className="panel">
      <div className="detail-actions">
        <button type="button" className="btn" onClick={onBack}>
          <span className="icon sm" aria-hidden="true">arrow_back</span>
          Về kho sách
        </button>
        {book && book.chapters.length > 0 && (
          <button type="button" className="btn primary" onClick={() => onRead(book.id)}>
            <span className="icon sm" aria-hidden="true">auto_stories</span>
            Đọc sách
          </button>
        )}
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}
      {!book && !error && <p className="muted">Đang tải thông tin sách…</p>}

      {book && (
        <>
          <div className="detail-head">
            <BookCover book={book} className="detail-cover" />
            <div>
              <h2>{book.title}</h2>
              <p className="book-author">Tác giả: <strong>{book.author}</strong></p>
              <div className="chips">
                {book.categories.map((name) => (
                  <span key={name} className="chip">{name}</span>
                ))}
              </div>
              {book.description && <p className="prose">{book.description}</p>}
              <p className="muted small">
                {book.chapters.length} chương · cập nhật{' '}
                {new Date(book.updatedAt ?? book.createdAt).toLocaleDateString('vi-VN')}
              </p>
            </div>
          </div>

          <h3>Mục lục</h3>
          {book.chapters.length === 0 && <p className="muted">Sách chưa có chương nào.</p>}
          <ol className="toc">
            {book.chapters.map((chapter) => (
              <li key={chapter.chapterNo}>
                <button
                  type="button"
                  className={openChapter === chapter.chapterNo ? 'toc-item active' : 'toc-item'}
                  onClick={() => setOpenChapter(
                    openChapter === chapter.chapterNo ? null : chapter.chapterNo,
                  )}
                >
                  <span>Chương {chapter.chapterNo}: {chapter.title}</span>
                  {chapter.sectionHeadings.length > 0 && (
                    <span className="muted small">{chapter.sectionHeadings.length} mục</span>
                  )}
                </button>
                {openChapter === chapter.chapterNo && (
                  <ChapterReader bookId={book.id} chapterNo={chapter.chapterNo} />
                )}
              </li>
            ))}
          </ol>

          <RelatedBooks book={book} onSelect={onSelect} onRead={onRead} />
        </>
      )}
    </section>
  )
}