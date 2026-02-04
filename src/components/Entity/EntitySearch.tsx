import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { entitiesApi } from '@/api/client'
import { useDebounce } from '@/hooks/useDebounce'
import type { Entity } from '@/types'

interface EntitySearchProps {
  onSelect: (entity: Entity) => void
  onCreateNew: () => void
  selectedEntity?: Entity | null
  placeholder?: string
}

export function EntitySearch({
  onSelect,
  onCreateNew,
  selectedEntity,
  placeholder = 'Search company or individual...'
}: EntitySearchProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebounce(query, 300)

  const { data: results, isLoading } = useQuery({
    queryKey: ['entity-search', debouncedQuery],
    queryFn: () => entitiesApi.list(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  })

  // Recent entities when no search
  const { data: recentEntities } = useQuery({
    queryKey: ['recent-entities'],
    queryFn: () => entitiesApi.list(),
    enabled: isOpen && query.length < 2,
  })

  const displayResults = query.length >= 2 ? results : recentEntities?.slice(0, 5)

  const handleSelect = (entity: Entity) => {
    onSelect(entity)
    setQuery(entity.entity_name)
    setIsOpen(false)
  }

  const handleClear = () => {
    setQuery('')
    onSelect(null as unknown as Entity)
    inputRef.current?.focus()
  }

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Set initial value from selectedEntity
  useEffect(() => {
    if (selectedEntity && !query) {
      setQuery(selectedEntity.entity_name)
    }
  }, [selectedEntity])

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="input pr-10"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
        >
          {isLoading ? (
            <div className="px-4 py-3 text-gray-500 text-sm">Searching...</div>
          ) : displayResults && displayResults.length > 0 ? (
            <ul className="max-h-64 overflow-y-auto">
              {query.length < 2 && (
                <li className="px-4 py-2 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  Recent
                </li>
              )}
              {displayResults.map((entity) => (
                <li key={entity.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(entity)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between border-b border-gray-100 last:border-0"
                  >
                    <div>
                      <div className="font-medium text-gray-900">{entity.entity_name}</div>
                      <div className="text-sm text-gray-500">
                        {entity.entity_type}
                        {entity.properties_owned ? ` · ${entity.properties_owned} owned` : ''}
                        {entity.properties_occupied ? ` · ${entity.properties_occupied} occupied` : ''}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : query.length >= 2 ? (
            <div className="px-4 py-3 text-gray-500 text-sm">No results found</div>
          ) : null}

          {/* Create New Option */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false)
              onCreateNew()
            }}
            className="w-full px-4 py-3 text-left text-blue-600 hover:bg-blue-50 border-t border-gray-200 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="font-medium">Create New Entity</span>
            {query.length >= 2 && (
              <span className="text-gray-500">"{query}"</span>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
