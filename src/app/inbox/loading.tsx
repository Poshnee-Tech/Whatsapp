export default function Loading() {
  return (
    <div className="inbox">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="skeleton" style={{ width: 140, height: 32 }} />
        </div>
        <div className="conversation-list">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="conversation">
              <span className="avatar skeleton" />
              <span className="conversation-body">
                <span className="skeleton" style={{ width: "55%", height: 14 }} />
                <span className="skeleton" style={{ width: "80%", height: 12 }} />
              </span>
            </div>
          ))}
        </div>
      </aside>
      <main className="thread" />
    </div>
  );
}
