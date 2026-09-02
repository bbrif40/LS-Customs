/**
 * WorkspaceFooter — persistent footer with brand, help, support, and legal links.
 */

interface WorkspaceFooterProps {
  onNotify: (message: string) => void
}

export function WorkspaceFooter({ onNotify }: WorkspaceFooterProps) {
  return (
    <footer className="workspace-footer">
      <div className="workspace-footer-brand">
        <span className="brand-spark">✳</span>
        <strong>LS Customs</strong>
        <small>Professional automotive solutions.</small>
      </div>
      <div className="workspace-footer-links">
        <button onClick={() => onNotify('Help Center opened')}>Help Center</button>
        <button onClick={() => onNotify('Contact Support opened')}>Contact Support</button>
        <button onClick={() => onNotify('Terms of Service opened')}>Terms of Service</button>
        <button onClick={() => onNotify('Privacy Policy opened')}>Privacy Policy</button>
      </div>
      <small className="workspace-copyright">© 2024 LS Customs</small>
    </footer>
  )
}
