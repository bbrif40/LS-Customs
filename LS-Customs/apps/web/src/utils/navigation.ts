/**
 * SPA client-side navigation helper.
 * Updates browser history and triggers popstate event so the root App
 * synchronizes its view state without causing a full page refresh.
 */
export function navigateTo(href: string) {
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    window.location.href = href
    return
  }
  window.history.pushState({}, '', href)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
