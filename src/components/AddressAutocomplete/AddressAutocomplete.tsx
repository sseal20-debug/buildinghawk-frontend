import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDebounce } from '@/hooks/useDebounce'
import { placesApi } from '@/api/client'

interface AddressAutocompleteProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  error?: string
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = 'Start typing an address...',
  className = '',
  error,
}: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const debouncedInput = useDebounce(inputValue, 300)

  // Sync external value changes
  useEffect(() => {
    setInputValue(value)
  }, [value])

  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: ['addressAutocomplete', debouncedInput],
    queryFn: () => placesApi.autocomplete(debouncedInput),
    enabled: debouncedInput.length >= 3,
    staleTime: 60000,
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    setIsOpen(true)
    setHighlightedIndex(-1)
  }

  const handleSelect = (description: string) => {
    setInputValue(description)
    onChange(description)
    setIsOpen(false)
    setHighlightedIndex(-1)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setIsOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          handleSelect(suggestions[highlightedIndex].description)
        }
        break
      case 'Escape':
        setIsOpen(false)
        setHighlightedIndex(-1)
        break
    }
  }

  const handleBlur = () => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      setIsOpen(false)
      // If user typed something but didn't select, keep their input
      if (inputValue !== value) {
        onChange(inputValue)
      }
    }, 200)
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  const showDropdown = isOpen && (suggestions.length > 0 || isFetching)

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => inputValue.length >= 3 && setIsOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`input ${className}`}
        autoComplete="off"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
        aria-autocomplete="list"
      />

      {isFetching && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
        </div>
      )}

      {showDropdown && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto"
          role="listbox"
        >
          {isFetching && suggestions.length === 0 ? (
            <li className="px-4 py-3 text-gray-500 text-sm">
              Searching addresses...
            </li>
          ) : (
            suggestions.map((suggestion, index) => (
              <li
                key={suggestion.place_id}
                role="option"
                aria-selected={index === highlightedIndex}
                className={`px-4 py-3 cursor-pointer text-sm ${
                  index === highlightedIndex
                    ? 'bg-blue-50 text-blue-900'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                onMouseDown={() => handleSelect(suggestion.description)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <div className="flex items-start gap-2">
                  <svg
                    className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>{suggestion.description}</span>
                </div>
              </li>
            ))
          )}
        </ul>
      )}

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}
