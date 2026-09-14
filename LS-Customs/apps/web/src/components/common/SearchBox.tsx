/**
 * SearchBox — shared search input used across Help Center, FAQs, and
 * Documentation pages. Triggers onSearch with the query string.
 */
import { Search } from 'lucide-react'
import { type ChangeEvent } from 'react'

interface SearchBoxProps {
  placeholder?: string
  value?: string
  onChange?: (query: string) => void
  onSearch?: (query: string) => void
}

export function SearchBox({
  placeholder = 'Search articles...',
  value = '',
  onChange,
  onSearch,
}: SearchBoxProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value
    onChange?.(next)
    onSearch?.(next)
  }

  return (
    <div className="search-box">
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        aria-label="Search"
      />
      <Search size={16} />
    </div>
  )
}
