import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="panel" style={{ maxWidth: 420, width: '100%' }}>
        <div className="empty"><b>Page not found</b>The page you opened does not exist.
          <div style={{ marginTop: 14 }}><Link className="btn" href="/" style={{ textDecoration: 'none' }}>Go to Overview</Link></div>
        </div>
      </div>
    </div>
  );
}
