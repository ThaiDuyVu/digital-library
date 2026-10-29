import { BookCover } from './BookCover'

/**
 * Thẻ sách dùng chung cho Kho sách, Sách liên quan và Thịnh hành.
 *
 * Thẻ là <article> chứ không phải <button>: bên trong đã có nút "Đọc sách" riêng,
 * mà HTML không cho lồng button trong button.
 *
 * Props:
 *  - horizontal: bìa bên trái, thông tin bên phải (dùng ở bảng Thịnh hành)
 *  - compact: bản ngang thu nhỏ cho cột bên của trang đọc, bỏ mô tả và thể loại
 *  - className: lớp thêm, ví dụ đánh dấu sách đang đọc
 *  - lead: phần tử đặt trước bìa, ví dụ số hạng
 *  - meta: phần tử thêm vào thân thẻ, ví dụ lượt đọc và xu hướng
 */
export function BookCard({
  book, onSelect, onRead, horizontal = false, compact = false, className = '', lead = null, meta = null,
}) {
  const classes = ['book-card', horizontal && 'horizontal', compact && 'compact', className].filter(Boolean)
  return (
    <article className={classes.join(' ')}>
      {lead}
      <button
        type="button"
        className="book-card-open"
        onClick={() => onSelect(book.id)}
        aria-label={`Xem chi tiết ${book.title}`}
      >
        <BookCover book={book} />
        <div className="book-card-body">
          <strong className="book-title">{book.title}</strong>
          <span className="book-author">{book.author}</span>
          {!compact && (
            <div className="chips">
              {book.categories.slice(0, 2).map((name) => (
                <span key={name} className="chip">{name}</span>
              ))}
            </div>
          )}
          {horizontal && !compact && book.description && <p className="book-desc">{book.description}</p>}
          {meta}
        </div>
      </button>
      <div className="book-card-foot">
        <span>{book.chapterCount} chương</span>
        <div className="book-card-actions">
          {horizontal && (
            <button type="button" className="btn small-btn" onClick={() => onSelect(book.id)}>
              <span className="icon sm" aria-hidden="true">info</span>
              Xem chi tiết
            </button>
          )}
          <button
            type="button"
            className="btn primary small-btn"
            onClick={() => onRead(book.id)}
            aria-label={`Đọc ${book.title}`}
          >
            <span className="icon sm" aria-hidden="true">auto_stories</span>
            Đọc sách
          </button>
        </div>
      </div>
    </article>
  )
}
