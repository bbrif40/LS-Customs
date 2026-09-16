/**
 * WorkspaceFooter — persistent footer with brand, help, support, and legal links.
 */

import { navigateTo } from '../../utils/navigation'

interface WorkspaceFooterProps {
  onNotify?: (message: string) => void
}

export function WorkspaceFooter({ onNotify: _onNotify }: WorkspaceFooterProps) {
  return (
    <footer className="workspace-footer">
      <div className="workspace-footer-brand">
        <span className="brand-spark">✳</span>
        <strong>LS Customs</strong>
        <small>Professional automotive solutions.</small>
      </div>
      <div className="workspace-footer-links">
        <button onClick={() => navigateTo('/help')}>Help Center</button>
        <button onClick={() => navigateTo('/contact')}>Contact Support</button>
        <button onClick={() => navigateTo('/terms')}>Terms of Service</button>
        <button onClick={() => navigateTo('/privacy')}>Privacy Policy</button>
      </div>
      <small className="workspace-copyright">© 2024 LS Customs</small>
    </footer>
  )
}
