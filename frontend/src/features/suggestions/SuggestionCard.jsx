function formatSuggestionDate(value) {
  return new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

export function SuggestionCard({ suggestion, showUser = false, children }) {
  return (
    <article className="suggestion-card">
      <div className="suggestion-card-head">
        <span className={`suggestion-status ${suggestion.reply ? 'replied' : ''}`}>
          <span className="icon sm" aria-hidden="true">{suggestion.reply ? 'mark_chat_read' : 'schedule'}</span>
          {suggestion.reply ? 'Đã phản hồi' : 'Chờ phản hồi'}
        </span>
        <time dateTime={suggestion.createdAt}>{formatSuggestionDate(suggestion.createdAt)}</time>
      </div>
      {showUser && <h3 className="suggestion-user"><span className="icon sm" aria-hidden="true">person</span>{suggestion.username}</h3>}
      <p className="suggestion-description">{suggestion.description}</p>
      {suggestion.reply ? (
        <div className="suggestion-reply">
          <h4><span className="icon sm" aria-hidden="true">support_agent</span>Phản hồi từ thư viện</h4>
          <p>{suggestion.reply}</p>
          <time dateTime={suggestion.repliedAt}>Cập nhật {formatSuggestionDate(suggestion.repliedAt)}</time>
        </div>
      ) : !showUser && <p className="muted small">Thư viện đã nhận được đề xuất. Bạn có thể quay lại đây để xem phản hồi nhé!</p>}
      {children}
    </article>
  )
}
