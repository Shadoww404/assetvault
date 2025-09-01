export default function Preloader() {
  return (
    <div className="preloader" role="status" aria-live="polite">
      <div className="pl-card">
        <div className="spinner" />
        <div className="brand">
          <strong>AssetVault</strong>
          <div className="muted" style={{ fontSize: 12 }}>Starting up…</div>
        </div>
      </div>
    </div>
  );
}
