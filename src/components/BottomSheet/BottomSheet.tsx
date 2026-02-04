import { useRef, useEffect, type ReactNode } from 'react'
import { motion, useAnimation, useDragControls, PanInfo } from 'framer-motion'

type SheetHeight = 'collapsed' | 'half' | 'full'

interface BottomSheetProps {
  children: ReactNode
  height: SheetHeight
  onHeightChange: (height: SheetHeight) => void
  onClose: () => void
}

const HEIGHTS = {
  collapsed: 0,
  half: 50,
  full: 90,
}

export function BottomSheet({ children, height, onHeightChange, onClose }: BottomSheetProps) {
  const controls = useAnimation()
  const dragControls = useDragControls()
  const sheetRef = useRef<HTMLDivElement>(null)

  const heightPercent = HEIGHTS[height]

  useEffect(() => {
    controls.start({
      height: `${heightPercent}%`,
      transition: { type: 'spring', damping: 30, stiffness: 300 },
    })
  }, [heightPercent, controls])

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const velocity = info.velocity.y
    const offset = info.offset.y

    // Fast swipe down
    if (velocity > 500) {
      if (height === 'full') {
        onHeightChange('half')
      } else {
        onHeightChange('collapsed')
        onClose()
      }
      return
    }

    // Fast swipe up
    if (velocity < -500) {
      onHeightChange('full')
      return
    }

    // Slow drag - snap to nearest
    const currentPercent = heightPercent - (offset / window.innerHeight) * 100

    if (currentPercent < 25) {
      onHeightChange('collapsed')
      onClose()
    } else if (currentPercent < 70) {
      onHeightChange('half')
    } else {
      onHeightChange('full')
    }
  }

  if (height === 'collapsed') {
    return null
  }

  return (
    <motion.div
      ref={sheetRef}
      className="fixed bottom-0 left-0 right-0 bg-white bottom-sheet z-20 flex flex-col"
      initial={{ height: 0 }}
      animate={controls}
      drag="y"
      dragControls={dragControls}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.2}
      onDragEnd={handleDragEnd}
      style={{ maxHeight: '90%' }}
    >
      {/* Drag Handle */}
      <div
        className="flex justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={(e) => dragControls.start(e)}
      >
        <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar px-4 pb-4">
        {children}
      </div>
    </motion.div>
  )
}
