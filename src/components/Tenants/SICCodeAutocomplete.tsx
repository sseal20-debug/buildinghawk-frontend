import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { tenantsApi } from '@/api/client'
import type { SICCode } from '@/api/client'

interface SICCodeAutocompleteProps {
  selected: SICCode[]
  onChange: (codes: SICCode[]) => void
}

export function SICCodeAutocomplete({ selected, onChange }: SICCodeAutocompleteProps) {
  const [input, setInput] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load all SIC codes once (cached)
  const { data: allCodes = [] } = useQuery({
    queryKey: ['sic-codes'],
    queryFn: () => tenantsApi.getSicCodes(),
    staleTime: 1000 * 60 * 60, // 1 hour cache
  })

  // Filter locally
  const filtered = input.length >= 1
    ? allCodes
        .filter(code =>
          code.code.startsWith(input.toLowerCase()) ||
          code.description.toLowerCase().includes(input.toLowerCase())
        )
        .filter(code => !selected.some(s => s.code === code.code))
        .slice(0, 20)
    : []

  const handleSelect = (code: SICCode) => {
    onChange([...selected, code])
    setInput('')
    setIsOpen(false)
    inputRef.current?.focus()
  }

  const handleRemove = (code: string) => {
    onChange(selected.filter(s => s.code !== code))
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {selected.map((code) => (
            <span
              key={code.code}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-teal/20 text-teal text-[10px] rounded font-medium"
            >
              {code.code}
              <button
                type="button"
                onClick={() => handleRemove(code.code)}
                className="hover:text-red-400 font-bold leading-none"
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => {
          setInput(e.target.value)
          setIsOpen(e.target.value.length >= 1)
        }}
        onFocus={() => {
          if (input.length >= 1) setIsOpen(true)
        }}
        placeholder="SIC code or sector"
        className="input text-xs py-1.5 w-full"
      />

      {/* Dropdown */}
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((code) => (
            <button
              key={code.code}
              type="button"
              onClick={() => handleSelect(code)}
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-teal/10 transition-colors flex items-center gap-2"
            >
              <span className="font-mono font-semibold text-teal w-10 flex-shrink-0">{code.code}</span>
              <span className="text-gray-700 truncate">{code.description}</span>
            </button>
          ))}
        </div>
      )}

      {isOpen && input.length >= 1 && filtered.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          <p className="text-xs text-gray-400 text-center">No matching SIC codes</p>
        </div>
      )}
    </div>
  )
}
